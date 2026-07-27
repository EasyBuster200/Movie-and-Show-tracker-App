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

**Single Express process, no framework on the frontend.** `server/index.js` mounts the API under `/api/*` and serves `public/` as static files (`express.static`) — one origin, one port, no CORS, no separate dev server for the frontend. Pages are plain multi-page HTML (`main.html`, `bookmarks.html`, `lists.html`, `movies.html`, `shows.html`, `profile.html`, `detail.html`, `search.html`, `media-list.html`, `login.html`); there's no router or SPA framework, so navigation is real page loads. This is **Express 5** (not 4) — if you hit a routing quirk that looks like it should work per old Express docs/Stack Overflow answers, check whether it's an Express 5 breaking change first.

**Database:** SQLite via `better-sqlite3` (`server/db.js`), schema in `server/schema.sql` applied idempotently (`CREATE TABLE IF NOT EXISTS`) on every boot — no migration system. Sessions are also stored in SQLite via a hand-rolled `express-session` store (`server/sessionStore.js`), not JWT — deliberately, since frontend and API are same-origin.

**TMDB is the only source of media data, and only the server talks to it directly.** `server/tmdbClient.js` + `server/routes/tmdb.js` proxy TMDB under `/api/tmdb/*`, injecting the bearer token server-side so it never reaches the browser. The app stores TMDB `id` + `media_type` (`'movie'|'tv'`) as the identity for everything — titles/posters/genres/cast are always fetched fresh through the proxy, never cached in the DB. When adding a new TMDB-backed feature, extend the proxy rather than caching a copy locally.

**Auth gating is client-side-first, not route-blocked.** Static pages like `bookmarks.html` are not protected at the HTTP layer; each protected page's own script calls `requireLogin()` (from `auth.js`) on load and redirects to `login.html` if unauthenticated. The real enforcement is server-side: `server/index.js` mounts `requireAuth` middleware per API route group (`/api/lists`, `/api/watched`, `/api/ratings`, `/api/favorites`, `/api/stats`, `/api/recommendations`), so a page-level redirect flash is cosmetic, not a security gap. `/api/auth` and `/api/tmdb` are intentionally unauthenticated — trending/search/discover browsing works logged-out.

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

**There's a de facto "standard item shape" used everywhere media is passed around client-side**: `{ tmdbId, mediaType, title, year, releaseDate, posterPath, voteAverage }`. It's produced independently by `server/tmdbClient.js`'s `fetchMediaSummary` (and its fallback objects in `lists.js`/`watched.js`/`favorites.js`), and mirrored client-side by `media.js`'s `normalizeTmdbTrendingItem` and `detail.js`'s `toStandardItem` — four separate implementations of the same contract rather than one shared definition. If you touch one, check the others stay in sync. `releaseDate` specifically is what powers **unreleased-content gating**: `media.js`'s `attachWatchedButton` and `detail.js`'s `buildEpisodeCard` each independently disable the watched-toggle (and, for episodes, swap in "Coming Soon" placeholders) when `releaseDate`/`air_date` is missing or in the future — same pattern, implemented twice, not shared.

**Recommendations** (`server/routes/recommendations.js`, `GET /api/recommendations/:mediaType`) are seed-based, not a raw TMDB passthrough: it seeds from the user's 5 most-recently-touched watched/list items, fetches TMDB's `/recommendations` for each seed, merges and ranks by match count then popularity, and excludes anything already watched/listed or a seed itself. Powers the "Recommended" rows on `movies.html`/`shows.html`.

**"Keep Watching" and "Airing Soon" rely on a bounded new-episode heuristic**, not a webhook/polling system: `server/newEpisodes.js`'s `computeNewEpisodeSeasons` only checks seasons at or above the user's highest-watched season, comparing episode air dates against `lastWatchedAt`. This feeds the "new episode" dot on `shows.js`'s Keep Watching cards, the "New" labels in `detail.js`'s season accordion, and (via `GET /api/watched/shows/upcoming`) the Home page's "Airing Soon" row, which distinguishes a logged-out empty state from a logged-in-but-nothing-upcoming one via a 401 check.

**Two former duplication hotspots are now consolidated in `media.js`** — check there first before adding a new copy of either: `renderPagination(container, currentPage, totalPages, onPageChange)` is the shared windowed Prev/1…/current±2/…/Last/Next widget used by `movies.js`, `shows.js`, and `search-results.js`; `renderSearchResultRows(resultsEl, rawResults, onSelect)` is the shared poster+title+meta search-row renderer used by `search.js`'s typeahead dropdown and `lists.js`'s quick-add card (`onSelect` is what differs — navigate to the detail page vs. add to the list). `search-results.js`'s full grid still reuses `buildCard`/`attachStandardActions` directly rather than this row renderer, since it renders full cards, not compact rows.

Also: `server/routes/tmdb.js`'s `GET /movie/popular` and `GET /tv/popular` proxies have no remaining client caller — `movies.js`/`shows.js`'s "Popular" rows now use `discover/movie|tv?with_origin_country=<region>` (region guessed from `navigator.language` via `media.js`'s `getUserRegion()`) instead, to bias results toward the user's locale.

## Current scope

`movies.html`/`shows.html` are built: Popular/Coming Soon (movies) or Keep Watching (shows) + Recommended rows, plus a paginated, multi-genre-filterable "browse everything" grid (`GET /api/tmdb/discover/movie|tv`) that excludes anything already watched. `search.html` is the full paginated results page reachable by pressing Enter in any page's search bar (`search.js`), separate from the 8-item typeahead dropdown. `media-list.html?source=watched|favorites&type=movie|tv` is the "see all" page linked from Profile's truncated Watched/Favorite rows.
