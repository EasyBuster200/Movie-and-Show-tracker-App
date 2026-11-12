// Loads the app's real browser scripts (standardItem.js, localDb.js, profiles.js, localApi.js)
// into an isolated Node `vm` context that stands in for one browser page: fake-indexeddb for
// IndexedDB, an in-memory localStorage, and a fake TMDB server in place of the network. Tests
// then drive it exactly like the app does - `fetch('/api/...')` against the shimmed fetch - so
// they cover the real route handlers, not a re-implementation of them.
//
// Every createApp() call is a fresh page load: new IndexedDB, new localStorage, and fresh
// module-level state (localApi.js's recommendation pool cache, in-flight request map, etc).

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const SCRIPTS_DIR = path.join(__dirname, '..', 'public', 'scripts');
const PAGE_SCRIPTS = ['standardItem.js', 'localDb.js', 'profiles.js', 'localApi.js'];
const TMDB_ORIGIN = 'https://api.themoviedb.org';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

// `tmdb` maps a TMDB path (no /3 prefix, no query string - e.g. '/movie/550') to either a JSON
// body, a number (an error status), or a function (path, url, callIndex) returning either.
// Unmapped paths 404. Every request is recorded in `tmdbCalls` (path + query string).
function createApp({ tmdb = {}, withProfile = true } = {}) {
  const storage = new Map();
  const localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };

  const tmdbCalls = [];
  const tmdbRequests = [];
  const callCounts = new Map();

  async function networkFetch(input, init) {
    const url = new URL(String(input));
    if (url.origin !== TMDB_ORIGIN) throw new Error(`Unexpected network request to ${url}`);
    const tmdbPath = url.pathname.replace(/^\/3/, '');
    tmdbCalls.push(tmdbPath + url.search);
    tmdbRequests.push({ url: url.toString(), headers: (init && init.headers) || {} });

    const callIndex = callCounts.get(tmdbPath) || 0;
    callCounts.set(tmdbPath, callIndex + 1);

    let entry = tmdb[tmdbPath];
    if (typeof entry === 'function') entry = entry(tmdbPath, url, callIndex);
    if (entry === undefined) return jsonResponse({ status_message: 'not found' }, 404);
    if (typeof entry === 'number') return jsonResponse({ status_message: 'error' }, entry);
    // Deep-copy so a route mutating a response (stripAdultItems does) can't leak into the fixture.
    return jsonResponse(structuredClone(entry));
  }

  const context = {
    console,
    URL,
    URLSearchParams,
    Response,
    AbortController,
    setTimeout,
    clearTimeout,
    structuredClone,
    crypto,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
    localStorage,
    location: { origin: 'http://localhost' },
    fetch: networkFetch,
  };
  context.window = context;
  vm.createContext(context);

  PAGE_SCRIPTS.forEach(file => {
    const code = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });

  const run = code => vm.runInContext(code, context);

  if (withProfile) {
    run("setActiveProfileId(createProfile({ displayName: 'Test', tmdbApiKey: 'test-key' }).id)");
  }

  async function api(method, apiPath, body) {
    const init = { method };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await context.fetch(apiPath, init);
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  // Writes a row straight into the active profile's IndexedDB, bypassing the routes - for
  // setting up state the routes can't produce directly (e.g. a watchedAt in the past).
  function put(storeName, row) {
    context.__putArgs = { storeName, row };
    return run('getDb().then(db => dbPut(db, __putArgs.storeName, __putArgs.row))');
  }

  function getAll(storeName) {
    context.__storeName = storeName;
    return run('getDb().then(db => dbGetAll(db, __storeName))');
  }

  function resetTmdbCalls() {
    tmdbCalls.length = 0;
  }

  return { context, run, api, put, getAll, tmdbCalls, tmdbRequests, resetTmdbCalls };
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function dateOnly(isoString) {
  return isoString.slice(0, 10);
}

module.exports = { createApp, daysFromNow, dateOnly };
