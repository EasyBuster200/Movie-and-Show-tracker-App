const SEARCH_DEBOUNCE_MS = 300;

function initSearchBar() {
  const input = document.getElementById('search-input');
  const resultsEl = document.getElementById('search-results');
  if (!input || !resultsEl) return;

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
      const response = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`, {
        credentials: 'same-origin',
        signal: activeController.signal,
      });
      const data = await response.json();
      renderResults(data.results || []);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Search failed:', error);
    }
  }

  function renderResults(rawResults) {
    renderSearchResultRows(resultsEl, rawResults, item => {
      window.location.href = detailUrl(item);
    });
    resultsEl.hidden = false;
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
    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-bar')) closeResults();
  });
}

document.addEventListener('DOMContentLoaded', initSearchBar);
