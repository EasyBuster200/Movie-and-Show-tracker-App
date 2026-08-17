const ENDPOINTS = {
  'watched:movie': '/api/watched/movies/details',
  'watched:tv': '/api/watched/shows',
  'favorites:movie': '/api/favorites/movies',
  'favorites:tv': '/api/favorites/tv',
  // Same underlying data as watched:tv - "in progress" is just that list filtered down to shows
  // with some but not all episodes watched, mirroring shows.js's Keep Watching row filter.
  'in-progress:tv': '/api/watched/shows?includeNewEpisodes=true',
};

function getListParams() {
  const params = new URLSearchParams(window.location.search);
  const sourceParam = params.get('source');
  const source = sourceParam === 'favorites' || sourceParam === 'in-progress' ? sourceParam : 'watched';
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';
  return { source, type };
}

function getListLabels(source, type) {
  if (source === 'in-progress') return { sourceLabel: 'Shows You’re', typeLabel: 'Watching' };
  const sourceLabel = source === 'favorites' ? 'Favorite' : 'Watched';
  const typeLabel = type === 'tv' ? 'Shows' : 'Movies';
  return { sourceLabel, typeLabel };
}

async function loadMediaList(source, type, context) {
  const grid = document.getElementById('media-list-grid');
  const emptyEl = document.getElementById('media-list-empty');
  const { sourceLabel, typeLabel } = getListLabels(source, type);

  const url = ENDPOINTS[`${source}:${type}`];
  let items = await fetch(url, { credentials: 'same-origin' }).then(r => r.json());
  if (source === 'in-progress') {
    items = items.filter(show => show.watched > 0 && show.total != null && show.watched < show.total);
  }

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = source === 'in-progress' ? 'No shows in progress right now.' : `No ${sourceLabel.toLowerCase()} ${typeLabel.toLowerCase()} yet.`;
    return;
  }

  grid.hidden = false;
  emptyEl.hidden = true;

  items.forEach(item => {
    const card = buildCard(item);

    if ((source === 'watched' || source === 'in-progress') && type === 'tv' && item.total != null) {
      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);
    }

    attachStandardActions(card, item, context, { onChange: () => loadMediaList(source, type, context) });
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'profile.html';
  });

  const { source, type } = getListParams();
  const { sourceLabel, typeLabel } = getListLabels(source, type);
  const title = `${user.displayName}'s ${sourceLabel} ${typeLabel}`;
  document.getElementById('media-list-heading').textContent = title;
  document.title = title;

  const context = await fetchStandardActionContext();
  loadMediaList(source, type, context);
});
