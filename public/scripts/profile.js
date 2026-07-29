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

function formatWatchTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

async function loadStats() {
  const stats = await fetch('/api/stats', { credentials: 'same-origin' }).then(r => r.json());
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '';

  const tiles = [
    { label: 'Movies Watched', value: stats.moviesWatched },
    { label: 'Shows Tracked', value: stats.showsTracked },
    { label: 'Episodes Watched', value: stats.episodesWatched },
    { label: 'Total Watch Time', value: formatWatchTime(stats.totalWatchMinutes) },
    { label: 'Favorites', value: stats.favorites },
    { label: 'Avg Rating Given', value: stats.averageRating != null ? `${stats.averageRating}/10` : '—' },
  ];

  tiles.forEach(tile => {
    const tileEl = document.createElement('div');
    tileEl.className = 'stat-tile';

    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = tile.value;

    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = tile.label;

    tileEl.appendChild(valueEl);
    tileEl.appendChild(labelEl);
    grid.appendChild(tileEl);
  });
}

const WATCHED_PREVIEW_LIMIT = 20;

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
  const items = await fetch(section.url, { credentials: 'same-origin' }).then(r => r.json());

  container.innerHTML = '';
  if (items.length === 0) {
    container.innerHTML = `<p>${section.empty}</p>`;
    return;
  }

  const preview = section.moreUrl ? items.slice(0, WATCHED_PREVIEW_LIMIT) : items;

  preview.forEach(item => {
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

  if (section.moreUrl && items.length > WATCHED_PREVIEW_LIMIT) {
    const moreCard = document.createElement('div');
    moreCard.className = 'more-card';
    moreCard.innerHTML = `<a href="${section.moreUrl}" class="more-btn" aria-label="View all"><span aria-hidden="true">+</span></a>`;
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

// The moved Import action: ask which kind of file this is before touching anything, since a
// TV Time export and an app backup need completely different handling.
function openImportChooser() {
  const { overlay, modal } = buildDialog('import-chooser-modal');

  const title = document.createElement('p');
  title.textContent = 'What are you importing?';
  modal.appendChild(title);

  function choice(titleText, descText, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'import-choice-btn';
    const t = document.createElement('div');
    t.className = 'import-choice-title';
    t.textContent = titleText;
    const d = document.createElement('div');
    d.className = 'import-choice-desc';
    d.textContent = descText;
    btn.appendChild(t);
    btn.appendChild(d);
    btn.addEventListener('click', () => {
      overlay.remove();
      onClick();
    });
    modal.appendChild(btn);
  }

  choice(
    'An old TV Time export',
    'Select the user_tv_show_data.csv file from a TV Time GDPR data request — resolves your shows against TMDB and marks watched/adds them to a list.',
    () => document.getElementById('import-tvtime-input').click()
  );
  choice(
    "One of this app's own backups",
    'A .json file exported from this app\'s "Export Backup" — restores it as a new profile.',
    () => document.getElementById('import-app-input').click()
  );

  const cancelRow = document.createElement('div');
  cancelRow.className = 'confirm-actions';
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'confirm-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());
  cancelRow.appendChild(cancelBtn);
  modal.appendChild(cancelRow);

  overlay.addEventListener('click', event => { if (event.target === overlay) overlay.remove(); });
}

function initAppBackupImport() {
  const input = document.getElementById('import-app-input');
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;

    try {
      const profile = await importBackupFile(file);
      const { overlay, modal } = buildDialog('');
      const p = document.createElement('p');
      p.textContent = `Imported as a new profile, "${profile.displayName}".`;
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

// Replaces the modal's body with a message + a single OK button, for any dead-end state
// (no file selected, wrong file, or an outright error) instead of leaving the dialog stuck
// showing stale "Reading files…" text with no way out and no explanation.
function showDialogDeadEnd(overlay, modal, message) {
  modal.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = message;
  const actions = document.createElement('div');
  actions.className = 'confirm-actions';
  const okBtn = document.createElement('button');
  okBtn.type = 'button';
  okBtn.className = 'confirm-btn';
  okBtn.textContent = 'OK';
  okBtn.addEventListener('click', () => overlay.remove());
  actions.appendChild(okBtn);
  modal.appendChild(p);
  modal.appendChild(actions);
}

function initTvTimeImport() {
  const input = document.getElementById('import-tvtime-input');
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';

    const { overlay, modal } = buildDialog('import-status-modal');
    const status = document.createElement('p');
    status.textContent = 'Reading files…';
    modal.appendChild(status);

    if (files.length === 0) {
      // The picker returned with nothing selected - some Android file-manager apps do this on
      // multi-select even after files look tapped/highlighted, rather than silently doing
      // nothing with no feedback at all.
      showDialogDeadEnd(overlay, modal, "No file came back from the picker. Try selecting just user_tv_show_data.csv on its own rather than several files at once.");
      return;
    }

    try {
      const rows = await findTvShowDataRows(files);
      if (!rows) {
        showDialogDeadEnd(overlay, modal, "That doesn't look like user_tv_show_data.csv — that's the specific file from your TV Time export with the actual show data, not the others.");
        return;
      }

      const summary = await importTvTimeShows(rows, message => { status.textContent = message; });

      modal.innerHTML = '';
      const resultTitle = document.createElement('p');
      resultTitle.textContent = 'Import complete.';
      modal.appendChild(resultTitle);

      const list = document.createElement('div');
      list.className = 'import-status-list';
      const lines = [
        `${summary.markedWatched.length} show${summary.markedWatched.length === 1 ? '' : 's'} marked fully watched${summary.markedWatched.length ? `: ${summary.markedWatched.join(', ')}` : ''}.`,
        `${summary.addedToList.length} show${summary.addedToList.length === 1 ? '' : 's'} added to "TV Time Shows"${summary.addedToList.length ? `: ${summary.addedToList.join(', ')}` : ''}.`,
      ];
      if (summary.unmatched.length) {
        lines.push(`${summary.unmatched.length} couldn't be matched on TMDB: ${summary.unmatched.join(', ')}.`);
      }
      lines.forEach(line => {
        const p = document.createElement('p');
        p.textContent = line;
        list.appendChild(p);
      });
      modal.appendChild(list);

      const actions = document.createElement('div');
      actions.className = 'confirm-actions';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'confirm-btn confirm-btn-yes';
      okBtn.textContent = 'Done';
      okBtn.addEventListener('click', () => {
        overlay.remove();
        refreshAll();
      });
      actions.appendChild(okBtn);
      modal.appendChild(actions);
    } catch (error) {
      console.error('TV Time import failed:', error);
      showDialogDeadEnd(overlay, modal, `Something went wrong reading that file: ${error.message || error}`);
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
    openImportChooser();
  });
  initAppBackupImport();
  initTvTimeImport();
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
