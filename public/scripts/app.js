// Base URLs for the trending endpoints (proxied through our own backend so the TMDB token stays server-side)
const MOVIE_API_URL = '/api/tmdb/trending/movie/day?language=en-US';
const TV_API_URL = '/api/tmdb/trending/tv/day?language=en-US';

async function fetchTrending(context) {
  await loadTrendingRow(MOVIE_API_URL, 'trending-movies');
  await loadTrendingRow(TV_API_URL, 'trending-shows');

  async function loadTrendingRow(baseUrl, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const loadNextPage = attachLoadMoreRow(
      container,
      page => fetch(`${baseUrl}&page=${page}`, { headers: { accept: 'application/json' } }).then(r => r.json()),
      raw => {
        if (raw.media_type === 'person') return null;
        const item = normalizeTmdbTrendingItem(raw);
        const card = buildCard(item);
        attachStandardActions(card, item, context);
        return card;
      }
    );
    await loadNextPage();
  }
}

function formatAirDate(airDate) {
  if (!airDate) return null;
  return new Date(airDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

async function loadAiringSoon(context) {
  const container = document.getElementById('airing-soon');
  const emptyEl = document.getElementById('airing-soon-empty');

  function showEmpty(message) {
    container.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = message;
  }

  try {
    const response = await fetch('/api/watched/shows/upcoming', { credentials: 'same-origin' });
    if (response.status === 401) {
      showEmpty("Login and start tracking your favorite shows' next episode.");
      return;
    }

    const shows = await response.json();
    if (!Array.isArray(shows) || shows.length === 0) {
      showEmpty('No new episodes.');
      return;
    }

    container.hidden = false;
    emptyEl.hidden = true;
    container.innerHTML = '';

    shows.forEach(item => {
      const card = buildCard(item);

      const meta = document.createElement('p');
      meta.className = 'card-meta';
      const { seasonNumber, episodeNumber, airDate } = item.nextEpisode;
      meta.textContent = `S${seasonNumber}E${episodeNumber} • Airs ${formatAirDate(airDate)}`;
      card.infoEl.appendChild(meta);

      attachStandardActions(card, item, context);
      container.appendChild(card);
    });
  } catch (error) {
    console.error('Failed to load airing soon:', error);
    showEmpty('No new episodes.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const context = await fetchStandardActionContext();
  fetchTrending(context);
  loadAiringSoon(context);
});