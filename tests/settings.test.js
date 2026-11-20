// Settings: per-profile preferences, TMDB language, release reminders, the weekly recap,
// the auto-backup switch and Reset all data.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const plain = value => JSON.parse(JSON.stringify(value));
const DAY_MS = 24 * 60 * 60 * 1000;

function setPrefs(app, prefs) {
  return app.run(`setProfilePrefs(getActiveProfileId(), ${JSON.stringify(prefs)})`);
}

test('preferences default sensibly and are kept per profile', async () => {
  const app = createApp();
  const defaults = plain(await app.call('getProfilePrefs'));
  assert.equal(defaults.theme, 'dark');
  assert.equal(defaults.accent, 'burgundy');
  assert.equal(defaults.language, 'en-US');
  assert.equal(defaults.notifyEpisodes, true);
  assert.equal(defaults.weeklyRecap, false);
  assert.equal(defaults.autoBackup, true);

  await setPrefs(app, { theme: 'light', region: 'PT' });
  const other = await app.run("createProfile({ displayName: 'Other', tmdbApiKey: 'k2' }).id");
  assert.equal(plain(await app.call('getProfilePrefs')).theme, 'light');
  assert.equal(plain(await app.call('getProfilePrefs', other)).theme, 'dark');
  assert.equal(await app.call('profileRegion'), 'PT');
});

test('the old device-wide notifications switch is the default for profiles without their own', async () => {
  const app = createApp();
  await app.run("localStorage.setItem('tvtc_notifications_enabled', 'false')");
  assert.equal(plain(await app.call('getProfilePrefs')).notifyEpisodes, false);
  await setPrefs(app, { notifyEpisodes: true });
  assert.equal(plain(await app.call('getProfilePrefs')).notifyEpisodes, true);
});

test('a non-English language is sent to TMDB and cached separately', async () => {
  const app = createApp({ tmdb: { '/movie/1': { id: 1, title: 'Film', runtime: 90 }, '/search/multi': { results: [] } } });
  await app.api('GET', '/api/tmdb/search/multi?query=x&language=en-US');
  assert.equal(app.tmdbRequests[0].url, 'https://api.themoviedb.org/3/search/multi?query=x&language=en-US');

  await setPrefs(app, { language: 'pt-PT' });
  await app.api('GET', '/api/tmdb/search/multi?query=x&language=en-US');
  assert.equal(app.tmdbRequests[1].url, 'https://api.themoviedb.org/3/search/multi?query=x&language=pt-PT');

  await app.api('GET', '/api/tmdb/movie/1?append_to_response=videos');
  assert.match(app.tmdbRequests[2].url, /include_video_language=pt%2Cen%2Cnull/);

  // Local enrichment: the detail cache is per language.
  await app.call('fetchLocalTmdb', '/movie/1');
  const keys = (await app.getAll('tmdb_cache')).map(e => e.key);
  assert.deepEqual(keys, ['movie:1@pt-PT']);
});

test('Watchlist releases use the region\'s theatrical date, else digital, and skip the past', async () => {
  const today = new Date();
  const iso = days => new Date(today.getTime() + days * DAY_MS).toISOString();
  const dates = entries => ({ results: [{ iso_3166_1: 'PT', release_dates: entries }] });
  const app = createApp({
    tmdb: {
      '/movie/1': { id: 1, title: 'Cinema', release_date: '2027-01-01' },
      '/movie/1/release_dates': dates([{ type: 4, release_date: iso(30) }, { type: 3, release_date: iso(10) }]),
      '/movie/2': { id: 2, title: 'Streaming' },
      '/movie/2/release_dates': dates([{ type: 4, release_date: iso(5) }]),
      '/movie/3': { id: 3, title: 'Already out' },
      '/movie/3/release_dates': dates([{ type: 3, release_date: iso(-10) }]),
      '/movie/4': { id: 4, title: 'Elsewhere only' },
      '/movie/4/release_dates': { results: [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: iso(3) }] }] },
    },
  });
  await setPrefs(app, { region: 'PT' });
  const lists = await (await app.api('GET', '/api/lists')).body;
  const watchlistId = lists.find(l => l.is_default).id;
  for (const id of [1, 2, 3, 4]) await app.api('POST', `/api/lists/${watchlistId}/items`, { tmdbId: id, mediaType: 'movie' });
  await app.api('POST', `/api/lists/${watchlistId}/items`, { tmdbId: 9, mediaType: 'tv' });

  const releases = await (await app.api('GET', '/api/watchlist/releases')).body;
  assert.deepEqual(releases.map(r => [r.title, r.releaseKind]), [['Streaming', 'digital'], ['Cinema', 'theatrical']]);
  assert.equal(releases[1].releaseDate, iso(10).slice(0, 10));

  const built = plain(await app.call('buildReleaseNotifications', releases, new Date()));
  assert.equal(built.length, 2);
  assert.equal(built[0].body, 'Out today to stream or buy.');
  assert.equal(built[1].extra.url, 'detail.html?type=movie&id=1');
  assert.equal(new Date(built[0].schedule.at).getHours(), 18);
});

test('the recap counts the last 7 days and the episodes airing in the next 7', async () => {
  const at = new Date();
  const ago = days => new Date(at.getTime() - days * DAY_MS).toISOString();
  const soon = days => {
    const d = new Date(at.getTime() + days * DAY_MS);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const app = createApp({
    tmdb: {
      '/movie/1': { id: 1, title: 'A', runtime: 100 },
      '/movie/2': { id: 2, title: 'B', runtime: 90 },
      '/tv/10': { id: 10, name: 'Show', episode_run_time: [40], seasons: [{ season_number: 1 }], next_episode_to_air: { season_number: 1, episode_number: 3, air_date: soon(2) } },
      '/tv/10/season/1': { episodes: [{ episode_number: 3, air_date: soon(2) }, { episode_number: 4, air_date: soon(9) }] },
    },
  });
  await app.put('watched_movies', { tmdbId: 1, watchedAt: ago(2) });
  await app.put('watched_movies', { tmdbId: 2, watchedAt: ago(20) });
  await app.put('watched_episodes', { key: '10:1:1', showId: 10, seasonNumber: 1, episodeNumber: 1, watchedAt: ago(1) });
  await app.put('watched_episodes', { key: '10:1:2', showId: 10, seasonNumber: 1, episodeNumber: 2, watchedAt: ago(3) });

  const recap = (await app.api('GET', `/api/recap?at=${encodeURIComponent(at.toISOString())}`)).body;
  assert.deepEqual(recap, { episodes: 2, movies: 1, minutes: 180, upcomingEpisodes: 1 });

  const note = plain(await app.call('buildRecapNotification', recap, at));
  assert.equal(note.body, 'This week: 2 episodes, 1 movie (3h 00m). Coming up: 1 new episode.');
  assert.equal(note.extra.url, 'stats.html');
  assert.equal(plain(await app.call('buildRecapNotification', { episodes: 0, movies: 0, minutes: 0, upcomingEpisodes: 0 }, at)).body, 'Nothing watched this week.');
});

test('the recap is scheduled for the next Sunday at 19:00', async () => {
  const app = createApp();
  const check = async (now, expected) => {
    const at = new Date(await app.call('nextRecapTime', now));
    assert.deepEqual([at.getDay(), at.getHours(), at.getDate()], expected);
  };
  await check(new Date(2026, 10, 18, 10, 0), [0, 19, 22]); // Wednesday -> Sunday 22nd
  await check(new Date(2026, 10, 22, 18, 0), [0, 19, 22]); // Sunday before 19:00 -> same day
  await check(new Date(2026, 10, 22, 20, 0), [0, 19, 29]); // Sunday after -> next week
});

test('refresh schedules reminders and the recap when they are switched on', async () => {
  const app = createApp({ native: true, tmdb: {} });
  await setPrefs(app, { notifyEpisodes: false, releaseReminders: true, weeklyRecap: true });
  const result = plain(await app.call('refreshEpisodeNotifications', { force: true }));
  assert.deepEqual(result, { status: 'scheduled', count: 1 });
  assert.equal(app.notifications.state.pending[0].title, 'Your week in Watchlog');
  assert.equal(app.background.last().enabled, false, 'the background episode check is off without episode notifications');
});

test('auto-backup skips profiles that switched it off, unless backing up now', async () => {
  const app = createApp({ native: true });
  await setPrefs(app, { autoBackup: false });
  assert.deepEqual(plain(await app.call('runAutoBackups')), []);
  const id = await app.run('getActiveProfileId()');
  const [forced] = plain(await app.call('runAutoBackups', { force: true, profileIds: [id] }));
  assert.equal(forced.status, 'saved');
});

test('reset empties the library but keeps the profile and an empty Watchlist', async () => {
  const app = createApp({ tmdb: { '/movie/1': { id: 1, title: 'A' } } });
  await app.api('POST', '/api/watched/movies/1', { title: 'A' });
  await app.api('POST', '/api/favorites/movie/1', { title: 'A' });
  await app.api('POST', '/api/lists', { name: 'Mine' });
  await app.put('tmdb_cache', { key: 'movie:1', data: { id: 1 }, fetchedAt: Date.now() });

  const response = await app.api('POST', '/api/reset');
  assert.equal(response.status, 200);
  assert.deepEqual(await (await app.api('GET', '/api/watched/movies')).body, []);
  const lists = await (await app.api('GET', '/api/lists')).body;
  assert.deepEqual(lists.map(l => [l.is_default, l.item_count]), [[1, 0]]);
  assert.equal((await app.getAll('favorites')).length, 0);
  assert.equal((await app.getAll('tmdb_cache')).length, 1, 'the TMDB cache is kept');
  assert.equal(await app.run('getActiveProfile().displayName'), 'Test');
});
