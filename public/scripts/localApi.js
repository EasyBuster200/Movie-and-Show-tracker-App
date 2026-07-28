// Fetch shim: intercepts every `fetch('/api/...')` call the app already makes and serves it
// locally instead of a server, so the ~49 existing call sites across the app need zero changes.
// Must be the FIRST script tag on every page (before profiles.js/auth.js), so the patch is
// installed before any page-load-time fetch fires.
//
// Fully local now — every route below (lists/watched/ratings/favorites/stats/recommendations)
// is handled here against the active profile's IndexedDB, plus the TMDB passthrough
// (`/api/tmdb/*`), where each profile calls TMDB directly using its own locally-stored API key
// (TMDB sends `access-control-allow-origin: *`, so this works from a browser/WebView with no
// server in between). There is no remaining server-backed fallback — see route()/matchPath()
// below for the full list of handled paths.

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const originalFetch = window.fetch.bind(window);

function jsonErrorResponse(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleTmdbPassthrough(pathname, search) {
  const profile = getActiveProfile();
  if (!profile || !profile.tmdbApiKey) {
    return jsonErrorResponse('No TMDB API key configured for this profile', 401);
  }

  const tmdbPath = pathname.slice('/api/tmdb'.length);
  const url = `${TMDB_BASE_URL}${tmdbPath}${search}`;

  try {
    return await originalFetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${profile.tmdbApiKey}`,
      },
    });
  } catch (error) {
    return jsonErrorResponse('Failed to reach TMDB', 502);
  }
}

// --- Local data routes (lists/watched/ratings/favorites/stats/recommendations) ---
// A tiny router: register (method, pattern, handler), match by segment count + literal parts,
// ':name' segments become params. If nothing matches, the caller falls through to the real
// network fetch — that's how routes not ported yet keep working against the old server.

class NoActiveProfileError extends Error {}

const routes = [];

function route(method, pattern, handler) {
  routes.push({ method, pattern, handler });
}

function matchPath(pattern, pathname) {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = pathname.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const part = patternParts[i];
    if (part.startsWith(':')) {
      params[part.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (part !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

async function dispatchLocalApi(method, pathname, searchParams, getBody) {
  for (const r of routes) {
    if (r.method !== method) continue;
    const params = matchPath(r.pattern, pathname);
    if (!params) continue;
    try {
      return { handled: true, response: await r.handler(params, searchParams, getBody) };
    } catch (error) {
      if (error instanceof NoActiveProfileError) {
        return { handled: true, response: jsonErrorResponse('Not authenticated', 401) };
      }
      console.error('Local API handler error:', error);
      return { handled: true, response: jsonErrorResponse('Internal error', 500) };
    }
  }
  return { handled: false };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

let dbPromise = null;

async function getDb() {
  const profile = getActiveProfile();
  if (!profile) throw new NoActiveProfileError('No active profile');
  if (!dbPromise) dbPromise = openProfileDb(profile.id);
  return dbPromise;
}

// Mirrors server/tmdbClient.js's fetchTmdb — a direct TMDB call using the active profile's own
// key instead of a server-side token. Returns null on any failure, same as the server version.
async function fetchLocalTmdb(tmdbPath) {
  const profile = getActiveProfile();
  if (!profile || !profile.tmdbApiKey) return null;
  try {
    const response = await originalFetch(`${TMDB_BASE_URL}${tmdbPath}`, {
      headers: { accept: 'application/json', Authorization: `Bearer ${profile.tmdbApiKey}` },
    });
    if (!response.ok) return null;
    return response.json();
  } catch (error) {
    return null;
  }
}

// Mirrors server/tmdbClient.js's fetchMediaSummary — same "standard item shape" contract.
async function fetchLocalMediaSummary(tmdbId, mediaType) {
  const fallback = { tmdbId, mediaType, title: 'Unknown', year: null, releaseDate: null, posterPath: null, voteAverage: null };
  const data = await fetchLocalTmdb(`/${mediaType}/${tmdbId}`);
  if (!data) return fallback;

  const title = data.title || data.name;
  const releaseDate = data.release_date || data.first_air_date || null;
  return {
    tmdbId,
    mediaType,
    title,
    year: releaseDate ? releaseDate.split('-')[0] : null,
    releaseDate,
    posterPath: data.poster_path,
    voteAverage: data.vote_average,
  };
}

// Mirrors server/newEpisodes.js's computeNewEpisodeSeasons exactly, minus the SQL-row shape
// (watchedRows here are {seasonNumber, episodeNumber} objects, not season_number/episode_number).
async function computeNewEpisodeSeasons({ tmdbId, watchedRows, lastWatchedAt, show }) {
  if (!lastWatchedAt || watchedRows.length === 0) {
    return { hasNewEpisodes: false, newSeasonNumbers: [] };
  }

  const watchedSet = new Set(watchedRows.map(r => `${r.seasonNumber}:${r.episodeNumber}`));
  const maxWatchedSeason = Math.max(...watchedRows.map(r => r.seasonNumber));
  const candidateSeasons = (show.seasons || []).filter(
    s => s.season_number > 0 && s.season_number >= maxWatchedSeason
  );

  const seasonData = await Promise.all(
    candidateSeasons.map(s => fetchLocalTmdb(`/tv/${tmdbId}/season/${s.season_number}`))
  );

  const now = new Date();
  const lastWatched = new Date(lastWatchedAt);
  const newSeasonNumbers = [];

  candidateSeasons.forEach((s, i) => {
    const episodes = (seasonData[i] && seasonData[i].episodes) || [];
    const hasNew = episodes.some(ep =>
      ep.air_date &&
      new Date(ep.air_date) <= now &&
      new Date(ep.air_date) > lastWatched &&
      !watchedSet.has(`${s.season_number}:${ep.episode_number}`)
    );
    if (hasNew) newSeasonNumbers.push(s.season_number);
  });

  return { hasNewEpisodes: newSeasonNumbers.length > 0, newSeasonNumbers };
}

// Mirrors server/routes/watched.js's getDistinctWatchedShows query — one entry per show with
// its watched-episode count, most-recently-watched first.
async function groupWatchedShows(db) {
  const episodes = await dbGetAll(db, 'watched_episodes');
  const byShow = new Map();
  episodes.forEach(ep => {
    const entry = byShow.get(ep.showId) || { showId: ep.showId, watchedCount: 0, lastWatchedAt: null, rows: [] };
    entry.watchedCount += 1;
    entry.rows.push(ep);
    if (!entry.lastWatchedAt || ep.watchedAt > entry.lastWatchedAt) entry.lastWatchedAt = ep.watchedAt;
    byShow.set(ep.showId, entry);
  });
  return [...byShow.values()].sort((a, b) => (b.lastWatchedAt || '').localeCompare(a.lastWatchedAt || ''));
}

function toListDto(list, itemCount) {
  return { id: list.id, name: list.name, is_default: list.isDefault ? 1 : 0, item_count: itemCount };
}

async function findList(db, listId) {
  return dbGet(db, 'lists', Number(listId));
}

route('GET', '/api/lists', async () => {
  const db = await getDb();
  const [lists, items] = await Promise.all([dbGetAll(db, 'lists'), dbGetAll(db, 'list_items')]);
  const counts = new Map();
  items.forEach(item => counts.set(item.listId, (counts.get(item.listId) || 0) + 1));
  const sorted = lists.slice().sort((a, b) => {
    if (Boolean(a.isDefault) !== Boolean(b.isDefault)) return a.isDefault ? -1 : 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return jsonResponse(sorted.map(l => toListDto(l, counts.get(l.id) || 0)));
});

route('POST', '/api/lists', async (params, searchParams, getBody) => {
  const body = await getBody();
  const name = ((body && body.name) || '').trim();
  if (!name) return jsonResponse({ error: 'name is required' }, 400);

  const db = await getDb();
  const lists = await dbGetAll(db, 'lists');
  if (lists.some(l => l.name === name)) {
    return jsonResponse({ error: 'You already have a list with that name' }, 409);
  }
  const id = await dbAdd(db, 'lists', { name, isDefault: false, createdAt: new Date().toISOString() });
  return jsonResponse({ id, name, is_default: 0, item_count: 0 }, 201);
});

route('GET', '/api/lists/membership/:mediaType/:tmdbId', async ({ mediaType, tmdbId }) => {
  const db = await getDb();
  const items = await dbGetAll(db, 'list_items');
  const id = Number(tmdbId);
  const listIds = items.filter(i => i.tmdbId === id && i.mediaType === mediaType).map(i => i.listId);
  return jsonResponse({ listIds });
});

route('DELETE', '/api/lists/:listId', async ({ listId }) => {
  const db = await getDb();
  const list = await findList(db, listId);
  if (!list) return jsonResponse({ error: 'List not found' }, 404);
  if (list.isDefault) return jsonResponse({ error: 'Cannot delete the default Bookmarks list' }, 400);

  const items = await dbGetAllByIndex(db, 'list_items', 'listId', list.id);
  await Promise.all(items.map(item => dbDelete(db, 'list_items', item.id)));
  await dbDelete(db, 'lists', list.id);
  return jsonResponse({});
});

route('GET', '/api/lists/:listId/items', async ({ listId }) => {
  const db = await getDb();
  const list = await findList(db, listId);
  if (!list) return jsonResponse({ error: 'List not found' }, 404);

  const items = await dbGetAllByIndex(db, 'list_items', 'listId', list.id);
  items.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  const enriched = await Promise.all(items.map(item => fetchLocalMediaSummary(item.tmdbId, item.mediaType)));
  return jsonResponse(enriched);
});

route('POST', '/api/lists/:listId/items', async ({ listId }, searchParams, getBody) => {
  const db = await getDb();
  const list = await findList(db, listId);
  if (!list) return jsonResponse({ error: 'List not found' }, 404);

  const body = await getBody();
  const tmdbId = body && Number(body.tmdbId);
  const mediaType = body && body.mediaType;
  if (!tmdbId || !['movie', 'tv'].includes(mediaType)) {
    return jsonResponse({ error: 'tmdbId and mediaType (movie|tv) are required' }, 400);
  }

  try {
    await dbAdd(db, 'list_items', { listId: list.id, tmdbId, mediaType, addedAt: new Date().toISOString() });
  } catch (error) {
    // Already in the list — matches the server's INSERT OR IGNORE semantics.
  }
  return jsonResponse({}, 201);
});

route('DELETE', '/api/lists/:listId/items/:tmdbId/:mediaType', async ({ listId, tmdbId, mediaType }) => {
  const db = await getDb();
  const items = await dbGetAllByIndex(db, 'list_items', 'listId', Number(listId));
  const match = items.find(i => i.tmdbId === Number(tmdbId) && i.mediaType === mediaType);
  if (match) await dbDelete(db, 'list_items', match.id);
  return jsonResponse({});
});

route('POST', '/api/watched/movies/:tmdbId', async ({ tmdbId }) => {
  const db = await getDb();
  await dbPut(db, 'watched_movies', { tmdbId: Number(tmdbId), watchedAt: new Date().toISOString() });
  return jsonResponse({});
});

route('DELETE', '/api/watched/movies/:tmdbId', async ({ tmdbId }) => {
  const db = await getDb();
  await dbDelete(db, 'watched_movies', Number(tmdbId));
  return jsonResponse({});
});

route('GET', '/api/watched/movies', async () => {
  const db = await getDb();
  const rows = await dbGetAll(db, 'watched_movies');
  rows.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
  return jsonResponse(rows.map(r => r.tmdbId));
});

route('GET', '/api/watched/movies/details', async () => {
  const db = await getDb();
  const rows = await dbGetAll(db, 'watched_movies');
  rows.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
  const enriched = await Promise.all(rows.map(r => fetchLocalMediaSummary(r.tmdbId, 'movie')));
  return jsonResponse(enriched);
});

route('GET', '/api/watched/shows', async (params, searchParams) => {
  const db = await getDb();
  const includeNew = searchParams.get('includeNewEpisodes') === 'true';
  const groups = await groupWatchedShows(db);

  const enriched = await Promise.all(groups.map(async group => {
    const [summary, show] = await Promise.all([
      fetchLocalMediaSummary(group.showId, 'tv'),
      fetchLocalTmdb(`/tv/${group.showId}`),
    ]);
    const total = show ? show.number_of_episodes : null;
    const watched = group.watchedCount;

    let hasNewEpisodes = false;
    if (includeNew && total != null && watched < total) {
      ({ hasNewEpisodes } = await computeNewEpisodeSeasons({
        tmdbId: group.showId,
        watchedRows: group.rows,
        lastWatchedAt: group.lastWatchedAt,
        show,
      }));
    }

    return { ...summary, watched, total, hasNewEpisodes };
  }));

  return jsonResponse(enriched);
});

route('POST', '/api/watched/shows/:tmdbId/season/:seasonNumber/episode/:episodeNumber', async ({ tmdbId, seasonNumber, episodeNumber }) => {
  const db = await getDb();
  const showId = Number(tmdbId);
  const season = Number(seasonNumber);
  const episode = Number(episodeNumber);
  await dbPut(db, 'watched_episodes', {
    key: `${showId}:${season}:${episode}`,
    showId,
    seasonNumber: season,
    episodeNumber: episode,
    watchedAt: new Date().toISOString(),
  });
  return jsonResponse({});
});

route('DELETE', '/api/watched/shows/:tmdbId/season/:seasonNumber/episode/:episodeNumber', async ({ tmdbId, seasonNumber, episodeNumber }) => {
  const db = await getDb();
  await dbDelete(db, 'watched_episodes', `${Number(tmdbId)}:${Number(seasonNumber)}:${Number(episodeNumber)}`);
  return jsonResponse({});
});

route('GET', '/api/watched/shows/:tmdbId/episodes', async ({ tmdbId }) => {
  const db = await getDb();
  const showId = Number(tmdbId);
  const watchedRows = await dbGetAllByIndex(db, 'watched_episodes', 'showId', showId);
  const lastWatchedAt = watchedRows.reduce((max, r) => (!max || r.watchedAt > max ? r.watchedAt : max), null);

  let newSeasonNumbers = [];
  if (lastWatchedAt) {
    const show = await fetchLocalTmdb(`/tv/${showId}`);
    if (show) {
      ({ newSeasonNumbers } = await computeNewEpisodeSeasons({ tmdbId: showId, watchedRows, lastWatchedAt, show }));
    }
  }

  return jsonResponse({
    episodes: watchedRows.map(r => ({ seasonNumber: r.seasonNumber, episodeNumber: r.episodeNumber })),
    lastWatchedAt,
    newSeasonNumbers,
  });
});

const UPCOMING_LIMIT = 20;

route('GET', '/api/watched/shows/upcoming', async () => {
  const db = await getDb();
  const groups = await groupWatchedShows(db);

  const enriched = await Promise.all(groups.map(async group => {
    const [summary, show] = await Promise.all([
      fetchLocalMediaSummary(group.showId, 'tv'),
      fetchLocalTmdb(`/tv/${group.showId}`),
    ]);
    if (!show || !show.next_episode_to_air) return null;
    const next = show.next_episode_to_air;
    return {
      ...summary,
      nextEpisode: {
        seasonNumber: next.season_number,
        episodeNumber: next.episode_number,
        name: next.name,
        airDate: next.air_date,
      },
    };
  }));

  const upcoming = enriched
    .filter(Boolean)
    .sort((a, b) => (a.nextEpisode.airDate < b.nextEpisode.airDate ? -1 : 1))
    .slice(0, UPCOMING_LIMIT);

  return jsonResponse(upcoming);
});

function mediaKey(mediaType, tmdbId) {
  return `${mediaType}:${Number(tmdbId)}`;
}

function invalidMediaType(mediaType) {
  return !['movie', 'tv'].includes(mediaType);
}

route('GET', '/api/ratings/:mediaType/:tmdbId', async ({ mediaType, tmdbId }) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const db = await getDb();
  const row = await dbGet(db, 'ratings', mediaKey(mediaType, tmdbId));
  return jsonResponse({ rating: row ? row.rating : null });
});

route('PUT', '/api/ratings/:mediaType/:tmdbId', async ({ mediaType, tmdbId }, searchParams, getBody) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const body = await getBody();
  const value = Number(body && body.rating);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return jsonResponse({ error: 'rating must be an integer between 1 and 10' }, 400);
  }
  const db = await getDb();
  await dbPut(db, 'ratings', {
    key: mediaKey(mediaType, tmdbId),
    mediaType,
    tmdbId: Number(tmdbId),
    rating: value,
    ratedAt: new Date().toISOString(),
  });
  return jsonResponse({});
});

route('DELETE', '/api/ratings/:mediaType/:tmdbId', async ({ mediaType, tmdbId }) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const db = await getDb();
  await dbDelete(db, 'ratings', mediaKey(mediaType, tmdbId));
  return jsonResponse({});
});

async function enrichedFavorites(db, mediaType) {
  const rows = await dbGetAllByIndex(db, 'favorites', 'mediaType', mediaType);
  return Promise.all(rows.map(r => fetchLocalMediaSummary(r.tmdbId, mediaType)));
}

route('GET', '/api/favorites/ids', async () => {
  const db = await getDb();
  const rows = await dbGetAll(db, 'favorites');
  return jsonResponse({
    movie: rows.filter(r => r.mediaType === 'movie').map(r => r.tmdbId),
    tv: rows.filter(r => r.mediaType === 'tv').map(r => r.tmdbId),
  });
});

route('GET', '/api/favorites/movies', async () => jsonResponse(await enrichedFavorites(await getDb(), 'movie')));
route('GET', '/api/favorites/tv', async () => jsonResponse(await enrichedFavorites(await getDb(), 'tv')));

route('POST', '/api/favorites/:mediaType/:tmdbId', async ({ mediaType, tmdbId }) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const db = await getDb();
  await dbPut(db, 'favorites', {
    key: mediaKey(mediaType, tmdbId),
    mediaType,
    tmdbId: Number(tmdbId),
    favoritedAt: new Date().toISOString(),
  });
  return jsonResponse({});
});

route('DELETE', '/api/favorites/:mediaType/:tmdbId', async ({ mediaType, tmdbId }) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const db = await getDb();
  await dbDelete(db, 'favorites', mediaKey(mediaType, tmdbId));
  return jsonResponse({});
});

const DEFAULT_EPISODE_RUNTIME_MINUTES = 30;

route('GET', '/api/stats', async () => {
  const db = await getDb();
  const [watchedMovies, episodes, favorites, ratings] = await Promise.all([
    dbGetAll(db, 'watched_movies'),
    dbGetAll(db, 'watched_episodes'),
    dbGetAll(db, 'favorites'),
    dbGetAll(db, 'ratings'),
  ]);

  const episodeCountsByShow = new Map();
  episodes.forEach(ep => episodeCountsByShow.set(ep.showId, (episodeCountsByShow.get(ep.showId) || 0) + 1));

  const ratingsCount = ratings.length;
  const averageRating = ratingsCount ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratingsCount : null;

  const [movieRuntimes, showRuntimes] = await Promise.all([
    Promise.all(watchedMovies.map(row => fetchLocalTmdb(`/movie/${row.tmdbId}`).then(data => (data && data.runtime) || 0))),
    Promise.all([...episodeCountsByShow.entries()].map(async ([showId, count]) => {
      const show = await fetchLocalTmdb(`/tv/${showId}`);
      const episodeRuntime = (show && show.episode_run_time && show.episode_run_time[0]) || DEFAULT_EPISODE_RUNTIME_MINUTES;
      return episodeRuntime * count;
    })),
  ]);

  const totalWatchMinutes = [...movieRuntimes, ...showRuntimes].reduce((sum, minutes) => sum + minutes, 0);

  return jsonResponse({
    moviesWatched: watchedMovies.length,
    showsTracked: episodeCountsByShow.size,
    episodesWatched: episodes.length,
    favorites: favorites.length,
    ratingsGiven: ratingsCount,
    averageRating: averageRating ? Math.round(averageRating * 10) / 10 : null,
    totalWatchMinutes,
  });
});

const SEED_COUNT = 5;
const RESULT_CAP = 20;

function normalizeRecommendation(raw, mediaType) {
  const releaseDate = raw.release_date || raw.first_air_date || null;
  return {
    tmdbId: raw.id,
    mediaType,
    title: raw.title || raw.name || 'Untitled',
    year: releaseDate ? releaseDate.split('-')[0] : null,
    releaseDate,
    posterPath: raw.poster_path,
    voteAverage: raw.vote_average,
  };
}

route('GET', '/api/recommendations/:mediaType', async ({ mediaType }) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const db = await getDb();

  const [watchedMovies, episodeGroups, listItems] = await Promise.all([
    dbGetAll(db, 'watched_movies'),
    groupWatchedShows(db),
    dbGetAll(db, 'list_items'),
  ]);

  const watchedRows = mediaType === 'movie'
    ? watchedMovies.map(r => ({ tmdbId: r.tmdbId, ts: r.watchedAt }))
    : episodeGroups.map(g => ({ tmdbId: g.showId, ts: g.lastWatchedAt }));
  const listRows = listItems.filter(i => i.mediaType === mediaType).map(i => ({ tmdbId: i.tmdbId, ts: i.addedAt }));

  const latestTsById = new Map();
  [...watchedRows, ...listRows].forEach(row => {
    const existing = latestTsById.get(row.tmdbId);
    if (!existing || row.ts > existing) latestTsById.set(row.tmdbId, row.ts);
  });

  const excludeIds = new Set(latestTsById.keys());
  const seeds = [...latestTsById.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, SEED_COUNT)
    .map(([tmdbId]) => tmdbId);

  if (seeds.length === 0) return jsonResponse({ seedCount: 0, items: [] });

  const recommendationLists = await Promise.all(
    seeds.map(tmdbId => fetchLocalTmdb(`/${mediaType}/${tmdbId}/recommendations`))
  );

  const merged = new Map();
  recommendationLists.forEach(data => {
    const results = (data && data.results) || [];
    const seenInThisSeed = new Set();
    results.forEach(raw => {
      if (seenInThisSeed.has(raw.id)) return;
      seenInThisSeed.add(raw.id);
      if (excludeIds.has(raw.id) || seeds.includes(raw.id)) return;

      const existing = merged.get(raw.id);
      if (existing) {
        existing.matchCount += 1;
      } else {
        merged.set(raw.id, { raw, matchCount: 1 });
      }
    });
  });

  const ranked = [...merged.values()].sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    const aScore = a.raw.popularity ?? a.raw.vote_count ?? 0;
    const bScore = b.raw.popularity ?? b.raw.vote_count ?? 0;
    return bScore - aScore;
  });

  const items = ranked.slice(0, RESULT_CAP).map(({ raw }) => normalizeRecommendation(raw, mediaType));

  return jsonResponse({ seedCount: seeds.length, items });
});

function getRequestBody(init) {
  if (!init || !init.body) return null;
  try {
    return JSON.parse(init.body);
  } catch (error) {
    return null;
  }
}

window.fetch = async function shimmedFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);

  if (url.pathname.startsWith('/api/tmdb/')) {
    return handleTmdbPassthrough(url.pathname, url.search);
  }

  if (url.pathname.startsWith('/api/')) {
    const method = ((init && init.method) || 'GET').toUpperCase();
    const result = await dispatchLocalApi(method, url.pathname, url.searchParams, async () => getRequestBody(init));
    if (result.handled) return result.response;
  }

  return originalFetch(input, init);
};
