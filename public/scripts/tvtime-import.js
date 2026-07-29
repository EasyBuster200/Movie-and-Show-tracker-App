// Imports a TV Time GDPR data export. TV Time's export is a folder of ~18 CSVs; only
// user_tv_show_data.csv (tv_show_id, is_followed, is_favorited, nb_episodes_seen, tv_show_name,
// user_id) has anything usable — everything else is auth tokens, analytics, or engagement
// scores. There's no per-episode data in the export, only a total count per show, so this can't
// reproduce exactly which episodes were watched.
//
// tv_show_id is a TheTVDB id (TV Time was built on TheTVDB, not TMDB), so each show is resolved
// via TMDB's /find/{id}?external_source=tvdb_id — the one TMDB endpoint that maps external ids.

const TV_TIME_REQUIRED_COLUMNS = ['tv_show_id', 'nb_episodes_seen', 'tv_show_name'];
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

// Scans whatever files the user selected for the one that looks like user_tv_show_data.csv,
// so they don't need to know which of ~18 files in their export actually matters.
async function findTvShowDataRows(files) {
  for (const file of files) {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) continue;
    const columns = Object.keys(rows[0]);
    if (TV_TIME_REQUIRED_COLUMNS.every(col => columns.includes(col))) {
      return rows;
    }
  }
  return null;
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

async function markShowFullyWatched(tmdbId, show) {
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

// Imports rows from user_tv_show_data.csv into the active profile. For each show: resolve its
// TVDB id to a TMDB id, then compare nb_episodes_seen against TMDB's current episode total -
// caught up (or ahead, e.g. TV Time/TMDB specials-count drift) marks every episode watched;
// anything less just adds the show to a "TV Time Shows" list instead. onProgress(message) fires
// as each show is processed, for a live status display.
async function importTvTimeShows(rows, onProgress) {
  const summary = { markedWatched: [], addedToList: [], unmatched: [] };
  let tvTimeListId = null;

  for (const row of rows) {
    const showName = row.tv_show_name || `TVDB #${row.tv_show_id}`;
    onProgress(`Resolving "${showName}"…`);

    const tvdbId = Number(row.tv_show_id);
    const nbEpisodesSeen = Number(row.nb_episodes_seen) || 0;
    if (!tvdbId) {
      summary.unmatched.push(showName);
      continue;
    }

    const tmdbId = await resolveTvdbShow(tvdbId);
    if (!tmdbId) {
      summary.unmatched.push(showName);
      continue;
    }

    const show = await fetch(`/api/tmdb/tv/${tmdbId}`, { credentials: 'same-origin' }).then(r => (r.ok ? r.json() : null));
    if (!show) {
      summary.unmatched.push(showName);
      continue;
    }

    if (show.number_of_episodes && nbEpisodesSeen >= show.number_of_episodes) {
      onProgress(`Marking "${showName}" fully watched…`);
      await markShowFullyWatched(tmdbId, show);
      summary.markedWatched.push(showName);
    } else {
      if (!tvTimeListId) tvTimeListId = await ensureTvTimeList();
      await fetch(`/api/lists/${tvTimeListId}/items`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId, mediaType: 'tv' }),
      });
      summary.addedToList.push(showName);
    }
  }

  return summary;
}
