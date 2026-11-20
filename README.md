# Watchlog

**A free, private movie and TV show tracker for Android.** Keep track of every movie you've
watched and every episode of every show, see what's airing next, and get a notification when a
new episode comes out. No account, no ads, no subscription.

When TV Time shut down on 15 July 2026, I lost the app I used every day to keep track of my
shows, so I built my own replacement. Watchlog started as a personal project (and a way to learn),
and I'm sharing it in case it's useful to anyone else who misses TV Time. It's built around three
ideas:

- **Your data stays on your phone.** There's no sign-up and no server. Your watch history is
  stored only on your device, and nobody else ever sees it.
- **Free forever.** There's nothing to host or pay for. Movie and show information comes from
  [TMDB](https://www.themoviedb.org/) (The Movie Database), using a free personal key that each
  person gets for themselves (it takes a few minutes, see [step 1](#1-get-your-free-tmdb-key)).
- **No lock-in.** You can back up all your data to a file at any time, and restore it on another
  phone.

<p align="center">
  <img src="docs/screenshots/home.png" width="180" alt="Home: Continue Watching, Airing Soon and trending shows">
  <img src="docs/screenshots/show.png" width="180" alt="A show's page, with progress per season">
  <img src="docs/screenshots/episodes.png" width="180" alt="A season's episodes, marked as watched">
  <img src="docs/screenshots/stats.png" width="180" alt="Stats page">
  <img src="docs/screenshots/settings.png" width="180" alt="Settings: theme, accent colour and notifications">
</p>

<p align="center">
  <a href="https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases/latest/download/Watchlog.apk"><b>⬇ Download the latest Watchlog.apk</b></a>
  · <a href="https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases">All versions</a>
</p>

---

## Contents

- [What it can do](#what-it-can-do)
- [Install it](#install-it)
  - [1. Get your free TMDB key](#1-get-your-free-tmdb-key)
  - [2. Install the app](#2-install-the-app)
  - [3. Create your profile](#3-create-your-profile)
- [How to use it](#how-to-use-it)
- [Settings](#settings)
- [Backups and moving to a new phone](#backups-and-moving-to-a-new-phone)
- [Updating the app](#updating-the-app)
- [Privacy](#privacy)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)
- [Credits and license](#credits-and-license)

---

## What it can do

- **Track movies and every episode of every show.** Mark a movie as watched with one tap. For
  shows, mark individual episodes; if you skip ahead, Watchlog offers to mark all the earlier
  episodes for you.
- **Continue Watching.** The shows you're in the middle of, right on the Home screen, with your
  progress and the next episode to watch.
- **Airing Soon, with a calendar.** Every announced upcoming episode of the shows you follow,
  day by day, with a strip of upcoming days on top so you can see what's coming at a glance.
- **Notifications.** A notification at 6 pm on the day a new episode of one of your shows comes
  out (it works even if you don't open the app for a while), a reminder when a movie on your
  Watchlist is released in your country, and an optional weekly recap every Sunday evening.
- **Knows when you've moved on.** Shows you're caught up on wait quietly until new episodes come
  out. A show you haven't touched for a month after new episodes came out counts as *dropped*
  and leaves Continue Watching. Your full list of watched shows can be filtered by Watching,
  Caught up, Completed and Dropped.
- **Stats.** Total watch time, hours watched per month, your top genres and actors, and how far
  along you are in every show.
- **Browse and discover.** Trending, popular (in your country), coming soon, and recommendations
  based on what you've watched, plus a full catalogue you can filter by genre and sort by
  popularity, rating or date. Search finds movies, shows and people; every actor has a page with
  their best-known titles and full filmography.
- **Watchlist, lists and favourites.** Save anything to your Watchlist for later, organise titles
  into your own lists, and mark favourites.
- **Make it yours.** Dark or light theme, seven accent colours, and titles and descriptions in
  your own language.
- **Several people on one phone.** Each person gets their own profile with completely separate
  data and settings.
- **Automatic weekly backups.** Every week your data is saved to a file on your phone, ready to
  restore if you ever reinstall or switch phones.

## Install it

Watchlog is an **Android** app (Android 5.1 or newer). There's no iPhone version.

Setting it up takes three steps: get a free TMDB key (about 5 minutes, once), install the app,
and create your profile.

### 1. Get your free TMDB key

Watchlog gets all its movie and show information from TMDB, and TMDB asks every app user to
have their own free key. Think of it as the app's "password" for talking to TMDB: you only
need it when you create your profile, and it's stored only on your phone.

1. **Create a free TMDB account** at [themoviedb.org/signup](https://www.themoviedb.org/signup),
   then open the confirmation email TMDB sends you and click the link in it.
2. **Log in** and go to [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
   (you can also get there from your profile picture → **Settings** → **API**).
3. **Request an API key.** Click the link to create or request one, choose the **Developer**
   option, and accept TMDB's terms of use.
4. **Fill in the short form.** TMDB asks what you'll use the key for and for some contact
   details. For example:
   - Type of use: **Personal**
   - Application name: **Watchlog**
   - Application URL: `https://github.com/EasyBuster200/Movie-and-Show-tracker-App`
   - Application summary: *"Personal movie and TV tracker app on my phone."*
5. **Copy your token.** Back on the [API settings page](https://www.themoviedb.org/settings/api)
   you'll see two codes. You need the long one called **API Read Access Token** (it starts with
   `eyJ` and is a few hundred characters long), **not** the short "API Key".

> **Tip:** Send the token to yourself (email, a note, or a password manager) so you can paste it
> on your phone. Keep it private, like a password. If it ever leaks, you can generate a new one
> on the same TMDB page.

### 2. Install the app

1. **On your Android phone**, open this page and tap
   **[Download the latest Watchlog.apk](https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases/latest/download/Watchlog.apk)**.
   (Your browser may warn that the file could be harmful. That's a standard warning for any app
   that doesn't come from the Play Store; tap **Download anyway**.)
2. **Open the downloaded file**, from the download notification or from your **Files** /
   **Downloads** app.
3. **Allow installing apps.** The first time, Android says your browser (or Files app) isn't
   allowed to install apps. Tap **Settings**, turn on **Allow from this source**, and go back.
4. **Tap Install.**
5. **If Google Play Protect shows a warning** ("unsafe app" or "app scan recommended"), that's
   because Watchlog isn't published on the Play Store. Tap **More details** → **Install anyway**
   (the wording differs a little between phones). Watchlog's full source code is in this
   repository for anyone to check.

When it's done, Watchlog appears in your app list.

### 3. Create your profile

1. Open **Watchlog** and tap **+ New profile**.
2. Enter your **name** and paste your **API Read Access Token** from step 1.
3. Tap **Create profile**. Watchlog checks the token with TMDB first, and tells you if something
   is wrong (for example if you pasted the short "API Key" by mistake).
4. Tap your new profile to start.
5. The first time, Android asks whether Watchlog may send you notifications. Tap **Allow** if
   you want them (you can turn each kind on or off later in [Settings](#settings)).

## How to use it

The bar at the bottom of the screen has six tabs: **Home**, **Watchlist**, **Lists**,
**Movies**, **Shows** and **Profile**.

### Find something

- **Search** with the search box at the top of **Home**, **Movies** and **Shows**. Results appear
  as you type; press Enter for the full results, where you can narrow them down to Shows, Movies
  or People.
- **Home** has *Continue Watching*, *Airing Soon*, and what's trending today.
- **Movies** and **Shows** have popular titles (in your country), recommendations based on what
  you've watched (and, for movies, *Coming Soon*). Every row has **See all** for the full list.
  At the bottom, **Browse All** lists everything: tap **Filter & sort** to pick genres and sort
  by Popular, Top rated or Newest.
- Tap any poster to open its page: description, cast, trailer, the TMDB rating, *More Like This*
  for movies, and the seasons for shows. Tap a cast member to see their page: their best-known
  titles and every movie and show they've been in, newest first.

### Track what you watch

Every poster has round buttons on it:

| Button | What it does |
| --- | --- |
| 👁 **Eye** (top right, movies) | Mark the movie as watched. Not available until it's released. |
| ♥ **Heart** (bottom left) | Add to your favourites. |
| 🔖 **Bookmark** (bottom right) | Save it to your Watchlist or one of your lists. It's filled in when the title is on your Watchlist. |

A filled-in button means it's on. The same buttons are on each title's own page.

**For shows,** open the show's page: under **Seasons** you'll see how many episodes of each
season you've watched. Tap a season to open its episodes, then tap the eye on an episode to mark
it watched. If earlier episodes aren't watched yet, Watchlog asks whether to mark those too,
which is handy when you're adding a show you're already halfway through. Episodes that haven't
aired yet can't be marked.

### Keep up with your shows

- **Continue Watching** (on **Home**) lists the shows you're in the middle of, with your progress
  and the next episode to watch. **Keep Watching** on the **Shows** tab shows the same shows as
  posters; a *New* label means a new episode has come out since you last watched.
- **Airing Soon** (on **Home**) shows the next episodes of the shows you follow. Tap **See all**
  for the full schedule: a strip of upcoming days on top (days with new episodes show how many;
  tap one to jump to it) and every announced episode listed below.
- **Notifications:** on the day a new episode airs, you get a notification at 6 pm. Tap it to
  open the show. Turn them on or off in [Settings](#settings).

How Watchlog sorts your shows:

| Status | Meaning |
| --- | --- |
| **Watching** | There are episodes out that you haven't watched yet. |
| **Caught up** | You've watched everything that's out, and more is coming. These shows wait in *Airing Soon* until the next episode is out. |
| **Completed** | The show has ended and you've watched all of it. |
| **Dropped** | New episodes have been out for over a month and you haven't watched any. It leaves *Continue Watching*, but still appears in *Airing Soon* and still notifies you. Watching an episode brings it back. |

To see all your shows by status, go to **Profile → Watched Shows → See all** and use the
filters at the top.

### Watchlist and lists

- **Watchlist** is your "watch later" pile: tap the bookmark on any poster and choose
  *Watchlist*. The Watchlist tab splits it into movies and shows, and has a search box to find
  something in it. Tap the **×** on a poster to remove it.
- **Lists** lets you make your own collections (e.g. "Christmas movies"). Tap **New list**, then
  add titles from any poster's bookmark button, or open the list and tap **Add a title**. To
  delete a list, open it and use the **⋯** button at the top.

### Your profile and stats

The **Profile** tab shows your stats and previews of your watched and favourite movies and shows
(tap **See all** on any of them for the full list, which you can sort by when you added it,
A–Z or rating). Tap **See all** next to *Stats* for the full stats page: hours watched each
month, your top genres and actors, and your progress in every show. The line under your name
shows when your data was last backed up.

The **⋯** button on your profile opens [Settings](#settings).

## Settings

Open **Settings** from the **⋯** button on the **Profile** tab. Everything here is saved for
your profile only, so each person on the phone can set it up their own way.

- **Your name and TMDB token:** tap the card at the top to change them.
- **Appearance:** *Dark*, *Light* or *Match device* (follows your phone's setting), and seven
  accent colours.
- **Notifications:**
  - **New episodes:** 6 pm on the day a new episode of a show you follow airs.
  - **Release reminders:** 6 pm on the day a movie on your Watchlist is released in your
    country (in cinemas, or to stream or buy if it isn't released in cinemas there).
  - **Weekly recap:** every Sunday at 7 pm, what you watched that week and how many new episodes
    are coming in the next one. Off unless you turn it on.
- **Library:**
  - **Region:** your country, used for *Popular* rows, release dates and release reminders.
    *Automatic* picks it from your phone's language settings.
  - **Language:** the language of titles, descriptions and episode names from TMDB. (Watchlog's
    own menus stay in English.) When TMDB has no translation, you see the English text.
- **Data & backup:** turn the weekly automatic backup on or off, **Back up now**, **Export
  data** and **Import data** (see [Backups](#backups-and-moving-to-a-new-phone)).
- **Account:**
  - **TMDB token:** change the token this profile uses.
  - **Switch profile:** go back to the profile list.
  - **Reset all data:** empties this profile's watched history, lists, Watchlist and favourites,
    but keeps the profile, its token and its settings. This can't be undone.
  - **Delete profile:** deletes this profile and all its data from the phone. This can't be
    undone.
- **About:** licences, and the version of Watchlog you have.

### Several people on one phone

Each person can have their own profile, with their own name, TMDB token, settings and completely
separate watch history. Use **Settings → Switch profile** to switch. Notifications follow
whichever profile is currently open.

## Backups and moving to a new phone

**Your data only exists on your phone.** If you uninstall Watchlog or lose your phone without a
backup, it's gone, so it's worth knowing how backups work.

- **Automatic weekly backup:** once a week, Watchlog saves a backup of each profile to the
  **Documents → Watchlog** folder on your phone (you can see it in your Files app). Only the
  newest one is kept. The weekly backup happens the next time you open the app after it's due;
  **Settings → Back up now** makes one immediately. You can turn it off in Settings.
- **Manual backup:** **Settings → Export data** lets you send a copy anywhere: Google Drive,
  email, another phone, and so on. It's a good idea to keep a copy somewhere other than your
  phone.
- **Backups never contain your TMDB token,** so they're safe to keep in the cloud. When you
  restore one, you'll be asked for your token again.

**To restore a backup** (on a new phone, or after reinstalling):

1. Install Watchlog (see [Install it](#install-it)) and put the backup file on the phone, for
   example by downloading it from Drive.
2. Open Watchlog. On the profile screen, tap **Import backup** and choose the file.
3. Paste your TMDB **API Read Access Token** and tap **Restore backup**.

Restoring always creates a new profile. It never overwrites one you already have. (If you
already have a profile, **Settings → Import data** restores a backup as another profile using
the same token.)

> **After reinstalling,** Android doesn't let the new install delete backup files made by the
> old one, so old files can pile up in **Documents → Watchlog**. Delete them yourself from the
> Files app whenever you like.

## Updating the app

When there's a new version, download the latest
**[Watchlog.apk](https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases/latest/download/Watchlog.apk)**
and install it the same way. It installs over the old version and **keeps all your data**. There's
no need to uninstall first. (Uninstalling deletes your data, so only do that after making a
backup.) You can see what changed in each version on the
[releases page](https://github.com/EasyBuster200/Movie-and-Show-tracker-App/releases), and which
version you have at the bottom of Settings.

## Privacy

- Watchlog has **no account and no server**. Everything you track is stored only on your phone.
- The only thing it connects to is **TMDB**, to get movie and show information and pictures,
  using your own token. Your watch history is never sent anywhere.
- There are **no ads, no analytics and no tracking** of any kind.
- Your TMDB token is stored only on your phone, inside the app, and is left out of every backup.

## Troubleshooting

**"TMDB rejected that key"**: make sure you copied the long **API Read Access Token**, all of
it, not the short "API Key". If Watchlog says it looks like the short API Key, go back to
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) and copy the long one.

**"Couldn't reach TMDB"** or pages say "Couldn't load…": check your internet connection.
Watchlog needs internet to fetch movie and show information (your own data is always available).

**I'm not getting notifications:**
- Check they're on in **Settings → Notifications**.
- Check Android allows them: **Settings → Apps → Watchlog → Notifications** (your phone's
  settings, not Watchlog's).
- Some phones stop apps from working in the background to save battery. If notifications don't
  arrive, set Watchlog's battery usage to **Unrestricted** in **Settings → Apps → Watchlog →
  Battery**.
- Episode notifications are only for shows where TMDB has announced the next episode's date.
  Check **Airing Soon** to see what's announced. Release reminders need TMDB to have a release
  date for your region (**Settings → Region**).

**Titles are in the wrong language**: set **Settings → Language**. Titles you saved before
changing it keep the language they were saved in.

**The app won't install over my current version**: this happens if the APK wasn't from this
page (it was signed differently). Make a backup, uninstall, install the version from here, and
restore the backup.

**Something else?** [Open an issue](https://github.com/EasyBuster200/Movie-and-Show-tracker-App/issues)
on GitHub.

## For developers

Building it yourself, how it works under the hood, tests and releasing are covered in
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.

## Credits and license

<a href="https://www.themoviedb.org/"><img src="public/images/tmdb-logo.svg" width="120" alt="TMDB logo"></a>

Movie and show information and images come from [TMDB](https://www.themoviedb.org/). This product
uses the TMDB API but is not endorsed, certified, or otherwise approved by TMDB.

Watchlog is not affiliated with TV Time or Whip Media. The Poppins typeface is used under the SIL
Open Font License; the full list of open-source software is in **Settings → Licences**.

License: ISC.
