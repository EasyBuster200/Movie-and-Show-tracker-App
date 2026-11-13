const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./harness');

const plain = value => JSON.parse(JSON.stringify(value));
const DAY_MS = 24 * 60 * 60 * 1000;

function activeProfile(app) {
  return plain(app.run('getActiveProfile()'));
}

async function seedSomeData(app) {
  const listId = (await app.api('POST', '/api/lists', { name: 'Horror' })).body.id;
  await app.api('POST', `/api/lists/${listId}/items`, { tmdbId: 1, mediaType: 'movie' });
  await app.api('POST', '/api/watched/movies/1', { title: 'Movie 1', year: '2020' });
  await app.api('POST', '/api/watched/shows/10/season/1/episode/1');
  await app.api('POST', '/api/favorites/tv/10', { title: 'Show 10' });
  await app.api('PUT', '/api/ratings/movie/1', { rating: 8 });
}

// --- export / restore -------------------------------------------------------------------------

test('a backup contains every data store but never the TMDB API key', async () => {
  const app = createApp();
  await seedSomeData(app);
  const payload = await app.call('buildBackupPayload', activeProfile(app));

  assert.equal(payload.app, 'tvtimeclone');
  assert.equal(payload.backupVersion, 2);
  assert.deepEqual(payload.profile, { displayName: 'Test' });
  assert.ok(!JSON.stringify(payload).includes('test-key'), 'the key must not appear anywhere in the file');
  assert.equal(payload.data.watched_movies.length, 1);
  assert.equal(payload.data.watched_episodes.length, 1);
  assert.equal(payload.data.favorites.length, 1);
  assert.equal(payload.data.ratings.length, 1);
  assert.deepEqual(payload.data.lists.map(l => l.name).sort(), ['Bookmarks', 'Horror']);
  assert.equal(payload.data.list_items.length, 1);
});

test('restoring creates a new profile with the given key and identical data', async () => {
  const app = createApp();
  await seedSomeData(app);
  const original = activeProfile(app);
  const payload = await app.call('buildBackupPayload', original);

  const restored = await app.call('restoreBackup', payload, { displayName: 'Restored', tmdbApiKey: 'new-key' });
  assert.notEqual(restored.id, original.id);
  assert.equal(restored.displayName, 'Restored');
  assert.equal(restored.tmdbApiKey, 'new-key');
  assert.equal(plain(app.run('getProfiles()')).length, 2);

  const roundTrip = await app.call('buildBackupPayload', restored);
  assert.deepEqual(roundTrip.data, payload.data);

  // The restored profile is fully usable through the normal API.
  app.run(`setActiveProfileId(${JSON.stringify(restored.id)}); dbPromise = null;`);
  assert.deepEqual((await app.api('GET', '/api/watched/movies')).body, [1]);
  assert.deepEqual((await app.api('GET', '/api/ratings/movie/1')).body, { rating: 8 });
});

test('parseBackupText rejects things that are not backups', async () => {
  const { run } = createApp({ withProfile: false });
  const parseError = text => {
    try {
      run(`parseBackupText(${JSON.stringify(text)})`);
      return null;
    } catch (error) {
      return error.message;
    }
  };
  assert.match(parseError('not json'), /isn't valid JSON/);
  assert.match(parseError(JSON.stringify({ app: 'other' })), /doesn't look like a TVTimeClone backup/);
  assert.match(parseError(JSON.stringify({ app: 'tvtimeclone', profile: { displayName: 'X' }, data: { lists: [] } })), /doesn't look like/);
});

test('old (v1) backups with an embedded key are still accepted; the key is offered as a prefill', async () => {
  const { run } = createApp({ withProfile: false });
  const data = { lists: [], list_items: [], watched_movies: [], watched_episodes: [], favorites: [], ratings: [] };
  const v1 = JSON.stringify({ app: 'tvtimeclone', backupVersion: 1, profile: { displayName: 'Old', tmdbApiKey: ' old-key ' }, data });
  const v2 = JSON.stringify({ app: 'tvtimeclone', backupVersion: 2, profile: { displayName: 'New' }, data });
  assert.equal(run(`legacyBackupApiKey(parseBackupText(${JSON.stringify(v1)}))`), 'old-key');
  assert.equal(run(`legacyBackupApiKey(parseBackupText(${JSON.stringify(v2)}))`), null);
});

// --- weekly auto-backup -----------------------------------------------------------------------

test('auto-backup does nothing outside the Android app', async () => {
  const app = createApp();
  assert.deepEqual(await app.call('runAutoBackups'), []);
  assert.deepEqual(app.filesystem.documents(), []);
});

test('auto-backup writes a dated file to Documents/TVTimeClone, then waits a week', async () => {
  const app = createApp({ native: true });
  await seedSomeData(app);
  const day0 = new Date(2026, 10, 13, 12, 0);

  const [first] = await app.call('runAutoBackups', { now: day0 });
  assert.equal(first.status, 'saved');
  assert.deepEqual(app.filesystem.documents(), ['TVTimeClone/tvtimeclone-test-2026-11-13.json']);

  const saved = JSON.parse(app.filesystem.read('TVTimeClone/tvtimeclone-test-2026-11-13.json'));
  assert.equal(saved.data.watched_movies.length, 1);
  assert.ok(!JSON.stringify(saved).includes('test-key'));

  const [again] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 6 * DAY_MS) });
  assert.equal(again.status, 'skipped');
  assert.deepEqual(app.filesystem.documents(), ['TVTimeClone/tvtimeclone-test-2026-11-13.json']);
});

test('the next weekly backup replaces the previous file (written first, then old one deleted)', async () => {
  const app = createApp({ native: true });
  const day0 = new Date(2026, 10, 13, 12, 0);
  await app.call('runAutoBackups', { now: day0 });
  await app.api('POST', '/api/watched/movies/2', { title: 'Movie 2' });

  const [result] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 7 * DAY_MS) });
  assert.equal(result.status, 'saved');
  assert.deepEqual(result.undeleted, []);
  assert.deepEqual(app.filesystem.documents(), ['TVTimeClone/tvtimeclone-test-2026-11-20.json']);
  assert.equal(JSON.parse(app.filesystem.read('TVTimeClone/tvtimeclone-test-2026-11-20.json')).data.watched_movies.length, 1);

  const info = await app.call('getAutoBackupInfo', activeProfile(app).id);
  assert.equal(info.path, 'TVTimeClone/tvtimeclone-test-2026-11-20.json');
  assert.equal(info.savedAt, new Date(day0.getTime() + 7 * DAY_MS).toISOString());
});

test('a previous backup that cannot be deleted is kept, reported, and retried next time', async () => {
  const app = createApp({ native: true, filesystemOptions: { undeletable: ['TVTimeClone/tvtimeclone-test-2026-11-13.json'] } });
  const day0 = new Date(2026, 10, 13, 12, 0);
  await app.call('runAutoBackups', { now: day0 });

  const [second] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 7 * DAY_MS) });
  assert.deepEqual(second.undeleted, ['TVTimeClone/tvtimeclone-test-2026-11-13.json']);
  assert.equal(app.filesystem.documents().length, 2);

  // Next week the old file becomes deletable again: both older files go, only the newest stays.
  app.filesystem.state.undeletable.clear();
  const [third] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 14 * DAY_MS) });
  assert.deepEqual(third.undeleted, []);
  assert.deepEqual(app.filesystem.documents(), ['TVTimeClone/tvtimeclone-test-2026-11-27.json']);
});

test('a previous backup the user already deleted by hand is not an error', async () => {
  const app = createApp({ native: true });
  const day0 = new Date(2026, 10, 13, 12, 0);
  await app.call('runAutoBackups', { now: day0 });
  await app.filesystem.plugin.Filesystem.deleteFile({ path: 'TVTimeClone/tvtimeclone-test-2026-11-13.json', directory: 'DOCUMENTS' });

  const [result] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 7 * DAY_MS) });
  assert.equal(result.status, 'saved');
  assert.deepEqual(result.undeleted, []);
});

test('a failed write keeps the previous backup and records the error', async () => {
  const app = createApp({ native: true });
  const day0 = new Date(2026, 10, 13, 12, 0);
  await app.call('runAutoBackups', { now: day0 });

  app.filesystem.state.failWrites = true;
  const [result] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 7 * DAY_MS) });
  assert.equal(result.status, 'failed');
  assert.deepEqual(app.filesystem.documents(), ['TVTimeClone/tvtimeclone-test-2026-11-13.json']);

  const info = await app.call('getAutoBackupInfo', activeProfile(app).id);
  assert.equal(info.lastError, 'Disk full');
  assert.equal(info.path, 'TVTimeClone/tvtimeclone-test-2026-11-13.json', 'still points at the surviving backup');

  // Still due, so the next page load tries again - and clears the error once it works.
  app.filesystem.state.failWrites = false;
  const [retry] = await app.call('runAutoBackups', { now: new Date(day0.getTime() + 7 * DAY_MS + 60000) });
  assert.equal(retry.status, 'saved');
  assert.equal((await app.call('getAutoBackupInfo', activeProfile(app).id)).lastError, null);
});

test('every profile on the device gets its own weekly file; "Back Up Now" forces one', async () => {
  const app = createApp({ native: true });
  app.run("createProfile({ displayName: 'Second Person', tmdbApiKey: 'k2' })");
  const day0 = new Date(2026, 10, 13, 12, 0);

  const results = await app.call('runAutoBackups', { now: day0 });
  assert.deepEqual(results.map(r => r.status), ['saved', 'saved']);
  assert.deepEqual(app.filesystem.documents(), [
    'TVTimeClone/tvtimeclone-second-person-2026-11-13.json',
    'TVTimeClone/tvtimeclone-test-2026-11-13.json',
  ]);

  const later = new Date(day0.getTime() + 2 * DAY_MS);
  const forced = await app.call('runAutoBackups', { now: later, force: true, profileIds: [activeProfile(app).id] });
  assert.deepEqual(forced.map(r => r.status), ['saved']);
  assert.deepEqual(app.filesystem.documents(), [
    'TVTimeClone/tvtimeclone-second-person-2026-11-13.json',
    'TVTimeClone/tvtimeclone-test-2026-11-15.json',
  ]);
});

// --- TMDB key validation ----------------------------------------------------------------------

test('validateTmdbApiKey accepts a working token', async () => {
  const app = createApp({
    withProfile: false,
    tmdb: { '/authentication': (path, url, i, headers) => (headers.Authorization === 'Bearer good-token' ? { success: true } : 401) },
  });
  assert.deepEqual(await app.call('validateTmdbApiKey', ' good-token '), { ok: true });
});

test('validateTmdbApiKey explains rejected keys, short v3 keys and network failures', async () => {
  let offline = false;
  const app = createApp({
    withProfile: false,
    tmdb: {
      '/authentication': () => {
        if (offline) throw new TypeError('Failed to fetch');
        return 401;
      },
    },
  });
  assert.match((await app.call('validateTmdbApiKey', '')).message, /Enter a TMDB/);
  assert.match((await app.call('validateTmdbApiKey', 'eyJ-not-valid')).message, /TMDB rejected that key/);
  const short = await app.call('validateTmdbApiKey', '0123456789abcdef0123456789abcdef');
  assert.equal(short.ok, false);
  assert.match(short.message, /API Read Access Token/);
  offline = true;
  assert.match((await app.call('validateTmdbApiKey', 'anything')).message, /Couldn't reach TMDB/);
});
