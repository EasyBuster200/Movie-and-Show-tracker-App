// Base URLs for the trending endpoints (proxied through our own backend so the TMDB token stays server-side)
const MOVIE_API_URL = '/api/tmdb/trending/movie/day?language=en-US';
const TV_API_URL = '/api/tmdb/trending/tv/day?language=en-US';

const toggleButton = document.getElementById("toggle-btn")
const sidebar  = document.getElementById("sidebar")

function toggleSidebar() {
  sidebar.classList.toggle("close")
  toggleButton.classList.toggle("rotate")

  closeAllSubMenus()
}

function toggleSubMenu(button) {
  if(!button.nextElementSibling.classList.contains("show"))
      closeAllSubMenus()

  button.nextElementSibling.classList.toggle('show')
  button.classList.toggle('rotate')

  if(sidebar.classList.contains("close")) {
    sidebar.classList.toggle("close")
    toggleButton.classList.toggle("rotate")
  }
}

function closeAllSubMenus() {
  Array.from(sidebar.getElementsByClassName("show")).forEach(ul => {
    ul.classList.remove("show")
    ul.previousElementSibling.classList.remove("rotate")
  })
}

async function fetchTrending() {
  const options = {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  };

  const user = await getCurrentUser();
  const watchedMovieIds = new Set(
    user ? await fetch('/api/watched/movies', { credentials: 'same-origin' }).then(r => r.json()) : []
  );

  try {
    const response = await fetch(MOVIE_API_URL, options);
    const data = await response.json();
    displayMedia(data.results, "trending-movies", watchedMovieIds);
  } catch (error) {
    console.error("Error fetching movies:", error);
    document.getElementById('trending-movies').innerHTML = `<p>Failed to load trending movies.</p>`;
  }

  try {
    const response = await fetch(TV_API_URL, options);
    const data = await response.json();
    displayMedia(data.results, "trending-shows", watchedMovieIds);
  } catch (error) {
    console.error("Error fetching shows:", error);
    document.getElementById('trending-shows').innerHTML = `<p>Failed to load trending shows.</p>`;
  }
}

function displayMedia(mediaList, containerId, watchedMovieIds) {
  const container = document.getElementById(containerId);

  if(!container) return;

  container.innerHTML = "";

  mediaList.forEach(raw => {
    if(raw.media_type === "person") return;

    const item = normalizeTmdbTrendingItem(raw);
    const card = buildCard(item);
    attachSaveButton(card.actionsEl, item);
    if (item.mediaType === 'movie') {
      attachWatchedButton(card.actionsEl, item, watchedMovieIds);
    } else {
      attachEpisodeTracker(card.actionsEl, item);
    }
    attachRatingControl(card.actionsEl, item);
    container.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', fetchTrending);