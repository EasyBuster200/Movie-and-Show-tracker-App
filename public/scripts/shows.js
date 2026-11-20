// Shows: Popular (biased to the user's region), Keep Watching, Recommended, then Browse All.
const MEDIA_TYPE = 'tv';
// Keep Watching only renders this many, but it has to check every tracked show's status first
// to know which ones are in progress.
const KEEP_WATCHING_PREVIEW_LIMIT = 8;

function showCard(raw, context) {
  const item = raw.tmdbId ? raw : toStandardItem(raw, MEDIA_TYPE);
  const card = buildCard(item);
  attachStandardActions(card, item, context);
  return card;
}

async function loadKeepWatching(context, trackedShows) {
  const container = document.getElementById('keep-watching');
  container.innerHTML = '';
  renderSkeletonRow(container, 3);
  try {
    const shows = await trackedShows;
    // Shows with aired episodes left that aren't dropped (localApi.js's computeShowStatus).
    const inProgress = shows
      .filter(s => s.status === 'watching')
      .sort((a, b) => (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''));
    container.innerHTML = '';
    if (inProgress.length === 0) {
      container.appendChild(el('p', 'empty-note', 'No shows in progress. Start watching something!'));
      return;
    }
    inProgress.slice(0, KEEP_WATCHING_PREVIEW_LIMIT).forEach(show => {
      const card = showCard(show, context);
      addCardDetail(card, `${show.watched}/${show.total} episodes watched`);
      if (show.hasNewEpisodes) card.overlayActionsEl.appendChild(el('span', 'tt-poster__badge', 'New'));
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load keep watching:', error);
    container.innerHTML = '';
    container.appendChild(el('p', 'empty-note', "Couldn't load your shows."));
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const context = await fetchStandardActionContext();
  const region = getUserRegion();
  const trackedShows = fetchJson('/api/watched/shows?includeNewEpisodes=true&includeStatus=true').catch(() => []);
  let watchedShowIds = new Set();
  trackedShows.then(shows => { watchedShowIds = new Set(shows.map(s => s.tmdbId)); });

  loadPosterRow(
    document.getElementById('popular-shows'),
    page => fetchJson(`/api/tmdb/discover/tv?sort_by=popularity.desc&with_origin_country=${region}&language=en-US&page=${page}`),
    raw => showCard(raw, context)
  );
  loadKeepWatching(context, trackedShows);
  loadPosterRow(
    document.getElementById('recommended-shows'),
    page => fetchJson(`/api/recommendations/tv?page=${page}`).then(d => ({ results: d.items, total_pages: d.totalPages })),
    item => showCard(item, context),
    { emptyText: 'Watch or save a few shows to get recommendations.' }
  );

  await trackedShows;
  initBrowse({ mediaType: MEDIA_TYPE, context, excludeIds: () => watchedShowIds });
});
