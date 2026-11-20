// Airing Soon (opened from Home): a strip of upcoming days in the header (days with episodes
// show how many; tap one to jump to it), then every announced upcoming episode of every tracked
// show, in date order. Data: GET /api/watched/shows/schedule (localApi.js).

const STRIP_MIN_DAYS = 14; // always show at least two weeks
const STRIP_MAX_DAYS = 120; // episodes further out are still listed, just not in the strip

function addDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function countByDay(schedule) {
  const counts = new Map();
  schedule.forEach(ep => counts.set(ep.airDate, (counts.get(ep.airDate) || 0) + 1));
  return counts;
}

function selectStripDay(dateStr) {
  document.querySelectorAll('.week-day').forEach(btn => btn.classList.toggle('is-active', btn.dataset.date === dateStr));
}

function renderWeekStrip(counts, todayStr) {
  const strip = document.getElementById('week-strip');
  strip.innerHTML = '';
  const today = parseLocalDate(todayStr);
  const lastDate = [...counts.keys()].sort().pop();
  const span = lastDate ? Math.round((parseLocalDate(lastDate) - today) / 86400000) + 1 : 0;
  const days = Math.min(Math.max(span, STRIP_MIN_DAYS), STRIP_MAX_DAYS);

  for (let i = 0; i < days; i++) {
    const date = addDays(today, i);
    const dateStr = localDateString(date);
    const count = counts.get(dateStr) || 0;

    const btn = el('button', `week-day${i === 0 ? ' is-today' : ''}`);
    btn.type = 'button';
    btn.dataset.date = dateStr;
    btn.disabled = count === 0;
    btn.setAttribute('aria-label', `${date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}: ${count} episode${count === 1 ? '' : 's'}`);
    // Month label on the first day and on each 1st, so the strip reads across months.
    btn.appendChild(el('span', 'week-day__month', i === 0 || date.getDate() === 1 ? date.toLocaleDateString(undefined, { month: 'short' }) : ''));
    btn.appendChild(el('span', 'week-day__dow', date.toLocaleDateString(undefined, { weekday: 'short' })));
    btn.appendChild(el('span', 'week-day__num', String(date.getDate())));
    btn.appendChild(el('span', 'week-day__count', count ? String(count) : ''));
    btn.addEventListener('click', () => {
      selectStripDay(dateStr);
      const target = document.querySelector(`#schedule-list [data-date="${dateStr}"]`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    strip.appendChild(btn);
  }
}

async function loadSchedule() {
  const emptyEl = document.getElementById('schedule-empty');
  const list = document.getElementById('schedule-list');
  const todayStr = localDateString(new Date());
  renderWeekStrip(new Map(), todayStr);
  for (let i = 0; i < 5; i++) list.appendChild(buildSkeletonMediaRow());

  try {
    const response = await fetch('/api/watched/shows/schedule', { credentials: 'same-origin' });
    const schedule = response.ok ? await response.json() : [];
    renderWeekStrip(countByDay(schedule), todayStr);
    list.innerHTML = '';
    document.getElementById('schedule-count').textContent =
      schedule.length ? `${schedule.length} upcoming episode${schedule.length === 1 ? '' : 's'}` : '';
    schedule.forEach(ep => list.appendChild(buildAiringRow({
      href: `detail.html?type=tv&id=${encodeURIComponent(ep.tmdbId)}`,
      title: ep.title,
      airDate: ep.airDate,
      seasonNumber: ep.seasonNumber,
      episodeNumber: ep.episodeNumber,
      episodeName: ep.name,
    })));
    if (schedule.length === 0) {
      emptyEl.textContent = "Nothing announced yet for the shows you're tracking.";
      emptyEl.hidden = false;
    } else {
      selectStripDay(schedule[0].airDate);
    }
  } catch (error) {
    console.error('Failed to load the schedule:', error);
    list.innerHTML = '';
    emptyEl.textContent = "Couldn't load upcoming episodes. Check your connection and try again.";
    emptyEl.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  loadSchedule();
});
