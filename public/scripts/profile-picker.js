const listEl = document.getElementById('profile-list');
const emptyEl = document.getElementById('profile-empty');
const newProfileBtn = document.getElementById('new-profile-btn');
const importBackupBtn = document.getElementById('import-backup-btn');
const importBackupInput = document.getElementById('import-backup-input');
const form = document.getElementById('profile-form');
const formSubmitBtn = document.getElementById('profile-form-submit');
const cancelBtn = document.getElementById('profile-form-cancel');
const errorEl = document.getElementById('profile-error');
const formHintEl = document.getElementById('profile-form-hint');

// The form serves three purposes: creating a profile, editing one, and restoring a backup into
// a new profile (backups never contain a TMDB key - see backup.js - so restoring asks for one).
// `pendingRestore` holds the parsed backup while the form is in restore mode.
let pendingRestore = null;

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

function initials(displayName) {
  return displayName
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function openForm(profile, { restorePayload = null } = {}) {
  errorEl.hidden = true;
  pendingRestore = restorePayload;
  form.editingId.value = profile ? profile.id : '';

  if (restorePayload) {
    form.displayName.value = restorePayload.profile.displayName;
    form.tmdbApiKey.value = legacyBackupApiKey(restorePayload) || '';
    formSubmitBtn.textContent = 'Restore backup';
    formHintEl.textContent = "Backups don't include your TMDB key, so enter it to finish restoring.";
    formHintEl.hidden = false;
  } else {
    form.displayName.value = profile ? profile.displayName : '';
    form.tmdbApiKey.value = profile ? profile.tmdbApiKey : '';
    formSubmitBtn.textContent = profile ? 'Save changes' : 'Create profile';
    formHintEl.hidden = true;
  }

  form.hidden = false;
  newProfileBtn.hidden = true;
  importBackupBtn.hidden = true;
  (restorePayload ? form.tmdbApiKey : form.displayName).focus();
}

function closeForm() {
  form.hidden = true;
  newProfileBtn.hidden = false;
  importBackupBtn.hidden = false;
  form.reset();
  formHintEl.hidden = true;
  errorEl.hidden = true;
  pendingRestore = null;
}

function selectProfile(profile) {
  setActiveProfileId(profile.id);
  window.location.href = 'main.html';
}

function deleteProfileWithConfirm(profile, event) {
  event.stopPropagation();
  const confirmed = window.confirm(`Delete "${profile.displayName}" and all of its watched and list data? This can't be undone.`);
  if (!confirmed) return;
  deleteProfile(profile.id);
  renderProfiles();
}

function renderProfiles() {
  const profiles = getProfiles();
  listEl.innerHTML = '';
  emptyEl.hidden = profiles.length > 0;

  profiles.forEach(profile => {
    const row = document.createElement('div');
    row.className = 'profile-row';
    row.addEventListener('click', () => selectProfile(profile));

    const avatar = document.createElement('div');
    avatar.className = 'profile-row-avatar';
    avatar.textContent = initials(profile.displayName);

    const name = document.createElement('span');
    name.className = 'profile-row-name';
    name.textContent = profile.displayName;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'profile-row-action';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', event => {
      event.stopPropagation();
      openForm(profile);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'profile-row-action profile-row-action-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', event => deleteProfileWithConfirm(profile, event));

    row.appendChild(avatar);
    row.appendChild(name);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);
    listEl.appendChild(row);
  });
}

newProfileBtn.addEventListener('click', () => openForm(null));
cancelBtn.addEventListener('click', closeForm);

importBackupBtn.addEventListener('click', () => importBackupInput.click());

importBackupInput.addEventListener('change', async () => {
  const file = importBackupInput.files[0];
  importBackupInput.value = '';
  if (!file) return;

  errorEl.hidden = true;
  try {
    openForm(null, { restorePayload: await readBackupFile(file) });
  } catch (error) {
    console.error('Backup import failed:', error);
    showError(error.message || 'Could not read that backup file.');
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  const displayName = form.displayName.value.trim();
  const tmdbApiKey = form.tmdbApiKey.value.trim();
  if (!displayName || !tmdbApiKey) {
    showError('Display name and TMDB API key are both required.');
    return;
  }

  const editingId = form.editingId.value;
  const existing = editingId ? getProfiles().find(p => p.id === editingId) : null;
  const keyChanged = !existing || existing.tmdbApiKey !== tmdbApiKey;

  errorEl.hidden = true;
  const submitLabel = formSubmitBtn.textContent;
  formSubmitBtn.disabled = true;
  try {
    if (keyChanged) {
      formSubmitBtn.textContent = 'Checking key…';
      const check = await validateTmdbApiKey(tmdbApiKey);
      if (!check.ok) {
        showError(check.message);
        return;
      }
    }

    if (pendingRestore) {
      formSubmitBtn.textContent = 'Restoring…';
      const profile = await restoreBackup(pendingRestore, { displayName, tmdbApiKey });
      setActiveProfileId(profile.id);
      window.location.href = 'main.html';
      return;
    }

    if (editingId) {
      updateProfile(editingId, { displayName, tmdbApiKey });
    } else {
      createProfile({ displayName, tmdbApiKey });
    }
    closeForm();
    renderProfiles();
  } catch (error) {
    console.error('Saving profile failed:', error);
    showError(error.message || 'Something went wrong saving that profile.');
  } finally {
    formSubmitBtn.disabled = false;
    formSubmitBtn.textContent = submitLabel;
  }
});

renderProfiles();
