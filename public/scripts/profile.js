function renderHeader(user) {
  document.getElementById('profile-name').textContent = user.displayName;
  const memberSince = new Date(user.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  document.getElementById('profile-email').textContent = `Local profile since ${memberSince}`;

  const initials = user.displayName
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  document.getElementById('profile-avatar').textContent = initials;
}

// The summary tiles (shared with stats.html via media.js's renderStatTiles). Tapping them opens
// the full Stats page.
async function loadStats() {
  const stats = await fetch('/api/stats', { credentials: 'same-origin' }).then(r => r.json());
  renderStatTiles(document.getElementById('stats-grid'), stats);
}

// The Watched Shows section always costs its own TMDB round trip per visible show (it needs
// live episode-count/progress data, unlike the other three sections' denormalized rows - see
// localApi.js's summaryFromRowOrFetch) - unlike the TMDB-list-backed rows elsewhere in the app,
// which get up to 20 full items in one request. Kept low across all four sections for a
// consistent preview size, so Watched Shows in particular doesn't block first paint on 20
// individual lookups.
const WATCHED_PREVIEW_LIMIT = 8;

const MEDIA_SECTIONS = [
  { url: '/api/watched/movies/details', containerId: 'watched-movies-container', empty: 'No watched movies yet.', moreUrl: 'media-list.html?source=watched&type=movie' },
  { url: '/api/favorites/movies', containerId: 'favorite-movies-container', empty: 'No favorite movies yet.', moreUrl: 'media-list.html?source=favorites&type=movie' },
  { url: '/api/watched/shows', containerId: 'watched-shows-container', empty: 'No shows tracked yet.', showProgress: true, moreUrl: 'media-list.html?source=watched&type=tv' },
  { url: '/api/favorites/tv', containerId: 'favorite-shows-container', empty: 'No favorite shows yet.', moreUrl: 'media-list.html?source=favorites&type=tv' },
];

// Shared across refreshes so per-card button states (watched/favorite) stay in sync
// without re-fetching them every time a section reloads.
let actionContext = null;

async function renderSection(section) {
  const container = document.getElementById(section.containerId);
  // Cap what gets enriched (rather than the section's whole watched/favorites history) -
  // the preview only ever shows WATCHED_PREVIEW_LIMIT items, with a "view all" tile always
  // linking to the full list. media-list.html's "see all" page fetches the same URL without
  // this param, since it needs the true full list.
  const url = section.moreUrl
    ? `${section.url}${section.url.includes('?') ? '&' : '?'}limit=${WATCHED_PREVIEW_LIMIT}`
    : section.url;

  // Watched Movies/Favorite Movies/Favorite Shows read denormalized fields straight out of
  // IndexedDB now (see localApi.js's summaryFromRowOrFetch) and resolve near-instantly, so a
  // skeleton would just flash. Watched Shows (showProgress) still needs a live per-show TMDB
  // lookup for its episode-count/progress data, so it's the one section that still benefits.
  if (section.showProgress) {
    container.innerHTML = '';
    renderSkeletonRow(container, WATCHED_PREVIEW_LIMIT);
  }

  const items = await fetch(url, { credentials: 'same-origin' }).then(r => r.json());

  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = `<p>${section.empty}</p>`;
    return;
  }

  items.forEach(item => {
    const card = buildCard(item);

    if (section.showProgress && item.total != null) {
      const progress = document.createElement('p');
      progress.className = 'card-meta';
      progress.textContent = `${item.watched}/${item.total} episodes watched`;
      card.infoEl.appendChild(progress);
    }

    attachStandardActions(card, item, actionContext, { onChange: refreshAll });
    container.appendChild(card);
  });

  if (section.moreUrl) {
    const moreCard = document.createElement('div');
    moreCard.className = 'more-card';
    moreCard.innerHTML = `<a href="${section.moreUrl}" class="more-btn" aria-label="View all">${moreBtnContentHtml('View All')}</a>`;
    container.appendChild(moreCard);
  }
}

// Any watched/favorite/episode/rating toggle on this page can change what belongs in
// these lists and the stats, so every toggle triggers a full refresh rather than trying
// to patch individual cards.
async function refreshAll() {
  await Promise.all([loadStats(), ...MEDIA_SECTIONS.map(renderSection)]);
}

function initProfileMenu() {
  const menuBtn = document.getElementById('profile-menu-btn');
  const dropdown = document.getElementById('profile-menu-dropdown');

  function closeMenu() {
    dropdown.hidden = true;
    menuBtn.classList.remove('open');
  }

  menuBtn.addEventListener('click', event => {
    event.stopPropagation();
    const willOpen = dropdown.hidden;
    closeMenu();
    if (willOpen) {
      dropdown.hidden = false;
      menuBtn.classList.add('open');
    }
  });

  document.addEventListener('click', event => {
    if (!dropdown.hidden && !dropdown.contains(event.target) && event.target !== menuBtn) closeMenu();
  });

  return closeMenu;
}

function buildDialog(className) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  const modal = document.createElement('div');
  modal.className = `confirm-modal ${className}`;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  return { overlay, modal };
}

// Restores a backup as a new profile. Backups never carry a TMDB key (see backup.js), so the
// new profile reuses this one's - same device, same person picking the file. It can be changed
// later from the profile picker's Edit.
function initAppBackupImport(user) {
  const input = document.getElementById('import-app-input');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    try {
      const payload = await readBackupFile(file);
      const profile = await restoreBackup(payload, {
        displayName: payload.profile.displayName,
        tmdbApiKey: legacyBackupApiKey(payload) || user.tmdbApiKey,
      });
      const { overlay, modal } = buildDialog('');
      const p = document.createElement('p');
      p.textContent = `Imported as a new profile, "${profile.displayName}". It uses the same TMDB key as this profile.`;
      const actions = document.createElement('div');
      actions.className = 'confirm-actions';
      const stayBtn = document.createElement('button');
      stayBtn.type = 'button';
      stayBtn.className = 'confirm-btn';
      stayBtn.textContent = 'Stay Here';
      stayBtn.addEventListener('click', () => overlay.remove());
      const switchBtn = document.createElement('button');
      switchBtn.type = 'button';
      switchBtn.className = 'confirm-btn confirm-btn-yes';
      switchBtn.textContent = 'Switch to It';
      switchBtn.addEventListener('click', () => {
        setActiveProfileId(profile.id);
        window.location.href = 'main.html';
      });
      actions.appendChild(stayBtn);
      actions.appendChild(switchBtn);
      modal.appendChild(p);
      modal.appendChild(actions);
    } catch (error) {
      console.error('Backup import failed:', error);
      window.alert(error.message || 'Could not import that backup file.');
    }
  });
}

function initExportBackup(user) {
  const button = document.getElementById('export-backup-btn');
  const status = document.getElementById('export-backup-status');

  button.addEventListener('click', async () => {
    button.disabled = true;
    status.hidden = true;
    try {
      await exportBackup(user);
      status.textContent = 'Backup ready — check your notifications or downloads.';
    } catch (error) {
      console.error('Backup export failed:', error);
      status.textContent = 'Something went wrong creating the backup.';
    }
    status.hidden = false;
    button.disabled = false;
  });
}

function formatBackupDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The weekly auto-backup (autoBackup.js) runs on its own; this shows when it last ran, where
// the file is, and anything that needs the user's attention (a failed write, or an old backup
// file the app wasn't allowed to delete).
function renderAutoBackupStatus(user) {
  const statusEl = document.getElementById('auto-backup-status');
  const info = getAutoBackupInfo(user.id);
  const lines = [];
  if (info && info.savedAt) {
    lines.push(`Auto-backup: saved ${formatBackupDate(info.savedAt)} to Documents/${info.path}`);
  } else {
    lines.push('Auto-backup: weekly, to Documents/Watchlog (first one runs shortly).');
  }
  if (info && info.lastError) lines.push(`Last auto-backup failed: ${info.lastError}`);
  if (info && info.undeleted && info.undeleted.length) {
    lines.push(`Couldn't delete the older backup ${info.undeleted.map(p => `Documents/${p}`).join(', ')} - you can delete it yourself.`);
  }
  statusEl.textContent = lines.join(' ');
  statusEl.hidden = false;
}

function initAutoBackupControls(user, closeMenu) {
  if (!isNativeApp()) return;
  renderAutoBackupStatus(user);

  const button = document.getElementById('backup-now-btn');
  button.hidden = false;
  button.addEventListener('click', async () => {
    closeMenu();
    button.disabled = true;
    await runAutoBackups({ force: true, profileIds: [user.id] });
    renderAutoBackupStatus(user);
    button.disabled = false;
  });

  // The page-load run (autoBackup.js) may finish after this renders - refresh once it has.
  setTimeout(async () => {
    await runAutoBackups();
    renderAutoBackupStatus(user);
  }, AUTO_BACKUP_START_DELAY_MS + 500);
}

function initNotificationToggle(closeMenu) {
  if (!notificationsSupported()) return;
  const button = document.getElementById('notifications-toggle-btn');
  const render = () => {
    button.textContent = `Episode Notifications: ${areEpisodeNotificationsEnabled() ? 'On' : 'Off'}`;
  };
  render();
  button.hidden = false;
  button.addEventListener('click', async () => {
    closeMenu();
    setEpisodeNotificationsEnabled(!areEpisodeNotificationsEnabled());
    render();
    const result = await refreshEpisodeNotifications({ force: true });
    if (result.status === 'denied') {
      window.alert('Notifications are blocked for this app. Allow them in Android Settings > Apps > Watchlog > Notifications.');
    }
  });
}

// Reuses profiles.js's deleteProfile(), which already clears the active-profile pointer if the
// deleted profile was active and wipes its IndexedDB - so all this needs to do afterward is
// leave the now-profile-less app.
function openDeleteAccountConfirm(user) {
  const { overlay, modal } = buildDialog('');
  const p = document.createElement('p');
  p.textContent = `Delete "${user.displayName}" and all of its watched/list/rating data? This can't be undone.`;

  const actions = document.createElement('div');
  actions.className = 'confirm-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'confirm-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'confirm-btn confirm-btn-danger';
  deleteBtn.textContent = 'Delete Account';
  deleteBtn.addEventListener('click', () => {
    deleteProfile(user.id);
    window.location.href = 'profile-picker.html';
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(deleteBtn);
  modal.appendChild(p);
  modal.appendChild(actions);

  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await requireLogin();
  if (!user) return;

  renderHeader(user);
  const closeMenu = initProfileMenu();
  initExportBackup(user);
  document.getElementById('import-btn').addEventListener('click', () => {
    closeMenu();
    document.getElementById('import-app-input').click();
  });
  initAppBackupImport(user);
  initAutoBackupControls(user, closeMenu);
  initNotificationToggle(closeMenu);
  document.getElementById('switch-account-btn').addEventListener('click', () => {
    closeMenu();
    logout();
  });
  document.getElementById('delete-account-btn').addEventListener('click', () => {
    closeMenu();
    openDeleteAccountConfirm(user);
  });
  actionContext = await fetchStandardActionContext();
  refreshAll();
});
