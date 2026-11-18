// Stats page (reached by tapping Stats on Profile): the summary tiles, watch time per month,
// top genres, top actors, how you rate, and per-show progress. Each section loads on its own
// (GET /api/stats, /api/stats/details, /api/stats/actors, /api/watched/shows?includeStatus=true),
// so a slow one - top actors needs one credits lookup per title the first time - doesn't hold up
// the rest.

const PROGRESS_POSTER_URL = 'https://image.tmdb.org/t/p/w92';

const STATUS_LABELS = {
  watching: 'Watching',
  caught_up: 'Caught up',
  completed: 'Completed',
  dropped: 'Dropped',
  unknown: 'Unknown',
};
const STATUS_ORDER = ['watching', 'caught_up', 'dropped', 'completed', 'unknown'];

function showSectionMessage(el, message) {
  el.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'stats-note';
  p.textContent = message;
  el.appendChild(p);
}

function renderLoading(el) {
  showSectionMessage(el, 'Loading…');
}

function formatHours(minutes) {
  const hours = minutes / 60;
  if (hours === 0) return '0h';
  return hours < 10 ? `${Math.round(hours * 10) / 10}h` : `${Math.round(hours)}h`;
}

function renderMonthChart(monthly) {
  const chart = document.getElementById('month-chart');
  chart.innerHTML = '';
  const max = Math.max(...monthly.map(m => m.minutes), 1);
  if (monthly.every(m => m.minutes === 0)) {
    showSectionMessage(chart, 'Nothing watched in the last 12 months yet.');
    return;
  }
  monthly.forEach(({ month, minutes }) => {
    const [year, mon] = month.split('-').map(Number);
    const label = new Date(year, mon - 1, 1).toLocaleDateString(undefined, { month: 'short' });
    const col = document.createElement('div');
    col.className = 'month-bar';
    col.title = `${new Date(year, mon - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}: ${formatHours(minutes)}`;
    col.innerHTML = `
      <span class="month-bar-value">${minutes ? formatHours(minutes) : ''}</span>
      <span class="month-bar-track"><span class="month-bar-fill" style="height:${(minutes / max) * 100}%"></span></span>
      <span class="month-bar-label">${label}</span>`;
    chart.appendChild(col);
  });
}

function renderBarList(el, rows) {
  el.innerHTML = '';
  const max = Math.max(...rows.map(r => r.value), 1);
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span class="bar-label"></span>
      <span class="bar-track"><span class="bar-fill" style="width:${(r.value / max) * 100}%"></span></span>
      <span class="bar-value">${r.value}</span>`;
    row.querySelector('.bar-label').textContent = r.label;
    el.appendChild(row);
  });
}

function starLabel(rating) {
  const stars = rating / 2;
  return `${Number.isInteger(stars) ? stars : stars.toFixed(1)} ★`;
}

async function loadDetails() {
  const genreEl = document.getElementById('genre-list');
  const ratingEl = document.getElementById('rating-list');
  const chart = document.getElementById('month-chart');
  [genreEl, ratingEl, chart].forEach(renderLoading);
  try {
    const details = await fetch('/api/stats/details', { credentials: 'same-origin' }).then(r => r.json());
    renderMonthChart(details.monthly);

    if (details.genres.length) {
      renderBarList(genreEl, details.genres.map(g => ({ label: g.name, value: g.count })));
    } else {
      showSectionMessage(genreEl, 'Watch something to see your top genres.');
    }

    if (details.ratings.some(r => r.count > 0)) {
      // Highest first, as half-stars (ratings are stored 1-10).
      renderBarList(ratingEl, details.ratings.slice().reverse().map(r => ({ label: starLabel(r.rating), value: r.count })));
    } else {
      showSectionMessage(ratingEl, "You haven't rated anything yet.");
    }
  } catch (error) {
    console.error('Failed to load stats details:', error);
    [genreEl, ratingEl, chart].forEach(el => showSectionMessage(el, "Couldn't load these stats."));
  }
}

async function loadActors() {
  const el = document.getElementById('actor-list');
  renderSkeletonRow(el);
  try {
    const actors = await fetch('/api/stats/actors', { credentials: 'same-origin' }).then(r => r.json());
    el.innerHTML = '';
    if (!actors.length) {
      showSectionMessage(el, 'Watch something to see your top actors.');
      return;
    }
    actors.forEach(actor => {
      el.appendChild(buildPersonCard({
        tmdbId: actor.id,
        name: actor.name,
        profilePath: actor.profilePath,
        knownForDepartment: `${actor.count} title${actor.count === 1 ? '' : 's'}`,
      }));
    });
  } catch (error) {
    console.error('Failed to load top actors:', error);
    showSectionMessage(el, "Couldn't load your top actors.");
  }
}

function buildProgressRow(show) {
  const row = document.createElement('a');
  row.className = 'progress-row';
  row.href = `detail.html?type=tv&id=${encodeURIComponent(show.tmdbId)}`;

  // A plain block keeps the row's shape when there's no poster (an <img> without a src would
  // show a broken-image outline).
  const img = document.createElement(show.posterPath ? 'img' : 'div');
  img.className = 'schedule-poster';
  if (show.posterPath) {
    img.alt = '';
    img.loading = 'lazy';
    img.src = `${PROGRESS_POSTER_URL}${show.posterPath}`;
  }
  row.appendChild(img);

  const aired = show.airedCount || 0;
  const watchedAired = aired - (show.unwatchedCount || 0);
  const pct = aired ? Math.round((watchedAired / aired) * 100) : 0;

  const body = document.createElement('div');
  body.className = 'progress-body';
  body.innerHTML = `
    <div class="progress-head">
      <p class="schedule-title"></p>
      <span class="status-pill status-${show.status}">${STATUS_LABELS[show.status] || show.status}</span>
    </div>
    <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
    <p class="card-meta">${watchedAired}/${aired} aired episodes · ${pct}%</p>`;
  body.querySelector('.schedule-title').textContent = show.title;
  row.appendChild(body);
  return row;
}

async function loadProgress() {
  const el = document.getElementById('progress-list');
  renderLoading(el);
  try {
    const shows = await fetch('/api/watched/shows?includeStatus=true', { credentials: 'same-origin' }).then(r => r.json());
    el.innerHTML = '';
    if (!shows.length) {
      showSectionMessage(el, 'Start a show to see your progress here.');
      return;
    }
    shows
      .slice()
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''))
      .forEach(show => el.appendChild(buildProgressRow(show)));
  } catch (error) {
    console.error('Failed to load show progress:', error);
    showSectionMessage(el, "Couldn't load your show progress.");
  }
}

async function loadSummary() {
  try {
    const stats = await fetch('/api/stats', { credentials: 'same-origin' }).then(r => r.json());
    renderStatTiles(document.getElementById('stats-grid'), stats);
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'profile.html';
  });
  loadSummary();
  loadDetails();
  loadActors();
  loadProgress();
});
