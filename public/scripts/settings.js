// Settings (opened from the ⋯ on Profile). Everything here is per profile (profiles.js's
// getProfilePrefs/setProfilePrefs) except the account actions:
//   - the profile card: edit the name and TMDB token
//   - Appearance: theme (dark / light / match device) and accent colour (theme.js applies them)
//   - Notifications: new episodes, release reminders, weekly recap (notifications.js)
//   - Library: region and language (used for TMDB requests - localApi.js, profiles.js)
//   - Data & backup: auto-backup on/off, back up now, export, import (autoBackup.js, backup.js)
//   - Account: TMDB token, switch profile, delete profile, reset all data
//   - About: licences, and the installed version

const THEME_OPTIONS = [['dark', 'Dark'], ['light', 'Light'], ['system', 'Match device']];
const ACCENT_NAMES = { burgundy: 'Burgundy', indigo: 'Indigo', ocean: 'Ocean', teal: 'Teal', coral: 'Coral', magenta: 'Magenta', amber: 'Amber' };

let user = null;

function prefs() {
  return getProfilePrefs(user.id);
}

function savePrefs(updates) {
  setProfilePrefs(user.id, updates);
  user = getActiveProfile();
}

// ---------- Profile card / token ----------

function renderProfileCard() {
  document.getElementById('settings-name').textContent = user.displayName;
  document.getElementById('settings-avatar').textContent = user.displayName.trim().charAt(0).toUpperCase();
}

// Name and TMDB token, as on the profile picker's Edit. A changed token is checked with TMDB
// before it's saved.
function openProfileDialog({ focusToken = false } = {}) {
  const { overlay, modal } = openDialog();
  const form = el('form', 'auth-form');
  form.appendChild(el('h2', null, 'Edit profile'));

  const nameField = el('label', 'field', 'Display name');
  const nameInput = el('input', 'text-input');
  nameInput.value = user.displayName;
  nameInput.required = true;
  nameField.appendChild(nameInput);

  const tokenField = el('label', 'field', 'TMDB API Read Access Token');
  const tokenInput = el('input', 'text-input');
  tokenInput.value = user.tmdbApiKey;
  tokenInput.required = true;
  tokenInput.autocomplete = 'off';
  tokenInput.spellcheck = false;
  tokenField.appendChild(tokenInput);

  const error = el('p', 'auth-error');
  error.hidden = true;
  const actions = el('div', 'confirm-actions');
  const cancel = dialogButton('Cancel', 'secondary');
  cancel.addEventListener('click', () => overlay.remove());
  const save = dialogButton('Save', 'primary');
  save.type = 'submit';
  actions.appendChild(cancel);
  actions.appendChild(save);

  [nameField, tokenField, error, actions].forEach(node => form.appendChild(node));
  modal.appendChild(form);
  (focusToken ? tokenInput : nameInput).focus();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const displayName = nameInput.value.trim();
    const tmdbApiKey = tokenInput.value.trim();
    if (!displayName || !tmdbApiKey) return;
    error.hidden = true;
    save.disabled = true;
    if (tmdbApiKey !== user.tmdbApiKey) {
      save.textContent = 'Checking token…';
      const check = await validateTmdbApiKey(tmdbApiKey);
      if (!check.ok) {
        error.textContent = check.message;
        error.hidden = false;
        save.disabled = false;
        save.textContent = 'Save';
        return;
      }
    }
    updateProfile(user.id, { displayName, tmdbApiKey });
    user = getActiveProfile();
    renderProfileCard();
    renderSections();
    overlay.remove();
  });
}

// ---------- Appearance ----------

function renderAppearance() {
  const current = prefs();
  const chips = document.getElementById('theme-chips');
  chips.innerHTML = '';
  THEME_OPTIONS.forEach(([id, label]) => chips.appendChild(buildChip(label, {
    selected: current.theme === id,
    onClick: () => {
      savePrefs({ theme: id });
      window.applyProfileTheme();
      renderAppearance();
    },
  })));

  document.getElementById('accent-name').textContent = ACCENT_NAMES[current.accent] || '';
  const swatches = document.getElementById('accent-swatches');
  swatches.innerHTML = '';
  ACCENT_COLOURS.forEach(id => {
    const on = current.accent === id;
    const btn = el('button', 'swatch');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${ACCENT_NAMES[id]} accent`);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const dot = el('span', 'swatch__dot');
    dot.style.background = `var(--${id}-mark)`;
    if (on) dot.innerHTML = ttIcon('check', { size: 16, strokeWidth: 2.6 });
    btn.appendChild(dot);
    btn.addEventListener('click', () => {
      savePrefs({ accent: id });
      window.applyProfileTheme();
      renderAppearance();
    });
    swatches.appendChild(btn);
  });
}

// ---------- Rows ----------

function settingsRow({ label, sub = null, value = null, switchOn = null, onSwitch, onClick, danger = false, disabled = false }) {
  const isButton = Boolean(onClick);
  const row = el(isButton ? 'button' : 'div', `settings-row${danger ? ' settings-row--danger' : ''}`);
  if (isButton) {
    row.type = 'button';
    row.disabled = disabled;
    row.addEventListener('click', onClick);
  }
  const text = el('span', 'settings-row__text');
  text.appendChild(el('span', 'settings-row__label', label));
  if (sub) text.appendChild(el('span', 'settings-row__sub', sub));
  row.appendChild(text);

  if (switchOn !== null) {
    const sw = buildSwitch(label, switchOn, onSwitch);
    sw.disabled = disabled;
    row.appendChild(sw);
  } else if (value !== null || (isButton && !danger)) {
    const valueEl = el('span', 'settings-row__value', value || '');
    valueEl.insertAdjacentHTML('beforeend', ttIcon('chevron', { size: 18 }));
    row.appendChild(valueEl);
  }
  return row;
}

function settingsSection(title, rows) {
  const section = el('section', 'settings-section');
  section.appendChild(el('span', 'tt-filter-label', title));
  const card = el('div', 'settings-card');
  rows.filter(Boolean).forEach(row => card.appendChild(row));
  section.appendChild(card);
  return section;
}

// Notifications only exist in the Android app; changing one reschedules everything.
function notificationRows(current) {
  const supported = notificationsSupported();
  const note = text => (supported ? text : 'Available in the Android app');
  const toggle = key => async on => {
    savePrefs({ [key]: on });
    const result = await refreshEpisodeNotifications({ force: true });
    if (result.status === 'denied') {
      await confirmDialog({
        title: 'Notifications are blocked',
        message: 'Allow them in Android Settings > Apps > Watchlog > Notifications.',
        confirmLabel: 'OK',
        cancelLabel: 'Close',
      });
    }
  };
  return [
    settingsRow({ label: 'New episodes', sub: note('When a show you track airs a new episode'), switchOn: current.notifyEpisodes, onSwitch: toggle('notifyEpisodes'), disabled: !supported }),
    settingsRow({ label: 'Release reminders', sub: note('Movies on your Watchlist, on release day'), switchOn: current.releaseReminders, onSwitch: toggle('releaseReminders'), disabled: !supported }),
    settingsRow({ label: 'Weekly recap', sub: note('What you watched and what is coming up, Sundays at 19:00'), switchOn: current.weeklyRecap, onSwitch: toggle('weeklyRecap'), disabled: !supported }),
  ];
}

// ---------- Region and language pickers ----------

function displayName(type, code) {
  try {
    return new Intl.DisplayNames(['en'], { type, languageDisplay: 'standard' }).of(code) || code;
  } catch (error) {
    return code;
  }
}

function languageName(tag) {
  return displayName('language', tag);
}

let countriesPromise = null;
function loadCountries() {
  if (!countriesPromise) {
    countriesPromise = fetchJson('/api/tmdb/configuration/countries')
      .then(list => list.map(c => ({ value: c.iso_3166_1, label: c.english_name })).sort((a, b) => a.label.localeCompare(b.label)))
      .catch(error => { countriesPromise = null; throw error; });
  }
  return countriesPromise;
}

let languagesPromise = null;
function loadLanguages() {
  if (!languagesPromise) {
    languagesPromise = fetchJson('/api/tmdb/configuration/primary_translations')
      .then(tags => tags.map(tag => ({ value: tag, label: languageName(tag) })).sort((a, b) => a.label.localeCompare(b.label)))
      .catch(error => { languagesPromise = null; throw error; });
  }
  return languagesPromise;
}

// A searchable single-choice list. Resolves to the picked value, or undefined when closed.
function pickFromList({ title, placeholder, load, current, extra = [] }) {
  return new Promise(resolve => {
    const { overlay, modal } = openDialog();
    const close = value => { overlay.remove(); resolve(value); };
    modal.appendChild(el('h2', null, title));
    const search = el('label', 'tt-search');
    search.innerHTML = ttIcon('search', { size: 20 });
    const input = el('input');
    input.type = 'search';
    input.placeholder = placeholder;
    search.appendChild(input);
    modal.appendChild(search);
    const list = el('div', 'select-list');
    list.setAttribute('role', 'listbox');
    list.appendChild(el('p', 'muted-note', 'Loading…'));
    modal.appendChild(list);
    const cancel = dialogButton('Cancel', 'secondary');
    cancel.addEventListener('click', () => close(undefined));
    modal.appendChild(cancel);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(undefined); });

    let options = [];
    const render = () => {
      const q = input.value.trim().toLowerCase();
      list.innerHTML = '';
      const shown = [...extra, ...options].filter(o => !q || o.label.toLowerCase().includes(q) || String(o.value || '').toLowerCase().includes(q));
      if (!shown.length) list.appendChild(el('p', 'muted-note', 'No matches.'));
      shown.forEach(o => {
        const item = el('button', 'select-list__item');
        item.type = 'button';
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', o.value === current ? 'true' : 'false');
        item.appendChild(el('span', null, o.label));
        if (o.value === current) item.insertAdjacentHTML('beforeend', ttIcon('check', { size: 18, strokeWidth: 2.2 }));
        item.addEventListener('click', () => close(o.value));
        list.appendChild(item);
      });
    };
    input.addEventListener('input', render);
    load()
      .then(loaded => { options = loaded; render(); })
      .catch(() => { list.innerHTML = ''; list.appendChild(el('p', 'muted-note', "Couldn't load the list. Check your connection.")); });
  });
}

async function chooseRegion() {
  const auto = profileRegion({ ...user, prefs: { ...(user.prefs || {}), region: null } });
  const value = await pickFromList({
    title: 'Region',
    placeholder: 'Search countries…',
    load: loadCountries,
    current: prefs().region,
    extra: [{ value: null, label: `Automatic (${displayName('region', auto)})` }],
  });
  if (value === undefined) return;
  savePrefs({ region: value });
  renderSections();
  refreshEpisodeNotifications({ force: true }).catch(() => {});
}

async function chooseLanguage() {
  const value = await pickFromList({ title: 'Language', placeholder: 'Search languages…', load: loadLanguages, current: prefs().language });
  if (value === undefined) return;
  savePrefs({ language: value });
  renderSections();
}

// ---------- Data & backup ----------

function formatBackupDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function autoBackupSub(current) {
  if (!isNativeApp()) return 'Available in the Android app';
  if (!current.autoBackup) return 'Off';
  const info = getAutoBackupInfo(user.id);
  if (info && info.lastError) return `Last attempt failed: ${info.lastError}`;
  if (info && info.savedAt) return `Last saved ${formatBackupDate(info.savedAt)} · Documents/Watchlog`;
  return 'Weekly, to Documents/Watchlog';
}

async function backUpNow(row) {
  row.disabled = true;
  await runAutoBackups({ force: true, profileIds: [user.id] });
  renderSections();
}

async function exportData(row) {
  row.disabled = true;
  try {
    await exportBackup(user);
  } catch (error) {
    console.error('Backup export failed:', error);
    await confirmDialog({ title: 'Export failed', message: 'Something went wrong creating the backup file.', confirmLabel: 'OK', cancelLabel: 'Close' });
  }
  row.disabled = false;
}

// Restores a backup as a new profile. Backups never carry a TMDB token (backup.js), so the new
// profile uses this one's.
function initImport() {
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
      const switchNow = await confirmDialog({
        title: 'Backup imported',
        message: `Imported as a new profile, "${profile.displayName}". It uses the same TMDB token as this profile.`,
        confirmLabel: 'Switch to it',
        cancelLabel: 'Stay here',
      });
      if (switchNow) {
        setActiveProfileId(profile.id);
        window.location.href = 'main.html';
      }
    } catch (error) {
      console.error('Backup import failed:', error);
      await confirmDialog({ title: "Couldn't import", message: error.message || 'Could not import that backup file.', confirmLabel: 'OK', cancelLabel: 'Close' });
    }
  });
}

// ---------- Account ----------

async function deleteThisProfile() {
  const ok = await confirmDialog({
    title: 'Delete profile?',
    message: `Delete "${user.displayName}" and all of its watched and list data from this phone? This can't be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  deleteProfile(user.id);
  window.location.href = 'profile-picker.html';
}

async function resetAllData() {
  const ok = await confirmDialog({
    title: 'Reset all data?',
    message: `This removes everything in "${user.displayName}"'s library from this phone: watched history, lists, Watchlist and favourites. The profile, its token and settings stay. This can't be undone.`,
    confirmLabel: 'Reset',
    danger: true,
  });
  if (!ok) return;
  await fetch('/api/reset', { method: 'POST', credentials: 'same-origin' });
  refreshEpisodeNotifications({ force: true }).catch(() => {});
  window.location.href = 'profile.html';
}

// ---------- Sections ----------

function renderSections() {
  const current = prefs();
  const container = document.getElementById('settings-sections');
  container.innerHTML = '';
  container.className = 'stack';
  container.style.gap = 'var(--space-6)';

  container.appendChild(settingsSection('Notifications', notificationRows(current)));

  container.appendChild(settingsSection('Library', [
    settingsRow({
      label: 'Region',
      sub: 'For Popular, release dates and reminders',
      value: current.region ? displayName('region', current.region) : `Automatic (${displayName('region', profileRegion(user))})`,
      onClick: chooseRegion,
    }),
    settingsRow({ label: 'Language', sub: 'Titles, overviews and episode names', value: languageName(current.language), onClick: chooseLanguage }),
  ]));

  const backupNow = settingsRow({ label: 'Back up now', onClick: () => backUpNow(backupNow), disabled: !isNativeApp() });
  const exportRow = settingsRow({ label: 'Export data', sub: 'Save your library as a JSON file', onClick: () => exportData(exportRow) });
  container.appendChild(settingsSection('Data & backup', [
    settingsRow({
      label: 'Auto-backup',
      sub: autoBackupSub(current),
      switchOn: current.autoBackup,
      disabled: !isNativeApp(),
      onSwitch: on => { savePrefs({ autoBackup: on }); renderSections(); },
    }),
    backupNow,
    exportRow,
    settingsRow({ label: 'Import data', sub: 'Restores a backup as a new profile', onClick: () => document.getElementById('import-app-input').click() }),
  ]));

  container.appendChild(settingsSection('Account', [
    settingsRow({ label: 'TMDB token', sub: 'The API Read Access Token this profile uses', value: 'Change', onClick: () => openProfileDialog({ focusToken: true }) }),
    settingsRow({ label: 'Switch profile', onClick: () => logout() }),
    settingsRow({ label: 'Reset all data', sub: 'Empties this profile\'s library on this phone', danger: true, onClick: resetAllData }),
    settingsRow({ label: 'Delete profile', sub: 'Removes the profile and all its data from this phone', danger: true, onClick: deleteThisProfile }),
  ]));

  container.appendChild(settingsSection('About', [
    settingsRow({ label: 'Licences', onClick: () => { window.location.href = 'licences.html'; } }),
  ]));
}

// The installed version comes from the app's own native plugin; the web preview has none.
async function renderVersion() {
  const versionEl = document.getElementById('app-version');
  const plugin = typeof backgroundPlugin === 'function' ? backgroundPlugin() : null;
  if (!isNativeApp() || !plugin) {
    versionEl.textContent = 'Watchlog · web preview';
    return;
  }
  try {
    const info = await plugin.getAppInfo();
    versionEl.textContent = `Watchlog · version ${info.versionName}`;
  } catch (error) {
    versionEl.textContent = 'Watchlog';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  user = await requireLogin();
  if (!user) return;
  renderProfileCard();
  document.getElementById('settings-profile').addEventListener('click', () => openProfileDialog());
  renderAppearance();
  renderSections();
  initImport();
  renderVersion();
});
