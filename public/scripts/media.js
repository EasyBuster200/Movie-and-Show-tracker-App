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

// Windowed Prev/1…current±2…Last/Next pagination, shared by every page with a paginated
// TMDB grid (Movies/Shows browse grids, search results). `onPageChange(page)` is called when
// a page button is clicked; it's up to the caller to update its own page state and reload.
function renderPagination(container, currentPage, totalPages, onPageChange) {
  container.innerHTML = '';
  if (!totalPages || totalPages <= 1) return;

  function pageButton(label, page, { disabled = false, active = false } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'page-btn';
    if (active) btn.classList.add('active');
    btn.textContent = label;
    btn.disabled = disabled;
    if (!disabled) {
      btn.addEventListener('click', () => onPageChange(page));
    }
    return btn;
  }

  function ellipsis() {
    const span = document.createElement('span');
    span.className = 'page-ellipsis';
    span.textContent = '…';
    return span;
  }

  container.appendChild(pageButton('Prev', currentPage - 1, { disabled: currentPage <= 1 }));

  const windowStart = Math.max(1, currentPage - 2);
  const windowEnd = Math.min(totalPages, currentPage + 2);

  if (windowStart > 1) {
    container.appendChild(pageButton('1', 1));
    if (windowStart > 2) container.appendChild(ellipsis());
  }

  for (let page = windowStart; page <= windowEnd; page++) {
    container.appendChild(pageButton(String(page), page, { active: page === currentPage }));
  }

  if (windowEnd < totalPages) {
    if (windowEnd < totalPages - 1) container.appendChild(ellipsis());
    container.appendChild(pageButton(String(totalPages), totalPages));
  }

  container.appendChild(pageButton('Next', currentPage + 1, { disabled: currentPage >= totalPages }));
}

function detailUrl(item) {
  return `detail.html?type=${item.mediaType}&id=${item.tmdbId}`;
}

// Renders TMDB search-multi results into `resultsEl` as compact poster+title+meta rows,
// shared by the typeahead dropdown (search.js) and the Lists quick-add card (lists.js).
// `onSelect(item)` is called on row click — callers decide what a click means (navigate to
// the detail page, add to a list, etc); this function only owns rendering, not `.hidden`
// toggling, since that's presentational and differs per caller.
function renderSearchResultRows(resultsEl, rawResults, onSelect) {
  const items = rawResults
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .slice(0, 8)
    .map(normalizeTmdbTrendingItem);

  resultsEl.innerHTML = '';

  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'search-empty';
    empty.textContent = 'No results found.';
    resultsEl.appendChild(empty);
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'search-result-row';

    const img = document.createElement('img');
    img.src = posterUrl(item.posterPath);
    img.alt = item.title;
    row.appendChild(img);

    const info = document.createElement('div');
    info.className = 'search-result-info';

    const title = document.createElement('p');
    title.className = 'search-result-title';
    title.textContent = item.title;
    info.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'search-result-meta';
    meta.textContent = `${item.year || 'N/A'} • ${item.mediaType === 'movie' ? 'Movie' : 'TV Show'}`;
    info.appendChild(meta);

    row.appendChild(info);
    row.addEventListener('click', () => onSelect(item));
    resultsEl.appendChild(row);
  });
}

function formatRating(voteAverage) {
  if (voteAverage === null || voteAverage === undefined) return 'N/A';
  const rating = Number(voteAverage);
  return (rating - Math.floor(rating)) === 0 ? rating : rating.toFixed(1);
}

// Normalizes a raw TMDB trending-endpoint item into the common shape used across pages.
function normalizeTmdbTrendingItem(raw) {
  const releaseDate = raw.release_date || raw.first_air_date || null;
  return {
    tmdbId: raw.id,
    mediaType: raw.media_type === 'movie' ? 'movie' : 'tv',
    title: raw.title || raw.name || 'Untitled',
    year: releaseDate ? releaseDate.split('-')[0] : null,
    releaseDate,
    posterPath: raw.poster_path,
    voteAverage: raw.vote_average,
  };
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

  const isUnreleased = !item.releaseDate || new Date(item.releaseDate) > new Date();
  if (isUnreleased) {
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
      await fetch(url, { method: 'POST', credentials: 'same-origin' });
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
      await fetch(url, { method: 'POST', credentials: 'same-origin' });
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
