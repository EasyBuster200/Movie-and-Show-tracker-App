// Stats (opened from Stats on Profile): the summary tiles, watch time per month, top genres, top
// actors, and per-show progress. Each section loads on its own (GET /api/stats,
// /api/stats/details, /api/stats/actors, /api/watched/shows?includeStatus=true), so a slow one
// - top actors needs a credits lookup per title the first time - doesn't hold up the rest.

const STATUS_LABELS = {
  watching: 'Watching',
  caught_up: 'Caught up',
  completed: 'Completed',
  dropped: 'Dropped',
  unknown: 'Unknown',
};
const STATUS_ORDER = ['watching', 'caught_up', 'dropped', 'completed', 'unknown'];
const TOP_GENRE_COUNT = 6;

function showSectionMessage(container, message) {
  container.innerHTML = '';
  container.appendChild(el('p', 'muted-note', message));
}

function renderMonthChart(monthly) {
  const chart = document.getElementById('month-chart');
  chart.innerHTML = '';
  if (monthly.every(m => m.minutes === 0)) {
    chart.style.display = 'block';
    chart.style.height = 'auto';
    showSectionMessage(chart, 'Nothing watched in the last 12 months yet.');
    return;
  }
  const hours = monthly.map(m => m.minutes / 60);
  const max = Math.max(...hours, 1);
  const peak = monthly[hours.indexOf(Math.max(...hours))];
  const peakDate = parseLocalDate(`${peak.month}-01`);
  chart.setAttribute('aria-label', `Bar chart of hours watched per month, peaking at ${Math.round(max)} hours in ${peakDate.toLocaleDateString(undefined, { month: 'long' })}`);

  monthly.forEach(({ month }, i) => {
    const date = parseLocalDate(`${month}-01`);
    const col = el('div', `month-bar${i === monthly.length - 1 ? ' month-bar--current' : ''}`);
    col.title = `${date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}: ${Math.round(hours[i] * 10) / 10}h`;
    col.appendChild(el('span', 'month-bar__value', hours[i] ? String(Math.round(hours[i])) : ''));
    const fill = el('div', 'month-bar__fill');
    fill.style.height = `${Math.round((hours[i] / max) * 104)}px`;
    col.appendChild(fill);
    col.appendChild(el('span', 'month-bar__label', date.toLocaleDateString(undefined, { month: 'narrow' })));
    chart.appendChild(col);
  });
}

function renderBarList(container, rows) {
  container.innerHTML = '';
  const max = Math.max(...rows.map(r => r.value), 1);
  rows.forEach(r => {
    const row = el('div', 'bar-row');
    row.appendChild(el('span', 'bar-row__label', r.label));
    const track = el('div', 'bar-row__track');
    const fill = el('div', 'bar-row__fill');
    fill.style.width = `${(r.value / max) * 100}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(el('span', 'bar-row__value', String(r.value)));
    container.appendChild(row);
  });
}

async function loadDetails() {
  const genreEl = document.getElementById('genre-list');
  try {
    const details = await fetchJson('/api/stats/details');
    renderMonthChart(details.monthly);

    if (details.genres.length) {
      renderBarList(genreEl, details.genres.slice(0, TOP_GENRE_COUNT).map(g => ({ label: g.name, value: g.count })));
    } else {
      showSectionMessage(genreEl, 'Watch something to see your top genres.');
    }
  } catch (error) {
    console.error('Failed to load stats details:', error);
    [genreEl, document.getElementById('month-chart')].forEach(c => showSectionMessage(c, "Couldn't load these stats."));
  }
}

async function loadActors() {
  const container = document.getElementById('actor-list');
  try {
    const actors = await fetchJson('/api/stats/actors');
    container.innerHTML = '';
    if (!actors.length) {
      showSectionMessage(container, 'Watch something to see your top actors.');
      return;
    }
    actors.forEach(actor => container.appendChild(buildCastCard({
      tmdbId: actor.id,
      name: actor.name,
      role: `${actor.count} title${actor.count === 1 ? '' : 's'}`,
      profilePath: actor.profilePath,
    })));
  } catch (error) {
    console.error('Failed to load top actors:', error);
    showSectionMessage(container, "Couldn't load your top actors.");
  }
}

function buildProgressRow(show) {
  const aired = show.airedCount || 0;
  const watchedAired = aired - (show.unwatchedCount || 0);
  const row = buildMediaRow({
    href: detailUrl(show),
    title: show.title,
    imageSrc: thumbUrl(show.posterPath),
  });
  // Title with the status pill beside it, then the progress through aired episodes.
  const titleEl = row.bodyEl.querySelector('.tt-media__title');
  const head = el('span', 'tt-media__head');
  titleEl.replaceWith(head);
  head.appendChild(titleEl);
  head.appendChild(el('span', `status-pill status-${show.status}`, STATUS_LABELS[show.status] || show.status));
  row.bodyEl.appendChild(buildProgressBar(watchedAired, aired, `${show.title} progress`));
  row.bodyEl.appendChild(el('span', 'tt-media__meta', `${watchedAired}/${aired} aired episodes`));
  return row;
}

async function loadProgress() {
  const container = document.getElementById('progress-list');
  container.appendChild(buildSkeletonMediaRow());
  try {
    const shows = await fetchJson('/api/watched/shows?includeStatus=true');
    container.innerHTML = '';
    if (!shows.length) {
      showSectionMessage(container, 'Start a show to see your progress here.');
      return;
    }
    shows
      .slice()
      .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
        || (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''))
      .forEach(show => container.appendChild(buildProgressRow(show)));
  } catch (error) {
    console.error('Failed to load show progress:', error);
    showSectionMessage(container, "Couldn't load your show progress.");
  }
}

async function loadSummary() {
  try {
    const stats = await fetchJson('/api/stats');
    renderStatTiles(document.getElementById('stats-grid'), stats, { layout: 'stats' });
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  loadSummary();
  loadDetails();
  loadActors();
  loadProgress();
});
