// A minimal promisified IndexedDB wrapper. No bundler in this project, so this is hand-rolled
// rather than pulling in a library (e.g. `idb`) that would need vendoring.
//
// Each profile gets its OWN database (name: `tvtc-profile-{profileId}`), not a shared database
// with a profile-id column — see CLAUDE.md for why (privacy blast-radius + trivial export/delete).
// Object stores mirror the old server/schema.sql tables, minus the user_id column (the whole
// database *is* one profile's data), with JS-camelCase field names matching the rest of the app's
// existing "standard item shape" conventions.

const DB_VERSION = 1;

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openProfileDb(profileId) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(`tvtc-profile-${profileId}`, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      const lists = db.createObjectStore('lists', { keyPath: 'id', autoIncrement: true });
      lists.createIndex('name', 'name', { unique: true });
      // Every profile gets a default "Bookmarks" list, mirroring the old signup-time behavior.
      lists.add({ name: 'Bookmarks', isDefault: true, createdAt: new Date(0).toISOString() });

      const listItems = db.createObjectStore('list_items', { keyPath: 'id', autoIncrement: true });
      listItems.createIndex('listId', 'listId');
      listItems.createIndex('unique_item', ['listId', 'tmdbId', 'mediaType'], { unique: true });

      db.createObjectStore('watched_movies', { keyPath: 'tmdbId' });

      const watchedEpisodes = db.createObjectStore('watched_episodes', { keyPath: 'key' });
      watchedEpisodes.createIndex('showId', 'showId');

      const favorites = db.createObjectStore('favorites', { keyPath: 'key' });
      favorites.createIndex('mediaType', 'mediaType');

      db.createObjectStore('ratings', { keyPath: 'key' });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function dbGetAll(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).getAll());
}

function dbGet(db, storeName, key) {
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).get(key));
}

function dbCount(db, storeName) {
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).count());
}

function dbGetAllByIndex(db, storeName, indexName, value) {
  const tx = db.transaction(storeName, 'readonly');
  return promisifyRequest(tx.objectStore(storeName).index(indexName).getAll(value));
}

// Insert-only — rejects (ConstraintError) if the key or a unique index would collide.
function dbAdd(db, storeName, value) {
  const tx = db.transaction(storeName, 'readwrite');
  return promisifyRequest(tx.objectStore(storeName).add(value));
}

// Insert-or-replace by primary key.
function dbPut(db, storeName, value) {
  const tx = db.transaction(storeName, 'readwrite');
  return promisifyRequest(tx.objectStore(storeName).put(value));
}

function dbDelete(db, storeName, key) {
  const tx = db.transaction(storeName, 'readwrite');
  return promisifyRequest(tx.objectStore(storeName).delete(key));
}
