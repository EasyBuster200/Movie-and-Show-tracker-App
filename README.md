# Watchlog

A TV Time–style movie/show tracker (formerly "TVTimeClone"): browse trending content, save it to lists, track what
you've watched (per-episode for shows), rate things, and mark favorites. Ships as a fully
local, offline-first **Android app** — there's no server, no accounts, and no shared backend.
Everyone who installs it keeps their own data on their own device.

> This is a from-scratch rebuild of the original server-backed multi-user website into a
> local-first Android app. It was split off into its own repo from
> [Movie-and-Show-tracker-Website](https://github.com/EasyBuster200/Movie-and-Show-tracker-Website),
> which still has the server-backed version — this repo's git history goes back to before that
> split if you need to compare against it.

## Features

- **Browse & search** — trending, popular, and recommended movies/shows via TMDB, plus a live
  search bar that also finds actors.
- **Actor pages** — tap any cast member (or an actor in search) for their bio and a full
  filmography you can save/watch/favorite from directly.
- **Lists & Bookmarks** — save anything to custom lists, with a dedicated Bookmarks page for
  quick-saves.
- **Per-episode watch tracking** — movies are a simple watched/unwatched toggle; shows track
  every episode individually, with a "catch up" prompt that bulk-marks earlier episodes when you
  jump ahead.
- **Ratings & favorites** — a 5-star (half-increment) rating widget on the detail page, and a
  heart toggle for favorites.
- **Keep Watching / Airing Soon** — Keep Watching lists the shows you're actively watching. Shows
  you're caught up on wait in Airing Soon until their next episode, and shows untouched for a
  month after new episodes came out count as dropped. Tap Airing Soon for a calendar page: a
  week strip plus every announced upcoming episode, day by day.
- **Watched shows filters** — All / Watching / Caught up / Completed / Dropped.
- **Stats** — tap Stats on your profile for watch time per month, top genres, top actors, your
  rating spread and per-show progress.
- **Recommendations** — seeded from your own most-recently-watched/listed items, ranked against
  TMDB's recommendation graph.
- **Adult-content filtering** — pornographic titles (TMDB's own `adult` flag, not general
  R-rated/mature content) are filtered out of search, browsing, and recommendations everywhere.
- **Local profiles** — swap between multiple people's data on the same device (a phone might be
  shared), each with their own TMDB API key and completely separate storage.
- **Backup & restore** — export a profile's full data as a file and re-import it on a new phone,
  so switching devices or reinstalling doesn't mean starting over.
- **Weekly automatic backups** — once a week each profile is saved to `Documents/Watchlog` on
  the phone (one file per profile, the previous week's replaced), so a reinstall or lost data
  is one "Import Backup" away. Backups never include your TMDB key.
- **New-episode notifications** — a notification on the evening a tracked show's next episode
  airs (on/off in the Profile menu). A daily background check keeps them coming even if you
  don't open the app.

## Why local-first

Every profile calls TMDB directly from the device using its own free API key — there's nothing
to run, host, or pay for, and nobody's watch history ever leaves their phone. See
[CLAUDE.md](CLAUDE.md) for the technical details of how that's implemented (a `fetch` shim
that intercepts the app's own API calls and serves them from IndexedDB instead of a server).

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A JDK for the Android build — **JDK 17** specifically (Gradle/AGP versions here predate
  JDK 21 support; see the note in [CLAUDE.md](CLAUDE.md) if you're bumping Capacitor)
- [Android SDK command-line tools](https://developer.android.com/studio#command-line-tools-only)
  (platform 34, build-tools 34.0.0, platform-tools) — or the full Android Studio, which bundles
  all of this
- A free [TMDB API Read Access Token](https://www.themoviedb.org/settings/api) — the long token,
  not the short "API Key" (you'll enter this in-app per
  profile, not as a build-time secret)

### Build

```bash
npm install              # install dependencies
npm run sync              # copy public/ into the Android project
```

Then either open the project in Android Studio and run it from there:

```bash
npm run open:android
```

...or build a release APK from the command line (JDK 17):

```bash
cd android
./gradlew assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk` — sideload it onto any
Android device (enable "Install unknown apps" for whatever you use to transfer it). Each build's
version number is the repo's commit count, so a newer build installs over an older one and keeps
all data.

**Signing.** Release builds are signed with a key kept *outside* the repo, configured in
`~/.android/watchlog-release.properties` (or the file named by `WATCHLOG_SIGNING_PROPERTIES`):

```properties
storeFile=C:/Users/you/.android/watchlog-release.jks
storePassword=...
keyAlias=watchlog
keyPassword=...
```

Create the keystore once with `keytool -genkeypair -v -keystore <path>.jks -alias watchlog -keyalg RSA
-keysize 2048 -validity 10000` (keytool ships with the JDK). Without that file, release builds
come out unsigned. **Back up the keystore and its passwords**: Android only installs an update
signed with the same key, so losing it means uninstalling (and losing the app's data unless you
restore a backup). For the same reason, don't install a debug build over a release-signed one.

There's no bundler or build step for the web layer itself — `public/` is plain HTML/CSS/JS
loaded directly via `<script>` tags, and Capacitor just wraps it in a WebView.

## Testing changes without Android

Since the app is a static site until Capacitor wraps it, you can iterate on most of it in a
plain browser tab — serve `public/` with any static file server and open `profile-picker.html`
to create a profile. The one thing you can't verify this way is anything native (the backup
feature's Share sheet, real back-button behavior) — those need the actual Android build.

## Tests

```bash
npm test
```

Runs the Node test suite in `tests/` (Node's built-in test runner, no framework). It loads the
app's real local data layer (`localApi.js` and friends) into a sandbox with an in-memory
IndexedDB and a fake TMDB, then exercises the same `/api/...` routes the pages call — lists,
watch tracking, stats, the new-episode check, recommendations, caching/retries. UI code isn't
covered; check that in a browser as described above.

## Project structure

```
public/          the entire app (HTML/CSS/JS), loaded into Capacitor's WebView
  scripts/       localDb.js (IndexedDB), localApi.js (fetch shim), profiles.js (local accounts),
                 standardItem.js (shared item shape), backup.js + autoBackup.js,
                 notifications.js, vendor/ (Capacitor plugins), plus one script per page
  styles/        style.css (app-wide) + profile-picker.css (profile picker)
tests/           Node test suite for the local data layer (npm test)
android/         the Capacitor-generated native wrapper (mostly boilerplate)
docs/icons/      source Material Symbols SVGs (reference for inline <svg> icons) and
                 watchlog-launcher.svg, the app icon artwork
```

The original Express/SQLite backend isn't part of this repo's working tree — it lives in this
repo's git history (before the local-first rebuild commit) and in the current state of the
separate [Movie-and-Show-tracker-Website](https://github.com/EasyBuster200/Movie-and-Show-tracker-Website)
repo.

See [CLAUDE.md](CLAUDE.md) for a much deeper architectural writeup (data flow, storage shape,
the standard item contract used across pages, and known rough edges).

## Attribution

This product uses the TMDB API but is not endorsed, certified, or otherwise approved by TMDB.

## License

ISC
