// Imports a TV Time GDPR data export (a folder of ~18 CSVs). Two files matter:
//
// - user_tv_show_data.csv (tv_show_id, is_followed, is_favorited, nb_episodes_seen,
//   tv_show_name, user_id) — the full list of followed shows, one row per show.
// - tracking-prod-records.csv — analytics-looking, but its `type=="watch"` rows are one row
//   PER EPISODE ACTUALLY WATCHED (series_id, season_number, episode_number), and their count
//   per show matches user_tv_show_data.csv's nb_episodes_seen exactly. This gives an *exact*
//   watched-episode list, not just a total — despite this file's name, it's more useful here
//   than the "real" show-list file for anything except is_favorited/the show list itself.
//
// If tracking-prod-records.csv isn't selected (or a show has no rows in it, meaning nothing
// watched or an older export that lacks it), we fall back to a cruder heuristic: nb_episodes_seen
// vs TMDB's current episode total decides "mark everything watched" vs "just add to a list".
//
// tv_show_id is a TheTVDB id (TV Time was built on TheTVDB, not TMDB), so each show is resolved
// via TMDB's /find/{id}?external_source=tvdb_id — the one TMDB endpoint that maps external ids.

const TV_TIME_SHOW_LIST_COLUMNS = ['tv_show_id', 'nb_episodes_seen', 'tv_show_name'];
const TV_TIME_WATCH_LOG_COLUMNS = ['series_id', 'type', 'episode_number', 'season_number'];
const TV_TIME_LIST_NAME = 'TV Time Shows';

// Minimal RFC4180-ish CSV line parser (handles quoted fields with embedded commas) - a full CSV
// library would be another vendored dependency this bundler-less project doesn't otherwise need.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(cell => cell !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    if (row.some(cell => cell !== '')) rows.push(row);
  }

  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map(cells => {
    const obj = {};
    header.forEach((key, index) => { obj[key] = cells[index]; });
    return obj;
  });
}

// Scans whatever files the user selected for the two shapes that matter, so they don't need to
// know which of ~18 files in their export actually matter. Returns { showRows, watchRowsBySeriesId }
// — watchRowsBySeriesId maps a TVDB series id to its list of {seasonNumber, episodeNumber}, absent
// entirely if no tracking-prod-records.csv-shaped file was found among the selection.
async function findTvTimeData(files) {
  let showRows = null;
  let watchRowsBySeriesId = null;

  for (const file of files) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]);

    if (!showRows && TV_TIME_SHOW_LIST_COLUMNS.every(col => columns.includes(col))) {
      showRows = rows;
    } else if (!watchRowsBySeriesId && TV_TIME_WATCH_LOG_COLUMNS.every(col => columns.includes(col))) {
      watchRowsBySeriesId = new Map();
      rows.filter(r => r.type === 'watch').forEach(r => {
        const seriesId = Number(r.series_id);
        const seasonNumber = Number(r.season_number);
        const episodeNumber = Number(r.episode_number);
        if (!seriesId || !seasonNumber || !episodeNumber) return;
        if (!watchRowsBySeriesId.has(seriesId)) watchRowsBySeriesId.set(seriesId, []);
        watchRowsBySeriesId.get(seriesId).push({ seasonNumber, episodeNumber });
      });
    }
  }

  return { showRows, watchRowsBySeriesId };
}

async function resolveTvdbShow(tvdbId) {
  const data = await fetch(`/api/tmdb/find/${tvdbId}?external_source=tvdb_id`, { credentials: 'same-origin' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  const match = data && data.tv_results && data.tv_results[0];
  return match ? match.id : null;
}

async function ensureTvTimeList() {
  const lists = await fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json());
  const existing = lists.find(l => l.name === TV_TIME_LIST_NAME);
  if (existing) return existing.id;

  const response = await fetch('/api/lists', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: TV_TIME_LIST_NAME }),
  });
  if (response.status === 409) {
    // Created by a concurrent call / already existed under a race - just look it up again.
    const retry = await fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json());
    return retry.find(l => l.name === TV_TIME_LIST_NAME).id;
  }
  const created = await response.json();
  return created.id;
}

async function markExactEpisodesWatched(tmdbId, episodes) {
  await Promise.all(episodes.map(({ seasonNumber, episodeNumber }) =>
    fetch(`/api/watched/shows/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      method: 'POST',
      credentials: 'same-origin',
    })
  ));
}

async function markShowFullyWatchedHeuristic(tmdbId, show) {
  const seasons = (show.seasons || []).filter(s => s.season_number > 0);
  for (const season of seasons) {
    const episodeNumbers = Array.from({ length: season.episode_count }, (_, i) => i + 1);
    await Promise.all(episodeNumbers.map(episodeNumber =>
      fetch(`/api/watched/shows/${tmdbId}/season/${season.season_number}/episode/${episodeNumber}`, {
        method: 'POST',
        credentials: 'same-origin',
      })
    ));
  }
}

async function addToTvTimeList(tmdbId) {
  const listId = await ensureTvTimeList();
  await fetch(`/api/lists/${listId}/items`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tmdbId, mediaType: 'tv' }),
  });
}

// Imports the parsed TV Time export into the active profile. For each followed show: resolve
// its TVDB id to a TMDB id, then prefer exact per-episode data from tracking-prod-records.csv
// (watchRowsBySeriesId) over the cruder "total count vs TMDB's episode count" heuristic, which
// only runs when no exact data was found for that show. is_favorited=1 always carries over to a
// favorite, independent of watch state. onProgress(message) fires as each show is processed.
async function importTvTimeShows(showRows, watchRowsBySeriesId, onProgress) {
  const summary = { markedExact: [], markedWatched: [], addedToList: [], favorited: [], unmatched: [] };
  let tvTimeListId = null;

  for (const row of showRows) {
    const showName = row.tv_show_name || `TVDB #${row.tv_show_id}`;
    onProgress(`Resolving "${showName}"…`);

    const tvdbId = Number(row.tv_show_id);
    const nbEpisodesSeen = Number(row.nb_episodes_seen) || 0;
    const isFavorited = row.is_favorited === '1';
    if (!tvdbId) {
      summary.unmatched.push(showName);
      continue;
    }

    const tmdbId = await resolveTvdbShow(tvdbId);
    if (!tmdbId) {
      summary.unmatched.push(showName);
      continue;
    }

    const exactEpisodes = watchRowsBySeriesId && watchRowsBySeriesId.get(tvdbId);
    if (exactEpisodes && exactEpisodes.length > 0) {
      onProgress(`Marking ${exactEpisodes.length} watched episode${exactEpisodes.length === 1 ? '' : 's'} of "${showName}"…`);
      await markExactEpisodesWatched(tmdbId, exactEpisodes);
      summary.markedExact.push(showName);
    } else if (nbEpisodesSeen > 0) {
      const show = await fetch(`/api/tmdb/tv/${tmdbId}`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null));
      if (show && show.number_of_episodes && nbEpisodesSeen >= show.number_of_episodes) {
        onProgress(`Marking "${showName}" fully watched…`);
        await markShowFullyWatchedHeuristic(tmdbId, show);
        summary.markedWatched.push(showName);
      } else {
        if (!tvTimeListId) tvTimeListId = await ensureTvTimeList();
        await addToTvTimeList(tmdbId);
        summary.addedToList.push(showName);
      }
    } else {
      if (!tvTimeListId) tvTimeListId = await ensureTvTimeList();
      await addToTvTimeList(tmdbId);
      summary.addedToList.push(showName);
    }

    if (isFavorited) {
      onProgress(`Favoriting "${showName}"…`);
      await fetch(`/api/favorites/tv/${tmdbId}`, { method: 'POST', credentials: 'same-origin' });
      summary.favorited.push(showName);
    }
  }

  return summary;
}
