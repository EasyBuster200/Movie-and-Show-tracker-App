function renderBookmarkSection(container, items, listId, context, emptyMessage) {
  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = `<p>${emptyMessage}</p>`;
    return;
  }

  items.forEach(item => {
    const card = buildCard(item);
    attachRemoveButton(card, item, listId, () => card.remove());
    attachStandardActions(card, item, context, { includeSave: false });
    container.appendChild(card);
  });
}

async function loadBookmarks() {
  const moviesContainer = document.getElementById('bookmarks-movies');
  const showsContainer = document.getElementById('bookmarks-shows');

  const lists = await fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json());
  const bookmarksList = lists.find(l => l.is_default);
  if (!bookmarksList) return;

  const [items, context] = await Promise.all([
    fetch(`/api/lists/${bookmarksList.id}/items`, { credentials: 'same-origin' }).then(r => r.json()),
    fetchStandardActionContext(),
  ]);

  const movies = items.filter(item => item.mediaType === 'movie');
  const shows = items.filter(item => item.mediaType === 'tv');

  renderBookmarkSection(moviesContainer, movies, bookmarksList.id, context, 'No movie bookmarks yet — save something from the Home page.');
  renderBookmarkSection(showsContainer, shows, bookmarksList.id, context, 'No show bookmarks yet — save something from the Home page.');
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (user) loadBookmarks();
});
