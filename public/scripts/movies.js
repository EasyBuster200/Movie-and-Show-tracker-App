const MEDIA_TYPE = 'movie';

const selectedGenreIds = new Set();
let currentPage = 1;
let context = null;

// `baseUrl` must not already carry a `page` param - this appends its own per page fetched.
// `filterItem`, if given, skips raw results it returns false for (e.g. TMDB's /movie/upcoming
// endpoint - unlike a specific region's actual theatrical release calendar - includes titles
// whose primary release_date has already passed by the time it's fetched).
async function loadPaginatedRow(baseUrl, containerId, { filterItem } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const loadNextPage = attachLoadMoreRow(
    container,
    page => fetch(`${baseUrl}${baseUrl.includes('?') ? '&' : '?'}page=${page}`, { credentials: 'same-origin' })
      .then(r => r.json()),
    raw => {
      if (filterItem && !filterItem(raw)) return null;
      const item = normalizeTmdbTrendingItem({ ...raw, media_type: MEDIA_TYPE });
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      return card;
    }
  );
  await loadNextPage();
}

function buildRecommendedCard(item) {
  const card = buildCard(item);
  attachStandardActions(card, item, context);
  return card;
}

async function loadRecommended() {
  const container = document.getElementById('recommended-movies');
  const emptyEl = document.getElementById('recommended-empty');
  try {
    const data = await fetch('/api/recommendations/movie?page=1', { credentials: 'same-origin' }).then(r => r.json());
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
        page => fetch(`/api/recommendations/movie?page=${page}`, { credentials: 'same-origin' })
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
    const data = await fetch('/api/tmdb/genre/movie/list', { credentials: 'same-origin' }).then(r => r.json());
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
    const data = await fetch(`/api/tmdb/discover/movie?${params.toString()}`, { credentials: 'same-origin' }).then(r => r.json());
    grid.innerHTML = '';
    (data.results || [])
      .filter(raw => !context.watchedMovieIds.has(raw.id))
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
    grid.innerHTML = '<p>Failed to load movies.</p>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  context = await fetchStandardActionContext();

  const region = getUserRegion();
  loadPaginatedRow(`/api/tmdb/discover/movie?sort_by=popularity.desc&with_origin_country=${region}&language=en-US`, 'popular-movies');
  loadPaginatedRow('/api/tmdb/movie/upcoming?language=en-US', 'upcoming-movies', {
    filterItem: raw => !raw.release_date || new Date(raw.release_date) > new Date(),
  });
  loadRecommended();
  loadGenreToolbar();
  loadBrowsePage();
});
