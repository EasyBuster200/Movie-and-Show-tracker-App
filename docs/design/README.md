# TV Tracker

The design system for TV Tracker, a mobile app for following movies and TV shows: what's trending, what you've watched, what's next, and how much time you've spent watching. It's built from screenshots of the current app (home, show detail, episodes and stats screens) and keeps that look: a near-black, poster-first interface with one burgundy accent, rgb(102, 0, 51).

## Content fundamentals

- **Voice:** short, plain and a little warm. Say what happened or what's next: "4/9 watched", "Next: Chapter Five", "Up to date".
- **Case:** Title Case for section headers ("Trending Shows", "Top Genres"); sentence case for everything else.
- **Numbers do the talking.** Counts read as `watched/total` ("29/42 episodes watched"), dates as `27 May 2022`, runtimes as `79m`, total time as `5D 14h`, ratings as `8.0/10`. Separate meta items with ` • `.
- **No emoji.** Icons carry meaning; words carry the rest.

## Visual foundations

- **Dark first.** Screens sit on `bg-page`. Grouped content sits on `bg-card` with a 1px `border-subtle` outline; `bg-surface` is for the bottom navigation bar only. Depth comes from these three steps, not from shadows (only posters get `shadow-poster`).
- **One accent.** Burgundy marks what's active or done. Solid fills (primary buttons, selected chips) use `accent`, the exact brand burgundy with white text. Thin marks drawn straight on the dark page (the active nav icon, progress bars, chart bars) use `accent-mark`, a brighter raspberry from the same family, because `#660033` alone reads faintly on near-black; in the light theme `accent-mark` is the brand burgundy itself. Toggles on artwork (watched, bookmark, favourite) never fill their circle: they keep the `scrim` backing and fill the icon in `accent-text`, the same for watched, bookmark and favourite. When the accent is text (stat values, "Show more", links) use `accent-text`, which is readable at small sizes. Never introduce a second brand hue; `rating` (gold) is only for stars.
- **Poster-first.** Artwork is the colour in the app. Posters are 2:3, `radius-md`, edge to edge with no frame. Icons over artwork sit on a round `scrim` backing so they read on any image.
- **Type:** Poppins throughout (Google Fonts, weights 400/500/600). One `screen-title` per screen, `section-title` for each section, `card-title` + `meta` inside cards.
- **Layout:** 16px (`space-4`) side padding, 24px (`space-6`) between sections, 8px (`space-2`) between rows and tiles, 12px (`space-3`) inside cards. Carousels scroll horizontally and bleed off the right edge.
- **Corners:** `radius-md` (10px) on almost everything, `radius-lg` on episode cards, `radius-pill` for round icon buttons and bars.
- **Motion:** 150ms ease-out on hover/press colour changes; nothing bounces.

## Themes and accent palettes

Two themes, **Dark** (the default) and **Light**, set with `data-theme="dark"` / `data-theme="light"` on the root. Light swaps the neutrals (page, cards, borders, text, scrim), deepens the status colours and the rating gold, and uses each palette's deeper `-text` tone so it stays readable on white.

Seven accent palettes are available, each with six tokens and a value per theme: `burgundy` (active), `indigo`, `ocean`, `teal`, `coral`, `magenta`, `amber`.

| Token | Role |
| --- | --- |
| `<palette>` | Fills: primary buttons, selected chips, active nav, chart bars |
| `<palette>-hover` | Hover state of fills |
| `<palette>-text` | Accent as text or filled icon: links, stat values, card toggles |
| `<palette>-subtle` | Tinted grounds: selected rows, icon tiles |
| `<palette>-on` | Text and icons on the fill (white, or dark for teal/coral/amber on dark and amber on light) |
| `<palette>-mark` | Thin marks drawn straight on the page: active nav icon, progress, chart bars. Same as the fill except burgundy on dark (`#de4a6f`) |

Components never use a palette directly: they read `accent`, `accent-hover`, `accent-text`, `accent-subtle`, `on-accent` and `accent-mark`, which point at the active palette (burgundy). To switch the whole app to another accent, repoint those six tokens (e.g. `accent` → `{teal}`, `accent-mark` → `{teal-mark}`). Avoid `amber` if star ratings matter on a screen: it sits close to `rating`.

## Iconography

Line icons, 24px grid, 1.8px stroke, round caps and joins, no fills. Inactive icons use `text-muted`; the active one uses `accent-mark`. The set (exported as `Icon`): home, bookmark, folder, film, tv, user, eye, heart, search, back, check, star, chevron, play, more, cloud, close, plus. The current app's icon source wasn't available, so these are drawn to match its look; swap in the real files when you have them.

## Components

`Icon`, `Button`, `BackButton`, `SearchField`, `SectionHeader`, `PosterArt`, `PosterCard`, `MediaRow`, `AiringRow`, `CastCard`, `Chip`, `Switch`, `ProgressBar`, `SeasonRow`, `EpisodeCard`, `StatTile`, `BottomNav`. Each reads only tokens, so restyling the tokens restyles the app. Every show or movie artwork, at any size, is `PosterArt` (inside `PosterCard`, `MediaRow` and the show header), so posters look the same everywhere. Every screen below the top level uses `BackButton` at its top-left. Pass real poster/still URLs through `image`; without one, cards show a `bg-raised` placeholder with the title's initials.

## What's not here yet

Charts (the watch-time bar chart and genre bars are drawn in screens with `accent` bars on `bg-card`), sheets/dialogs and toasts. Exact hex values were sampled from screenshots, so compare them with the app's code and correct any that drifted.