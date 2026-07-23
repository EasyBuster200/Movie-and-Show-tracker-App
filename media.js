const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

function posterUrl(posterPath) {
  return posterPath ? IMAGE_BASE_URL + posterPath : 'https://via.placeholder.com/500x750?text=No+Image';
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
    posterPath: raw.poster_path,
    voteAverage: raw.vote_average,
  };
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card';

  const img = document.createElement('img');
  img.src = posterUrl(item.posterPath);
  img.alt = item.title;
  card.appendChild(img);

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

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  info.appendChild(actions);

  card.appendChild(info);
  card.actionsEl = actions;
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
  button.className = 'card-action save-btn';
  button.type = 'button';
  button.title = 'Save to a list';
  button.innerHTML = bookmarkIconSvg();
  actionsEl.appendChild(button);

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
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

function attachRemoveButton(actionsEl, item, listId, onRemoved) {
  const button = document.createElement('button');
  button.className = 'card-action remove-btn';
  button.type = 'button';
  button.title = 'Remove from this list';
  button.textContent = '✕';

  button.addEventListener('click', async event => {
    event.stopPropagation();
    await fetch(`/api/lists/${listId}/items/${item.tmdbId}/${item.mediaType}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    onRemoved();
  });

  actionsEl.appendChild(button);
}

function checkIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';
}

// Movies are watched as a single unit. `watchedMovieIds` is a Set fetched once per page
// so every card's initial state is known without a fetch per card.
function attachWatchedButton(actionsEl, item, watchedMovieIds) {
  const button = document.createElement('button');
  button.className = 'card-action watched-btn';
  button.type = 'button';
  button.title = 'Mark as watched';
  button.innerHTML = checkIconSvg();

  const syncVisual = () => button.classList.toggle('active', watchedMovieIds.has(item.tmdbId));
  syncVisual();

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
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
  });

  actionsEl.appendChild(button);
}

function tvIconSvg() {
  return '<svg xmlns="http://www.w3.org/2000/svg" height="18px" viewBox="0 -960 960 960" width="18px" fill="currentColor"><path d="M320-120v-80H160q-33 0-56.5-23.5T80-280v-480q0-33 23.5-56.5T160-840h640q33 0 56.5 23.5T880-760v480q0 33-23.5 56.5T800-200H640v80H320ZM160-280h640v-480H160v480Z"/></svg>';
}

function closeEpisodeModal() {
  const existing = document.querySelector('.episode-modal-overlay');
  if (existing) existing.remove();
}

async function openEpisodeModal(item) {
  closeEpisodeModal();

  const overlay = document.createElement('div');
  overlay.className = 'episode-modal-overlay';
  overlay.addEventListener('click', event => {
    if (event.target === overlay) closeEpisodeModal();
  });

  const modal = document.createElement('div');
  modal.className = 'episode-modal';

  const header = document.createElement('div');
  header.className = 'episode-modal-header';
  const heading = document.createElement('h3');
  heading.textContent = item.title;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'card-action close-modal-btn';
  closeBtn.textContent = '✕';
  header.appendChild(heading);
  header.appendChild(closeBtn);

  const progressEl = document.createElement('p');
  progressEl.className = 'episode-progress';
  progressEl.textContent = 'Loading progress…';

  const seasonTabsEl = document.createElement('div');
  seasonTabsEl.className = 'season-tabs';

  const episodeListEl = document.createElement('div');
  episodeListEl.className = 'episode-list';
  episodeListEl.textContent = 'Loading episodes…';

  modal.appendChild(header);
  modal.appendChild(progressEl);
  modal.appendChild(seasonTabsEl);
  modal.appendChild(episodeListEl);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  closeBtn.addEventListener('click', closeEpisodeModal);

  async function refreshProgress() {
    const progress = await fetch(`/api/watched/shows/${item.tmdbId}/progress`, { credentials: 'same-origin' }).then(r => r.json());
    progressEl.textContent = progress.total != null
      ? `${progress.watched}/${progress.total} episodes watched`
      : `${progress.watched} episodes watched`;
  }

  async function loadSeason(seasonNumber) {
    seasonTabsEl.querySelectorAll('.season-tab').forEach(tab => {
      tab.classList.toggle('active', Number(tab.dataset.season) === seasonNumber);
    });

    episodeListEl.textContent = 'Loading episodes…';
    const [season, watchedEpisodes] = await Promise.all([
      fetch(`/api/tmdb/tv/${item.tmdbId}/season/${seasonNumber}`, { credentials: 'same-origin' }).then(r => r.json()),
      fetch(`/api/watched/shows/${item.tmdbId}/episodes`, { credentials: 'same-origin' }).then(r => r.json()),
    ]);

    const watchedSet = new Set(watchedEpisodes.filter(e => e.seasonNumber === seasonNumber).map(e => e.episodeNumber));

    episodeListEl.innerHTML = '';
    (season.episodes || []).forEach(episode => {
      const row = document.createElement('label');
      row.className = 'episode-row';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = watchedSet.has(episode.episode_number);
      checkbox.addEventListener('change', async () => {
        const url = `/api/watched/shows/${item.tmdbId}/season/${seasonNumber}/episode/${episode.episode_number}`;
        await fetch(url, { method: checkbox.checked ? 'POST' : 'DELETE', credentials: 'same-origin' });
        refreshProgress();
      });

      const span = document.createElement('span');
      span.textContent = `${episode.episode_number}. ${episode.name}`;

      row.appendChild(checkbox);
      row.appendChild(span);
      episodeListEl.appendChild(row);
    });
  }

  refreshProgress();

  const show = await fetch(`/api/tmdb/tv/${item.tmdbId}`, { credentials: 'same-origin' }).then(r => r.json());
  const seasons = (show.seasons || []).filter(s => s.season_number > 0);

  seasonTabsEl.innerHTML = '';
  seasons.forEach(season => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'season-tab';
    tab.dataset.season = season.season_number;
    tab.textContent = `S${season.season_number}`;
    tab.addEventListener('click', () => loadSeason(season.season_number));
    seasonTabsEl.appendChild(tab);
  });

  if (seasons.length > 0) loadSeason(seasons[0].season_number);
  else episodeListEl.textContent = 'No episode data available.';
}

async function attachRatingControl(actionsEl, item) {
  const select = document.createElement('select');
  select.className = 'card-action rating-select';
  select.title = 'Rate';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Rate…';
  select.appendChild(placeholder);

  for (let i = 1; i <= 10; i++) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i}/10`;
    select.appendChild(option);
  }

  actionsEl.appendChild(select);

  const user = await getCurrentUser();
  if (user) {
    const current = await fetch(`/api/ratings/${item.mediaType}/${item.tmdbId}`, { credentials: 'same-origin' }).then(r => r.json());
    if (current.rating) select.value = String(current.rating);
  }

  select.addEventListener('click', event => event.stopPropagation());
  select.addEventListener('change', async () => {
    const loggedInUser = await getCurrentUser();
    if (!loggedInUser) {
      window.location.href = 'login.html';
      return;
    }

    const url = `/api/ratings/${item.mediaType}/${item.tmdbId}`;
    if (select.value === '') {
      await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
    } else {
      await fetch(url, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: Number(select.value) }),
      });
    }
  });
}

function attachEpisodeTracker(actionsEl, item) {
  const button = document.createElement('button');
  button.className = 'card-action episodes-btn';
  button.type = 'button';
  button.title = 'Track episodes watched';
  button.innerHTML = tvIconSvg();

  button.addEventListener('click', async event => {
    event.stopPropagation();
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }
    openEpisodeModal(item);
  });

  actionsEl.appendChild(button);
}
