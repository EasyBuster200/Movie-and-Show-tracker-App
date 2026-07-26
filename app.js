// Base URLs for the trending endpoints (proxied through our own backend so the TMDB token stays server-side)
const MOVIE_API_URL = '/api/tmdb/trending/movie/day?language=en-US';
const TV_API_URL = '/api/tmdb/trending/tv/day?language=en-US';

async function fetchTrending() {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  };

  const context = await fetchStandardActionContext();

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

document.addEventListener('DOMContentLoaded', fetchTrending);