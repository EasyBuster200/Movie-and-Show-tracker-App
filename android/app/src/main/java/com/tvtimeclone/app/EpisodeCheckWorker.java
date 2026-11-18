package com.tvtimeclone.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationManagerCompat;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.capacitorjs.plugins.localnotifications.LocalNotification;
import com.capacitorjs.plugins.localnotifications.LocalNotificationManager;
import com.capacitorjs.plugins.localnotifications.NotificationStorage;
import com.getcapacitor.CapConfig;
import com.getcapacitor.JSObject;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Daily background check for new episodes (scheduled by {@link WatchlogBackgroundPlugin}), so
 * notifications keep coming even if the app isn't opened for weeks. It's the native twin of
 * notifications.js's refreshEpisodeNotifications: for each tracked show the app last synced, it
 * asks TMDB for next_episode_to_air and schedules a notification for EPISODE_NOTIFY_HOUR local
 * time on its air date.
 *
 * Notifications go through the @capacitor/local-notifications plugin's own scheduler and storage
 * (the same thing that plugin's reboot receiver does), so they are indistinguishable from ones
 * the app schedules: same icon, tapping opens the show (notifications.js's tap listener), and
 * getPending/cancel in the app see them. Ids are per episode (episodeNotificationId, identical in
 * notifications.js), so an episode is never scheduled twice and a notification that already
 * fired is never replaced.
 *
 * It only ever adds: it doesn't cancel anything. Turning notifications off in the app cancels
 * pending ones from JS and switches this job off.
 */
public class EpisodeCheckWorker extends Worker {
    private static final String TAG = "WatchlogEpisodeCheck";
    private static final String TMDB_TV_URL = "https://api.themoviedb.org/3/tv/";
    private static final int TIMEOUT_MS = 15000;

    public EpisodeCheckWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    /** Same algorithm as notifications.js's episodeNotificationId (Java's String.hashCode). */
    static int episodeNotificationId(long showId, int season, int episode) {
        return (showId + ":" + season + ":" + episode).hashCode() & 0x7fffffff;
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        SharedPreferences prefs = context.getSharedPreferences(WatchlogBackgroundPlugin.PREFS, Context.MODE_PRIVATE);
        String apiKey = prefs.getString("apiKey", "");
        if (!prefs.getBoolean("enabled", false) || apiKey.isEmpty()) return Result.success();
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return Result.success();

        int notifyHour = prefs.getInt("notifyHour", 18);
        String smallIcon = prefs.getString("smallIcon", null);

        NotificationStorage storage = new NotificationStorage(context);
        List<String> existingIds = storage.getSavedNotificationIds();
        List<LocalNotification> toSchedule = new ArrayList<>();
        boolean hadTransientFailure = false;

        try {
            JSONArray shows = new JSONArray(prefs.getString("shows", "[]"));
            for (int i = 0; i < shows.length(); i++) {
                JSONObject show = shows.getJSONObject(i);
                long showId = show.getLong("id");
                JSONObject details;
                try {
                    details = fetchShow(showId, apiKey);
                } catch (Exception e) {
                    hadTransientFailure = true;
                    Log.w(TAG, "Couldn't check show " + showId + ": " + e.getMessage());
                    continue;
                }
                if (details == null) continue;

                JSONObject next = details.optJSONObject("next_episode_to_air");
                if (next == null) continue;
                Calendar at = notificationTime(next.optString("air_date", ""), notifyHour);
                if (at == null || !at.after(Calendar.getInstance())) continue;

                int season = next.optInt("season_number");
                int episode = next.optInt("episode_number");
                int id = episodeNotificationId(showId, season, episode);
                if (existingIds.contains(String.valueOf(id))) continue;

                String name = next.optString("name", "");
                boolean hasRealName = !name.isEmpty() && !name.trim().matches("(?i)^Episode\\s+\\d+$");
                String title = details.optString("name", show.optString("title", "New episode"));

                JSObject json = new JSObject();
                json.put("id", id);
                json.put("title", title);
                json.put("body", "New episode today: S" + season + "E" + episode + (hasRealName ? " · " + name : ""));
                JSObject schedule = new JSObject();
                schedule.put("at", formatUtc(at));
                schedule.put("allowWhileIdle", true);
                json.put("schedule", schedule);
                if (smallIcon != null) json.put("smallIcon", smallIcon);
                JSObject extra = new JSObject();
                extra.put("showId", showId);
                json.put("extra", extra);
                toSchedule.add(LocalNotification.buildNotificationFromJSObject(json));
            }
        } catch (Exception e) {
            Log.e(TAG, "Episode check failed", e);
            return Result.retry();
        }

        if (!toSchedule.isEmpty()) {
            LocalNotificationManager manager = new LocalNotificationManager(storage, null, context, CapConfig.loadDefault(context));
            manager.createNotificationChannel();
            manager.schedule(null, toSchedule);
            storage.appendNotifications(toSchedule);
            Log.i(TAG, "Scheduled " + toSchedule.size() + " episode notification(s)");
        }
        return hadTransientFailure && toSchedule.isEmpty() ? Result.retry() : Result.success();
    }

    /** null for a 404 (show gone); throws on network errors and other failures. */
    private static JSONObject fetchShow(long showId, String apiKey) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(TMDB_TV_URL + showId).openConnection();
        conn.setConnectTimeout(TIMEOUT_MS);
        conn.setReadTimeout(TIMEOUT_MS);
        conn.setRequestProperty("accept", "application/json");
        conn.setRequestProperty("Authorization", "Bearer " + apiKey);
        try {
            int status = conn.getResponseCode();
            if (status == 404) return null;
            if (status != 200) throw new Exception("HTTP " + status);
            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }
            return new JSONObject(body.toString());
        } finally {
            conn.disconnect();
        }
    }

    /** "YYYY-MM-DD" -> that day at notifyHour:00 in the phone's time zone. */
    private static Calendar notificationTime(String airDate, int notifyHour) {
        String[] parts = airDate.split("-");
        if (parts.length != 3) return null;
        try {
            Calendar cal = Calendar.getInstance();
            cal.clear();
            cal.set(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]) - 1, Integer.parseInt(parts[2]), notifyHour, 0, 0);
            return cal;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** The plugin's JS_DATE_FORMAT, in UTC - what JS's Date serializes to. */
    private static String formatUtc(Calendar at) {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(at.getTime());
    }
}
