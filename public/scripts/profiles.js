// Local profile registry — replaces the old server-side accounts system.
// Profile *identity* (id/displayName/tmdbApiKey/createdAt) lives in localStorage; each profile's
// actual app data lives in its own IndexedDB database (see localDb.js), named `tvtc-profile-{id}`.
// Enumerating IndexedDB databases across browsers isn't reliable, so this small registry is the
// source of truth for "which profiles exist" and "which one is active".

const PROFILES_KEY = 'tvtc_profiles';
const ACTIVE_PROFILE_KEY = 'tvtc_active_profile_id';

function generateProfileId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `profile-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getProfiles() {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY)) || [];
  } catch (error) {
    return [];
  }
}

function saveProfiles(profiles) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

function createProfile({ displayName, tmdbApiKey }) {
  const profile = {
    id: generateProfileId(),
    displayName,
    tmdbApiKey,
    createdAt: new Date().toISOString(),
  };
  const profiles = getProfiles();
  profiles.push(profile);
  saveProfiles(profiles);
  return profile;
}

function updateProfile(id, updates) {
  const profiles = getProfiles();
  const index = profiles.findIndex(p => p.id === id);
  if (index === -1) return null;
  profiles[index] = { ...profiles[index], ...updates };
  saveProfiles(profiles);
  return profiles[index];
}

function deleteProfile(id) {
  const profiles = getProfiles().filter(p => p.id !== id);
  saveProfiles(profiles);
  if (getActiveProfileId() === id) clearActiveProfile();
  indexedDB.deleteDatabase(`tvtc-profile-${id}`);
}

function getActiveProfileId() {
  return localStorage.getItem(ACTIVE_PROFILE_KEY);
}

function setActiveProfileId(id) {
  localStorage.setItem(ACTIVE_PROFILE_KEY, id);
}

function clearActiveProfile() {
  localStorage.removeItem(ACTIVE_PROFILE_KEY);
}

function getActiveProfile() {
  const id = getActiveProfileId();
  if (!id) return null;
  return getProfiles().find(p => p.id === id) || null;
}
