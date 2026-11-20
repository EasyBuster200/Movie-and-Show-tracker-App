// Lists: the profile's own lists (the Watchlist has its own page and isn't shown here), one
// row each with its first three posters stacked, its name and size. A row opens the list in
// media-list.html; "New list" asks for a name.

// The Watchlist is a list under the hood (the default one) - it's left out here.
async function fetchLists() {
  const lists = await fetchJson('/api/lists');
  return lists.filter(list => !list.is_default);
}

function buildListRow(list, items) {
  const row = el('a', 'list-row');
  row.href = `media-list.html?source=list&id=${list.id}`;

  const stack = el('div', 'list-row__stack');
  const covers = items.slice(0, 3);
  // Always three slots, so every row's art lines up; missing ones are blank tiles.
  for (let i = 0; i < 3; i++) {
    const item = covers[i];
    stack.appendChild(buildPosterArt(item ? item.title : '', item ? thumbUrl(item.posterPath) : null));
  }
  row.appendChild(stack);

  const body = el('div', 'list-row__body');
  body.appendChild(el('span', 'list-row__name', list.name));
  body.appendChild(el('span', 'list-row__count', `${list.item_count} title${list.item_count === 1 ? '' : 's'}`));
  row.appendChild(body);

  const chevron = el('span', 'list-row__chevron');
  chevron.innerHTML = ttIcon('chevron', { size: 20 });
  row.appendChild(chevron);
  return row;
}

async function renderLists() {
  const lists = await fetchLists();
  const rowsEl = document.getElementById('lists-rows');
  const has = lists.length > 0;

  document.getElementById('lists-count').textContent = has ? `${lists.length} list${lists.length === 1 ? '' : 's'}` : 'Your own collections';
  document.getElementById('new-list-btn').hidden = !has;
  document.getElementById('lists-empty').hidden = has;

  const itemsByList = await Promise.all(lists.map(list => fetchJson(`/api/lists/${list.id}/items`)));
  rowsEl.innerHTML = '';
  lists.forEach((list, i) => rowsEl.appendChild(buildListRow(list, itemsByList[i])));
}

async function createList() {
  const name = await promptDialog({ title: 'New list', label: 'Name', placeholder: 'Weekend picks', confirmLabel: 'Create' });
  if (!name) return;
  const response = await fetch('/api/lists', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (response.ok) {
    const created = await response.json();
    window.location.href = `media-list.html?source=list&id=${created.id}`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  document.getElementById('new-list-btn').addEventListener('click', createList);
  document.getElementById('first-list-btn').addEventListener('click', createList);
  renderLists();
});
