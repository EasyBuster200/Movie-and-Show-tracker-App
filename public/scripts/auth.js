// Kept as getCurrentUser/requireLogin/logout so the existing call sites across the app
// (bookmarks.js, detail.js, lists.js, media.js, profile.js, media-list.js) don't need to change —
// only what backs them did: a local profile (profiles.js) instead of a server session.

async function getCurrentUser() {
  return getActiveProfile();
}

async function requireLogin() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = 'profile-picker.html';
    return null;
  }
  return user;
}

async function logout() {
  clearActiveProfile();
  window.location.href = 'profile-picker.html';
}
