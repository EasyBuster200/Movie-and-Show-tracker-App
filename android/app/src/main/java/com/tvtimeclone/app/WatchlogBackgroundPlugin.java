package com.tvtimeclone.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.TimeUnit;

/**
 * The app's bridge to {@link EpisodeCheckWorker}. notifications.js calls configure() after every
 * notification refresh with the active profile's TMDB key and tracked shows (the worker can't
 * read the app's IndexedDB), and whether notifications are on. On: a daily background check is
 * kept scheduled. Off (disabled, no profile, permission refused): it's cancelled.
 *
 * The key is stored in this app's private SharedPreferences - the same protection as the
 * WebView's localStorage, where the app already keeps it.
 */
@CapacitorPlugin(name = "WatchlogBackground")
public class WatchlogBackgroundPlugin extends Plugin {
    static final String PREFS = "watchlog_background";
    static final String WORK_NAME = "watchlog-episode-check";

    @PluginMethod
    public void configure(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        JSArray shows = call.getArray("shows", new JSArray());

        SharedPreferences.Editor editor = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        editor.putBoolean("enabled", enabled);
        editor.putString("apiKey", enabled ? call.getString("apiKey", "") : "");
        editor.putInt("notifyHour", call.getInt("notifyHour", 18));
        editor.putString("smallIcon", call.getString("smallIcon"));
        editor.putString("shows", shows.toString());
        editor.apply();

        WorkManager workManager = WorkManager.getInstance(getContext());
        if (enabled) {
            Constraints constraints = new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(EpisodeCheckWorker.class, 24, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();
            // KEEP: re-configuring on every app open must not keep pushing the next run back.
            workManager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, work);
        } else {
            workManager.cancelUniqueWork(WORK_NAME);
        }
        call.resolve();
    }

    /** Runs one check right away (for testing the background path without waiting a day). */
    @PluginMethod
    public void runNow(PluginCall call) {
        WorkManager.getInstance(getContext()).enqueue(new OneTimeWorkRequest.Builder(EpisodeCheckWorker.class).build());
        JSObject result = new JSObject();
        result.put("queued", true);
        call.resolve(result);
    }

    // The installed version (versionName/versionCode from app/build.gradle), shown at the bottom of
    // Settings.
    @PluginMethod
    public void getAppInfo(PluginCall call) {
        JSObject result = new JSObject();
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            result.put("versionName", info.versionName);
            result.put("versionCode", info.versionCode);
        } catch (Exception e) {
            result.put("versionName", "");
        }
        call.resolve(result);
    }
}
