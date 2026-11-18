const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280';
const PROFILE_BASE_URL = 'https://image.tmdb.org/t/p/w185';

function posterUrl(posterPath) {
  return posterPath ? IMAGE_BASE_URL + posterPath : 'https://via.placeholder.com/500x750?text=No+Image';
}

function backdropUrl(backdropPath) {
  return backdropPath ? BACKDROP_BASE_URL + backdropPath : null;
}

function profileUrl(profilePath) {
  return profilePath ? PROFILE_BASE_URL + profilePath : 'https://via.placeholder.com/185x278?text=No+Photo';
}

const STILL_BASE_URL = 'https://image.tmdb.org/t/p/w300';

function stillUrl(stillPath) {
  return stillPath ? STILL_BASE_URL + stillPath : 'https://via.placeholder.com/300x169?text=No+Image';
}

// Best-effort country guess from the browser's locale (e.g. "en-US" -> "US"), used to bias
// "Popular" rows toward content that originates from the user's region. Falls back to US
// when the locale has no region subtag (e.g. just "en").
function getUserRegion() {
  const locale = navigator.language || 'en-US';
  const region = locale.split('-')[1];
  return (region || 'US').toUpperCase();
}

// Prev/Next + a "Page X of Y" label, shared by every page with a paginated TMDB grid
// (Movies/Shows browse grids, search results, the person page's filmography). `onPageChange
// (page)` is called when Prev/Next is clicked; it's up to the caller to update its own page
// state and reload. Deliberately not per-number jump buttons (a previous version windowed
// Prev/1…current±2…Last/Next) - that could overflow a phone-width row once there were enough
// pages to need an ellipsis on both sides, wrapping Next onto its own line. Always exactly
// three elements here, so it always fits on one line with no wrapping and no scrolling needed,
// regardless of how many total pages exist.
function renderPagination(container, currentPage, totalPages, onPageChange) {
  container.innerHTML = '';
  if (!totalPages || totalPages <= 1) return;

  function pageButton(label, page, disabled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  }

  container.appendChild(pageButton('Prev', currentPage - 1, currentPage <= 1));

  const label = document.createElement('span');
  label.className = 'page-label';
  label.textContent = `Page ${currentPage} of ${totalPages}`;
  container.appendChild(label);

  container.appendChild(pageButton('Next', currentPage + 1, currentPage >= totalPages));
}

// Appends a trailing "+" tile to a horizontally-scrolling row (a `.media-container`) that,
// when clicked, fetches and appends the next page of the same paginated TMDB feed - removing
// itself once the feed runs out of pages. `fetchPage(page)` must resolve to a TMDB-shaped
// { results, page, total_pages } object. `renderItem(raw)` builds and returns the card for one
// result, or returns a falsy value to skip it (e.g. filtering out "person" entries). Returns a
// `loadNextPage` function the caller uses to kick off the first page itself, so the caller
// still controls what an empty/failed first load looks like.
// Shared by attachLoadMoreRow below and profile.js/shows.js's plain "View all" links - same
// card-sized tile, same icon+label content, whether it loads more inline or navigates away.
function moreBtnContentHtml(label) {
  return `
    <span class="more-btn-icon" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z"/></svg>
    </span>
    <span class="more-btn-label">${label}</span>
  `;
}

function attachLoadMoreRow(container, fetchPage, renderItem, { startPage = 1 } = {}) {
  let page = startPage;
  let loading = false;
  // Only the very first load gets skeleton placeholders - by the time the user clicks
  // "Load More" themselves, the row already has real cards on screen, so there's nothing
  // empty to mask.
  let firstLoad = true;

  const moreCard = document.createElement('div');
  moreCard.className = 'more-card';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'more-btn';
  button.setAttribute('aria-label', 'Load more');
  button.innerHTML = moreBtnContentHtml('Load More');
  moreCard.appendChild(button);
  container.appendChild(moreCard);

  // A `renderItem` that filters (returns falsy for some raw results - e.g. movies.js's
  // Coming Soon row skipping already-released titles) can hit a page where only a handful, or
  // even zero, of a page's ~20 raw results survive. Stopping as soon as *anything* got added
  // would still leave a filtered row looking sparse (2-3 cards) compared to a normal unfiltered
  // row's full page - so a single call here keeps pulling subsequent pages on its own until it's
  // accumulated a full page's worth, up to MAX_PAGES_PER_LOAD, instead of stopping at the first
  // non-empty one. Rows with no filtering (the common case) always fill this on the first page,
  // so this loop never runs more than once for them.
  const TARGET_ITEMS_PER_LOAD = 20;
  const MAX_PAGES_PER_LOAD = 10;

  async function loadNextPage() {
    if (loading) return;
    loading = true;
    button.disabled = true;

    const skeletons = firstLoad
      ? Array.from({ length: SKELETON_ROW_COUNT }, () => {
          const skeleton = buildSkeletonCard();
          container.insertBefore(skeleton, moreCard);
          return skeleton;
        })
      : [];

    try {
      let added = 0;
      for (let attempts = 0; attempts < MAX_PAGES_PER_LOAD && added < TARGET_ITEMS_PER_LOAD; attempts++) {
        const data = await fetchPage(page);
        (data.results || []).forEach(raw => {
          const card = renderItem(raw);
          if (card) {
            // Swap a still-pending skeleton for the real card in place, so cards don't jump
            // around mid-row as results trickle in - only overflow to appending once every
            // skeleton has been claimed.
            const skeleton = skeletons.shift();
            if (skeleton) container.replaceChild(card, skeleton);
            else container.insertBefore(card, moreCard);
            added += 1;
          }
        });
        const totalPages = data.total_pages || page;
        if (page >= totalPages) {
          moreCard.remove();
          break;
        }
        page += 1;
      }
    } catch (error) {
      console.error('Failed to load more:', error);
      if (!container.querySelector('.card:not(.skeleton)')) {
        container.innerHTML = '<p>Failed to load.</p>';
      }
    } finally {
      skeletons.forEach(skeleton => skeleton.remove());
      loading = false;
      button.disabled = false;
      firstLoad = false;
    }
  }

  button.addEventListener('click', loadNextPage);
  return loadNextPage;
}

const SKELETON_ROW_COUNT = 8;

// A placeholder shaped exactly like a real .card (same .card-poster/.card-info structure, so
// it takes up the same layout space and can't cause a reflow when swapped for the real thing)
// with shimmering blocks instead of real content, and no click handler since there's nothing to
// open yet. Used everywhere a row/grid is about to wait on a network fetch, so the row's shape
// appears immediately instead of the space looking empty/broken until data arrives.
function buildSkeletonCard() {
  const card = document.createElement('div');
  card.className = 'card skeleton';

  const posterWrap = document.createElement('div');
  posterWrap.className = 'card-poster skeleton-shimmer';
  card.appendChild(posterWrap);

  const info = document.createElement('div');
  info.className = 'card-info';

  const meta = document.createElement('p');
  meta.className = 'card-meta skeleton-line skeleton-shimmer';
  info.appendChild(meta);

  const title = document.createElement('h3');
  title.className = 'card-title skeleton-line skeleton-shimmer';
  info.appendChild(title);

  card.appendChild(info);
  return card;
}

// Fills `container` with placeholder cards ahead of a fetch that's about to replace its
// contents wholesale (the common case: the caller already does `container.innerHTML = ''` once
// real data arrives, which clears these back out). Not used by attachLoadMoreRow's own first
// load below, which replaces skeletons in place one at a time as results arrive instead, so
// cards don't jump around mid-row.
function renderSkeletonRow(container, count = SKELETON_ROW_COUNT) {
  for (let i = 0; i < count; i++) {
    container.appendChild(buildSkeletonCard());
  }
}

function detailUrl(item) {
  return `detail.html?type=${item.mediaType}&id=${item.tmdbId}`;
}

function personUrl(item) {
  return `person.html?id=${item.tmdbId}`;
}

// Normalizes a raw TMDB person search/credit result. Deliberately not folded into the
// standard item shape (tmdbId/mediaType/title/year/releaseDate/posterPath/voteAverage) used
// for movies/shows - a person has none of releaseDate/voteAverage, and its image is a profile
// photo (profile_path), not a poster - forcing it into that shape would just mean every reader
// has to know which fields are actually meaningless for a `mediaType: 'person'` item.
function normalizeTmdbPerson(raw) {
  return {
    tmdbId: raw.id,
    mediaType: 'person',
    name: raw.name || 'Unknown',
    profilePath: raw.profile_path,
    knownForDepartment: raw.known_for_department || null,
  };
}

// Renders TMDB search-multi results into `resultsEl` as compact poster+title+meta rows,
// shared by the typeahead dropdown (search.js) and the Lists quick-add card (lists.js).
// `onSelect(item)` is called on row click — callers decide what a click means (navigate to
// the detail/person page, add to a list, etc); this function only owns rendering, not
// `.hidden` toggling, since that's presentational and differs per caller. `includePersons`
// defaults off since a list only ever holds movies/shows - only the global search bar
// (search.js) opts in.
function renderSearchResultRows(resultsEl, rawResults, onSelect, { includePersons = false } = {}) {
  const items = rawResults
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv' || (includePersons && r.media_type === 'person'))
    .slice(0, 8)
    .map(r => (r.media_type === 'person' ? normalizeTmdbPerson(r) : toStandardItem(r)));

  resultsEl.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'No results found.';
    resultsEl.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const isPerson = item.mediaType === 'person';
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const img = document.createElement('img');
    img.src = isPerson ? profileUrl(item.profilePath) : posterUrl(item.posterPath);
    img.alt = isPerson ? item.name : item.title;
    row.appendChild(img);

    const info = document.createElement('div');
    info.className = 'search-result-info';

    const title = document.createElement('p');
    title.className = 'search-result-title';
    title.textContent = isPerson ? item.name : item.title;
    info.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'search-result-meta';
    meta.textContent = isPerson
      ? (item.knownForDepartment || 'Person')
      : `${item.year || 'N/A'} • ${item.mediaType === 'movie' ? 'Movie' : 'TV Show'}`;
    info.appendChild(meta);

    row.appendChild(info);
    row.addEventListener('click', () => onSelect(item));
    resultsEl.appendChild(row);
  });
}

// A person's card for the search results grid - visually like .card, but a profile photo and
// department instead of a poster/year/rating, no save/favorite/watched overlay (those are
// movie/show-only concepts), and links to the person page instead of detail.html.
function buildPersonCard(person) {
  const card = document.createElement('div');
  card.className = 'card';

  const posterWrap = document.createElement('div');
  posterWrap.className = 'card-poster';

  const img = document.createElement('img');
  img.src = profileUrl(person.profilePath);
  img.alt = person.name;
  posterWrap.appendChild(img);
  card.appendChild(posterWrap);

  const info = document.createElement('div');
  info.className = 'card-info';

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = person.knownForDepartment || 'Person';
  info.appendChild(meta);

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = person.name;
  info.appendChild(title);

  card.appendChild(info);

  card.addEventListener('click', () => {
    window.location.href = personUrl(person);
  });

  return card;
}

function formatRating(voteAverage) {
  if (voteAverage === null || voteAverage === undefined) return 'N/A';
  const rating = Number(voteAverage);
  return (rating - Math.floor(rating)) === 0 ? rating : rating.toFixed(1);
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const posterWrap = document.createElement('div');
  posterWrap.className = 'card-poster';

  const img = document.createElement('img');
  img.src = posterUrl(item.posterPath);
  img.alt = item.title;
  posterWrap.appendChild(img);

  const overlayActions = document.createElement('div');
  overlayActions.className = 'card-overlay-actions';
  posterWrap.appendChild(overlayActions);

  card.appendChild(posterWrap);

  const info = document.createElement('div');
  info.className = 'card-info';

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = `${item.year || 'N/A'} • ${formatRating(item.voteAverage)}/10`;
  info.appendChild(meta);

  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = item.title;
  info.appendChild(title);

  card.appendChild(info);
  card.overlayActionsEl = overlayActions;
  card.infoEl = info;

  card.addEventListener('click', () => {
    window.location.href = detailUrl(item);
  });

  return card;
}

function closeExistingPopover() {
  const existing = document.querySelector('.save-popover');
  if (existing) existing.remove();
}

function bookmarkIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M200-120v-640q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v640L480-240 200-120Z"/></svg>';
}

async function attachSaveButton(actionsEl, item) {
  const button = document.createElement('button');
  button.className = 'card-action save-btn card-action-br';
  button.type = 'button';
  button.title = 'Save to a list';
  button.innerHTML = bookmarkIconSvg();
  actionsEl.appendChild(button);

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'profile-picker.html';
      return;
    }

    if (button.classList.contains('open')) {
      closeExistingPopover();
      button.classList.remove('open');
      return;
    }

    closeExistingPopover();
    button.classList.add('open');

    const [lists, membership] = await Promise.all([
      fetch('/api/lists', { credentials: 'same-origin' }).then(r => r.json()),
      fetch(`/api/lists/membership/${item.mediaType}/${item.tmdbId}`, { credentials: 'same-origin' }).then(r => r.json()),
    ]);

    const popover = document.createElement('div');
    popover.className = 'save-popover';
    popover.addEventListener('click', event => event.stopPropagation());

    lists.forEach(list => {
      const row = document.createElement('label');
      row.className = 'save-popover-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = membership.listIds.includes(list.id);
      checkbox.addEventListener('change', async () => {
        const url = `/api/lists/${list.id}/items/${item.tmdbId}/${item.mediaType}`;
        if (checkbox.checked) {
          await fetch(`/api/lists/${list.id}/items`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tmdbId: item.tmdbId, mediaType: item.mediaType }),
          });
        } else {
          await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        }
      });

      const span = document.createElement('span');
      span.textContent = list.name;

      row.appendChild(checkbox);
      row.appendChild(span);
      popover.appendChild(row);
    });

    button.parentElement.appendChild(popover);

    document.addEventListener('click', function outsideClick(e) {
      if (!popover.contains(e.target) && e.target !== button) {
        closeExistingPopover();
        button.classList.remove('open');
        document.removeEventListener('click', outsideClick);
      }
    });
  });
}

function closeIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M256-200 200-256l224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>';
}

// Removing only makes sense on list-management pages, so it isn't part of
// attachStandardActions — but it lives in the same overlay corner slot (top-left, unused
// by save/favorite/watched) so it reads as part of the same action language, not a bolted-on
// footer button.
function attachRemoveButton(card, item, listId, onRemoved) {
  const button = document.createElement('button');
  button.className = 'card-action remove-btn card-action-tl';
  button.type = 'button';
  button.title = 'Remove from this list';
  button.innerHTML = closeIconSvg();

  button.addEventListener('click', async event => {
    event.stopPropagation();
    await fetch(`/api/lists/${listId}/items/${item.tmdbId}/${item.mediaType}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    onRemoved();
  });

  card.overlayActionsEl.appendChild(button);
}

function eyeIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-320q75 0 127.5-52.5T660-500q0-75-52.5-127.5T480-680q-75 0-127.5 52.5T300-500q0 75 52.5 127.5T480-320Zm0-72q-45 0-76.5-31.5T372-500q0-45 31.5-76.5T480-608q45 0 76.5 31.5T588-500q0 45-31.5 76.5T480-392Zm0 192q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm0-300Zm0 220q113 0 207.5-59.5T832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280Z"/></svg>';
}

// Movies are watched as a single unit. `watchedMovieIds` is a Set fetched once per page
// so every card's initial state is known without a fetch per card. `onChange`, if given,
// is called after a successful toggle so pages showing "your watched items" can refresh.
function attachWatchedButton(actionsEl, item, watchedMovieIds, onChange) {
  const button = document.createElement('button');
  button.className = 'card-action watched-btn card-action-tr';
  button.type = 'button';
  button.innerHTML = eyeIconSvg();

  const unreleased = isUnreleased(item.releaseDate);
  if (unreleased) {
    button.disabled = true;
    button.title = 'Not yet released';
    actionsEl.appendChild(button);
    return;
  }
  button.title = 'Mark as watched';

  const syncVisual = () => button.classList.toggle('active', watchedMovieIds.has(item.tmdbId));
  syncVisual();

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'profile-picker.html';
      return;
    }

    const alreadyWatched = watchedMovieIds.has(item.tmdbId);
    const url = `/api/watched/movies/${item.tmdbId}`;
    if (alreadyWatched) {
      await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      watchedMovieIds.delete(item.tmdbId);
    } else {
      // Sends the display fields the caller already has in hand (title/poster/etc) so
      // localApi.js can store them alongside the id - the Profile page's watched-movies
      // preview can then render straight from IndexedDB instead of re-fetching TMDB per item.
      await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickSummaryFields(item)),
      });
      watchedMovieIds.add(item.tmdbId);
    }
    syncVisual();
    if (onChange) onChange();
  });

  actionsEl.appendChild(button);
}

function favoriteKey(item) {
  return `${item.mediaType}:${item.tmdbId}`;
}

// Fetches the current user's watched-movie ids and favorite ids once per page,
// so every card's initial button state is known without a fetch per card.
async function fetchStandardActionContext() {
  const user = await getCurrentUser();
  if (!user) {
    return { watchedMovieIds: new Set(), favoriteIds: new Set() };
  }

  const [watchedMovies, favoriteIdsByType] = await Promise.all([
    fetch('/api/watched/movies', { credentials: 'same-origin' }).then(r => r.json()),
    fetch('/api/favorites/ids', { credentials: 'same-origin' }).then(r => r.json()),
  ]);

  const favoriteIds = new Set([
    ...favoriteIdsByType.movie.map(id => `movie:${id}`),
    ...favoriteIdsByType.tv.map(id => `tv:${id}`),
  ]);

  return { watchedMovieIds: new Set(watchedMovies), favoriteIds };
}

function heartIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M480-120 240-296q-99-72-159.5-142.5T20-580q0-90 61-150t149-60q56 0 105 26.5t105 79.5q56-53 105-79.5T650-790q88 0 149 60t61 150q0 79-60.5 149.5T740-296L480-120Z"/></svg>';
}

function attachFavoriteButton(actionsEl, item, favoriteIds, onChange) {
  const button = document.createElement('button');
  button.className = 'card-action favorite-btn card-action-bl';
  button.type = 'button';
  button.title = 'Favorite';
  button.innerHTML = heartIconSvg();

  const key = favoriteKey(item);
  const syncVisual = () => button.classList.toggle('active', favoriteIds.has(key));
  syncVisual();

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'profile-picker.html';
      return;
    }

    const isFavorite = favoriteIds.has(key);
    const url = `/api/favorites/${item.mediaType}/${item.tmdbId}`;
    if (isFavorite) {
      await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      favoriteIds.delete(key);
    } else {
      await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pickSummaryFields(item)),
      });
      favoriteIds.add(key);
    }
    syncVisual();
    if (onChange) onChange();
  });

  actionsEl.appendChild(button);
}

// Attaches the standard set of card actions (save, favorite, watched) used consistently
// across Home, Bookmarks, Lists, and Profile. Shows don't get a quick watched toggle here —
// per-episode tracking lives on the detail page (click the card to open it). Rating lives
// only on the detail page as a star widget, not here. `onChange`, if given, fires after any
// toggle so a page showing "your watched/favorited items" can refresh itself.
function attachStandardActions(card, item, context, { includeSave = true, onChange } = {}) {
  if (includeSave) attachSaveButton(card.overlayActionsEl, item);
  attachFavoriteButton(card.overlayActionsEl, item, context.favoriteIds, onChange);
  if (item.mediaType === 'movie') {
    attachWatchedButton(card.overlayActionsEl, item, context.watchedMovieIds, onChange);
  }
}

function formatWatchTime(totalMinutes) {
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours >= 24) {
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `${days}D ${hours}h`;
  }
  const minutes = totalMinutes % 60;
  return `${totalHours}h ${minutes}m`;
}

// Summary stat tiles from GET /api/stats - the Profile page's Stats box and the top of stats.html.
function renderStatTiles(grid, stats) {
  grid.innerHTML = '';

  const tiles = [
    { label: 'Movies Watched', value: stats.moviesWatched },
    { label: 'Shows Tracked', value: stats.showsTracked },
    { label: 'Episodes Watched', value: stats.episodesWatched },
    { label: 'Total Watch Time', value: formatWatchTime(stats.totalWatchMinutes) },
    { label: 'Favorites', value: stats.favorites },
    { label: 'Avg Rating Given', value: stats.averageRating != null ? `${stats.averageRating}/10` : '—' },
  ];

  tiles.forEach(tile => {
    const tileEl = document.createElement('div');
    tileEl.className = 'stat-tile';

    const valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = tile.value;

    const labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = tile.label;

    tileEl.appendChild(valueEl);
    tileEl.appendChild(labelEl);
    grid.appendChild(tileEl);
  });
}
