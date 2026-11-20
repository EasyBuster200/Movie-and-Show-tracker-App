# Watchlog — development guide

Everything technical: how the app works, building it, testing it, and publishing a release.
For using the app, see the [README](../README.md). For a deeper, file-by-file architecture
reference (data flow, storage shape, the conventions shared between pages), see
[CLAUDE.md](../CLAUDE.md).

## How it works

Watchlog is a plain HTML/CSS/JavaScript app (`public/`) wrapped in an Android app with
[Capacitor](https://capacitorjs.com/) 6. There's no server, no bundler and no build step for the
web code: pages load their scripts with ordinary `<script>` tags.

- **No backend.** `public/scripts/localApi.js` patches `window.fetch` and answers the app's own
  `/api/...` requests locally, so the pages are written as if there were a server.
  - `/api/tmdb/*` requests go straight to [TMDB](https://developer.themoviedb.org/docs), using
    the active profile's own API Read Access Token as a bearer token.
  - Everything else (lists, watched, favorites, stats, recommendations, schedule) reads
    and writes the active profile's own IndexedDB database (`localDb.js`), one database per
    profile.
  - TMDB calls are rate-limited, retried, de-duplicated and, for movie/show details and credits,
    cached for 7 days.
- **Profiles** are a small registry in `localStorage` (`profiles.js`). Each holds a display name
  and a TMDB token; the token is checked against TMDB before it's saved.
- **Backups** (`backup.js`) are a JSON export of a profile's database, without the TMDB token.
  `autoBackup.js` writes one per profile per week to the phone's public `Documents/Watchlog`
  folder.
- **Settings** (`settings.js`) are kept per profile on its registry entry (`profiles.js`):
  theme and accent (applied before paint by `theme.js`), region and TMDB language, the three
  notification switches and auto-backup.
- **Notifications** (`notifications.js`) use `@capacitor/local-notifications` to schedule
  new-episode notifications, release reminders for Watchlist movies and a weekly recap when the
  app opens. A native daily job keeps them coming without
  opening the app: `android/.../WatchlogBackgroundPlugin.java` + `EpisodeCheckWorker.java`,
  which use WorkManager.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or newer.
- **JDK 17** for the Android build. The Gradle/AGP versions that Capacitor 6 uses predate JDK 21
  support, so don't build with 21+.
- The [Android SDK](https://developer.android.com/studio#command-line-tools-only) (platform 34,
  build-tools 34, platform-tools), or Android Studio, which includes it.
- A TMDB API Read Access Token to use the app (see the README).

## Build

```bash
npm install
npm run sync   # copies public/ into the Android project (npx cap sync android)
```

Then build an APK (bash/Git Bash shown; set the paths for your machine):

```bash
cd android
JAVA_HOME="C:/Program Files/Java/jdk-17" ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" ./gradlew assembleRelease
```

The APK is `android/app/build/outputs/apk/release/app-release.apk`. Install it on a phone
connected with USB debugging:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`npm run open:android` opens the project in Android Studio instead.

**Versioning:** `versionCode` is the number of commits on the current branch
(`git rev-list --count HEAD`), and `versionName` is `2.<that number>` (the 2.x series is the redesign; 1.x was the original design, up to 1.61). Every build from a newer
commit is a higher version, so it installs as an update and keeps the app's data.

### Signing

Release builds are signed with a key kept **outside the repository**. Gradle reads its details
from `~/.android/watchlog-release.properties`, or from the file named by the
`WATCHLOG_SIGNING_PROPERTIES` environment variable:

```properties
storeFile=C:/Users/you/.android/watchlog-release.jks
storePassword=...
keyAlias=watchlog
keyPassword=...
```

Create the keystore once (`keytool` comes with the JDK):

```bash
keytool -genkeypair -v -keystore watchlog-release.jks -alias watchlog -keyalg RSA -keysize 2048 -validity 10000
```

Without the properties file, release builds come out unsigned and can't be installed.

> **Never lose the key, and never sign a build with a different one.** Android only installs an
> update signed with the same key as the installed app. A differently-signed build can only be
> installed by uninstalling first, which deletes the user's data. Keep the keystore and its
> passwords backed up. For the same reason, don't install a debug build (signed with your
> machine's debug key) over a release build.

## Running it without Android

The app is a static site until Capacitor wraps it, so most of it can be developed in a browser:
serve `public/` with any static file server (`.claude/launch.json` has an `npx serve public`
configuration) and open `profile-picker.html` to create a profile. Turn off "clean URLs" if your
server has them (`serve.json` does this for `npx serve`): pages pass their parameters in the query
string, and a redirect from `page.html?id=1` to `/page` would drop it. Native-only features (the
Share sheet for exporting backups, the weekly backup file, notifications, the hardware back
button) need the real Android build.

## Tests

```bash
npm test
```

This runs the Node test suite in `tests/` with Node's built-in test runner. `tests/harness.js`
loads the app's real data-layer scripts into a sandbox that stands in for one page: an in-memory
IndexedDB (`fake-indexeddb`), `localStorage`, a fake TMDB server, and fakes of the Capacitor
plugins. The tests then call the same `/api/...` routes the pages use. They cover watch
tracking, show statuses, the schedule, stats, recommendations, caching and retries, backups and
auto-backups, notification scheduling and the background-check sync, and TMDB key validation.
Page and UI code isn't covered by tests; check it in a browser.

## Publishing a release

The README's download link points at
`https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases/latest/download/Watchlog.apk`,
so every release must attach the APK under exactly the name **`Watchlog.apk`**.

1. Commit and push everything (the version number comes from the commit count).
2. Build the signed release APK (see [Build](#build)), and note its version. `versionName` is
   `2.<commit count>`.
3. Copy it to `Watchlog.apk` and create the release, tagged with that version:

   ```bash
   cp android/app/build/outputs/apk/release/app-release.apk Watchlog.apk
   gh release create v2.<N> Watchlog.apk --title "Watchlog 2.<N>" --notes "What changed..."
   ```

Users then download the new APK and install it over the old one; their data is kept.

## Project structure

```
public/            the whole app, loaded into Capacitor's WebView
  *.html           one page per screen (main, movies, shows, detail, episodes, person,
                   airing-soon, stats, lists, bookmarks (the Watchlist), media-list (every
                   "See all"), search, profile, settings, licences, profile-picker)
  scripts/         localApi.js (the fetch shim / local "server"), localDb.js (IndexedDB),
                   profiles.js, standardItem.js (shared item shape), media.js (shared UI
                   components), browse.js (Movies/Shows filter & sort), theme.js (theme and
                   accent, applied before paint), backup.js,
                   autoBackup.js, notifications.js, one script per page, vendor/ (Capacitor
                   core and plugins as plain scripts)
  styles/          tokens.css (design tokens), style.css (components and screens)
android/           Capacitor's native Android project. Hand-written parts: MainActivity.java,
                   WatchlogBackgroundPlugin.java, EpisodeCheckWorker.java, app/build.gradle
                   (versioning and signing), the launcher and notification icons
tests/             Node test suite (npm test)
docs/              this guide, design/ (the design system's tokens.json and reference
                   component CSS), screenshots/, icons/ (Material Symbols reference SVGs and
                   the app icon artwork)
CLAUDE.md          detailed architecture reference
```

## History

This repository was split off from
[Movie-and-Show-tracker-Website](https://github.com/EasyBuster200/Movie-and-Show-tracker-Website),
a server-backed multi-user website (Express + SQLite), at the commit that rebuilt it as this
local-first Android app. The earlier server version is still in this repository's git history.
The app was called "TVTimeClone" before being renamed to Watchlog; some internal identifiers
(the Android application id `com.tvtimeclone.app`, the backup format id) keep the old name on
purpose, because changing them would break updates and old backups.
