// New-episode notifications (Android app only), via @capacitor/local-notifications - no server,
// no push. Whenever the app is opened (throttled to every NOTIFICATIONS_REFRESH_INTERVAL_MS, or
// immediately after switching profile/toggling the setting), this asks localApi.js for the
// active profile's upcoming episodes (GET /api/watched/shows/upcoming - one next episode per
// tracked show) and schedules one local notification per show for EPISODE_NOTIFY_HOUR local
// time on its air date. Android fires them itself, even with the app closed, and the plugin
// re-registers them after a reboot.
//
// TMDB only says what each show's *next* episode is, so the one after it is picked up later:
// the next time the app is opened, or by the daily background check (EpisodeCheckWorker.java,
// kept in sync through syncBackgroundEpisodeCheck below), whichever comes first. TMDB air dates
// are dates without a time (in the network's own country), so the notification time is an
// approximation.
//
// Tapping a notification opens that show's detail page (initNotificationTapHandler, which every
// page registers; the plugin holds the tap event until a listener exists, so a cold start from
// a notification still lands there).

const EPISODE_NOTIFY_HOUR = 18;
const NOTIFICATIONS_ENABLED_KEY = 'tvtc_notifications_enabled';
const NOTIFICATIONS_REFRESH_KEY = 'tvtc_notifications_refresh';
const NOTIFICATIONS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const NOTIFICATIONS_START_DELAY_MS = 1500;
const NOTIFICATION_SMALL_ICON = 'ic_stat_tvtc';

function notificationsSupported() {
  return Boolean(
    window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() &&
    window.capacitorLocalNotifications
  );
}

function areEpisodeNotificationsEnabled() {
  return localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== 'false';
}

function setEpisodeNotificationsEnabled(enabled) {
  localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, enabled ? 'true' : 'false');
}

// 'YYYY-MM-DD' -> that day at EPISODE_NOTIFY_HOUR, in the phone's local time zone.
function episodeNotificationTime(airDate) {
  const [year, month, day] = String(airDate).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, EPISODE_NOTIFY_HOUR, 0, 0, 0);
}

// One id per episode - "showId:season:episode" hashed the way Java's String.hashCode does it, so
// EpisodeCheckWorker.java computes the exact same id. That way the app and the background job
// never schedule the same episode twice, and rescheduling never replaces a notification that
// already fired and is still showing.
function episodeNotificationId(showId, season, episode) {
  const key = `${showId}:${season}:${episode}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return hash & 0x7fffffff;
}

// Pure: upcoming shows (the /api/watched/shows/upcoming shape) -> LocalNotifications schedule
// entries, skipping anything whose notification time has already passed.
function buildEpisodeNotifications(upcoming, now = new Date()) {
  return (upcoming || [])
    .map(show => {
      const next = show.nextEpisode;
      const at = next && episodeNotificationTime(next.airDate);
      if (!at || at <= now) return null;
      const code = `S${next.seasonNumber}E${next.episodeNumber}`;
      const hasRealName = next.name && !/^Episode\s+\d+$/i.test(next.name.trim());
      return {
        id: episodeNotificationId(show.tmdbId, next.seasonNumber, next.episodeNumber),
        title: show.title,
        body: `New episode today: ${code}${hasRealName ? ` · ${next.name}` : ''}`,
        schedule: { at, allowWhileIdle: true },
        smallIcon: NOTIFICATION_SMALL_ICON,
        extra: { showId: show.tmdbId },
      };
    })
    .filter(Boolean);
}

function readNotificationRefreshState() {
  try {
    return JSON.parse(localStorage.getItem(NOTIFICATIONS_REFRESH_KEY)) || {};
  } catch (error) {
    return {};
  }
}

// The native daily check (WatchlogBackgroundPlugin.java) can't read the app's data, so after
// every refresh it's told the active profile's key and tracked shows - or switched off.
function backgroundPlugin() {
  if (!window.capacitorExports || !window.capacitorExports.registerPlugin) return null;
  if (!window.__watchlogBackground) window.__watchlogBackground = window.capacitorExports.registerPlugin('WatchlogBackground');
  return window.__watchlogBackground;
}

async function syncBackgroundEpisodeCheck({ enabled, profile = null, shows = [] }) {
  const plugin = backgroundPlugin();
  if (!plugin) return;
  try {
    await plugin.configure({
      enabled,
      apiKey: enabled && profile ? profile.tmdbApiKey : '',
      notifyHour: EPISODE_NOTIFY_HOUR,
      smallIcon: NOTIFICATION_SMALL_ICON,
      shows: enabled ? shows.map(show => ({ id: show.tmdbId, title: show.title })) : [],
    });
  } catch (error) {
    // An older build without the native plugin - the in-app scheduling still works.
    console.warn('Background episode check unavailable:', error);
  }
}

async function cancelEpisodeNotifications(LocalNotifications) {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications && pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
  }
}

// Resolves to { status } - 'unsupported' | 'throttled' | 'cleared' | 'disabled' | 'denied' |
// 'failed' | 'scheduled' (with `count`).
async function refreshEpisodeNotifications({ force = false, now = new Date() } = {}) {
  if (!notificationsSupported()) return { status: 'unsupported' };
  const { LocalNotifications } = window.capacitorLocalNotifications;

  const profile = getActiveProfile();
  if (!profile) {
    await cancelEpisodeNotifications(LocalNotifications);
    localStorage.removeItem(NOTIFICATIONS_REFRESH_KEY);
    await syncBackgroundEpisodeCheck({ enabled: false });
    return { status: 'cleared' };
  }

  // Pages without the fetch shim (profile-picker.html) can only clear, not schedule.
  if (typeof dispatchLocalApi === 'undefined') return { status: 'unsupported' };

  if (!areEpisodeNotificationsEnabled()) {
    await cancelEpisodeNotifications(LocalNotifications);
    localStorage.removeItem(NOTIFICATIONS_REFRESH_KEY);
    await syncBackgroundEpisodeCheck({ enabled: false });
    return { status: 'disabled' };
  }

  const last = readNotificationRefreshState();
  const recent = last.profileId === profile.id && now.getTime() - (last.at || 0) < NOTIFICATIONS_REFRESH_INTERVAL_MS;
  if (!force && recent) return { status: 'throttled' };

  let permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
    permission = await LocalNotifications.requestPermissions();
  }
  if (permission.display !== 'granted') {
    await syncBackgroundEpisodeCheck({ enabled: false });
    return { status: 'denied' };
  }

  const response = await fetch('/api/watched/shows/upcoming', { credentials: 'same-origin' });
  if (!response.ok) return { status: 'failed' };
  const notifications = buildEpisodeNotifications(await response.json(), now);

  await cancelEpisodeNotifications(LocalNotifications);
  if (notifications.length) await LocalNotifications.schedule({ notifications });

  localStorage.setItem(NOTIFICATIONS_REFRESH_KEY, JSON.stringify({ profileId: profile.id, at: now.getTime() }));

  const tracked = await fetch('/api/watched/shows', { credentials: 'same-origin' });
  await syncBackgroundEpisodeCheck({ enabled: true, profile, shows: tracked.ok ? await tracked.json() : [] });
  return { status: 'scheduled', count: notifications.length };
}

function initNotificationTapHandler() {
  if (!notificationsSupported()) return;
  const { LocalNotifications } = window.capacitorLocalNotifications;
  LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const showId = event && event.notification && event.notification.extra && event.notification.extra.showId;
    if (showId) window.location.href = `detail.html?type=tv&id=${encodeURIComponent(showId)}`;
  });
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    initNotificationTapHandler();
    setTimeout(() => {
      refreshEpisodeNotifications().catch(error => console.error('Scheduling episode notifications failed:', error));
    }, NOTIFICATIONS_START_DELAY_MS);
  });
}
