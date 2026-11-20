// The Watchlist (bookmarks.html): everything saved to the profile's default list, as a Movies
// row and a Shows row, with a search field that filters both. Each poster's × removes it.

let watchlistItems = [];
let watchlistId = null;
let actionContext = null;

function renderWatchlist() {
  const query = document.getElementById('watchlist-search').value.trim().toLowerCase();
  const visible = watchlistItems.filter(item => !query || item.title.toLowerCase().includes(query));
  document.getElementById('watchlist-count').textContent =
    `${watchlistItems.length} title${watchlistItems.length === 1 ? '' : 's'} to watch`;

  [['movie', 'movies', 'Movies'], ['tv', 'shows', 'Shows']].forEach(([type, key, label]) => {
    const items = visible.filter(item => item.mediaType === type);
    const row = document.getElementById(`bookmarks-${key}`);
    document.getElementById(`watchlist-${key}-title`).textContent = `${label} (${items.length})`;
    document.getElementById(`watchlist-${key}-empty`).hidden = items.length > 0;
    const seeAll = document.getElementById(`watchlist-${key}-all`);
    seeAll.href = `media-list.html?source=list&id=${watchlistId}&type=${type}`;
    seeAll.hidden = items.length === 0;

    row.innerHTML = '';
    row.hidden = items.length === 0;
    items.forEach(item => {
      const card = buildCard(item);
      attachRemoveButton(card, item, watchlistId, () => {
        watchlistItems = watchlistItems.filter(i => !(i.tmdbId === item.tmdbId && i.mediaType === item.mediaType));
        renderWatchlist();
      }, { listName: 'your watchlist' });
      attachStandardActions(card, item, actionContext, { includeSave: false });
      row.appendChild(card);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  ['movies', 'shows'].forEach(key => renderSkeletonRow(document.getElementById(`bookmarks-${key}`), 3));
  actionContext = await fetchStandardActionContext();
  watchlistId = actionContext.watchlistId;
  if (!watchlistId) return;
  watchlistItems = await fetchJson(`/api/lists/${watchlistId}/items`);

  document.getElementById('watchlist-search').addEventListener('input', renderWatchlist);
  renderWatchlist();
});
