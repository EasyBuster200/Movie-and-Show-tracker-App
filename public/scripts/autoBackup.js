// Weekly automatic backups (Android app only). Once a week, per profile on this device, the
// same JSON file "Export Backup" produces (backup.js - no TMDB key in it) is written to the
// phone's public Documents/TVTimeClone folder. That folder survives uninstalling the app,
// unlike IndexedDB, which is the whole point.
//
// Exactly one auto-backup per profile is kept: the new file is written FIRST and only then is
// the previous one deleted, so a failed write never leaves zero backups behind. Android lets an
// app delete files it created itself in public Documents (no storage permission needed on
// Android 11+). It can't delete files written by a previous install of the app (after an
// uninstall, ownership is gone) - those are left for the user to clean up, and any delete that
// fails is remembered in `undeleted` and retried on the next run.
//
// There's no background job: the check runs a few seconds after any page loads, and only does
// anything when a profile's last auto-backup is a week old. State lives in localStorage under
// AUTO_BACKUP_STATE_KEY: { [profileId]: { path, savedAt, undeleted: [paths], lastError } }.

const AUTO_BACKUP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_BACKUP_DIR = 'TVTimeClone';
const AUTO_BACKUP_STATE_KEY = 'tvtc_auto_backup';
const AUTO_BACKUP_START_DELAY_MS = 3000;

function readAutoBackupState() {
  try {
    return JSON.parse(localStorage.getItem(AUTO_BACKUP_STATE_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function writeAutoBackupState(state) {
  localStorage.setItem(AUTO_BACKUP_STATE_KEY, JSON.stringify(state));
}

function getAutoBackupInfo(profileId) {
  return readAutoBackupState()[profileId] || null;
}

function isAutoBackupDue(entry, now = new Date()) {
  if (!entry || !entry.savedAt) return true;
  return now.getTime() - Date.parse(entry.savedAt) >= AUTO_BACKUP_INTERVAL_MS;
}

function autoBackupPath(profile, now = new Date()) {
  return `${AUTO_BACKUP_DIR}/tvtimeclone-${profileSlug(profile)}-${localDateString(now)}.json`;
}

function isMissingFileError(error) {
  return /does not exist/i.test((error && error.message) || String(error));
}

// Backs up one profile if it's due (or `force`). Resolves to { status: 'skipped' } or
// { status: 'saved', path, undeleted }. Throws if the write itself fails.
async function autoBackupProfile(profile, { now = new Date(), force = false } = {}) {
  const state = readAutoBackupState();
  const previous = state[profile.id] || null;
  if (!force && !isAutoBackupDue(previous, now)) return { status: 'skipped' };

  const { Filesystem, Directory, Encoding } = window.capacitorFilesystem;
  const payload = await buildBackupPayload(profile);
  const path = autoBackupPath(profile, now);

  await Filesystem.writeFile({
    path,
    data: JSON.stringify(payload, null, 2),
    directory: Directory.Documents,
    encoding: Encoding.UTF8,
    recursive: true,
  });

  // Only now that the new file exists: remove the previous one, plus any earlier deletes that
  // failed. A file the user already deleted by hand counts as deleted.
  const toDelete = [previous && previous.path, ...((previous && previous.undeleted) || [])]
    .filter((p, i, all) => p && p !== path && all.indexOf(p) === i);
  const undeleted = [];
  for (const oldPath of toDelete) {
    try {
      await Filesystem.deleteFile({ path: oldPath, directory: Directory.Documents });
    } catch (error) {
      if (!isMissingFileError(error)) undeleted.push(oldPath);
    }
  }

  const latest = readAutoBackupState();
  latest[profile.id] = { path, savedAt: now.toISOString(), undeleted, lastError: null };
  writeAutoBackupState(latest);
  return { status: 'saved', path, undeleted };
}

function recordAutoBackupError(profileId, error) {
  const state = readAutoBackupState();
  state[profileId] = { ...(state[profileId] || {}), lastError: (error && error.message) || String(error) };
  writeAutoBackupState(state);
}

let autoBackupRunning = null;

// Backs up every profile on the device that's due. Safe to call on every page load.
function runAutoBackups({ now = new Date(), force = false, profileIds = null } = {}) {
  if (!isNativeApp() || !window.capacitorFilesystem) return Promise.resolve([]);
  if (autoBackupRunning) return autoBackupRunning;

  autoBackupRunning = (async () => {
    const results = [];
    const profiles = getProfiles().filter(p => !profileIds || profileIds.includes(p.id));
    for (const profile of profiles) {
      try {
        results.push({ profileId: profile.id, ...(await autoBackupProfile(profile, { now, force })) });
      } catch (error) {
        console.error(`Auto-backup failed for "${profile.displayName}":`, error);
        recordAutoBackupError(profile.id, error);
        results.push({ profileId: profile.id, status: 'failed', error: (error && error.message) || String(error) });
      }
    }
    return results;
  })().finally(() => { autoBackupRunning = null; });

  return autoBackupRunning;
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { runAutoBackups(); }, AUTO_BACKUP_START_DELAY_MS);
  });
}
