// Export/import a profile's full local data as a single JSON file, so it can be moved to a new
// phone (or restored after an uninstall) without re-marking everything as watched/favorited.
// Ordinary app updates already preserve IndexedDB/localStorage automatically (Android keeps app
// data across `adb install -r`/Play Store updates) - this is for device-to-device migration,
// reinstalls, and autoBackup.js's weekly files.
//
// Backups deliberately do NOT contain the profile's TMDB API key. They end up in shared places
// (public Documents, Drive, email), and a key in plain text there is readable by anything that
// can read the file. A TMDB key is free and re-obtainable, so restoring asks for one instead
// (profile-picker.js) or reuses the current profile's (profile.js). Version 1 backups, made
// before this change, did include it - restoring still accepts those (legacyBackupApiKey).

// Ratings were removed from the app: new backups don't have them, and old backups' `ratings`
// are ignored when restoring.
const BACKUP_STORE_NAMES = ['lists', 'list_items', 'watched_movies', 'watched_episodes', 'favorites'];
const BACKUP_FORMAT_VERSION = 2;

async function buildBackupPayload(profile) {
  const db = await openProfileDb(profile.id);
  const data = {};
  for (const storeName of BACKUP_STORE_NAMES) {
    data[storeName] = await dbGetAll(db, storeName);
  }
  db.close();
  return {
    // Format id, not the display name - kept from when the app was called TVTimeClone so every
    // existing backup file stays importable. Don't change it.
    app: 'tvtimeclone',
    backupVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { displayName: profile.displayName },
    data,
  };
}

function profileSlug(profile) {
  return profile.displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'profile';
}

function backupFilename(profile) {
  return `watchlog-backup-${profileSlug(profile)}.json`;
}

function downloadBackupInBrowser(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function isNativeApp() {
  return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

// Packaged Android WebViews don't wire up blob `<a download>` links (no DownloadListener
// registered), so the native build writes the file to the app's cache dir and hands it to the
// system Share sheet instead - which also solves "get it onto a new phone" (Drive, email,
// Nearby Share, a Files app, whatever the user picks).
async function shareBackupNatively(json, filename) {
  const { Filesystem, Directory, Encoding } = window.capacitorFilesystem;
  const { Share } = window.capacitorShare;

  const written = await Filesystem.writeFile({
    path: filename,
    data: json,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await Share.share({
    title: 'Watchlog Backup',
    dialogTitle: 'Save or send your backup file',
    url: written.uri,
  });
}

async function exportBackup(profile) {
  const payload = await buildBackupPayload(profile);
  const json = JSON.stringify(payload, null, 2);
  const filename = backupFilename(profile);

  if (isNativeApp()) {
    await shareBackupNatively(json, filename);
  } else {
    downloadBackupInBrowser(json, filename);
  }
}

function isValidBackupPayload(payload) {
  return Boolean(
    payload &&
    payload.app === 'tvtimeclone' &&
    payload.profile &&
    typeof payload.profile.displayName === 'string' &&
    payload.data &&
    BACKUP_STORE_NAMES.every(name => Array.isArray(payload.data[name]))
  );
}

// Parses and validates a backup file's text, throwing a user-facing message if it isn't one.
function parseBackupText(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isValidBackupPayload(payload)) {
    throw new Error("That file doesn't look like a Watchlog backup.");
  }
  return payload;
}

async function readBackupFile(file) {
  return parseBackupText(await file.text());
}

// Version 1 backups carried the key in plain text. Offered as a prefill when restoring one, so
// an old file still restores in one step - new backups never have it.
function legacyBackupApiKey(payload) {
  const key = payload.profile && payload.profile.tmdbApiKey;
  return typeof key === 'string' && key.trim() ? key.trim() : null;
}

// Always creates a brand-new profile rather than overwriting an existing one, so a bad import
// never clobbers data already on the device.
async function restoreBackup(payload, { displayName, tmdbApiKey }) {
  const profile = createProfile({
    displayName: (displayName || payload.profile.displayName).trim(),
    tmdbApiKey,
  });

  const db = await openProfileDb(profile.id);
  for (const storeName of BACKUP_STORE_NAMES) {
    for (const record of payload.data[storeName]) {
      await dbPut(db, storeName, record);
    }
  }
  db.close();

  return profile;
}
