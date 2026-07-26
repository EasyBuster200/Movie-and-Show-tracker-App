function getMediaTypeParam() {
  const params = new URLSearchParams(window.location.search);
  return params.get('type') === 'tv' ? 'tv' : 'movie';
}

async function loadWatchedList(mediaType, context) {
  const grid = document.getElementById('watched-grid');
  const emptyEl = document.getElementById('watched-empty');

  const url = mediaType === 'tv' ? '/api/watched/shows' : '/api/watched/movies/details';
  const items = await fetch(url, { credentials: 'same-origin' }).then(r => r.json());

  grid.innerHTML = '';
  if (items.length === 0) {
    grid.hidden = true;
    emptyEl.hidden = false;
    emptyEl.textContent = mediaType === 'tv' ? 'No watched shows yet.' : 'No watched movies yet.';
    return;
  }

  grid.hidden = false;
  emptyEl.hidden = true;

  items.forEach(item => {
    const card = buildCard(item);

    if (mediaType === 'tv' && item.total != null) {
      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);
    }

    attachStandardActions(card, item, context, { onChange: () => loadWatchedList(mediaType, context) });
    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  const mediaType = getMediaTypeParam();
  const title = `${user.displayName} Watched ${mediaType === 'tv' ? 'Shows' : 'Movies'}`;
  document.getElementById('watched-heading').textContent = title;
  document.title = title;

  const context = await fetchStandardActionContext();
  loadWatchedList(mediaType, context);
});
