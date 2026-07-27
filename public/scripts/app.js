// Base URLs for the trending endpoints (proxied through our own backend so the TMDB token stays server-side)
const MOVIE_API_URL = '/api/tmdb/trending/movie/day?language=en-US';
const TV_API_URL = '/api/tmdb/trending/tv/day?language=en-US';

async function fetchTrending(context) {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  };

  try {
    const response = await fetch(MOVIE_API_URL, options);
    const data = await response.json();
    displayMedia(data.results, "trending-movies", context, "movies.html", "movies");
  } catch (error) {
    console.error("Error fetching movies:", error);
    document.getElementById('trending-movies').innerHTML = `<p>Failed to load trending movies.</p>`;
  }

  try {
    const response = await fetch(TV_API_URL, options);
    const data = await response.json();
    displayMedia(data.results, "trending-shows", context, "shows.html", "shows");
  } catch (error) {
    console.error("Error fetching shows:", error);
    document.getElementById('trending-shows').innerHTML = `<p>Failed to load trending shows.</p>`;
  }
}

function displayMedia(mediaList, containerId, context, moreUrl, moreLabel) {
  const container = document.getElementById(containerId);

  if(!container) return;

  container.innerHTML = "";

  mediaList.forEach(raw => {
    if(raw.media_type === "person") return;

    const item = normalizeTmdbTrendingItem(raw);
    const card = buildCard(item);
    attachStandardActions(card, item, context);
    container.appendChild(card);
  });

  if (moreUrl) {
    const moreCard = document.createElement("div");
    moreCard.className = "more-card";
    moreCard.innerHTML = `<a href="${moreUrl}" class="more-btn" aria-label="View more ${moreLabel}"><span aria-hidden="true">+</span></a>`;
    container.appendChild(moreCard);
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