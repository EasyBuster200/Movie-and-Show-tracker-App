# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A TV Time–style movie/show tracker: browse trending content, save it to lists, track what you've watched (per-episode for shows), rate things, and mark favorites. All movie/show metadata comes live from TMDB — nothing is cached locally beyond IDs.

## Commands

```bash
npm install   # install dependencies (better-sqlite3 needs a native build)
npm start     # runs node server/index.js — serves the whole app on one port
```

There is no build step, bundler, or lint config — the frontend is plain HTML/CSS/JS loaded directly via `<script>` tags. `npm test` is an unconfigured placeholder (`exit 1`); there is no test suite in this repo.

Required `.env` (gitignored, not present in a fresh checkout): `TMDB_ACCESS_TOKEN`, `SESSION_SECRET`, `PORT` (defaults to 3000 if unset).

**Node version note:** `better-sqlite3` is pinned to `^11.x` deliberately — later majors declare `engines.node >= 22`. If you bump this dependency, confirm the actual runtime Node version first.

## Architecture

**Folder layout:** `server/` (Express app, routes, DB) and `public/` (everything `express.static` serves — HTML pages at its root so page URLs stay e.g. `/main.html`, plus `public/styles/` and `public/scripts/` for CSS/JS). `docs/icons/` holds source Material Symbols SVGs used as copy-paste reference for the inline `<svg>` icons scattered through the HTML — not loaded by the app itself, safe to ignore when tracing runtime behavior.

**Single Express process, no framework on the frontend.** `server/index.js` mounts the API under `/api/*` and serves `public/` as static files (`express.static`) — one origin, one port, no CORS, no separate dev server for the frontend. Pages are plain multi-page HTML (`main.html`, `bookmarks.html`, `lists.html`, `movies.html`, `shows.html`, `profile.html`, `detail.html`, `search.html`, `media-list.html`, `login.html`); there's no router or SPA framework, so navigation is real page loads.

**Database:** SQLite via `better-sqlite3` (`server/db.js`), schema in `server/schema.sql` applied idempotently (`CREATE TABLE IF NOT EXISTS`) on every boot — no migration system. Sessions are also stored in SQLite via a hand-rolled `express-session` store (`server/sessionStore.js`), not JWT — deliberately, since frontend and API are same-origin.

**TMDB is the only source of media data, and only the server talks to it directly.** `server/tmdbClient.js` + `server/routes/tmdb.js` proxy TMDB under `/api/tmdb/*`, injecting the bearer token server-side so it never reaches the browser. The app stores TMDB `id` + `media_type` (`'movie'|'tv'`) as the identity for everything — titles/posters/genres/cast are always fetched fresh through the proxy, never cached in the DB. When adding a new TMDB-backed feature, extend the proxy rather than caching a copy locally.

**Auth gating is client-side-first, not route-blocked.** Static pages like `bookmarks.html` are not protected at the HTTP layer; each protected page's own script calls `requireLogin()` (from `auth.js`) on load and redirects to `login.html` if unauthenticated. The real enforcement is server-side: `server/index.js` mounts `requireAuth` middleware per API route group (`/api/lists`, `/api/watched`, `/api/ratings`, `/api/favorites`, `/api/stats`), so a page-level redirect flash is cosmetic, not a security gap.

**Frontend has no bundler, so shared code is shared `<script>` includes, and load order matters.** Every page manually lists the scripts it needs (from `public/scripts/`); the working convention is `auth.js` → `sidebar.js` → `media.js` → (`search.js` if present) → page-specific script (`app.js`, `bookmarks.js`, `lists.js`, `profile.js`, `detail.js`, `movies.js`, `shows.js`, `search-results.js`, `media-list.js`). `media.js` is the de facto shared component library:
- `buildCard(item)` builds the poster card DOM used everywhere content is listed, wiring in click-through to `detail.html?type=&id=`.
- `attachStandardActions(card, item, context, opts)` is the standard entry point every page calls to wire up the save/favorite/watched buttons on a card — don't reimplement these per page.
- `fetchStandardActionContext()` batch-fetches the current user's watched-movie ids and favorite ids once per page load, so individual card buttons don't each fire their own request.

Adding a new page that lists movies/shows should reuse `buildCard`/`attachStandardActions`, not duplicate card-rendering logic.

**Card action layout:** the save/favorite/watched buttons live as an absolutely-positioned overlay on the poster image (`card.overlayActionsEl`), pinned to fixed corners via `.card-action-tr/-bl/-br` (eye=watched top-right, heart=favorite bottom-left, bookmark=save bottom-right) — not in the footer below the title. A separate footer row (`card.infoEl`'s lazily-created `.card-actions`) exists only for the list-removal button on Bookmarks/Lists, since that action doesn't apply everywhere cards are shown.

**Watched tracking has two different shapes on purpose.** Movies are a single boolean (`watched_movies` table). TV is tracked per episode (`watched_episodes`, one row per user/show/season/episode) because per-episode progress is the core feature — there's no cached progress counter; "X/Y watched" is always computed live by combining the local watched count with TMDB's `number_of_episodes`. `detail.js`'s season accordion lazy-loads episode lists per season and, when you mark an episode watched, offers a "catch up" prompt to bulk-mark every earlier unwatched episode across all prior seasons too.

**Bookmarks are still stored as a list under the hood** — the one `lists` row per user with `is_default = 1`, auto-created at signup — but is treated as a separate concept in the UI: `lists.js`'s `fetchLists()` filters out the default list, so it never appears on `lists.html`, and `bookmarks.html` is its own dedicated page (with movie/show items split into two separate `.media-container`s). It still shows up as a checkable option in the "Save to a list" popover (`media.js`'s `attachSaveButton`, which hits `GET /api/lists` directly and isn't filtered) since that's still how items get added to it. Don't add a parallel bookmarks table/API if extending this — the split is presentation-only.

**Ratings:** stored as an integer 1–10 (`ratings` table, one row per user/tmdb_id/media_type), but only ever displayed as a 5-star half-increment widget on the detail page (`star value = rating / 2`). Cards elsewhere (Home/Bookmarks/Lists/Profile) do not show a rating control at all — that was deliberately removed in favor of detail-page-only rating.

**`detail.html`/`detail.js` is the single content page for both movies and shows**, distinguished by a `?type=movie|tv&id=<tmdbId>` query string — there's no separate movie-detail vs show-detail template. TV-specific sections (seasons/episodes) are simply hidden/skipped when `type=movie`.

## Current scope

`movies.html`/`shows.html` are built: Popular/Coming Soon (movies) or Keep Watching (shows) + Recommended rows, plus a paginated, multi-genre-filterable "browse everything" grid (`GET /api/tmdb/discover/movie|tv`) that excludes anything already watched. `search.html` is the full paginated results page reachable by pressing Enter in any page's search bar (`search.js`), separate from the 8-item typeahead dropdown. `media-list.html?source=watched|favorites&type=movie|tv` is the "see all" page linked from Profile's truncated Watched/Favorite rows.
