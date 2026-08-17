const MEDIA_TYPE = 'tv';
const KEEP_WATCHING_PREVIEW_LIMIT = 20;

const selectedGenreIds = new Set();
let currentPage = 1;
let context = null;
let watchedShowIds = new Set();

async function fetchWatchedShowIds() {
  const response = await fetch('/api/watched/shows', { credentials: 'same-origin' });
  if (!response.ok) return new Set();
  const shows = await response.json();
  return new Set(shows.map(s => s.tmdbId));
}

// `baseUrl` must not already carry a `page` param - this appends its own per page fetched.
async function loadPaginatedRow(baseUrl, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const loadNextPage = attachLoadMoreRow(
    container,
    page => fetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`, { credentials: 'same-origin' })
      .then(r => r.json()),
    raw => {
      const item = normalizeTmdbTrendingItem({ ...raw, media_type: MEDIA_TYPE });
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      return card;
    }
  );
  await loadNextPage();
}

async function loadKeepWatching() {
  const container = document.getElementById('keep-watching');
  const emptyEl = document.getElementById('keep-watching-empty');
  try {
    const response = await fetch('/api/watched/shows?includeNewEpisodes=true', { credentials: 'same-origin' });
    if (!response.ok) {
      // Not logged in (or some other non-success response) — no watched shows to show,
      // not an actual failure, so no console error.
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    const shows = await response.json();
    const inProgress = shows.filter(s => s.watched > 0 && s.total != null && s.watched < s.total);

    if (inProgress.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    container.hidden = false;
    emptyEl.hidden = true;
    container.innerHTML = '';

    inProgress.slice(0, KEEP_WATCHING_PREVIEW_LIMIT).forEach(item => {
      const card = buildCard(item);

      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);

      if (item.hasNewEpisodes) {
        const dot = document.createElement('span');
        dot.className = 'new-episode-dot';
        dot.title = 'New episodes available';
        card.overlayActionsEl.appendChild(dot);
      }

      attachStandardActions(card, item, context);
      container.appendChild(card);
    });

    if (inProgress.length > KEEP_WATCHING_PREVIEW_LIMIT) {
      const moreCard = document.createElement('div');
      moreCard.className = 'more-card';
      moreCard.innerHTML = `<a href="media-list.html?source=in-progress&type=tv" class="more-btn" aria-label="View all in-progress shows">${moreBtnContentHtml('View All')}</a>`;
      container.appendChild(moreCard);
    }
  } catch (error) {
    console.error('Failed to load keep watching:', error);
    container.hidden = true;
    emptyEl.hidden = false;
  }
}

function buildRecommendedCard(item) {
  const card = buildCard(item);
  attachStandardActions(card, item, context);
  return card;
}

async function loadRecommended() {
  const container = document.getElementById('recommended-shows');
  const emptyEl = document.getElementById('recommended-empty');
  try {
    const data = await fetch('/api/recommendations/tv?page=1', { credentials: 'same-origin' }).then(r => r.json());
    if (!data.items || data.items.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    container.hidden = false;
    emptyEl.hidden = true;
    container.innerHTML = '';
    data.items.forEach(item => container.appendChild(buildRecommendedCard(item)));

    if (data.totalPages > 1) {
      attachLoadMoreRow(
        container,
        page => fetch(`/api/recommendations/tv?page=${page}`, { credentials: 'same-origin' })
          .then(r => r.json())
          .then(d => ({ results: d.items, total_pages: d.totalPages })),
        buildRecommendedCard,
        { startPage: 2 }
      );
    }
  } catch (error) {
    console.error('Failed to load recommendations:', error);
    container.hidden = true;
    emptyEl.hidden = false;
  }
}

async function loadGenreToolbar() {
  const toolbar = document.getElementById('genre-toolbar');
  try {
    const data = await fetch('/api/tmdb/genre/tv/list', { credentials: 'same-origin' }).then(r => r.json());
    (data.genres || []).forEach(genre => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'list-chip';
      chip.textContent = genre.name;
      chip.addEventListener('click', () => {
        if (selectedGenreIds.has(genre.id)) {
          selectedGenreIds.delete(genre.id);
          chip.classList.remove('active');
        } else {
          selectedGenreIds.add(genre.id);
          chip.classList.add('active');
        }
        currentPage = 1;
        loadBrowsePage();
      });
      toolbar.appendChild(chip);
    });
  } catch (error) {
    console.error('Failed to load genres:', error);
  }
}

async function loadBrowsePage() {
  const grid = document.getElementById('browse-grid');
  const params = new URLSearchParams({
    page: currentPage,
    sort_by: 'popularity.desc',
    language: 'en-US',
    include_adult: 'false',
  });
  if (selectedGenreIds.size > 0) {
    params.set('with_genres', [...selectedGenreIds].join(','));
  }

  try {
    const data = await fetch(`/api/tmdb/discover/tv?${params.toString()}`, { credentials: 'same-origin' }).then(r => r.json());
    grid.innerHTML = '';
    (data.results || [])
      .filter(raw => !watchedShowIds.has(raw.id))
      .forEach(raw => {
        const item = normalizeTmdbTrendingItem({ ...raw, media_type: MEDIA_TYPE });
        const card = buildCard(item);
        attachStandardActions(card, item, context);
        grid.appendChild(card);
      });
    renderPagination(document.getElementById('browse-pagination'), data.page || currentPage, data.total_pages || 1, page => {
      currentPage = page;
      loadBrowsePage();
    });
  } catch (error) {
    console.error('Failed to load browse grid:', error);
    grid.innerHTML = '<p>Failed to load shows.</p>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  context = await fetchStandardActionContext();
  watchedShowIds = await fetchWatchedShowIds();

  const region = getUserRegion();
  loadPaginatedRow(`/api/tmdb/discover/tv?sort_by=popularity.desc&with_origin_country=${region}&language=en-US`, 'popular-shows');
  loadKeepWatching();
  loadRecommended();
  loadGenreToolbar();
  loadBrowsePage();
});
