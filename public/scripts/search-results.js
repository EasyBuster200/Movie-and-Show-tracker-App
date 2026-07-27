let currentQuery = '';
let currentPage = 1;
let context = null;

async function loadResultsPage() {
  const grid = document.getElementById('search-results-grid');
  const emptyEl = document.getElementById('search-results-empty');

  try {
    const params = new URLSearchParams({ query: currentQuery, page: currentPage, include_adult: 'false' });
    const data = await fetch(`/api/tmdb/search/multi?${params.toString()}`, { credentials: 'same-origin' }).then(r => r.json());
    const results = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv');

    grid.innerHTML = '';
    const paginationEl = document.getElementById('search-results-pagination');
    if (results.length === 0) {
      emptyEl.hidden = false;
      renderPagination(paginationEl, 1, 1, () => {});
      return;
    }

    emptyEl.hidden = true;
    results.forEach(raw => {
      const item = normalizeTmdbTrendingItem(raw);
      const card = buildCard(item);
      attachStandardActions(card, item, context);
      grid.appendChild(card);
    });
    renderPagination(paginationEl, data.page || currentPage, data.total_pages || 1, page => {
      currentPage = page;
      loadResultsPage();
    });
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
