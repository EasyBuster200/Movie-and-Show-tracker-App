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

// Caps how many TMDB requests are in flight across the whole app at once. Several routes below
// (watched/favorites/lists/stats/recommendations) enrich a whole batch of items in parallel -
// one TMDB request per item, sometimes two (a show's own details plus a season's episode list,
// per show, for the "new episodes" check) - and some of those batches are themselves fired in
// parallel with each other (profile.js's refreshAll loads all four Profile sections at once).
// That adds up to dozens of simultaneous requests from a single page load, which on a phone's
// real network is slow enough to look stuck, and/or trips TMDB's abuse-rate limiting. Routing
// every TMDB call (both this passthrough and fetchLocalTmdb below) through one shared queue
// caps actual network concurrency without any of those call sites needing to know about each
// other - they can still fire off as many Promise.all'd calls as they want, this just serializes
// how many are actually in flight at once.
const TMDB_MAX_CONCURRENT = 20;
const TMDB_TIMEOUT_MS = 10000;

let tmdbActiveCount = 0;
const tmdbQueue = [];

function runTmdbQueue() {
  while (tmdbActiveCount < TMDB_MAX_CONCURRENT && tmdbQueue.length > 0) {
    const job = tmdbQueue.shift();
    tmdbActiveCount++;
    job().finally(() => {
      tmdbActiveCount--;
      runTmdbQueue();
    });
  }
}

function queueTmdbRequest(job) {
  return new Promise(resolve => {
    tmdbQueue.push(() => job().then(resolve));
    runTmdbQueue();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tmdbFetchWithTimeout(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TMDB_TIMEOUT_MS);
  try {
    return await originalFetch(url, { headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// TMDB's `adult` flag (on movie/tv objects specifically) marks actual pornographic content,
// not just mature-rated mainstream movies/shows (an R-rated horror film is never adult:true) -
// so filtering on it removes the former without touching the latter. Only ever applied to the
// two known media-listing shapes (a top-level `results` array - search/discover/trending/
// upcoming/recommendations - or a collection's `parts` array), never to unrelated arrays like
// `credits.cast`/`credits.crew` on a detail response, where a person object's own `adult` field
// means something entirely different (their known-for work, not this request's content) and
// stripping them would incorrectly drop legitimate cast/crew credits.
function stripAdultItems(data) {
  if (data && Array.isArray(data.results)) {
    data.results = data.results.filter(item => !(item && item.adult));
  }
  if (data && Array.isArray(data.parts)) {
    data.parts = data.parts.filter(item => !(item && item.adult));
  }
  return data;
}

async function handleTmdbPassthrough(pathname, search) {
  const profile = getActiveProfile();
  if (!profile || !profile.tmdbApiKey) {
    return jsonErrorResponse('No TMDB API key configured for this profile', 401);
  }

  const tmdbPath = pathname.slice('/api/tmdb'.length);
  const url = `${TMDB_BASE_URL}${tmdbPath}${search}`;

  return queueTmdbRequest(async () => {
    try {
      const response = await tmdbFetchWithTimeout(url, {
        accept: 'application/json',
        Authorization: `Bearer ${profile.tmdbApiKey}`,
      });
      if (!response.ok) return response;
      return jsonResponse(stripAdultItems(await response.json()), response.status);
    } catch (error) {
      return jsonErrorResponse('Failed to reach TMDB', 502);
    }
  });
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

const TMDB_MAX_RETRIES = 2;

// A movie/show's core details (runtime, episode count, poster, title...) barely ever change,
// but they were being re-fetched from TMDB on every single page load that needed them - often
// several times over for the *same* item within one Profile load alone (e.g. /api/stats needs
// a watched movie's runtime, /api/watched/movies/details needs that same movie's title/poster,
// each hitting /movie/{id} separately). Caching /movie/{id} and /tv/{id} responses in IndexedDB
// (the 'tmdb_cache' store - see localDb.js) turns every repeat lookup, across routes and across
// page loads, into an instant local read instead of a network round trip. Deliberately NOT
// applied to sub-resources like /tv/{id}/season/{n} (used for new-episode detection, which
// needs to stay fresh) or one-off calls like /search or /discover.
const TMDB_DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TMDB_DETAIL_PATH_RE = /^\/(movie|tv)\/(\d+)$/;

async function readTmdbDetailCache(cacheKey) {
  try {
    const db = await getDb();
    const entry = await dbGet(db, 'tmdb_cache', cacheKey);
    return entry && Date.now() - entry.fetchedAt < TMDB_DETAIL_CACHE_TTL_MS ? entry.data : null;
  } catch (error) {
    return null;
  }
}

// Fire-and-forget - a cache write failing (e.g. a full-ish IndexedDB) shouldn't break the
// request that triggered it, which already has its data either way.
function writeTmdbDetailCache(cacheKey, data) {
  getDb()
    .then(db => dbPut(db, 'tmdb_cache', { key: cacheKey, data, fetchedAt: Date.now() }))
    .catch(() => {});
}

// Two routes can both want the exact same not-yet-cached path at the same moment (e.g.
// /api/stats and /api/watched/movies/details both need a just-watched movie's /movie/{id} the
// first time it's ever seen, before writeTmdbDetailCache has had a chance to persist it) -
// without this, both would independently miss the cache and fire their own network request.
// Sharing the in-flight promise instead means only the first caller actually hits the network;
// everyone else asking for the same path while it's still pending gets the same result.
const inFlightTmdbRequests = new Map();

function fetchLocalTmdb(tmdbPath) {
  if (inFlightTmdbRequests.has(tmdbPath)) return inFlightTmdbRequests.get(tmdbPath);
  const promise = fetchLocalTmdbUncached(tmdbPath).finally(() => inFlightTmdbRequests.delete(tmdbPath));
  inFlightTmdbRequests.set(tmdbPath, promise);
  return promise;
}

// Mirrors server/tmdbClient.js's fetchTmdb — a direct TMDB call using the active profile's own
// key instead of a server-side token. Returns null on any failure, same as the server version.
// Retries transient failures (rate-limited, server error, timeout) a couple of times before
// giving up - this is specifically what enriched item summaries (fetchLocalMediaSummary below)
// fall back to a blank "Unknown" card for, so a request that would've succeeded on a second try
// no longer permanently loses that item's poster/title/rating.
async function fetchLocalTmdbUncached(tmdbPath) {
  const profile = getActiveProfile();
  if (!profile || !profile.tmdbApiKey) return null;

  const detailMatch = tmdbPath.match(TMDB_DETAIL_PATH_RE);
  const cacheKey = detailMatch ? `${detailMatch[1]}:${detailMatch[2]}` : null;
  if (cacheKey) {
    const cached = await readTmdbDetailCache(cacheKey);
    if (cached) return cached;
  }

  const result = await queueTmdbRequest(async () => {
    const url = `${TMDB_BASE_URL}${tmdbPath}`;
    const headers = { accept: 'application/json', Authorization: `Bearer ${profile.tmdbApiKey}` };
    for (let attempt = 0; attempt <= TMDB_MAX_RETRIES; attempt++) {
      const isLastAttempt = attempt === TMDB_MAX_RETRIES;
      try {
        const response = await tmdbFetchWithTimeout(url, headers);
        if (response.ok) return stripAdultItems(await response.json());
        // 429 (rate-limited) and 5xx are worth retrying; 404/401/etc are not.
        if (isLastAttempt || (response.status !== 429 && response.status < 500)) return null;
      } catch (error) {
        if (isLastAttempt) return null;
      }
      await sleep(400 * (attempt + 1));
    }
    return null;
  });

  if (cacheKey && result) writeTmdbDetailCache(cacheKey, result);
  return result;
}

// Shared by fetchLocalMediaSummary and any route that already has the raw TMDB object for
// other reasons (e.g. /api/watched/shows needs the full show for its episode count) - fetching
// it twice, once here and once for the summary, would double the request count for no reason.
function summaryFromTmdbData(tmdbId, mediaType, data) {
  if (!data) return { tmdbId, mediaType, title: 'Unknown', year: null, releaseDate: null, posterPath: null, voteAverage: null };

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

// Mirrors server/tmdbClient.js's fetchMediaSummary — same "standard item shape" contract.
async function fetchLocalMediaSummary(tmdbId, mediaType) {
  const data = await fetchLocalTmdb(`/${mediaType}/${tmdbId}`);
  return summaryFromTmdbData(tmdbId, mediaType, data);
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

// `limit`, if given, caps how many items get enriched with a TMDB request - profile.js's
// preview sections only ever display WATCHED_PREVIEW_LIMIT of these, so enriching the rest
// (someone's whole watch history, potentially hundreds of items) was pure wasted work that
// media-list.html's "see all" page (which omits `limit`, wanting the true full list) doesn't
// need duplicated here.
function applyLimit(rows, searchParams) {
  const limit = Number(searchParams.get('limit'));
  return limit > 0 ? rows.slice(0, limit) : rows;
}

route('GET', '/api/watched/movies/details', async (params, searchParams) => {
  const db = await getDb();
  const rows = await dbGetAll(db, 'watched_movies');
  rows.sort((a, b) => b.watchedAt.localeCompare(a.watchedAt));
  const enriched = await Promise.all(applyLimit(rows, searchParams).map(r => fetchLocalMediaSummary(r.tmdbId, 'movie')));
  return jsonResponse(enriched);
});

route('GET', '/api/watched/shows', async (params, searchParams) => {
  const db = await getDb();
  const includeNew = searchParams.get('includeNewEpisodes') === 'true';
  const groups = applyLimit(await groupWatchedShows(db), searchParams);

  const enriched = await Promise.all(groups.map(async group => {
    const show = await fetchLocalTmdb(`/tv/${group.showId}`);
    const summary = summaryFromTmdbData(group.showId, 'tv', show);
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
    const show = await fetchLocalTmdb(`/tv/${group.showId}`);
    if (!show || !show.next_episode_to_air) return null;
    const next = show.next_episode_to_air;
    return {
      ...summaryFromTmdbData(group.showId, 'tv', show),
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

async function enrichedFavorites(db, mediaType, searchParams) {
  const rows = await dbGetAllByIndex(db, 'favorites', 'mediaType', mediaType);
  return Promise.all(applyLimit(rows, searchParams).map(r => fetchLocalMediaSummary(r.tmdbId, mediaType)));
}

route('GET', '/api/favorites/ids', async () => {
  const db = await getDb();
  const rows = await dbGetAll(db, 'favorites');
  return jsonResponse({
    movie: rows.filter(r => r.mediaType === 'movie').map(r => r.tmdbId),
    tv: rows.filter(r => r.mediaType === 'tv').map(r => r.tmdbId),
  });
});

route('GET', '/api/favorites/movies', async (params, searchParams) => jsonResponse(await enrichedFavorites(await getDb(), 'movie', searchParams)));
route('GET', '/api/favorites/tv', async (params, searchParams) => jsonResponse(await enrichedFavorites(await getDb(), 'tv', searchParams)));

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
const REC_PAGE_SIZE = 20;

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

// Seeding + ranking is the expensive part (one TMDB /recommendations call per seed), but its
// result only depends on watched/list state as of when the row first loaded - re-deriving it on
// every "load more" page click would repeat the same handful of TMDB requests for a ranked pool
// that hasn't changed. Cached in memory per mediaType for the rest of this page's session (a
// fresh page load - including switching profiles, which always redirects/reloads - naturally
// starts over, so this never needs explicit invalidation).
const recommendationPoolCache = new Map();

async function buildRecommendationPool(mediaType) {
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

  if (seeds.length === 0) return { seedCount: 0, ranked: [] };

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

  const ranked = [...merged.values()]
    .sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      const aScore = a.raw.popularity ?? a.raw.vote_count ?? 0;
      const bScore = b.raw.popularity ?? b.raw.vote_count ?? 0;
      return bScore - aScore;
    })
    .map(({ raw }) => raw);

  return { seedCount: seeds.length, ranked };
}

route('GET', '/api/recommendations/:mediaType', async ({ mediaType }, searchParams) => {
  if (invalidMediaType(mediaType)) return jsonResponse({ error: 'mediaType must be movie or tv' }, 400);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  let pool = recommendationPoolCache.get(mediaType);
  if (!pool) {
    pool = await buildRecommendationPool(mediaType);
    recommendationPoolCache.set(mediaType, pool);
  }

  const { seedCount, ranked } = pool;
  if (seedCount === 0) return jsonResponse({ seedCount: 0, items: [], page: 1, totalPages: 1 });

  const totalPages = Math.max(1, Math.ceil(ranked.length / REC_PAGE_SIZE));
  const items = ranked
    .slice((page - 1) * REC_PAGE_SIZE, page * REC_PAGE_SIZE)
    .map(raw => normalizeRecommendation(raw, mediaType));

  return jsonResponse({ seedCount, items, page, totalPages });
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
