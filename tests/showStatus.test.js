const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp, daysFromNow, dateOnly } = require('./harness');

const DAY_MS = 24 * 60 * 60 * 1000;

// A show with seasons of `counts` episodes, `lastAired` = [season, episode] of the newest aired
// episode, and TMDB status (Returning Series / Ended / Canceled).
function show(id, { counts = [3, 3], lastAired = [2, 3], status = 'Returning Series', next = null } = {}) {
  return {
    id,
    name: `Show ${id}`,
    status,
    number_of_episodes: counts.reduce((a, b) => a + b, 0),
    seasons: [{ season_number: 0, episode_count: 5 }, ...counts.map((c, i) => ({ season_number: i + 1, episode_count: c }))],
    last_episode_to_air: lastAired ? { season_number: lastAired[0], episode_number: lastAired[1] } : null,
    next_episode_to_air: next,
  };
}

async function watch(app, showId, episodes, watchedAt) {
  for (const [s, e] of episodes) {
    await app.put('watched_episodes', { key: `${showId}:${s}:${e}`, showId, seasonNumber: s, episodeNumber: e, watchedAt });
  }
}

const ALL_6 = [[1, 1], [1, 2], [1, 3], [2, 1], [2, 2], [2, 3]];

async function statusOf(app, id) {
  const shows = (await app.api('GET', '/api/watched/shows?includeStatus=true')).body;
  return shows.find(s => s.tmdbId === id);
}

test('caught up: every aired episode watched, show still running (specials ignored)', async () => {
  const app = createApp({ tmdb: { '/tv/1': show(1) } });
  await watch(app, 1, ALL_6, daysFromNow(-90));
  const s = await statusOf(app, 1);
  assert.equal(s.status, 'caught_up');
  assert.equal(s.airedCount, 6);
  assert.equal(s.unwatchedCount, 0);
});

test('completed: everything watched and the show has ended or been canceled', async () => {
  const app = createApp({ tmdb: { '/tv/1': show(1, { status: 'Ended' }), '/tv/2': show(2, { status: 'Canceled' }) } });
  await watch(app, 1, ALL_6, daysFromNow(-1));
  await watch(app, 2, ALL_6, daysFromNow(-1));
  assert.equal((await statusOf(app, 1)).status, 'completed');
  assert.equal((await statusOf(app, 2)).status, 'completed');
});

test('watching: unwatched aired episodes and a watch within the last 30 days', async () => {
  const app = createApp({ tmdb: { '/tv/1': show(1) } });
  await watch(app, 1, [[1, 1], [1, 2]], daysFromNow(-29));
  const s = await statusOf(app, 1);
  assert.equal(s.status, 'watching');
  assert.equal(s.unwatchedCount, 4);
  assert.ok(s.nextUnwatched && s.nextUnwatched.seasonNumber >= 1 && s.nextUnwatched.episodeNumber >= 1);
});

test('dropped: nothing watched for 30+ days after the oldest unwatched episode came out', async () => {
  const app = createApp({
    tmdb: {
      '/tv/1': show(1),
      '/tv/1/season/1': { episodes: [{ episode_number: 3, air_date: dateOnly(daysFromNow(-200)) }] },
    },
  });
  await watch(app, 1, [[1, 1], [1, 2]], daysFromNow(-31));
  assert.equal((await statusOf(app, 1)).status, 'dropped');
});

test('a show returning from a long break gets a fresh 30 days from the new episode', async () => {
  const app = createApp({
    tmdb: {
      '/tv/1': show(1, { lastAired: [2, 1] }),
      '/tv/1/season/2': { episodes: [{ episode_number: 1, air_date: dateOnly(daysFromNow(-5)) }] },
    },
  });
  // Season 1 watched months ago; season 2 premiered 5 days ago.
  await watch(app, 1, [[1, 1], [1, 2], [1, 3]], daysFromNow(-150));
  assert.equal((await statusOf(app, 1)).status, 'watching');
});

test('...and is dropped once that new episode has gone unwatched for 30+ days', async () => {
  const app = createApp({
    tmdb: {
      '/tv/1': show(1, { lastAired: [2, 1] }),
      '/tv/1/season/2': { episodes: [{ episode_number: 1, air_date: dateOnly(daysFromNow(-31)) }] },
    },
  });
  await watch(app, 1, [[1, 1], [1, 2], [1, 3]], daysFromNow(-150));
  assert.equal((await statusOf(app, 1)).status, 'dropped');
});

test('no season lookup is made for shows watched in the last 30 days', async () => {
  const app = createApp({ tmdb: { '/tv/1': show(1) } });
  await watch(app, 1, [[1, 1]], daysFromNow(-2));
  await statusOf(app, 1);
  assert.deepEqual(app.tmdbCalls.filter(p => p.includes('/season/')), []);
});

test('status is only computed when asked for, and a failed lookup is "unknown"', async () => {
  const app = createApp({ tmdb: { '/tv/1': show(1) } });
  await watch(app, 1, [[1, 1]], daysFromNow(-2));
  await watch(app, 9, [[1, 1]], daysFromNow(-2));
  const plainList = (await app.api('GET', '/api/watched/shows')).body;
  assert.equal(plainList[0].status, undefined);
  assert.equal((await statusOf(app, 9)).status, 'unknown');
});

// --- schedule (Airing Soon page) --------------------------------------------------------------

test('schedule lists every upcoming episode of the next and later seasons, sorted by date', async () => {
  const today = dateOnly(daysFromNow(0));
  const app = createApp({
    tmdb: {
      '/tv/1': show(1, { counts: [3, 3], lastAired: [2, 1], next: { season_number: 2, episode_number: 2, air_date: dateOnly(daysFromNow(3)) } }),
      '/tv/1/season/2': {
        episodes: [
          { episode_number: 1, air_date: dateOnly(daysFromNow(-4)), name: 'Old' },
          { episode_number: 2, air_date: dateOnly(daysFromNow(3)), name: 'Two' },
          { episode_number: 3, air_date: dateOnly(daysFromNow(10)), name: 'Three' },
          { episode_number: 4, air_date: null, name: 'TBA' },
        ],
      },
      '/tv/2': show(2, { next: { season_number: 3, episode_number: 1, air_date: today, name: 'Premiere' } }),
      '/tv/3': show(3), // nothing announced
    },
  });
  await watch(app, 1, [[1, 1]], daysFromNow(-60)); // dropped shows are still listed
  await watch(app, 2, [[1, 1]], daysFromNow(-1));
  await watch(app, 3, [[1, 1]], daysFromNow(-1));

  const schedule = (await app.api('GET', '/api/watched/shows/schedule')).body;
  assert.deepEqual(schedule.map(e => [e.tmdbId, e.seasonNumber, e.episodeNumber, e.airDate]), [
    [2, 3, 1, today], // not in its season list yet -> taken from next_episode_to_air; today counts
    [1, 2, 2, dateOnly(daysFromNow(3))],
    [1, 2, 3, dateOnly(daysFromNow(10))],
  ]);
  assert.equal(schedule[1].name, 'Two');
  assert.equal(schedule[0].title, 'Show 2');
});

// --- stats ------------------------------------------------------------------------------------

test('stats details: watch time per month and top genres', async () => {
  const now = new Date();
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12).toISOString();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1, 12).toISOString();
  const app = createApp({
    tmdb: {
      '/movie/1': { id: 1, title: 'M1', runtime: 120, genres: [{ name: 'Drama' }, { name: 'Crime' }] },
      '/movie/2': { id: 2, title: 'M2', runtime: 90, genres: [{ name: 'Drama' }] },
      '/tv/10': { id: 10, name: 'S', episode_run_time: [40], genres: [{ name: 'Drama' }, { name: 'Comedy' }] },
    },
  });
  await app.put('watched_movies', { tmdbId: 1, watchedAt: thisMonth });
  await app.put('watched_movies', { tmdbId: 2, watchedAt: lastMonth });
  await watch(app, 10, [[1, 1], [1, 2]], thisMonth);

  const details = (await app.api('GET', '/api/stats/details')).body;
  assert.equal(details.monthly.length, 12);
  assert.deepEqual(details.monthly.slice(-2).map(m => m.minutes), [90, 120 + 2 * 40]);
  assert.deepEqual(details.genres, [{ name: 'Drama', count: 3 }, { name: 'Comedy', count: 1 }, { name: 'Crime', count: 1 }]);
  assert.equal(details.ratings, undefined);
});

test('stats actors: top-billed cast counted once per title, credits cached', async () => {
  const cast = (...people) => ({ cast: people.map(([id, name, order]) => ({ id, name, order, profile_path: `/${id}.jpg` })) });
  const app = createApp({
    tmdb: {
      '/movie/1/credits': cast([100, 'Alice', 0], [200, 'Bob', 1], [100, 'Alice', 5]),
      '/movie/2/credits': cast([100, 'Alice', 0], [300, 'Extra', 15]),
      '/tv/10/aggregate_credits': cast([200, 'Bob', 0], [100, 'Alice', 2]),
    },
  });
  await app.put('watched_movies', { tmdbId: 1, watchedAt: daysFromNow(-1) });
  await app.put('watched_movies', { tmdbId: 2, watchedAt: daysFromNow(-1) });
  await watch(app, 10, [[1, 1]], daysFromNow(-1));

  const actors = (await app.api('GET', '/api/stats/actors')).body;
  assert.deepEqual(actors.map(a => [a.name, a.count]), [['Alice', 3], ['Bob', 2]]);
  assert.equal(actors[0].profilePath, '/100.jpg');

  app.resetTmdbCalls();
  await app.api('GET', '/api/stats/actors');
  assert.deepEqual(app.tmdbCalls, [], 'credits come from the cache the second time');
});
