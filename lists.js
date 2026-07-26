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

  lists.forEach(list => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'list-chip';
    if (list.id === currentListId) chip.classList.add('active');
    chip.textContent = `${list.name} (${list.item_count})`;
    chip.addEventListener('click', () => selectList(list));
    toolbar.appendChild(chip);
  });

  const newChip = document.createElement('button');
  newChip.type = 'button';
  newChip.className = 'list-chip new-list-chip';
  newChip.textContent = '+ New List';
  newChip.addEventListener('click', () => showNewListForm());
  toolbar.appendChild(newChip);
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
  toolbar.appendChild(form);
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
  if (items.length === 0) {
    itemsContainer.innerHTML = '<p>This list is empty — save something from the Home page.</p>';
    return;
  }
  items.forEach(item => {
    const card = buildCard(item);
    attachRemoveButton(card, item, list.id, () => card.remove());
    attachStandardActions(card, item, context, { includeSave: false });
    itemsContainer.appendChild(card);
  });
}

deleteListBtn.addEventListener('click', async () => {
  if (!currentListId) return;
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
