// The "See all" page: one grid template for every full list in the app, picked by ?source=.
//   watched / favorites (&type=movie|tv)  - your watched or favourite movies/shows. Watched
//                                           shows get status chips (?filter=).
//   list (&id=, optional &type=)          - one of your lists, or the Watchlist. Posters get a
//                                           remove ×, a tile to add titles, and a Delete menu.
//   trending / popular / upcoming / recommended (&type=), similar (&type=&id=)
//                                         - TMDB feeds, paged with Prev/Next.
// Local sources can be sorted: Recently added / A–Z / Rating.

const LOCAL_ENDPOINTS = {
  'watched:movie': '/api/watched/movies/details',
  // includeStatus adds each show's watching/caught_up/completed/dropped status (localApi.js).
  'watched:tv': '/api/watched/shows?includeStatus=true',
  'favorites:movie': '/api/favorites/movies',
  'favorites:tv': '/api/favorites/tv',
};

const SHOW_FILTERS = [
  { key: 'all', label: 'All', status: null },
  { key: 'watching', label: 'Watching', status: 'watching' },
  { key: 'caught-up', label: 'Caught up', status: 'caught_up' },
  { key: 'completed', label: 'Completed', status: 'completed' },
  { key: 'dropped', label: 'Dropped', status: 'dropped' },
];
const SHOW_FILTER_EMPTY = {
  all: 'No watched shows yet.',
  watching: 'No shows in progress right now.',
  'caught-up': "You're not caught up on any ongoing shows.",
  completed: 'No completed shows yet.',
  dropped: 'No dropped shows.',
};

const SORTS = [
  { key: 'recent', label: 'Recently added' },
  { key: 'title', label: 'A–Z' },
  { key: 'rating', label: 'Rating' },
];

const TYPE_LABELS = { movie: 'Movies', tv: 'Shows' };

function feedUrl(state, page) {
  const { source, type, id } = state;
  const region = getUserRegion();
  if (source === 'trending') return `/api/tmdb/trending/${type}/day?language=en-US&page=${page}`;
  if (source === 'popular') return `/api/tmdb/discover/${type}?sort_by=popularity.desc&with_origin_country=${region}&language=en-US&page=${page}`;
  if (source === 'upcoming') return `/api/tmdb/movie/upcoming?language=en-US&page=${page}`;
  if (source === 'similar') return `/api/tmdb/${type}/${id}/recommendations?language=en-US&page=${page}`;
  return null;
}

const FEED_TITLES = {
  trending: type => `Trending ${TYPE_LABELS[type]}`,
  popular: type => `Popular ${TYPE_LABELS[type]}`,
  upcoming: () => 'Coming Soon',
  recommended: type => `Recommended ${TYPE_LABELS[type]}`,
  similar: () => 'More Like This',
};

function getState() {
  const params = new URLSearchParams(window.location.search);
  let source = params.get('source') || 'watched';
  let type = params.get('type') === 'tv' ? 'tv' : (params.get('type') === 'movie' ? 'movie' : null);
  let filter = SHOW_FILTERS.some(f => f.key === params.get('filter')) ? params.get('filter') : 'all';
  // Older "in progress" links: the watched shows list, filtered to Watching.
  if (source === 'in-progress') {
    source = 'watched';
    type = 'tv';
    filter = 'watching';
  }
  if (source !== 'list' && !type) type = 'movie';
  return { source, type, filter, id: params.get('id'), sort: 'recent', page: 1, items: [], totalPages: 1 };
}

const isFeed = state => state.source in FEED_TITLES;
const isShowList = state => state.source === 'watched' && state.type === 'tv';

function sortKeyTitle(title) {
  return (title || '').replace(/^(the|a|an)\s+/i, '').toLowerCase();
}

function sortedItems(state) {
  let items = state.items;
  if (isShowList(state)) {
    const status = SHOW_FILTERS.find(f => f.key === state.filter).status;
    if (status) items = items.filter(item => item.status === status);
  }
  if (state.sort === 'title') items = items.slice().sort((a, b) => sortKeyTitle(a.title).localeCompare(sortKeyTitle(b.title)));
  if (state.sort === 'rating') items = items.slice().sort((a, b) => (Number(b.voteAverage) || 0) - (Number(a.voteAverage) || 0));
  return items;
}

function renderChipRow(rowEl, options, selectedKey, onPick) {
  rowEl.innerHTML = '';
  rowEl.hidden = false;
  options.forEach(o => rowEl.appendChild(buildChip(o.label, { selected: o.key === selectedKey, onClick: () => onPick(o.key) })));
}

function renderControls(state, context) {
  if (isFeed(state)) return;
  renderChipRow(document.getElementById('media-list-sorts'), SORTS, state.sort, key => {
    state.sort = key;
    renderControls(state, context);
    renderGrid(state, context);
  });
  if (isShowList(state)) {
    renderChipRow(document.getElementById('media-list-filters'), SHOW_FILTERS, state.filter, key => {
      state.filter = key;
      const url = new URL(window.location.href);
      url.searchParams.set('filter', key);
      window.history.replaceState(null, '', url);
      renderControls(state, context);
      renderGrid(state, context);
    });
  }
}

function setCount(n) {
  document.getElementById('media-list-count').textContent = `${n} title${n === 1 ? '' : 's'}`;
}

function renderGrid(state, context) {
  const grid = document.getElementById('media-list-grid');
  const emptyEl = document.getElementById('media-list-empty');
  const items = sortedItems(state);
  grid.innerHTML = '';
  if (!isFeed(state)) setCount(items.length);

  // An empty list still shows its "Add a title" tile, so it needs no message.
  emptyEl.hidden = items.length > 0 || state.source === 'list';
  if (items.length === 0 && state.source !== 'list') {
    if (isShowList(state)) emptyEl.textContent = SHOW_FILTER_EMPTY[state.filter];
    else if (isFeed(state)) emptyEl.textContent = 'Nothing here yet.';
    else emptyEl.textContent = `No ${state.source === 'favorites' ? 'favourite' : 'watched'} ${TYPE_LABELS[state.type].toLowerCase()} yet.`;
  }

  items.forEach(item => {
    const card = buildCard(item);
    if (isShowList(state) && item.total != null) addCardDetail(card, `${item.watched}/${item.total} episodes watched`);
    if (state.source === 'list') {
      attachRemoveButton(card, item, state.listId, () => {
        state.items = state.items.filter(i => i !== item);
        renderGrid(state, context);
      }, { listName: state.listName });
      attachStandardActions(card, item, context, { includeSave: false });
    } else {
      attachStandardActions(card, item, context, { onChange: isFeed(state) ? null : () => loadLocal(state, context) });
    }
    grid.appendChild(card);
  });

  if (state.source === 'list') grid.appendChild(buildAddTile(state, context));
}

// A dashed tile at the end of a list's grid: search TMDB and add a title.
function buildAddTile(state, context) {
  const tile = el('button', 'tile-btn');
  tile.type = 'button';
  tile.innerHTML = `${ttIcon('plus', { size: 24 })}<span>Add a title</span>`;
  tile.addEventListener('click', () => openAddDialog(state, context));
  return tile;
}

function openAddDialog(state, context) {
  const { overlay, modal } = openDialog();
  modal.appendChild(el('h2', null, `Add to ${state.listName}`));
  const label = el('label', 'tt-search');
  label.innerHTML = ttIcon('search', { size: 20 });
  const input = el('input');
  input.type = 'search';
  input.placeholder = 'Search movies and shows…';
  label.appendChild(input);
  modal.appendChild(label);
  const results = el('div', 'media-rows');
  results.style.maxHeight = '50vh';
  results.style.overflowY = 'auto';
  modal.appendChild(results);
  const close = el('button', 'tt-btn tt-btn--secondary', 'Done');
  close.type = 'button';
  close.addEventListener('click', () => overlay.remove());
  modal.appendChild(close);
  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
  input.focus();

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const query = input.value.trim();
    if (!query) { results.innerHTML = ''; return; }
    timer = setTimeout(async () => {
      const data = await fetchJson(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`);
      const raws = (data.results || []).filter(r => !state.type || r.media_type === state.type);
      renderSearchResultRows(results, raws, async item => {
        await fetch(`/api/lists/${state.listId}/items`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tmdbId: item.tmdbId, mediaType: item.mediaType }),
        });
        overlay.remove();
        loadLocal(state, context);
      });
    }, 300);
  });
}

async function loadLocal(state, context) {
  let items;
  if (state.source === 'list') {
    items = await fetchJson(`/api/lists/${state.listId}/items`);
    if (state.type) items = items.filter(item => item.mediaType === state.type);
  } else {
    items = await fetchJson(LOCAL_ENDPOINTS[`${state.source}:${state.type}`]);
  }
  state.items = items;
  renderGrid(state, context);
}

async function loadFeedPage(state, context) {
  const grid = document.getElementById('media-list-grid');
  grid.innerHTML = '';
  renderSkeletonRow(grid, 9);
  let data;
  if (state.source === 'recommended') {
    const d = await fetchJson(`/api/recommendations/${state.type}?page=${state.page}`);
    data = { items: d.items || [], totalPages: d.totalPages || 1 };
  } else {
    const d = await fetchJson(feedUrl(state, state.page));
    let raws = d.results || [];
    if (state.source === 'upcoming') raws = raws.filter(raw => isUnreleased(raw.release_date));
    data = { items: raws.map(raw => toStandardItem(raw, state.type)), totalPages: Math.min(d.total_pages || 1, 500) };
  }
  state.items = data.items;
  state.totalPages = data.totalPages;
  renderGrid(state, context);
  renderPagination(document.getElementById('media-list-pagination'), state.page, state.totalPages, page => {
    state.page = page;
    loadFeedPage(state, context);
  });
}

function initListMenu(state) {
  const menu = document.getElementById('list-menu');
  const btn = document.getElementById('list-menu-btn');
  const listEl = document.getElementById('list-menu-list');
  menu.hidden = false;
  btn.addEventListener('click', event => {
    event.stopPropagation();
    listEl.hidden = !listEl.hidden;
  });
  document.addEventListener('click', () => { listEl.hidden = true; });
  document.getElementById('delete-list-btn').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete list?',
      message: `Delete "${state.listName}"? The titles in it aren't affected. This can't be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await fetch(`/api/lists/${state.listId}`, { method: 'DELETE', credentials: 'same-origin' });
    window.location.href = 'lists.html';
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  const state = getState();
  const heading = document.getElementById('media-list-heading');
  const nav = document.getElementById('bottom-nav');
  const grid = document.getElementById('media-list-grid');
  renderSkeletonRow(grid, 9);

  let title;
  if (state.source === 'list') {
    const lists = await fetchJson('/api/lists');
    const list = lists.find(l => String(l.id) === String(state.id));
    if (!list) {
      heading.textContent = 'List not found';
      grid.innerHTML = '';
      return;
    }
    state.listId = list.id;
    state.listName = list.is_default ? 'Watchlist' : list.name;
    title = state.type ? `${state.listName} · ${TYPE_LABELS[state.type]}` : state.listName;
    nav.dataset.active = list.is_default ? 'watchlist' : 'lists';
    document.querySelector('[data-back]').dataset.back = list.is_default ? 'bookmarks.html' : 'lists.html';
    if (!list.is_default) initListMenu(state);
  } else if (isFeed(state)) {
    title = FEED_TITLES[state.source](state.type);
    nav.dataset.active = state.type === 'tv' ? 'shows' : 'movies';
    document.querySelector('[data-back]').dataset.back = state.type === 'tv' ? 'shows.html' : 'movies.html';
  } else {
    title = `${state.source === 'favorites' ? 'Favourite' : 'Watched'} ${TYPE_LABELS[state.type]}`;
  }
  heading.textContent = title;
  document.title = title;
  renderBottomNav(nav);

  const context = await fetchStandardActionContext();
  renderControls(state, context);
  if (isFeed(state)) {
    document.getElementById('media-list-count').textContent = '';
    loadFeedPage(state, context);
  } else {
    loadLocal(state, context);
  }
});
