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
    const items = rawResults
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .slice(0, 8)
      .map(normalizeTmdbTrendingItem);

    resultsEl.innerHTML = '';

    if (items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'search-empty';
      empty.textContent = 'No results found.';
      resultsEl.appendChild(empty);
      resultsEl.hidden = false;
      return;
    }

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'search-result-row';

      const img = document.createElement('img');
      img.src = posterUrl(item.posterPath);
      img.alt = item.title;
      row.appendChild(img);

      const info = document.createElement('div');
      info.className = 'search-result-info';

      const title = document.createElement('p');
      title.className = 'search-result-title';
      title.textContent = item.title;
      info.appendChild(title);

      const meta = document.createElement('p');
      meta.className = 'search-result-meta';
      meta.textContent = `${item.year || 'N/A'} • ${item.mediaType === 'movie' ? 'Movie' : 'TV Show'}`;
      info.appendChild(meta);

      row.appendChild(info);

      row.addEventListener('click', () => {
        window.location.href = detailUrl(item);
      });

      resultsEl.appendChild(row);
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

  document.addEventListener('click', event => {
    if (!event.target.closest('.search-bar')) closeResults();
  });
}

document.addEventListener('DOMContentLoaded', initSearchBar);
