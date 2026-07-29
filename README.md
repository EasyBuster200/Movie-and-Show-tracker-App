# TVTimeClone

A TV Time–style movie/show tracker: browse trending content, save it to lists, track what
you've watched (per-episode for shows), rate things, and mark favorites. Ships as a fully
local, offline-first **Android app** — there's no server, no accounts, and no shared backend.
Everyone who installs it keeps their own data on their own device.

> This is the `mobile-local-app` branch — a from-scratch rebuild of the original server-backed
> multi-user website (still on `master`) into a local-first Android app.

## Features

- **Browse & search** — trending, popular, and recommended movies/shows via TMDB, plus a live
  search bar.
- **Lists & Bookmarks** — save anything to custom lists, with a dedicated Bookmarks page for
  quick-saves.
- **Per-episode watch tracking** — movies are a simple watched/unwatched toggle; shows track
  every episode individually, with a "catch up" prompt that bulk-marks earlier episodes when you
  jump ahead.
- **Ratings & favorites** — a 5-star (half-increment) rating widget on the detail page, and a
  heart toggle for favorites.
- **Keep Watching / Airing Soon** — surfaces shows with new episodes since you last watched, and
  upcoming air dates for anything you're tracking.
- **Recommendations** — seeded from your own most-recently-watched/listed items, ranked against
  TMDB's recommendation graph.
- **Local profiles** — swap between multiple people's data on the same device (a phone might be
  shared), each with their own TMDB API key and completely separate storage.
- **Backup & restore** — export a profile's full data as a file and re-import it on a new phone,
  so switching devices or reinstalling doesn't mean starting over.
- **TV Time import** — bring your history over from a real TV Time account via its GDPR data
  export, matching shows against TMDB and marking watched episodes exactly (not just a rough
  guess) when the export's per-episode tracking data is included.

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
- A free [TMDB API key](https://www.themoviedb.org/settings/api) (you'll enter this in-app per
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

...or build a debug APK from the command line:

```bash
cd android
./gradlew assembleDebug
```

The APK lands at `android/app/build/outputs/apk/debug/app-debug.apk` — debug-signed, ready to
sideload onto any Android device (enable "Install unknown apps" for whatever you use to transfer
it). Installing a new build over an existing install upgrades it in place and keeps all data,
as long as it's signed with the same debug key (true for every build produced from this repo on
one machine) — data is only lost if the app is uninstalled first.

There's no bundler or build step for the web layer itself — `public/` is plain HTML/CSS/JS
loaded directly via `<script>` tags, and Capacitor just wraps it in a WebView.

## Testing changes without Android

Since the app is a static site until Capacitor wraps it, you can iterate on most of it in a
plain browser tab — serve `public/` with any static file server and open `profile-picker.html`
to create a profile. The one thing you can't verify this way is anything native (the backup
feature's Share sheet, real back-button behavior) — those need the actual Android build.

## Project structure

```
public/          the entire app (HTML/CSS/JS), loaded into Capacitor's WebView
  scripts/       localDb.js (IndexedDB), localApi.js (fetch shim), profiles.js (local accounts),
                 backup.js, tvtime-import.js, plus one script per page
  styles/        style.css (app-wide) + login.css (profile picker)
android/         the Capacitor-generated native wrapper (mostly boilerplate)
docs/icons/      source Material Symbols SVGs, copy-pasted as reference for inline <svg> icons
server/          the original Express/SQLite backend — no longer used by anything in public/,
                 kept around for reference until it's removed
```

See [CLAUDE.md](CLAUDE.md) for a much deeper architectural writeup (data flow, storage shape,
the standard item contract used across pages, and known rough edges).

## Attribution

This product uses the TMDB API but is not endorsed, certified, or otherwise approved by TMDB.

## License

ISC
