// Movies: Popular (biased to the user's region), Coming Soon, Recommended, then Browse All.
const MEDIA_TYPE = 'movie';

function movieCard(raw, context) {
  const item = raw.tmdbId ? raw : toStandardItem(raw, MEDIA_TYPE);
  const card = buildCard(item);
  attachStandardActions(card, item, context);
  return card;
}

document.addEventListener('DOMContentLoaded', async () => {
  const context = await fetchStandardActionContext();
  const region = getUserRegion();

  loadPosterRow(
    document.getElementById('popular-movies'),
    page => fetchJson(`/api/tmdb/discover/movie?sort_by=popularity.desc&with_origin_country=${region}&language=en-US&page=${page}`),
    raw => movieCard(raw, context)
  );
  // TMDB's /movie/upcoming includes titles that have already come out by now - skip those.
  loadPosterRow(
    document.getElementById('upcoming-movies'),
    page => fetchJson(`/api/tmdb/movie/upcoming?language=en-US&page=${page}`),
    raw => (isUnreleased(raw.release_date) ? movieCard(raw, context) : null)
  );
  loadPosterRow(
    document.getElementById('recommended-movies'),
    page => fetchJson(`/api/recommendations/movie?page=${page}`).then(d => ({ results: d.items, total_pages: d.totalPages })),
    item => movieCard(item, context),
    { emptyText: 'Watch or save a few movies to get recommendations.' }
  );

  initBrowse({ mediaType: MEDIA_TYPE, context, excludeIds: () => context.watchedMovieIds });
});
