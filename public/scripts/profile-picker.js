const listEl = document.getElementById('profile-list');
const emptyEl = document.getElementById('profile-empty');
const newProfileBtn = document.getElementById('new-profile-btn');
const importBackupBtn = document.getElementById('import-backup-btn');
const importBackupInput = document.getElementById('import-backup-input');
const form = document.getElementById('profile-form');
const formSubmitBtn = document.getElementById('profile-form-submit');
const cancelBtn = document.getElementById('profile-form-cancel');
const errorEl = document.getElementById('profile-error');

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

function openForm(profile) {
  errorEl.hidden = true;
  form.editingId.value = profile ? profile.id : '';
  form.displayName.value = profile ? profile.displayName : '';
  form.tmdbApiKey.value = profile ? profile.tmdbApiKey : '';
  formSubmitBtn.textContent = profile ? 'Save Changes' : 'Create Profile';
  form.hidden = false;
  newProfileBtn.hidden = true;
  form.displayName.focus();
}

function closeForm() {
  form.hidden = true;
  newProfileBtn.hidden = false;
  form.reset();
  errorEl.hidden = true;
}

function selectProfile(profile) {
  setActiveProfileId(profile.id);
  window.location.href = 'main.html';
}

function deleteProfileWithConfirm(profile, event) {
  event.stopPropagation();
  const confirmed = window.confirm(`Delete "${profile.displayName}" and all of its watched/list/rating data? This can't be undone.`);
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
    deleteBtn.className = 'profile-row-action';
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
  importBackupBtn.disabled = true;
  try {
    const profile = await importBackupFile(file);
    setActiveProfileId(profile.id);
    window.location.href = 'main.html';
  } catch (error) {
    console.error('Backup import failed:', error);
    showError(error.message || 'Could not import that backup file.');
  }
  importBackupBtn.disabled = false;
});

form.addEventListener('submit', event => {
  event.preventDefault();
  const displayName = form.displayName.value.trim();
  const tmdbApiKey = form.tmdbApiKey.value.trim();
  if (!displayName || !tmdbApiKey) {
    showError('Display name and TMDB API key are both required.');
    return;
  }

  const editingId = form.editingId.value;
  if (editingId) {
    updateProfile(editingId, { displayName, tmdbApiKey });
  } else {
    createProfile({ displayName, tmdbApiKey });
  }
  closeForm();
  renderProfiles();
});

renderProfiles();
