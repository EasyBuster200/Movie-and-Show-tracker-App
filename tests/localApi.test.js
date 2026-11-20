const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, daysFromNow, dateOnly } = require('./harness');

const plain = value => JSON.parse(JSON.stringify(value));

const movie = (id, extra = {}) => ({ id, title: `Movie ${id}`, release_date: '2020-01-01', poster_path: `/m${id}.jpg`, vote_average: 7, ...extra });

// --- auth / passthrough ---------------------------------------------------------------------

test('local routes return 401 with no active profile', async () => {
  const { api } = createApp({ withProfile: false });
  const res = await api('GET', '/api/lists');
  assert.equal(res.status, 401);
});

test('TMDB passthrough sends the profile key as a bearer token and strips adult results', async () => {
  const { api, tmdbRequests } = createApp({
    tmdb: { '/search/multi': { results: [movie(1), movie(2, { adult: true })] } },
  });
  const res = await api('GET', '/api/tmdb/search/multi?query=x');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.results.map(r => r.id), [1]);
  assert.equal(tmdbRequests[0].url, 'https://api.themoviedb.org/3/search/multi?query=x');
  assert.equal(tmdbRequests[0].headers.Authorization, 'Bearer test-key');
});

test('stripAdultItems keeps a movie credit list\'s person objects but filters adult combined_credits titles', async () => {
  const { api } = createApp({
    tmdb: {
      '/movie/1/credits': { cast: [{ id: 10, name: 'Actor', adult: true }] },
      '/person/10/combined_credits': {
        cast: [{ id: 1, media_type: 'movie' }, { id: 2, media_type: 'movie', adult: true }],
        crew: [{ id: 3, media_type: 'tv', adult: true }],
      },
      '/collection/5': { parts: [movie(1), movie(2, { adult: true })] },
    },
  });
  assert.equal((await api('GET', '/api/tmdb/movie/1/credits')).body.cast.length, 1);
  const credits = (await api('GET', '/api/tmdb/person/10/combined_credits')).body;
  assert.deepEqual(credits.cast.map(c => c.id), [1]);
  assert.deepEqual(credits.crew, []);
  assert.deepEqual((await api('GET', '/api/tmdb/collection/5')).body.parts.map(p => p.id), [1]);
});

// --- lists ----------------------------------------------------------------------------------

test('lists: default Bookmarks exists, duplicates rejected, default undeletable', async () => {
  const { api } = createApp();
  let lists = (await api('GET', '/api/lists')).body;
  assert.equal(lists.length, 1);
  assert.equal(lists[0].name, 'Bookmarks');
  assert.equal(lists[0].is_default, 1);

  assert.equal((await api('POST', '/api/lists', { name: '  ' })).status, 400);
  const created = await api('POST', '/api/lists', { name: 'Horror' });
  assert.equal(created.status, 201);
  assert.equal((await api('POST', '/api/lists', { name: 'Horror' })).status, 409);

  assert.equal((await api('DELETE', `/api/lists/${lists[0].id}`)).status, 400);
  assert.equal((await api('DELETE', `/api/lists/${created.body.id}`)).status, 200);
  lists = (await api('GET', '/api/lists')).body;
  assert.deepEqual(lists.map(l => l.name), ['Bookmarks']);
});

test('lists: adding an item twice is idempotent and membership reflects it', async () => {
  const { api } = createApp({ tmdb: { '/movie/1': movie(1) } });
  const listId = (await api('POST', '/api/lists', { name: 'Watch' })).body.id;

  assert.equal((await api('POST', `/api/lists/${listId}/items`, { tmdbId: 1, mediaType: 'bogus' })).status, 400);
  await api('POST', `/api/lists/${listId}/items`, { tmdbId: 1, mediaType: 'movie' });
  await api('POST', `/api/lists/${listId}/items`, { tmdbId: 1, mediaType: 'movie' });

  const items = (await api('GET', `/api/lists/${listId}/items`)).body;
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Movie 1');
  assert.deepEqual((await api('GET', '/api/lists/membership/movie/1')).body.listIds, [listId]);

  await api('DELETE', `/api/lists/${listId}/items/1/movie`);
  assert.deepEqual((await api('GET', '/api/lists/membership/movie/1')).body.listIds, []);
});

// --- watched movies / favorites: denormalized display fields --------------------------------

test('watched movies: display fields sent on POST are read back with zero TMDB calls', async () => {
  const { api, tmdbCalls } = createApp();
  await api('POST', '/api/watched/movies/1', {
    title: 'Movie 1', year: '2020', releaseDate: '2020-01-01', posterPath: '/m1.jpg', voteAverage: 7,
  });
  const details = (await api('GET', '/api/watched/movies/details')).body;
  assert.deepEqual(details, [{
    tmdbId: 1, mediaType: 'movie', title: 'Movie 1', year: '2020', releaseDate: '2020-01-01', posterPath: '/m1.jpg', voteAverage: 7,
  }]);
  assert.equal(tmdbCalls.length, 0);
});

test('watched movies: a legacy row with no display fields is fetched once, then backfilled', async () => {
  const { api, tmdbCalls, getAll, resetTmdbCalls } = createApp({ tmdb: { '/movie/1': movie(1) } });
  await api('POST', '/api/watched/movies/1'); // no body, like tvtime-import.js
  assert.equal((await api('GET', '/api/watched/movies/details')).body[0].title, 'Movie 1');
  assert.deepEqual(tmdbCalls, ['/movie/1']);

  const [row] = plain(await getAll('watched_movies'));
  assert.equal(row.title, 'Movie 1');
  assert.equal(row.posterPath, '/m1.jpg');

  resetTmdbCalls();
  await api('GET', '/api/watched/movies/details');
  assert.equal(tmdbCalls.length, 0);
});

test('watched movies: a failed lookup shows "Unknown" but is not persisted, so it retries later', async () => {
  let available = false;
  const { api, getAll } = createApp({ tmdb: { '/movie/1': () => (available ? movie(1) : 404) } });
  await api('POST', '/api/watched/movies/1');

  assert.equal((await api('GET', '/api/watched/movies/details')).body[0].title, 'Unknown');
  assert.equal(plain(await getAll('watched_movies'))[0].title, undefined);

  available = true;
  assert.equal((await api('GET', '/api/watched/movies/details')).body[0].title, 'Movie 1');
});

test('watched movies: ?limit= only enriches that many rows, most recent first', async () => {
  const { api, put, tmdbCalls } = createApp({ tmdb: { '/movie/1': movie(1), '/movie/2': movie(2), '/movie/3': movie(3) } });
  await put('watched_movies', { tmdbId: 1, watchedAt: daysFromNow(-3) });
  await put('watched_movies', { tmdbId: 2, watchedAt: daysFromNow(-1) });
  await put('watched_movies', { tmdbId: 3, watchedAt: daysFromNow(-2) });

  const limited = (await api('GET', '/api/watched/movies/details?limit=2')).body;
  assert.deepEqual(limited.map(m => m.tmdbId), [2, 3]);
  assert.deepEqual(tmdbCalls.sort(), ['/movie/2', '/movie/3']);
  assert.deepEqual((await api('GET', '/api/watched/movies')).body, [2, 3, 1]);
});

test('favorites: POST/ids/list/DELETE round trip', async () => {
  const { api, tmdbCalls } = createApp();
  assert.equal((await api('POST', '/api/favorites/person/1')).status, 400);
  await api('POST', '/api/favorites/movie/1', { title: 'M' });
  await api('POST', '/api/favorites/tv/2', { title: 'S' });
  assert.deepEqual((await api('GET', '/api/favorites/ids')).body, { movie: [1], tv: [2] });
  assert.deepEqual((await api('GET', '/api/favorites/tv')).body.map(s => s.title), ['S']);
  assert.equal(tmdbCalls.length, 0);
  await api('DELETE', '/api/favorites/movie/1');
  assert.deepEqual((await api('GET', '/api/favorites/ids')).body, { movie: [], tv: [2] });
});

// --- stats ----------------------------------------------------------------------------------

test('the ratings store is removed from databases created before ratings were dropped', async () => {
  const { context, run } = createApp({ withProfile: false });
  // A v2 database, as the app created it while ratings existed.
  await new Promise((resolve, reject) => {
    const request = context.indexedDB.open('tvtc-profile-old', 2);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('ratings', { keyPath: 'key' });
      request.result.createObjectStore('tmdb_cache', { keyPath: 'key' });
    };
    request.onsuccess = () => { request.result.close(); resolve(); };
    request.onerror = () => reject(request.error);
  });
  const stores = await run("openProfileDb('old').then(db => { const names = [...db.objectStoreNames]; db.close(); return names; })");
  assert.ok(!JSON.parse(JSON.stringify(stores)).includes('ratings'));
});

test('stats: totals and watch time (with 30m default episode runtime)', async () => {
  const { api } = createApp({
    tmdb: {
      '/movie/1': movie(1, { runtime: 120 }),
      '/movie/2': movie(2), // no runtime -> counts as 0
      '/tv/10': { id: 10, name: 'A', episode_run_time: [45] },
      '/tv/20': { id: 20, name: 'B', episode_run_time: [] }, // -> 30m default
    },
  });
  await api('POST', '/api/watched/movies/1');
  await api('POST', '/api/watched/movies/2');
  await api('POST', '/api/watched/shows/10/season/1/episode/1');
  await api('POST', '/api/watched/shows/10/season/1/episode/2');
  await api('POST', '/api/watched/shows/20/season/1/episode/1');
  await api('POST', '/api/favorites/movie/1');

  assert.deepEqual((await api('GET', '/api/stats')).body, {
    moviesWatched: 2,
    showsTracked: 2,
    episodesWatched: 3,
    favorites: 1,
    totalWatchMinutes: 120 + 45 * 2 + 30,
  });
});

// --- new-episode heuristic ------------------------------------------------------------------

function showWithSeasons(id, extra = {}) {
  return {
    id,
    name: `Show ${id}`,
    number_of_episodes: 6,
    seasons: [{ season_number: 0 }, { season_number: 1 }, { season_number: 2 }],
    ...extra,
  };
}

function episodes(...airDates) {
  return { episodes: airDates.map((air_date, i) => ({ episode_number: i + 1, air_date })) };
}

test('new episodes: only an aired, unwatched episode after lastWatchedAt in season >= max watched counts', async () => {
  const { api, put, tmdbCalls } = createApp({
    tmdb: {
      '/tv/10': showWithSeasons(10),
      // Season 1 has an unwatched episode that aired after lastWatchedAt, but it's below the
      // highest watched season, so it isn't even checked.
      '/tv/10/season/1': episodes(dateOnly(daysFromNow(-100)), dateOnly(daysFromNow(-1))),
      // Season 2: E1 watched, E2 aired after lastWatchedAt (new), E3 not aired yet (not new).
      '/tv/10/season/2': episodes(dateOnly(daysFromNow(-20)), dateOnly(daysFromNow(-1)), dateOnly(daysFromNow(5))),
    },
  });
  await put('watched_episodes', { key: '10:2:1', showId: 10, seasonNumber: 2, episodeNumber: 1, watchedAt: daysFromNow(-10) });

  const res = (await api('GET', '/api/watched/shows/10/episodes')).body;
  assert.deepEqual(res.newSeasonNumbers, [2]);
  assert.ok(!tmdbCalls.includes('/tv/10/season/1'), 'season below max watched season should not be fetched');
  assert.ok(!tmdbCalls.includes('/tv/10/season/0'), 'specials should not be fetched');

  const shows = (await api('GET', '/api/watched/shows?includeNewEpisodes=true')).body;
  assert.equal(shows[0].hasNewEpisodes, true);
  assert.equal(shows[0].watched, 1);
  assert.equal(shows[0].total, 6);
});

test('new episodes: nothing new when the only later episode is still unaired', async () => {
  const { api, put } = createApp({
    tmdb: {
      '/tv/10': showWithSeasons(10),
      '/tv/10/season/2': episodes(dateOnly(daysFromNow(-20)), dateOnly(daysFromNow(3))),
    },
  });
  await put('watched_episodes', { key: '10:2:1', showId: 10, seasonNumber: 2, episodeNumber: 1, watchedAt: daysFromNow(-10) });
  assert.deepEqual((await api('GET', '/api/watched/shows/10/episodes')).body.newSeasonNumbers, []);
});

test('watched shows: most recently watched first, ?limit= respected', async () => {
  const { api, put } = createApp({ tmdb: { '/tv/10': showWithSeasons(10), '/tv/20': showWithSeasons(20) } });
  await put('watched_episodes', { key: '10:1:1', showId: 10, seasonNumber: 1, episodeNumber: 1, watchedAt: daysFromNow(-5) });
  await put('watched_episodes', { key: '20:1:1', showId: 20, seasonNumber: 1, episodeNumber: 1, watchedAt: daysFromNow(-1) });
  assert.deepEqual((await api('GET', '/api/watched/shows')).body.map(s => s.tmdbId), [20, 10]);
  assert.deepEqual((await api('GET', '/api/watched/shows?limit=1')).body.map(s => s.tmdbId), [20]);
});

test('upcoming: only shows with a next episode, soonest first', async () => {
  const next = (airDate) => ({ season_number: 1, episode_number: 2, name: 'Next', air_date: airDate });
  const { api } = createApp({
    tmdb: {
      '/tv/10': showWithSeasons(10, { next_episode_to_air: next('2030-05-01') }),
      '/tv/20': showWithSeasons(20, { next_episode_to_air: next('2030-01-01') }),
      '/tv/30': showWithSeasons(30, { next_episode_to_air: null }),
    },
  });
  for (const id of [10, 20, 30]) await api('POST', `/api/watched/shows/${id}/season/1/episode/1`);
  const upcoming = (await api('GET', '/api/watched/shows/upcoming')).body;
  assert.deepEqual(upcoming.map(s => s.tmdbId), [20, 10]);
  assert.deepEqual(upcoming[0].nextEpisode, { seasonNumber: 1, episodeNumber: 2, name: 'Next', airDate: '2030-01-01' });
});

// --- recommendations ------------------------------------------------------------------------

test('recommendations: no seeds -> empty', async () => {
  const { api } = createApp();
  assert.deepEqual((await api('GET', '/api/recommendations/movie')).body, { seedCount: 0, items: [], page: 1, totalPages: 1 });
  assert.equal((await api('GET', '/api/recommendations/person')).status, 400);
});

test('recommendations: ranks by match count then popularity, excludes seeds and watched/listed', async () => {
  const rec = (id, popularity) => ({ id, title: `Rec ${id}`, popularity });
  const { api, put, tmdbCalls, resetTmdbCalls } = createApp({
    tmdb: {
      '/movie/1/recommendations': { results: [rec(100, 1), rec(200, 50), rec(2, 99), rec(300, 10)] },
      '/movie/2/recommendations': { results: [rec(100, 1), rec(300, 10), rec(300, 10)] }, // dup within one seed counts once
      '/movie/3/recommendations': { results: [rec(400, 5)] }, // 3 is listed, not watched - still a seed
    },
  });
  await put('watched_movies', { tmdbId: 1, watchedAt: daysFromNow(-1) });
  await put('watched_movies', { tmdbId: 2, watchedAt: daysFromNow(-2) });
  const listId = (await api('POST', '/api/lists', { name: 'L' })).body.id;
  await put('list_items', { listId, tmdbId: 3, mediaType: 'movie', addedAt: daysFromNow(-3) });

  const res = (await api('GET', '/api/recommendations/movie')).body;
  assert.equal(res.seedCount, 3);
  // 100 and 300 matched twice (300 more popular), then 200 and 400 once by popularity; 2 is a seed.
  assert.deepEqual(res.items.map(i => i.tmdbId), [300, 100, 200, 400]);
  assert.deepEqual(res.items[0], {
    tmdbId: 300, mediaType: 'movie', title: 'Rec 300', year: null, releaseDate: null,
  });

  // The ranked pool is cached for the page's lifetime - asking again doesn't refetch.
  resetTmdbCalls();
  await api('GET', '/api/recommendations/movie?page=2');
  assert.equal(tmdbCalls.length, 0);
});

test('recommendations: only the 5 most recent items seed, and pages are 20 items', async () => {
  const tmdb = {};
  for (let seed = 1; seed <= 6; seed++) {
    tmdb[`/movie/${seed}/recommendations`] = {
      results: Array.from({ length: 10 }, (_, i) => ({ id: seed * 1000 + i, title: 'R', popularity: i })),
    };
  }
  const { api, put, tmdbCalls } = createApp({ tmdb });
  for (let seed = 1; seed <= 6; seed++) {
    await put('watched_movies', { tmdbId: seed, watchedAt: daysFromNow(-seed) });
  }
  const page1 = (await api('GET', '/api/recommendations/movie')).body;
  assert.equal(page1.seedCount, 5);
  assert.ok(!tmdbCalls.includes('/movie/6/recommendations'), 'oldest item should not seed');
  assert.equal(page1.totalPages, 3); // 50 items / 20 per page
  assert.equal(page1.items.length, 20);
  const page3 = (await api('GET', '/api/recommendations/movie?page=3')).body;
  assert.equal(page3.items.length, 10);
});

// --- TMDB fetching: cache, dedup, retry ------------------------------------------------------

test('movie/show details are cached in IndexedDB and shared across simultaneous callers', async () => {
  const { api, tmdbCalls, resetTmdbCalls } = createApp({ tmdb: { '/movie/1': movie(1, { runtime: 100 }) } });
  await api('POST', '/api/watched/movies/1');
  // Both routes need /movie/1 at the same moment - only one network request should go out.
  await Promise.all([api('GET', '/api/stats'), api('GET', '/api/watched/movies/details')]);
  assert.deepEqual(tmdbCalls, ['/movie/1']);

  resetTmdbCalls();
  assert.equal((await api('GET', '/api/stats')).body.totalWatchMinutes, 100);
  assert.equal(tmdbCalls.length, 0, 'second lookup should come from the tmdb_cache store');
});

test('transient TMDB failures (5xx) are retried, 404s are not', async () => {
  const { api, tmdbCalls } = createApp({
    tmdb: {
      '/movie/1': (path, url, callIndex) => (callIndex === 0 ? 503 : movie(1, { runtime: 90 })),
      '/movie/2': 404,
    },
  });
  await api('POST', '/api/watched/movies/1');
  await api('POST', '/api/watched/movies/2');
  const stats = (await api('GET', '/api/stats')).body;
  assert.equal(stats.totalWatchMinutes, 90);
  assert.equal(tmdbCalls.filter(p => p === '/movie/1').length, 2);
  assert.equal(tmdbCalls.filter(p => p === '/movie/2').length, 1);
});
