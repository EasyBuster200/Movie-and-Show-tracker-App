const ENDPOINTS = {
  'watched:movie': '/api/watched/movies/details',
  // includeStatus adds each show's watching/caught_up/completed/dropped status (localApi.js's
  // computeShowStatus), which the filter chips below use.
  'watched:tv': '/api/watched/shows?includeStatus=true',
  'favorites:movie': '/api/favorites/movies',
  'favorites:tv': '/api/favorites/tv',
};

// Filter chips on the watched-shows list. `null` status = all.
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

function getListParams() {
  const params = new URLSearchParams(window.location.search);
  const sourceParam = params.get('source');
  let source = sourceParam === 'favorites' ? 'favorites' : 'watched';
  let type = params.get('type') === 'tv' ? 'tv' : 'movie';
  let filter = SHOW_FILTERS.some(f => f.key === params.get('filter')) ? params.get('filter') : 'all';
  // Older "in progress" links: the same list, pre-filtered to Watching.
  if (sourceParam === 'in-progress') {
    source = 'watched';
    type = 'tv';
    filter = 'watching';
  }
  return { source, type, filter };
}

function getListLabels(source, type) {
  const sourceLabel = source === 'favorites' ? 'Favorite' : 'Watched';
  const typeLabel = type === 'tv' ? 'Shows' : 'Movies';
  return { sourceLabel, typeLabel };
}

// The fetched list, kept so switching filter chips doesn't refetch.
let loadedItems = null;

function renderFilterChips(state, context) {
  const bar = document.getElementById('media-list-filters');
  bar.innerHTML = '';
  bar.hidden = false;
  SHOW_FILTERS.forEach(f => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `list-chip${f.key === state.filter ? ' active' : ''}`;
    chip.textContent = f.label;
    chip.addEventListener('click', () => {
      state.filter = f.key;
      const url = new URL(window.location.href);
      url.searchParams.set('filter', f.key);
      url.searchParams.set('source', 'watched');
      window.history.replaceState(null, '', url);
      renderFilterChips(state, context);
      renderItems(state, context);
    });
    bar.appendChild(chip);
  });
}

function renderItems(state, context) {
  const { source, type, filter } = state;
  const grid = document.getElementById('media-list-grid');
  const emptyEl = document.getElementById('media-list-empty');
  const isShowList = source === 'watched' && type === 'tv';
  const status = isShowList ? SHOW_FILTERS.find(f => f.key === filter).status : null;
  const items = status ? loadedItems.filter(item => item.status === status) : loadedItems;

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.hidden = true;
    emptyEl.hidden = false;
    const { sourceLabel, typeLabel } = getListLabels(source, type);
    emptyEl.textContent = isShowList ? SHOW_FILTER_EMPTY[filter] : `No ${sourceLabel.toLowerCase()} ${typeLabel.toLowerCase()} yet.`;
    return;
  }

  grid.hidden = false;
  emptyEl.hidden = true;

  items.forEach(item => {
    const card = buildCard(item);

    if (isShowList && item.total != null) {
      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);
    }

    attachStandardActions(card, item, context, { onChange: () => loadMediaList(state, context) });
    grid.appendChild(card);
  });
}

async function loadMediaList(state, context) {
  const grid = document.getElementById('media-list-grid');
  const emptyEl = document.getElementById('media-list-empty');
  grid.hidden = false;
  emptyEl.hidden = true;
  grid.innerHTML = '';
  renderSkeletonRow(grid);

  loadedItems = await fetch(ENDPOINTS[`${state.source}:${state.type}`], { credentials: 'same-origin' }).then(r => r.json());
  if (state.source === 'watched' && state.type === 'tv') renderFilterChips(state, context);
  renderItems(state, context);
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'profile.html';
  });

  const state = getListParams();
  const { sourceLabel, typeLabel } = getListLabels(state.source, state.type);
  const title = `${user.displayName}'s ${sourceLabel} ${typeLabel}`;
  document.getElementById('media-list-heading').textContent = title;
  document.title = title;

  const context = await fetchStandardActionContext();
  loadMediaList(state, context);
});
