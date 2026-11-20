// Home: Continue Watching (shows in progress), Airing Soon (the next episodes of tracked
// shows), then Trending Shows and Trending Movies.
const HOME_ROW_LIMIT = 3;

async function loadTrendingRow(mediaType, containerId, context) {
  const container = document.getElementById(containerId);
  await loadPosterRow(
    container,
    page => fetchJson(`/api/tmdb/trending/${mediaType}/day?language=en-US&page=${page}`),
    raw => {
      const item = toStandardItem(raw, mediaType);
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      return card;
    }
  );
}

async function loadContinueWatching() {
  const container = document.getElementById('continue-watching');
  container.innerHTML = '';
  container.appendChild(buildSkeletonMediaRow());
  try {
    const shows = await fetchJson('/api/watched/shows?includeStatus=true');
    // Only shows with aired episodes left that aren't dropped (localApi.js's computeShowStatus),
    // most recently watched first.
    const watching = shows
      .filter(s => s.status === 'watching')
      .sort((a, b) => (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''));

    container.innerHTML = '';
    if (watching.length === 0) {
      container.appendChild(el('p', 'empty-note', 'Nothing in progress. Mark an episode watched on any show to see it here.'));
      return;
    }
    watching.slice(0, HOME_ROW_LIMIT).forEach(show => {
      const next = show.nextUnwatched;
      container.appendChild(buildMediaRow({
        href: detailUrl(show),
        title: show.title,
        meta: next ? `Next: S${next.seasonNumber} · E${next.episodeNumber}` : null,
        imageSrc: thumbUrl(show.posterPath),
        progress: { watched: show.watched, total: show.total },
      }));
    });
  } catch (error) {
    console.error('Failed to load continue watching:', error);
    container.innerHTML = '';
    container.appendChild(el('p', 'empty-note', "Couldn't load your shows."));
  }
}

async function loadAiringSoon() {
  const container = document.getElementById('airing-soon');
  container.innerHTML = '';
  container.appendChild(buildSkeletonMediaRow());
  try {
    const shows = await fetchJson('/api/watched/shows/upcoming');
    container.innerHTML = '';
    if (!Array.isArray(shows) || shows.length === 0) {
      container.appendChild(el('p', 'empty-note', "No new episodes announced for the shows you're tracking."));
      return;
    }
    shows.slice(0, HOME_ROW_LIMIT).forEach(show => {
      const { seasonNumber, episodeNumber, airDate, name } = show.nextEpisode;
      container.appendChild(buildAiringRow({
        href: detailUrl(show),
        title: show.title,
        airDate,
        seasonNumber,
        episodeNumber,
        episodeName: name,
      }));
    });
  } catch (error) {
    console.error('Failed to load airing soon:', error);
    container.innerHTML = '';
    container.appendChild(el('p', 'empty-note', "Couldn't load upcoming episodes."));
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  loadContinueWatching();
  loadAiringSoon();
  const context = await fetchStandardActionContext();
  loadTrendingRow('tv', 'trending-shows', context);
  loadTrendingRow('movie', 'trending-movies', context);
});
