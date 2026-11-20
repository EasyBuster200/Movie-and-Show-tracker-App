// One season of a show (?id=<tmdbId>&season=<n>), opened from the Seasons rows on the show's
// detail page: a header with the season's progress, then a card per episode with its still,
// air date, runtime and synopsis, and a watched toggle. Marking an episode watched offers to
// mark every earlier unwatched episode (across all seasons) watched too.

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return { tmdbId: params.get('id'), seasonNumber: Number(params.get('season')) };
}

function formatAirDate(airDate) {
  if (!airDate) return null;
  return parseLocalDate(airDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildEpisodeCard(episode, { watched, isNew, onToggle }) {
  const unreleased = isUnreleased(episode.air_date);
  const hasRealTitle = episode.name && !/^Episode\s+\d+$/i.test(episode.name.trim());
  const card = el('article', `tt-episode${unreleased ? ' tt-episode--unreleased' : ''}`);

  const still = el('div', 'tt-episode__still');
  if (episode.still_path) {
    const img = document.createElement('img');
    img.src = stillUrl(episode.still_path);
    img.alt = '';
    img.loading = 'lazy';
    still.appendChild(img);
  } else {
    still.textContent = unreleased ? 'Coming soon' : '';
  }
  card.appendChild(still);

  const head = el('div', 'tt-episode__head');
  head.appendChild(el('span', 'tt-episode__num', String(episode.episode_number)));
  head.appendChild(el('span', 'tt-episode__title', hasRealTitle ? episode.name : (unreleased ? 'Coming soon' : `Episode ${episode.episode_number}`)));
  if (isNew) head.appendChild(el('span', 'new-pill', 'New'));

  const check = el('button', 'tt-toggle tt-toggle--watch tt-episode__check');
  check.type = 'button';
  const setOn = on => {
    check.classList.toggle('tt-toggle--on', on);
    check.setAttribute('aria-pressed', on ? 'true' : 'false');
    check.setAttribute('aria-label', `${on ? 'Unmark' : 'Mark'} episode ${episode.episode_number} as watched`);
    check.innerHTML = ttIcon('eye', { size: 18, filled: on });
  };
  setOn(watched);
  if (unreleased) {
    check.disabled = true;
    check.setAttribute('aria-label', 'Not aired yet');
  } else {
    check.addEventListener('click', async () => {
      check.disabled = true;
      const now = await onToggle();
      setOn(now);
      check.disabled = false;
    });
  }
  card.setWatched = setOn;
  head.appendChild(check);
  card.appendChild(head);

  const meta = [formatAirDate(episode.air_date), episode.runtime ? `${episode.runtime}m` : null].filter(Boolean).join(' • ');
  if (meta) card.appendChild(el('span', 'tt-episode__meta', meta));

  if (episode.overview && episode.overview.trim()) {
    const body = el('p', 'tt-episode__body', episode.overview);
    card.appendChild(body);
    const more = el('button', 'tt-link', 'Show more');
    more.type = 'button';
    more.style.alignSelf = 'flex-start';
    more.hidden = true;
    more.addEventListener('click', () => {
      const expanded = body.classList.toggle('expanded');
      more.textContent = expanded ? 'Show less' : 'Show more';
    });
    card.appendChild(more);
    requestAnimationFrame(() => { more.hidden = body.scrollHeight <= body.clientHeight; });
  }
  return card;
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;
  const { tmdbId, seasonNumber } = getParams();
  const listEl = document.getElementById('episode-list');
  if (!tmdbId || !seasonNumber) {
    listEl.innerHTML = '<p class="empty-note">This season couldn\'t be found.</p>';
    return;
  }
  document.querySelector('[data-back]').dataset.back = `detail.html?type=tv&id=${tmdbId}`;

  for (let i = 0; i < 3; i++) {
    const sk = el('div', 'tt-episode skeleton');
    sk.appendChild(el('div', 'tt-episode__still skeleton-shimmer'));
    sk.appendChild(el('div', 'skeleton-line skeleton-shimmer'));
    sk.appendChild(el('div', 'skeleton-line short skeleton-shimmer'));
    listEl.appendChild(sk);
  }

  const [show, season, progress] = await Promise.all([
    fetchJson(`/api/tmdb/tv/${tmdbId}`),
    fetchJson(`/api/tmdb/tv/${tmdbId}/season/${seasonNumber}`),
    fetchJson(`/api/watched/shows/${tmdbId}/episodes`),
  ]);

  const showTitle = show.name || 'Show';
  const seasonName = season.name || `Season ${seasonNumber}`;
  document.title = `${showTitle} · ${seasonName}`;
  document.getElementById('show-title').textContent = showTitle;
  document.getElementById('season-title').textContent = seasonName;
  document.querySelector('[data-back]').setAttribute('aria-label', `Back to ${showTitle}`);

  const watchedSet = new Set(progress.episodes.map(e => `${e.seasonNumber}:${e.episodeNumber}`));
  const episodes = season.episodes || [];
  const countEl = document.getElementById('season-count');
  const bar = buildProgressBar(0, episodes.length, `${seasonName} progress`);
  document.getElementById('season-progress').appendChild(bar);

  function updateProgress() {
    const watched = episodes.filter(ep => watchedSet.has(`${seasonNumber}:${ep.episode_number}`)).length;
    countEl.textContent = `${watched}/${episodes.length} watched`;
    bar.setProgress(watched, episodes.length);
  }

  const cards = new Map();
  const seasonCounts = new Map((show.seasons || []).filter(s => s.season_number > 0).map(s => [s.season_number, s.episode_count]));

  async function setWatched(s, e, on) {
    await fetch(`/api/watched/shows/${tmdbId}/season/${s}/episode/${e}`, { method: on ? 'POST' : 'DELETE', credentials: 'same-origin' });
    const key = `${s}:${e}`;
    if (on) watchedSet.add(key);
    else watchedSet.delete(key);
    if (s === seasonNumber && cards.has(e)) cards.get(e).setWatched(on);
  }

  // Every earlier aired episode, across all seasons, that isn't watched yet.
  function unwatchedBefore(e) {
    const before = [];
    seasonCounts.forEach((count, s) => {
      const last = s < seasonNumber ? count : s === seasonNumber ? e - 1 : 0;
      for (let n = 1; n <= last; n++) if (!watchedSet.has(`${s}:${n}`)) before.push([s, n]);
    });
    return before;
  }

  listEl.innerHTML = '';
  episodes.forEach(episode => {
    const key = `${seasonNumber}:${episode.episode_number}`;
    const isNew = !watchedSet.has(key) && !isUnreleased(episode.air_date)
      && progress.lastWatchedAt && new Date(episode.air_date) > new Date(progress.lastWatchedAt);
    const card = buildEpisodeCard(episode, {
      watched: watchedSet.has(key),
      isNew,
      onToggle: async () => {
        const nowWatched = !watchedSet.has(key);
        await setWatched(seasonNumber, episode.episode_number, nowWatched);
        updateProgress();
        if (nowWatched) {
          const before = unwatchedBefore(episode.episode_number);
          if (before.length) {
            const ok = await confirmDialog({
              title: 'Catch up?',
              message: `You have ${before.length} unwatched episode${before.length === 1 ? '' : 's'} before this one. Mark ${before.length === 1 ? 'it' : 'them'} as watched too?`,
              confirmLabel: 'Mark watched',
              cancelLabel: 'No',
            });
            if (ok) {
              await Promise.all(before.map(([s, n]) => setWatched(s, n, true)));
              updateProgress();
            }
          }
        }
        return nowWatched;
      },
    });
    cards.set(episode.episode_number, card);
    listEl.appendChild(card);
  });
  if (episodes.length === 0) listEl.innerHTML = '<p class="empty-note">No episodes announced yet.</p>';
  updateProgress();
});
