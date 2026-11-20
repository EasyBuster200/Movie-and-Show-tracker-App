// "Browse All" on the Movies and Shows pages: a collapsible Filter & sort card (sort chips and
// genre chips), then a three-column grid of TMDB's discover results with Prev/Next paging.
// Titles already watched are left out (`excludeIds()` returns their TMDB ids).

const BROWSE_SORTS = [
  { id: 'popular', label: 'Popular' },
  { id: 'rated', label: 'Top rated' },
  { id: 'newest', label: 'Newest' },
];
const BROWSE_COLLAPSED_GENRES = 8;

function browseSortParams(sort, mediaType) {
  const today = new Date().toISOString().slice(0, 10);
  const dateField = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date';
  if (sort === 'rated') return { sort_by: 'vote_average.desc', 'vote_count.gte': '300' };
  if (sort === 'newest') return { sort_by: `${dateField}.desc`, [`${dateField}.lte`]: today, 'vote_count.gte': '20' };
  return { sort_by: 'popularity.desc' };
}

function initBrowse({ mediaType, context, excludeIds = () => new Set() }) {
  const state = { sort: 'popular', genres: [], picked: new Set(), expanded: false, open: false, page: 1 };

  const toggle = document.getElementById('filter-toggle');
  const panel = document.getElementById('filter-panel');
  const summaryEl = document.getElementById('filter-summary');
  const badgeEl = document.getElementById('filter-badge');
  const sortsEl = document.getElementById('filter-sorts');
  const genresEl = document.getElementById('filter-genres');
  const clearBtn = document.getElementById('filter-clear');
  const resultLabel = document.getElementById('browse-result-label');
  const emptyEl = document.getElementById('browse-empty');
  const grid = document.getElementById('browse-grid');
  const pager = document.getElementById('browse-pagination');

  const sortLabel = () => BROWSE_SORTS.find(s => s.id === state.sort).label;
  const pickedNames = () => state.genres.filter(g => state.picked.has(g.id)).map(g => g.name);

  function renderControls() {
    const names = pickedNames();
    toggle.setAttribute('aria-expanded', state.open ? 'true' : 'false');
    panel.hidden = !state.open;
    summaryEl.textContent = `${sortLabel()} · ${names.length ? `${names.length} genre${names.length === 1 ? '' : 's'}` : 'All genres'}`;
    badgeEl.hidden = names.length === 0;
    badgeEl.textContent = names.length;
    clearBtn.hidden = names.length === 0;
    clearBtn.textContent = `Clear (${names.length})`;
    resultLabel.textContent = `${names.length ? names.join(', ') : 'All genres'} · ${sortLabel()}`;

    sortsEl.innerHTML = '';
    BROWSE_SORTS.forEach(s => sortsEl.appendChild(buildChip(s.label, {
      selected: state.sort === s.id,
      onClick: () => { state.sort = s.id; state.page = 1; renderControls(); loadPage(); },
    })));

    genresEl.innerHTML = '';
    const shown = state.expanded
      ? state.genres
      : state.genres.filter((g, i) => i < BROWSE_COLLAPSED_GENRES || state.picked.has(g.id));
    shown.forEach(g => genresEl.appendChild(buildChip(g.name, {
      selected: state.picked.has(g.id),
      check: true,
      onClick: () => {
        if (state.picked.has(g.id)) state.picked.delete(g.id);
        else state.picked.add(g.id);
        state.page = 1;
        renderControls();
        loadPage();
      },
    })));
    const hidden = state.genres.length - shown.length;
    if (state.expanded || hidden > 0) {
      const more = el('button', 'tt-chip tt-chip--ghost', state.expanded ? 'Show less' : `+${hidden} more`);
      more.type = 'button';
      more.setAttribute('aria-expanded', state.expanded ? 'true' : 'false');
      more.addEventListener('click', () => { state.expanded = !state.expanded; renderControls(); });
      genresEl.appendChild(more);
    }
  }

  async function loadPage() {
    const params = new URLSearchParams({
      page: state.page,
      language: 'en-US',
      include_adult: 'false',
      ...browseSortParams(state.sort, mediaType),
    });
    // Any of the picked genres (TMDB: "|" is OR).
    if (state.picked.size) params.set('with_genres', [...state.picked].join('|'));

    emptyEl.hidden = true;
    grid.innerHTML = '';
    renderSkeletonRow(grid, 9);
    try {
      const data = await fetchJson(`/api/tmdb/discover/${mediaType}?${params.toString()}`);
      const skip = excludeIds();
      grid.innerHTML = '';
      const results = (data.results || []).filter(raw => !skip.has(raw.id));
      emptyEl.hidden = results.length > 0;
      results.forEach(raw => {
        const item = toStandardItem(raw, mediaType);
        const card = buildCard(item);
        attachStandardActions(card, item, context);
        grid.appendChild(card);
      });
      // TMDB stops serving discover results after page 500.
      renderPagination(pager, data.page || state.page, Math.min(data.total_pages || 1, 500), page => {
        state.page = page;
        loadPage();
      });
    } catch (error) {
      console.error('Failed to load browse grid:', error);
      grid.innerHTML = '';
      grid.appendChild(el('p', 'empty-note', "Couldn't load this page. Check your connection."));
    }
  }

  toggle.addEventListener('click', () => { state.open = !state.open; renderControls(); });
  clearBtn.addEventListener('click', () => { state.picked.clear(); state.page = 1; renderControls(); loadPage(); });

  fetchJson(`/api/tmdb/genre/${mediaType}/list`)
    .then(data => { state.genres = data.genres || []; renderControls(); })
    .catch(error => console.error('Failed to load genres:', error));

  renderControls();
  loadPage();
}
