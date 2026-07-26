let currentQuery = '';
let currentPage = 1;
let context = null;

function renderPagination(current, totalPages) {
  const pagination = document.getElementById('search-results-pagination');
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
        loadResultsPage();
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

async function loadResultsPage() {
  const grid = document.getElementById('search-results-grid');
  const emptyEl = document.getElementById('search-results-empty');

  try {
    const params = new URLSearchParams({ query: currentQuery, page: currentPage, include_adult: 'false' });
    const data = await fetch(`/api/tmdb/search/multi?${params.toString()}`, { credentials: 'same-origin' }).then(r => r.json());
    const results = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');

    grid.innerHTML = '';
    if (results.length === 0) {
      emptyEl.hidden = false;
      renderPagination(1, 1);
      return;
    }

    emptyEl.hidden = true;
    results.forEach(raw => {
      const item = normalizeTmdbTrendingItem(raw);
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      grid.appendChild(card);
    });
    renderPagination(data.page || currentPage, data.total_pages || 1);
  } catch (error) {
    console.error('Search failed:', error);
    grid.innerHTML = '<p>Something went wrong loading results.</p>';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  context = await fetchStandardActionContext();

  currentQuery = new URLSearchParams(window.location.search).get('q') || '';
  const input = document.getElementById('search-input');
  if (input) input.value = currentQuery;

  const heading = document.getElementById('search-results-heading');
  if (!currentQuery) {
    heading.textContent = 'Search';
    document.getElementById('search-results-empty').hidden = false;
    document.getElementById('search-results-empty').textContent = 'Type something in the search bar above.';
    return;
  }

  heading.textContent = `Results for "${currentQuery}"`;
  loadResultsPage();
});
