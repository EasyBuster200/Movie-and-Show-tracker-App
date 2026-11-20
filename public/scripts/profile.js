// Profile: the profile card (name, since when, the ⋯ that opens Settings, and the backup
// status), the summary stats, then previews of watched and favourite movies and shows. Backups,
// notifications and account actions live in Settings (settings.js).

function renderHeader(user) {
  document.getElementById('profile-name').textContent = user.displayName;
  const since = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('profile-since').textContent = `Local profile since ${since}`;
  document.getElementById('profile-avatar').textContent = user.displayName.trim().charAt(0).toUpperCase();
}

async function loadStats() {
  const stats = await fetchJson('/api/stats');
  renderStatTiles(document.getElementById('stats-grid'), stats, { layout: 'profile' });
}

// Each preview shows at most this many. Watched Shows costs a TMDB lookup per show (it needs
// live episode counts), so the previews ask the API for only this many (?limit=).
const WATCHED_PREVIEW_LIMIT = 8;

const MEDIA_SECTIONS = [
  { url: '/api/watched/movies/details', containerId: 'watched-movies-container', empty: 'No watched movies yet.' },
  { url: '/api/favorites/movies', containerId: 'favorite-movies-container', empty: 'No favourite movies yet.' },
  { url: '/api/watched/shows', containerId: 'watched-shows-container', empty: 'No shows tracked yet.', showProgress: true },
  { url: '/api/favorites/tv', containerId: 'favorite-shows-container', empty: 'No favourite shows yet.' },
];

let actionContext = null;

async function renderSection(section) {
  const container = document.getElementById(section.containerId);
  if (section.showProgress && !container.children.length) renderSkeletonRow(container, 3);

  const items = await fetchJson(`${section.url}?limit=${WATCHED_PREVIEW_LIMIT}`);
  container.innerHTML = '';
  if (items.length === 0) {
    container.appendChild(el('p', 'empty-note', section.empty));
    return;
  }
  items.forEach(item => {
    const card = buildCard(item);
    if (section.showProgress && item.total != null) addCardDetail(card, `${item.watched}/${item.total} episodes watched`);
    attachStandardActions(card, item, actionContext, { onChange: refreshAll });
    container.appendChild(card);
  });
}

// A watched/favourite toggle here can change what belongs in every section and the stats.
async function refreshAll() {
  await Promise.all([loadStats(), ...MEDIA_SECTIONS.map(renderSection)]);
}

// The status row under the profile: last backup and where it went, or what went wrong.
function showBackupStatus(title, detail, { warning = false } = {}) {
  document.getElementById('backup-status').hidden = false;
  document.getElementById('backup-status-title').textContent = title;
  document.getElementById('backup-status-detail').textContent = detail || '';
  document.getElementById('backup-status-icon').classList.toggle('is-warning', warning);
}

function formatBackupDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The weekly auto-backup (autoBackup.js, Android only): when it last ran and where the file
// is, or anything that needs attention (a failed write, an older file it couldn't delete, or
// auto-backup being switched off in Settings).
function renderAutoBackupStatus(user) {
  if (!isNativeApp()) return;
  const info = getAutoBackupInfo(user.id);
  if (!getProfilePrefs(user).autoBackup) {
    showBackupStatus('Auto-backup is off', info && info.savedAt ? `Last saved ${formatBackupDate(info.savedAt)}. Turn it on in Settings.` : 'Turn it on in Settings.', { warning: true });
    return;
  }
  if (info && info.lastError) {
    showBackupStatus('Last auto-backup failed', info.lastError, { warning: true });
    return;
  }
  if (info && info.undeleted && info.undeleted.length) {
    showBackupStatus(
      `Backed up ${formatBackupDate(info.savedAt)}`,
      `Couldn't delete the older backup ${info.undeleted.map(p => `Documents/${p}`).join(', ')}. You can delete it yourself.`,
      { warning: true }
    );
    return;
  }
  if (info && info.savedAt) {
    showBackupStatus(`Backed up ${formatBackupDate(info.savedAt)}`, `Documents/${info.path}`);
  } else {
    showBackupStatus('Weekly backups are on', 'The first one is saved to Documents/Watchlog shortly.');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  renderHeader(user);
  renderAutoBackupStatus(user);
  // The page-load run (autoBackup.js) may finish after this renders - refresh once it has.
  if (isNativeApp()) {
    setTimeout(async () => {
      await runAutoBackups();
      renderAutoBackupStatus(user);
    }, AUTO_BACKUP_START_DELAY_MS + 500);
  }

  actionContext = await fetchStandardActionContext();
  refreshAll();
});
