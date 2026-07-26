const ENDPOINTS = {
  'watched:movie': '/api/watched/movies/details',
  'watched:tv': '/api/watched/shows',
  'favorites:movie': '/api/favorites/movies',
  'favorites:tv': '/api/favorites/tv',
};

function getListParams() {
  const params = new URLSearchParams(window.location.search);
  const source = params.get('source') === 'favorites' ? 'favorites' : 'watched';
  const type = params.get('type') === 'tv' ? 'tv' : 'movie';
  return { source, type };
}

async function loadMediaList(source, type, context) {
  const grid = document.getElementById('media-list-grid');
  const emptyEl = document.getElementById('media-list-empty');
  const sourceLabel = source === 'favorites' ? 'Favorite' : 'Watched';
  const typeLabel = type === 'tv' ? 'Shows' : 'Movies';

  const url = ENDPOINTS[`${source}:${type}`];
  const items = await fetch(url, { credentials: 'same-origin' }).then(r => r.json());

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = `No ${sourceLabel.toLowerCase()} ${typeLabel.toLowerCase()} yet.`;
    return;
  }

  grid.hidden = false;
  emptyEl.hidden = true;

  items.forEach(item => {
    const card = buildCard(item);

    if (source === 'watched' && type === 'tv' && item.total != null) {
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
  const sourceLabel = source === 'favorites' ? 'Favorite' : 'Watched';
  const typeLabel = type === 'tv' ? 'Shows' : 'Movies';
  const title = `${user.displayName}'s ${sourceLabel} ${typeLabel}`;
  document.getElementById('media-list-heading').textContent = title;
  document.title = title;

  const context = await fetchStandardActionContext();
  loadMediaList(source, type, context);
});
