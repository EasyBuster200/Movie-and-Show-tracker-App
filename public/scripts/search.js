// The search field's typeahead (Home, Movies, Shows, Search): results drop down under it as
// you type, and Enter opens the full results page. The input's `data-search-type` ("movie" or
// "tv") limits it to one kind, as on the Movies and Shows pages.
const SEARCH_DEBOUNCE_MS = 300;

function searchEndpoint(query, type) {
  const q = encodeURIComponent(query);
  return type ? `/api/tmdb/search/${type}?query=${q}` : `/api/tmdb/search/multi?query=${q}`;
}

function initSearchBar() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  if (!input || !resultsEl) return;
  const type = input.dataset.searchType || '';

  let debounceTimer = null;
  let activeController = null;

  function closeResults() {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
  }

  async function runSearch(query) {
    if (activeController) activeController.abort();
    activeController = new AbortController();
    try {
      const response = await fetch(searchEndpoint(query, type), {
        credentials: 'same-origin',
        signal: activeController.signal,
      });
      const data = await response.json();
      // Single-type searches don't tag results with media_type; add it.
      const results = (data.results || []).map(r => (type ? { ...r, media_type: type } : r));
      renderSearchResultRows(resultsEl, results, null, { includePersons: !type, limit: 6 });
      resultsEl.hidden = false;
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Search failed:', error);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (!query) {
      closeResults();
      return;
    }
    debounceTimer = setTimeout(() => runSearch(query), SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    const query = input.value.trim();
    if (!query) return;
    const params = new URLSearchParams({ q: query });
    if (type) params.set('type', type);
    window.location.href = `search.html?${params.toString()}`;
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-bar')) closeResults();
  });
}

document.addEventListener('DOMContentLoaded', initSearchBar);
