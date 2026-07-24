function renderHeader(user) {
  document.getElementById('profile-name').textContent = user.displayName;
  document.getElementById('profile-email').textContent = user.email;

  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  document.getElementById('profile-avatar').textContent = initials;
}

function formatWatchTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

async function loadStats() {
  const stats = await fetch('/api/stats', { credentials: 'same-origin' }).then(r => r.json());
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '';

  const tiles = [
    { label: 'Movies Watched', value: stats.moviesWatched },
    { label: 'Shows Tracked', value: stats.showsTracked },
    { label: 'Episodes Watched', value: stats.episodesWatched },
    { label: 'Total Watch Time', value: formatWatchTime(stats.totalWatchMinutes) },
    { label: 'Favorites', value: stats.favorites },
    { label: 'Avg Rating Given', value: stats.averageRating != null ? `${stats.averageRating}/10` : '—' },
  ];

  tiles.forEach(tile => {
    const tileEl = document.createElement('div');
    tileEl.className = 'stat-tile';

    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = tile.value;

    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = tile.label;

    tileEl.appendChild(valueEl);
    tileEl.appendChild(labelEl);
    grid.appendChild(tileEl);
  });
}

const MEDIA_SECTIONS = [
  { url: '/api/watched/movies/details', containerId: 'watched-movies-container', empty: 'No watched movies yet.' },
  { url: '/api/favorites/movies', containerId: 'favorite-movies-container', empty: 'No favorite movies yet.' },
  { url: '/api/watched/shows', containerId: 'watched-shows-container', empty: 'No shows tracked yet.', showProgress: true },
  { url: '/api/favorites/tv', containerId: 'favorite-shows-container', empty: 'No favorite shows yet.' },
];

// Shared across refreshes so per-card button states (watched/favorite) stay in sync
// without re-fetching them every time a section reloads.
let actionContext = null;

async function renderSection(section) {
  const container = document.getElementById(section.containerId);
  const items = await fetch(section.url, { credentials: 'same-origin' }).then(r => r.json());

  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = `<p>${section.empty}</p>`;
    return;
  }

  items.forEach(item => {
    const card = buildCard(item);

    if (section.showProgress && item.total != null) {
      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);
    }

    attachStandardActions(card, item, actionContext, { onChange: refreshAll });
    container.appendChild(card);
  });
}

// Any watched/favorite/episode/rating toggle on this page can change what belongs in
// these lists and the stats, so every toggle triggers a full refresh rather than trying
// to patch individual cards.
async function refreshAll() {
  await Promise.all([loadStats(), ...MEDIA_SECTIONS.map(renderSection)]);
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  renderHeader(user);
  actionContext = await fetchStandardActionContext();
  refreshAll();
});
