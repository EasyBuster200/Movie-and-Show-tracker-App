const MEDIA_TYPE = 'movie';

const selectedGenreIds = new Set();
let currentPage = 1;
let context = null;

async function loadRow(url, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  try {
    const response = await fetch(url, { credentials: 'same-origin' });
    const data = await response.json();
    container.innerHTML = '';
    (data.results || []).forEach(raw => {
      const item = normalizeTmdbTrendingItem({ ...raw, media_type: MEDIA_TYPE });
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      container.appendChild(card);
    });
  } catch (error) {
    console.error(`Failed to load ${containerId}:`, error);
    container.innerHTML = '<p>Failed to load.</p>';
  }
}

async function loadRecommended() {
  const container = document.getElementById('recommended-movies');
  const emptyEl = document.getElementById('recommended-empty');
  try {
    const data = await fetch('/api/recommendations/movie', { credentials: 'same-origin' }).then(r => r.json());
    if (!data.items || data.items.length === 0) {
      container.hidden = true;
      emptyEl.hidden = false;
      return;
    }
    container.hidden = false;
    emptyEl.hidden = true;
    container.innerHTML = '';
    data.items.forEach(item => {
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      container.appendChild(card);
    });
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

function renderPagination(current, totalPages) {
  const pagination = document.getElementById('browse-pagination');
  pagination.innerHTML = '';
  if (!totalPages || totalPages <= 1) return;

  function pageButton(label, page, { disabled = false, active = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    if (active) btn.classList.add('active');
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) {
      btn.addEventListener('click', () => {
        currentPage = page;
        loadBrowsePage();
      });
    }
    return btn;
  }

  function ellipsis() {
    const span = document.createElement('span');
    span.className = 'page-ellipsis';
    span.textContent = '…';
    return span;
  }

  pagination.appendChild(pageButton('Prev', current - 1, { disabled: current <= 1 }));

  const windowStart = Math.max(1, current - 2);
  const windowEnd = Math.min(totalPages, current + 2);

  if (windowStart > 1) {
    pagination.appendChild(pageButton('1', 1));
    if (windowStart > 2) pagination.appendChild(ellipsis());
  }

  for (let page = windowStart; page <= windowEnd; page++) {
    pagination.appendChild(pageButton(String(page), page, { active: page === current }));
  }

  if (windowEnd < totalPages) {
    if (windowEnd < totalPages - 1) pagination.appendChild(ellipsis());
    pagination.appendChild(pageButton(String(totalPages), totalPages));
  }

  pagination.appendChild(pageButton('Next', current + 1, { disabled: current >= totalPages }));
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
    renderPagination(data.page || currentPage, data.total_pages || 1);
  } catch (error) {
    console.error('Failed to load browse grid:', error);
    grid.innerHTML = '<p>Failed to load movies.</p>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  context = await fetchStandardActionContext();

  const region = getUserRegion();
  loadRow(`/api/tmdb/discover/movie?sort_by=popularity.desc&with_origin_country=${region}&page=1&language=en-US`, 'popular-movies');
  loadRow('/api/tmdb/movie/upcoming?language=en-US', 'upcoming-movies');
  loadRecommended();
  loadGenreToolbar();
  loadBrowsePage();
});
