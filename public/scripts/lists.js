const toolbar = document.getElementById('lists-toolbar');
const itemsContainer = document.getElementById('list-items-container');
const titleEl = document.getElementById('list-title');
const deleteListBtn = document.getElementById('delete-list-btn');

let currentListId = null;

// Bookmarks is a list under the hood (the default list, auto-created at signup) but has
// its own dedicated page — it's excluded here so it doesn't also show up as a regular list.
async function fetchLists() {
  const lists = await fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json());
  return lists.filter(list => !list.is_default);
}

function renderChips(lists) {
  toolbar.innerHTML = '';

  // Rendered first (not appended after every list chip) so it stays reachable near the top
  // of the toolbar without scrolling once someone has accumulated a lot of lists.
  const newChip = document.createElement('button');
  newChip.type = 'button';
  newChip.className = 'list-chip new-list-chip';
  newChip.textContent = '+ New List';
  newChip.addEventListener('click', () => showNewListForm());
  toolbar.appendChild(newChip);

  lists.forEach(list => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'list-chip';
    if (list.id === currentListId) chip.classList.add('active');
    chip.textContent = `${list.name} (${list.item_count})`;
    chip.addEventListener('click', () => selectList(list));
    toolbar.appendChild(chip);
  });
}

function showNewListForm() {
  if (toolbar.querySelector('.new-list-form')) return;

  const form = document.createElement('form');
  form.className = 'new-list-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'List name';
  input.required = true;

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Create';

  form.appendChild(input);
  form.appendChild(submit);
  // Inserted right after the "+ New List" chip (not appended at the end of the toolbar) so
  // the form - and its Create button - appears where the click happened instead of below
  // however many list chips already exist.
  toolbar.insertBefore(form, toolbar.querySelector('.new-list-chip').nextSibling);
  input.focus();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const response = await fetch('/api/lists', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    if (response.ok) {
      const created = await response.json();
      const lists = await fetchLists();
      renderChips(lists);
      selectList(created);
    }
  });
}

const ADD_ITEM_SEARCH_DEBOUNCE_MS = 300;

// A dashed "+" tile appended to the end of every list's items — clicking it turns the tile
// itself into an inline search box (styled after search.js's dropdown) so a movie/show can
// be added without leaving the page. `onItemAdded` re-renders the list afterward.
function buildAddItemCard(listId, onItemAdded) {
  const card = document.createElement('div');
  card.className = 'card add-item-card';
  card.title = 'Add a movie or show to this list';

  const plus = document.createElement('span');
  plus.className = 'add-item-plus';
  plus.textContent = '+';
  card.appendChild(plus);

  let active = false;
  let debounceTimer = null;
  let activeController = null;

  function closeSearch() {
    if (!active) return;
    active = false;
    if (activeController) activeController.abort();
    card.classList.remove('active');
    card.innerHTML = '';
    card.appendChild(plus);
    document.removeEventListener('click', handleOutsideClick);
  }

  function handleOutsideClick(event) {
    if (!card.contains(event.target)) closeSearch();
  }

  function renderResults(rawResults, resultsEl) {
    renderSearchResultRows(resultsEl, rawResults, async item => {
      await fetch(`/api/lists/${listId}/items`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: item.tmdbId, mediaType: item.mediaType }),
      });
      closeSearch();
      onItemAdded();
    });
  }

  async function runSearch(query, resultsEl) {
    if (activeController) activeController.abort();
    activeController = new AbortController();
    try {
      const response = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`, {
        credentials: 'same-origin',
        signal: activeController.signal,
      });
      const data = await response.json();
      renderResults(data.results || [], resultsEl);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Search failed:', error);
    }
  }

  function openSearch() {
    if (active) return;
    active = true;
    card.classList.add('active');
    card.innerHTML = '';

    const wrap = document.createElement('div');
    wrap.className = 'add-item-search';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search movies and shows...';

    const resultsEl = document.createElement('div');
    resultsEl.className = 'add-item-results';

    wrap.appendChild(input);
    wrap.appendChild(resultsEl);
    card.appendChild(wrap);
    input.focus();

    input.addEventListener('click', event => event.stopPropagation());
    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const query = input.value.trim();
      if (!query) {
        resultsEl.innerHTML = '';
        return;
      }
      debounceTimer = setTimeout(() => runSearch(query, resultsEl), ADD_ITEM_SEARCH_DEBOUNCE_MS);
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeSearch();
    });

    document.addEventListener('click', handleOutsideClick);
  }

  card.addEventListener('click', () => openSearch());

  return card;
}

function showNoListsState() {
  currentListId = null;
  titleEl.textContent = 'Lists';
  deleteListBtn.hidden = true;
  itemsContainer.innerHTML = '<p>Create your first list to get started.</p>';
}

async function selectList(list) {
  currentListId = list.id;
  titleEl.textContent = list.name;
  deleteListBtn.hidden = false;

  const lists = await fetchLists();
  renderChips(lists);

  const [items, context] = await Promise.all([
    fetch(`/api/lists/${list.id}/items`, { credentials: 'same-origin' }).then(r => r.json()),
    fetchStandardActionContext(),
  ]);

  itemsContainer.innerHTML = '';
  items.forEach(item => {
    const card = buildCard(item);
    attachRemoveButton(card, item, list.id, () => card.remove());
    attachStandardActions(card, item, context, { includeSave: false });
    itemsContainer.appendChild(card);
  });
  itemsContainer.appendChild(buildAddItemCard(list.id, () => selectList(list)));
}

// Mirrors profile.js's openDeleteAccountConfirm shape (overlay/modal/actions built from the
// same .confirm-* classes) but as a yes/no Promise like detail.js's showConfirmDialog, since
// the caller here just needs to know whether to proceed - not a whole custom modal per case.
function confirmDeleteList(listName) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    const text = document.createElement('p');
    text.textContent = `Delete "${listName}"? This can't be undone.`;
    modal.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'confirm-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => close(false));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'confirm-btn confirm-btn-danger';
    deleteBtn.textContent = 'Delete List';
    deleteBtn.addEventListener('click', () => close(true));

    actions.appendChild(cancelBtn);
    actions.appendChild(deleteBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

deleteListBtn.addEventListener('click', async () => {
  if (!currentListId) return;
  const confirmed = await confirmDeleteList(titleEl.textContent);
  if (!confirmed) return;

  await fetch(`/api/lists/${currentListId}`, { method: 'DELETE', credentials: 'same-origin' });
  const lists = await fetchLists();
  if (lists.length > 0) {
    selectList(lists[0]);
  } else {
    renderChips(lists);
    showNoListsState();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  const lists = await fetchLists();
  renderChips(lists);
  if (lists.length > 0) selectList(lists[0]);
  else showNoListsState();
});
