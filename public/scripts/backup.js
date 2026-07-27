// Export/import a profile's full local data as a single JSON file, so it can be moved to a new
// phone (or restored after an uninstall) without re-marking everything as watched/favorited.
// Ordinary app updates already preserve IndexedDB/localStorage automatically (Android keeps app
// data across `adb install -r`/Play Store updates) — this is only needed for device-to-device
// migration or an explicit backup.

const BACKUP_STORE_NAMES = ['lists', 'list_items', 'watched_movies', 'watched_episodes', 'favorites', 'ratings'];
const BACKUP_FORMAT_VERSION = 1;

async function buildBackupPayload(profile) {
  const db = await openProfileDb(profile.id);
  const data = {};
  for (const storeName of BACKUP_STORE_NAMES) {
    data[storeName] = await dbGetAll(db, storeName);
  }
  return {
    app: 'tvtimeclone',
    backupVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { displayName: profile.displayName, tmdbApiKey: profile.tmdbApiKey },
    data,
  };
}

function backupFilename(profile) {
  const slug = profile.displayName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'profile';
  return `tvtimeclone-backup-${slug}.json`;
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

// Packaged Android WebViews don't wire up blob `<a download>` links (no DownloadListener
// registered), so the native build writes the file to the app's cache dir and hands it to the
// system Share sheet instead — which also solves "get it onto a new phone" (Drive, email,
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
    title: 'TVTimeClone Backup',
    dialogTitle: 'Save or send your backup file',
    url: written.uri,
  });
}

async function exportBackup(profile) {
  const payload = await buildBackupPayload(profile);
  const json = JSON.stringify(payload, null, 2);
  const filename = backupFilename(profile);

  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
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

// Always creates a brand-new profile rather than overwriting an existing one, so a bad import
// never clobbers data already on the device.
async function importBackupFile(file) {
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error("That file isn't valid JSON.");
  }
  if (!isValidBackupPayload(payload)) {
    throw new Error("That file doesn't look like a TVTimeClone backup.");
  }

  const profile = createProfile({
    displayName: payload.profile.displayName,
    tmdbApiKey: payload.profile.tmdbApiKey,
  });

  const db = await openProfileDb(profile.id);
  for (const storeName of BACKUP_STORE_NAMES) {
    for (const record of payload.data[storeName]) {
      await dbPut(db, storeName, record);
    }
  }

  return profile;
}
