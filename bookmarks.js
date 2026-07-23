async function loadBookmarks() {
  const container = document.getElementById('bookmarks-container');

  const lists = await fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json());
  const bookmarksList = lists.find(l => l.is_default);
  if (!bookmarksList) return;

  const [items, watchedMovieIds] = await Promise.all([
    fetch(`/api/lists/${bookmarksList.id}/items`, { credentials: 'same-origin' }).then(r => r.json()),
    fetch('/api/watched/movies', { credentials: 'same-origin' }).then(r => r.json()).then(ids => new Set(ids)),
  ]);

  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = '<p>No bookmarks yet — save something from the Home page.</p>';
    return;
  }

  items.forEach(item => {
    const card = buildCard(item);
    attachRemoveButton(card.actionsEl, item, bookmarksList.id, () => card.remove());
    if (item.mediaType === 'movie') {
      attachWatchedButton(card.actionsEl, item, watchedMovieIds);
    } else {
      attachEpisodeTracker(card.actionsEl, item);
    }
    attachRatingControl(card.actionsEl, item);
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (user) loadBookmarks();
});
