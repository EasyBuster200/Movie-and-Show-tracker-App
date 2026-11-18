// Airing Soon page: a week strip of upcoming days on top (days with episodes are marked; tap
// one to jump to it), and below it every announced upcoming episode of every tracked show, in
// order, grouped by day. Data: GET /api/watched/shows/schedule (localApi.js). Reached by tapping
// Airing Soon on Home.

const STRIP_MIN_DAYS = 14; // always show at least two weeks
const STRIP_MAX_DAYS = 120; // episodes further out than this are still in the list, just not the strip

const POSTER_THUMB_URL = 'https://image.tmdb.org/t/p/w92';

function parseLocalDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dayHeading(dateStr, todayStr) {
  const date = parseLocalDate(dateStr);
  const full = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (dateStr === todayStr) return `Today · ${full}`;
  if (dateStr === localDateString(addDays(parseLocalDate(todayStr), 1))) return `Tomorrow · ${full}`;
  return full;
}

function groupByDay(schedule) {
  const groups = new Map();
  schedule.forEach(ep => {
    if (!groups.has(ep.airDate)) groups.set(ep.airDate, []);
    groups.get(ep.airDate).push(ep);
  });
  return groups;
}

function selectStripDay(dateStr) {
  document.querySelectorAll('.week-day').forEach(btn => btn.classList.toggle('active', btn.dataset.date === dateStr));
}

function renderWeekStrip(groups, todayStr) {
  const strip = document.getElementById('week-strip');
  strip.innerHTML = '';
  const today = parseLocalDate(todayStr);
  const lastDate = [...groups.keys()].pop();
  const span = lastDate ? Math.round((parseLocalDate(lastDate) - today) / 86400000) + 1 : 0;
  const days = Math.min(Math.max(span, STRIP_MIN_DAYS), STRIP_MAX_DAYS);

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const dateStr = localDateString(date);
    const count = groups.has(dateStr) ? groups.get(dateStr).length : 0;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `week-day${count ? ' has-episodes' : ''}${i === 0 ? ' today' : ''}`;
    btn.dataset.date = dateStr;
    btn.setAttribute('aria-label', `${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${count} episode${count === 1 ? '' : 's'}`);
    // Month label on the first day and on each 1st, so the strip is readable across months.
    const monthLabel = i === 0 || date.getDate() === 1 ? date.toLocaleDateString(undefined, { month: 'short' }) : '';
    btn.innerHTML = `
      <span class="week-day-month">${monthLabel}</span>
      <span class="week-day-name">${date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
      <span class="week-day-number">${date.getDate()}</span>
      <span class="week-day-dot">${count ? count : ''}</span>`;
    btn.disabled = count === 0;
    btn.addEventListener('click', () => {
      selectStripDay(dateStr);
      const target = document.getElementById(`day-${dateStr}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    strip.appendChild(btn);
  }
}

function buildEpisodeRow(ep) {
  const row = document.createElement('a');
  row.className = 'schedule-row';
  row.href = `detail.html?type=tv&id=${encodeURIComponent(ep.tmdbId)}`;

  // A plain block keeps the row's shape when there's no poster (an <img> without a src would
  // show a broken-image outline).
  const img = document.createElement(ep.posterPath ? 'img' : 'div');
  img.className = 'schedule-poster';
  if (ep.posterPath) {
    img.alt = '';
    img.loading = 'lazy';
    img.src = `${POSTER_THUMB_URL}${ep.posterPath}`;
  }
  row.appendChild(img);

  const text = document.createElement('div');
  text.className = 'schedule-text';
  const title = document.createElement('p');
  title.className = 'schedule-title';
  title.textContent = ep.title;
  const meta = document.createElement('p');
  meta.className = 'card-meta';
  const hasRealName = ep.name && !/^Episode\s+\d+$/i.test(ep.name.trim());
  meta.textContent = `S${ep.seasonNumber} E${ep.episodeNumber}${hasRealName ? ` · ${ep.name}` : ''}`;
  text.appendChild(title);
  text.appendChild(meta);
  row.appendChild(text);
  return row;
}

function renderScheduleList(groups, todayStr) {
  const list = document.getElementById('schedule-list');
  list.innerHTML = '';
  groups.forEach((episodes, dateStr) => {
    const section = document.createElement('section');
    section.className = 'schedule-day';
    section.id = `day-${dateStr}`;
    const heading = document.createElement('h3');
    heading.className = 'schedule-day-heading';
    heading.textContent = dayHeading(dateStr, todayStr);
    section.appendChild(heading);
    episodes.forEach(ep => section.appendChild(buildEpisodeRow(ep)));
    list.appendChild(section);
  });
}

function renderScheduleSkeleton() {
  const list = document.getElementById('schedule-list');
  list.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const row = document.createElement('div');
    row.className = 'schedule-row skeleton-row';
    row.innerHTML = '<div class="schedule-poster skeleton-shimmer"></div><div class="schedule-text"><p class="skeleton-line skeleton-shimmer"></p><p class="skeleton-line skeleton-shimmer short"></p></div>';
    list.appendChild(row);
  }
}

async function loadSchedule() {
  const emptyEl = document.getElementById('schedule-empty');
  const todayStr = localDateString(new Date());
  emptyEl.hidden = true;
  renderWeekStrip(new Map(), todayStr);
  renderScheduleSkeleton();

  try {
    const response = await fetch('/api/watched/shows/schedule', { credentials: 'same-origin' });
    const schedule = response.ok ? await response.json() : [];
    const groups = groupByDay(schedule);
    renderWeekStrip(groups, todayStr);
    renderScheduleList(groups, todayStr);
    if (schedule.length === 0) {
      emptyEl.textContent = "Nothing announced yet for the shows you're tracking.";
      emptyEl.hidden = false;
    } else {
      selectStripDay(schedule[0].airDate);
    }
  } catch (error) {
    console.error('Failed to load the schedule:', error);
    document.getElementById('schedule-list').innerHTML = '';
    emptyEl.textContent = "Couldn't load upcoming episodes. Check your connection and try again.";
    emptyEl.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'main.html';
  });
  loadSchedule();
});
