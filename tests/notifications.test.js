const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const plain = value => JSON.parse(JSON.stringify(value));
const HOUR_MS = 60 * 60 * 1000;

function show(id, nextEpisode) {
  return { id, name: `Show ${id}`, number_of_episodes: 10, seasons: [{ season_number: 1 }], next_episode_to_air: nextEpisode };
}

function next(airDate, episodeNumber = 2, name = 'The Next One') {
  return { season_number: 1, episode_number: episodeNumber, name, air_date: airDate };
}

async function trackShows(app, ids) {
  for (const id of ids) await app.api('POST', `/api/watched/shows/${id}/season/1/episode/1`);
}

const NOW = new Date(2026, 10, 13, 12, 0); // 13 Nov 2026, 12:00 local

// --- building the schedule (pure) -------------------------------------------------------------

test('notifications are scheduled for 18:00 local on the air date, one per show', async () => {
  const { call } = createApp({ withProfile: false });
  const built = await call('buildEpisodeNotifications', [
    { tmdbId: 10, title: 'Show 10', nextEpisode: { seasonNumber: 2, episodeNumber: 5, name: 'Reunion', airDate: '2026-11-15' } },
    { tmdbId: 20, title: 'Show 20', nextEpisode: { seasonNumber: 1, episodeNumber: 3, name: 'Episode 3', airDate: '2026-11-13' } },
  ], NOW);

  assert.deepEqual(built.map(n => n.id), [10, 20]);
  assert.equal(built[0].title, 'Show 10');
  assert.equal(built[0].body, 'New episode today: S2E5 · Reunion');
  assert.equal(built[0].schedule.at, new Date(2026, 10, 15, 18, 0).toISOString());
  assert.equal(built[0].schedule.allowWhileIdle, true);
  assert.deepEqual(built[0].extra, { showId: 10 });
  assert.equal(built[1].body, 'New episode today: S1E3', 'placeholder "Episode N" names are left out');
  assert.equal(built[1].schedule.at, new Date(2026, 10, 13, 18, 0).toISOString());
});

test('episodes whose notification time has passed, or without an air date, are skipped', async () => {
  const { call } = createApp({ withProfile: false });
  const evening = new Date(2026, 10, 13, 19, 0);
  const built = await call('buildEpisodeNotifications', [
    { tmdbId: 1, title: 'A', nextEpisode: { seasonNumber: 1, episodeNumber: 1, airDate: '2026-11-13' } }, // today, 18:00 passed
    { tmdbId: 2, title: 'B', nextEpisode: { seasonNumber: 1, episodeNumber: 1, airDate: '2026-11-10' } }, // past
    { tmdbId: 3, title: 'C', nextEpisode: { seasonNumber: 1, episodeNumber: 1, airDate: null } },
    { tmdbId: 4, title: 'D', nextEpisode: { seasonNumber: 1, episodeNumber: 1, airDate: '2026-11-14' } },
  ], evening);
  assert.deepEqual(built.map(n => n.id), [4]);
});

// --- refreshing against the plugin ------------------------------------------------------------

test('refresh schedules upcoming episodes and replaces anything previously scheduled', async () => {
  const app = createApp({
    native: true,
    tmdb: { '/tv/10': show(10, next('2026-11-15')), '/tv/20': show(20, null) },
  });
  await trackShows(app, [10, 20]);
  app.notifications.state.pending.push({ id: 999, title: 'stale' });

  const result = await app.call('refreshEpisodeNotifications', { now: NOW });
  assert.deepEqual(result, { status: 'scheduled', count: 1 });
  const pending = plain(app.notifications.state.pending);
  assert.deepEqual(pending.map(n => n.id), [10]);
  assert.equal(pending[0].smallIcon, 'ic_stat_tvtc');
});

test('refresh is throttled per profile, unless forced', async () => {
  const app = createApp({ native: true, tmdb: { '/tv/10': show(10, next('2026-11-15')) } });
  await trackShows(app, [10]);

  assert.equal((await app.call('refreshEpisodeNotifications', { now: NOW })).status, 'scheduled');
  app.resetTmdbCalls();
  assert.equal((await app.call('refreshEpisodeNotifications', { now: new Date(NOW.getTime() + HOUR_MS) })).status, 'throttled');
  assert.equal((await app.call('refreshEpisodeNotifications', { now: new Date(NOW.getTime() + 7 * HOUR_MS) })).status, 'scheduled');
  assert.equal((await app.call('refreshEpisodeNotifications', { now: new Date(NOW.getTime() + 7 * HOUR_MS), force: true })).status, 'scheduled');
});

test('switching profile reschedules immediately for the new profile', async () => {
  const app = createApp({ native: true, tmdb: { '/tv/10': show(10, next('2026-11-15')) } });
  await trackShows(app, [10]);
  await app.call('refreshEpisodeNotifications', { now: NOW });

  app.run("setActiveProfileId(createProfile({ displayName: 'Other', tmdbApiKey: 'k2' }).id); dbPromise = null;");
  const result = await app.call('refreshEpisodeNotifications', { now: new Date(NOW.getTime() + HOUR_MS) });
  assert.deepEqual(result, { status: 'scheduled', count: 0 });
  assert.deepEqual(app.notifications.state.pending, [], "the previous profile's notifications are gone");
});

test('turning notifications off cancels them; no active profile clears them too', async () => {
  const app = createApp({ native: true, tmdb: { '/tv/10': show(10, next('2026-11-15')) } });
  await trackShows(app, [10]);
  await app.call('refreshEpisodeNotifications', { now: NOW });
  assert.equal(app.notifications.state.pending.length, 1);

  app.run('setEpisodeNotificationsEnabled(false)');
  assert.equal((await app.call('refreshEpisodeNotifications', { now: NOW })).status, 'disabled');
  assert.deepEqual(app.notifications.state.pending, []);

  app.run('setEpisodeNotificationsEnabled(true)');
  await app.call('refreshEpisodeNotifications', { now: NOW, force: true });
  app.run('clearActiveProfile()');
  assert.equal((await app.call('refreshEpisodeNotifications', { now: NOW })).status, 'cleared');
  assert.deepEqual(app.notifications.state.pending, []);
});

test('permission is requested once when undecided; a refusal schedules nothing', async () => {
  const app = createApp({
    native: true,
    notificationOptions: { permission: 'prompt', denyRequest: true },
    tmdb: { '/tv/10': show(10, next('2026-11-15')) },
  });
  await trackShows(app, [10]);
  assert.equal((await app.call('refreshEpisodeNotifications', { now: NOW })).status, 'denied');
  assert.equal(app.notifications.state.requests, 1);
  assert.deepEqual(app.notifications.state.pending, []);

  // Once denied, Android won't show the prompt again - don't keep asking.
  await app.call('refreshEpisodeNotifications', { now: NOW, force: true });
  assert.equal(app.notifications.state.requests, 1);
});

test('nothing happens outside the Android app', async () => {
  const app = createApp();
  assert.equal((await app.call('refreshEpisodeNotifications', { now: NOW })).status, 'unsupported');
});

// --- detail cache vs. next_episode_to_air -----------------------------------------------------

test("a cached show whose next episode has already aired is refetched, so the following one is known", async () => {
  let call = 0;
  const app = createApp({
    tmdb: {
      // First fetch: next episode airs "yesterday" relative to now. Second fetch: TMDB has moved on.
      '/tv/10': () => (call++ === 0 ? show(10, next('2000-01-01', 2)) : show(10, next('2999-01-01', 3))),
      '/tv/20': show(20, next('2999-01-01', 2)),
    },
  });
  await trackShows(app, [10, 20]);
  await app.api('GET', '/api/watched/shows/upcoming');
  app.resetTmdbCalls();

  const upcoming = (await app.api('GET', '/api/watched/shows/upcoming')).body;
  assert.deepEqual(app.tmdbCalls, ['/tv/10'], 'only the show with a stale next episode is refetched');
  assert.deepEqual(upcoming.map(s => [s.tmdbId, s.nextEpisode.episodeNumber]).sort(), [[10, 3], [20, 2]]);
});
