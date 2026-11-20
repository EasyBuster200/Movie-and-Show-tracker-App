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

// --- Per-profile preferences (the Settings page) ---
// Stored on the profile's own registry entry (`prefs`), so each profile keeps its own and they
// go away with it. Anything unset falls back to PROFILE_PREF_DEFAULTS. theme.js reads the theme
// and accent straight from localStorage before the page paints, so keep the shape in sync.
const ACCENT_COLOURS = ['burgundy', 'indigo', 'ocean', 'teal', 'coral', 'magenta', 'amber'];
const DEFAULT_TMDB_LANGUAGE = 'en-US';
// The old device-wide episode-notifications switch; still honoured as the default for
// profiles that haven't set their own.
const LEGACY_NOTIFICATIONS_KEY = 'tvtc_notifications_enabled';

const PROFILE_PREF_DEFAULTS = {
  theme: 'dark', // 'dark' | 'light' | 'system'
  accent: 'burgundy',
  region: null, // ISO 3166-1 code; null = guess from the phone's locale
  language: DEFAULT_TMDB_LANGUAGE, // TMDB language tag for titles/overviews
  notifyEpisodes: true,
  releaseReminders: true,
  weeklyRecap: false,
  autoBackup: true,
};

function getProfilePrefs(profileOrId = getActiveProfile()) {
  const profile = typeof profileOrId === 'string' ? getProfiles().find(p => p.id === profileOrId) : profileOrId;
  const defaults = { ...PROFILE_PREF_DEFAULTS, notifyEpisodes: localStorage.getItem(LEGACY_NOTIFICATIONS_KEY) !== 'false' };
  return { ...defaults, ...((profile && profile.prefs) || {}) };
}

function setProfilePrefs(id, updates) {
  const profile = getProfiles().find(p => p.id === id);
  if (!profile) return null;
  return updateProfile(id, { prefs: { ...(profile.prefs || {}), ...updates } }).prefs;
}

// The region to use for Popular rows and release dates: the chosen one, else a guess from the
// locale ("en-US" -> "US"), else US.
function profileRegion(profile = getActiveProfile()) {
  const chosen = getProfilePrefs(profile).region;
  if (chosen) return chosen;
  const locale = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
  return (locale.split('-')[1] || 'US').toUpperCase();
}

function profileLanguage(profile = getActiveProfile()) {
  return getProfilePrefs(profile).language || DEFAULT_TMDB_LANGUAGE;
}

// Checks a TMDB key actually works before it's saved, rather than letting a typo surface later
// as generic "Failed to load…" errors on every page. The app sends keys as a bearer token
// (localApi.js), which only TMDB's long "API Read Access Token" accepts - the short 32-character
// "API Key" from the same settings page gets a 401, so that case gets its own message.
// Resolves to { ok: true } or { ok: false, message }.
const TMDB_KEY_CHECK_URL = 'https://api.themoviedb.org/3/authentication';
const TMDB_KEY_CHECK_TIMEOUT_MS = 10000;

async function validateTmdbApiKey(key) {
  const trimmed = (key || '').trim();
  if (!trimmed) return { ok: false, message: 'Enter a TMDB API Read Access Token.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TMDB_KEY_CHECK_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(TMDB_KEY_CHECK_URL, {
      headers: { accept: 'application/json', Authorization: `Bearer ${trimmed}` },
      signal: controller.signal,
    });
  } catch (error) {
    return { ok: false, message: "Couldn't reach TMDB to check this key. Check your connection and try again." };
  } finally {
    clearTimeout(timer);
  }

  if (response.ok) return { ok: true };
  if (response.status === 401) {
    if (/^[0-9a-f]{32}$/i.test(trimmed)) {
      return {
        ok: false,
        message: 'That looks like the short "API Key". This app needs the long "API Read Access Token" from the same page (themoviedb.org/settings/api).',
      };
    }
    return { ok: false, message: 'TMDB rejected that key. Copy the "API Read Access Token" from themoviedb.org/settings/api.' };
  }
  return { ok: false, message: `TMDB couldn't check the key right now (error ${response.status}). Try again in a moment.` };
}
