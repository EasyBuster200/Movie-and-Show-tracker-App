function getParams() {
  const params = new URLSearchParams(window.location.search);
  return { mediaType: params.get('type'), tmdbId: params.get('id') };
}

function showConfirmDialog(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    const modal = document.createElement('div');
    modal.className = 'confirm-modal';

    const text = document.createElement('p');
    text.textContent = message;
    modal.appendChild(text);

    const actions = document.createElement('div');
    actions.className = 'confirm-actions';

    function close(result) {
      overlay.remove();
      resolve(result);
    }

    const noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'confirm-btn';
    noBtn.textContent = 'No';
    noBtn.addEventListener('click', () => close(false));

    const yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'confirm-btn confirm-btn-yes';
    yesBtn.textContent = 'Yes, mark them';
    yesBtn.addEventListener('click', () => close(true));

    actions.appendChild(noBtn);
    actions.appendChild(yesBtn);
    modal.appendChild(actions);
    overlay.appendChild(modal);

    overlay.addEventListener('click', event => {
      if (event.target === overlay) close(false);
    });

    document.body.appendChild(overlay);
  });
}

function toStandardItem(data, mediaType) {
  const releaseDate = data.release_date || data.first_air_date || null;
  return {
    tmdbId: data.id,
    mediaType,
    title: data.title || data.name,
    year: releaseDate ? releaseDate.split('-')[0] : null,
    posterPath: data.poster_path,
    voteAverage: data.vote_average,
  };
}

function formatRuntime(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function renderHero(data, mediaType) {
  const backdrop = backdropUrl(data.backdrop_path);
  const heroEl = document.getElementById('detail-hero');
  if (backdrop) {
    heroEl.style.backgroundImage = `linear-gradient(180deg, rgba(0,0,0,0.2), var(--base-clr)), url('${backdrop}')`;
  }

  document.getElementById('detail-poster').src = posterUrl(data.poster_path);
  document.getElementById('detail-poster').alt = data.title || data.name;

  const releaseDate = data.release_date || data.first_air_date;
  const year = releaseDate ? releaseDate.split('-')[0] : 'N/A';
  document.getElementById('detail-title').textContent = `${data.title || data.name} (${year})`;

  const taglineEl = document.getElementById('detail-tagline');
  if (data.tagline) {
    taglineEl.textContent = data.tagline;
    taglineEl.hidden = false;
  }

  const metaParts = [];
  if (mediaType === 'movie') {
    const runtime = formatRuntime(data.runtime);
    if (runtime) metaParts.push(runtime);
  } else {
    metaParts.push(`${data.number_of_seasons} Season${data.number_of_seasons === 1 ? '' : 's'}`);
    metaParts.push(`${data.number_of_episodes} Episodes`);
  }
  if (data.genres && data.genres.length) metaParts.push(data.genres.map(g => g.name).join(', '));
  if (data.status) metaParts.push(data.status);
  if (data.vote_average) metaParts.push(`⭐ ${formatRating(data.vote_average)}/10`);
  document.getElementById('detail-meta-row').textContent = metaParts.join(' • ');

  const crewEl = document.getElementById('detail-crew');
  if (mediaType === 'movie') {
    const directors = (data.credits?.crew || []).filter(c => c.job === 'Director').map(c => c.name);
    crewEl.textContent = directors.length ? `Director: ${directors.join(', ')}` : '';
  } else {
    const creators = (data.created_by || []).map(c => c.name);
    crewEl.textContent = creators.length ? `Creator: ${creators.join(', ')}` : '';
  }

  document.getElementById('detail-overview').textContent = data.overview || 'No overview available.';
}

function renderTrailer(data) {
  const link = document.getElementById('trailer-link');
  const videos = data.videos?.results || [];
  const trailer = videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
    || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');

  if (!trailer) return;
  link.href = `https://www.youtube.com/watch?v=${trailer.key}`;
  link.hidden = false;
}

function renderCast(data) {
  const container = document.getElementById('cast-list');
  container.innerHTML = '';
  const cast = (data.credits?.cast || []).slice(0, 12);

  if (cast.length === 0) {
    container.innerHTML = '<p>No cast information available.</p>';
    return;
  }

  cast.forEach(person => {
    const card = document.createElement('div');
    card.className = 'cast-card';

    const img = document.createElement('img');
    img.src = profileUrl(person.profile_path);
    img.alt = person.name;
    card.appendChild(img);

    const name = document.createElement('p');
    name.className = 'cast-name';
    name.textContent = person.name;
    card.appendChild(name);

    const character = document.createElement('p');
    character.className = 'cast-character';
    character.textContent = person.character || '';
    card.appendChild(character);

    container.appendChild(card);
  });
}

async function renderActions(item, context) {
  const actionsEl = document.getElementById('detail-actions');
  attachStandardActions({ overlayActionsEl: actionsEl }, item, context);
  attachStarRating(actionsEl, item);
}

// A 5-star, half-star-increment rating widget backed by the existing 1-10 integer ratings
// API (star value = rating / 2). Each star is split into a clickable left half (sets a half
// star) and right half (sets a full star), with a filled overlay clipped to the fraction of
// that star which is "on".
function buildStar(index, onSelect, onHover) {
  const star = document.createElement('span');
  star.className = 'star';

  const bg = document.createElement('span');
  bg.className = 'star-bg';
  bg.textContent = '★';

  const fg = document.createElement('span');
  fg.className = 'star-fg';
  const fgInner = document.createElement('span');
  fgInner.className = 'star-fg-inner';
  fgInner.textContent = '★';
  fg.appendChild(fgInner);

  const leftHalf = document.createElement('button');
  leftHalf.type = 'button';
  leftHalf.className = 'star-half star-half-left';
  leftHalf.title = `${index - 0.5} stars`;
  leftHalf.addEventListener('click', event => {
    event.stopPropagation();
    onSelect(index - 0.5);
  });
  leftHalf.addEventListener('mouseenter', () => onHover(index - 0.5));

  const rightHalf = document.createElement('button');
  rightHalf.type = 'button';
  rightHalf.className = 'star-half star-half-right';
  rightHalf.title = `${index} stars`;
  rightHalf.addEventListener('click', event => {
    event.stopPropagation();
    onSelect(index);
  });
  rightHalf.addEventListener('mouseenter', () => onHover(index));

  star.appendChild(bg);
  star.appendChild(fg);
  star.appendChild(leftHalf);
  star.appendChild(rightHalf);

  star.setFill = starValue => {
    const fillWithinStar = Math.max(0, Math.min(1, starValue - (index - 1)));
    fg.style.width = `${fillWithinStar * 100}%`;
  };

  return star;
}

async function attachStarRating(container, item) {
  const wrapper = document.createElement('div');
  wrapper.className = 'user-rating';

  const starsEl = document.createElement('div');
  starsEl.className = 'star-rating';

  const valueLabel = document.createElement('span');
  valueLabel.className = 'user-rating-value';

  const stars = [];
  function applyFill(starValue) {
    stars.forEach(star => star.setFill(starValue));
    valueLabel.textContent = starValue ? `(${Math.round(starValue * 2)}/10)` : '';
  }

  for (let i = 1; i <= 5; i++) {
    const star = buildStar(i, selectRating, applyFill);
    stars.push(star);
    starsEl.appendChild(star);
  }

  starsEl.addEventListener('mouseleave', () => applyFill(currentRating ? currentRating / 2 : 0));

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'clear-rating-btn';
  clearBtn.textContent = 'Clear';
  clearBtn.hidden = true;
  clearBtn.addEventListener('click', () => selectRating(null));

  wrapper.appendChild(starsEl);
  wrapper.appendChild(valueLabel);
  wrapper.appendChild(clearBtn);
  container.appendChild(wrapper);

  let currentRating = null;

  function render() {
    applyFill(currentRating ? currentRating / 2 : 0);
    clearBtn.hidden = !currentRating;
  }

  async function selectRating(starValue) {
    const user = await getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    const url = `/api/ratings/${item.mediaType}/${item.tmdbId}`;
    if (starValue === null) {
      await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
      currentRating = null;
    } else {
      const ratingInt = Math.round(starValue * 2);
      if (ratingInt === currentRating) {
        // Clicking the already-selected value again clears the rating.
        await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
        currentRating = null;
      } else {
        await fetch(url, {
          method: 'PUT',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: ratingInt }),
        });
        currentRating = ratingInt;
      }
    }
    render();
  }

  const user = await getCurrentUser();
  if (user) {
    const current = await fetch(`/api/ratings/${item.mediaType}/${item.tmdbId}`, { credentials: 'same-origin' }).then(r => r.json());
    currentRating = current.rating;
  }
  render();
}

function formatAirDate(airDate) {
  if (!airDate) return null;
  return new Date(airDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function buildEpisodeCard(episode, season, item, watchedSet, { onToggle, onMarkedWatched, lastWatchedAt }) {
  const key = `${season.season_number}:${episode.episode_number}`;
  const isUnreleased = !episode.air_date || new Date(episode.air_date) > new Date();
  const isNew = !isUnreleased && !watchedSet.has(key) && lastWatchedAt && new Date(episode.air_date) > new Date(lastWatchedAt);
  const hasRealTitle = episode.name && !/^Episode\s+\d+$/i.test(episode.name.trim());
  const hasOverview = episode.overview && episode.overview.trim().length > 0;

  const card = document.createElement('div');
  card.className = 'episode-card';
  if (isUnreleased) card.classList.add('unreleased');

  let still;
  if (episode.still_path) {
    still = document.createElement('img');
    still.className = 'episode-still';
    still.src = stillUrl(episode.still_path);
    still.alt = hasRealTitle ? episode.name : 'Coming Soon';
  } else {
    still = document.createElement('div');
    still.className = 'episode-still episode-still-placeholder';
    still.textContent = 'Coming Soon';
  }
  card.appendChild(still);

  const info = document.createElement('div');
  info.className = 'episode-info';

  const titleRow = document.createElement('div');
  titleRow.className = 'episode-title-row';

  const number = document.createElement('span');
  number.className = 'episode-number';
  number.textContent = episode.episode_number;

  const name = document.createElement('h4');
  name.className = 'episode-name';
  name.textContent = hasRealTitle ? episode.name : 'Coming Soon';
  if (!hasRealTitle) name.classList.add('placeholder');

  const watchedBtn = document.createElement('button');
  watchedBtn.type = 'button';
  watchedBtn.className = 'card-action episode-watched-btn';
  watchedBtn.dataset.episodeKey = key;
  watchedBtn.innerHTML = eyeIconSvg();
  watchedBtn.classList.toggle('active', watchedSet.has(key));

  if (isUnreleased) {
    watchedBtn.disabled = true;
    watchedBtn.title = 'Not yet aired';
  } else {
    watchedBtn.title = 'Mark episode as watched';
    watchedBtn.addEventListener('click', async () => {
      const user = await getCurrentUser();
      if (!user) {
        window.location.href = 'login.html';
        return;
      }
      const nowWatched = !watchedSet.has(key);
      const url = `/api/watched/shows/${item.tmdbId}/season/${season.season_number}/episode/${episode.episode_number}`;
      await fetch(url, { method: nowWatched ? 'POST' : 'DELETE', credentials: 'same-origin' });
      if (nowWatched) watchedSet.add(key);
      else watchedSet.delete(key);
      watchedBtn.classList.toggle('active', nowWatched);
      onToggle();
      if (nowWatched) onMarkedWatched();
    });
  }

  titleRow.appendChild(number);
  titleRow.appendChild(name);
  if (isNew) {
    const newLabel = document.createElement('span');
    newLabel.className = 'new-label';
    newLabel.textContent = 'New';
    titleRow.appendChild(newLabel);
  }
  titleRow.appendChild(watchedBtn);
  info.appendChild(titleRow);

  const metaParts = [formatAirDate(episode.air_date), episode.runtime ? `${episode.runtime}m` : null].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement('p');
    meta.className = 'episode-meta';
    meta.textContent = metaParts.join(' • ');
    info.appendChild(meta);
  }

  const overview = document.createElement('p');
  overview.className = 'episode-overview';
  overview.textContent = hasOverview ? episode.overview : 'Coming soon.';
  info.appendChild(overview);

  card.appendChild(info);
  return card;
}

async function renderSeasons(data, item) {
  const section = document.getElementById('seasons-section');
  section.hidden = false;

  const progressEl = document.getElementById('show-progress');
  const accordion = document.getElementById('seasons-accordion');
  accordion.innerHTML = '';

  const { episodes: watchedEpisodes, lastWatchedAt, newSeasonNumbers } =
    await fetch(`/api/watched/shows/${item.tmdbId}/episodes`, { credentials: 'same-origin' }).then(r => r.json());
  const watchedSet = new Set(watchedEpisodes.map(e => `${e.seasonNumber}:${e.episodeNumber}`));
  const newSeasonSet = new Set(newSeasonNumbers);

  const seasons = (data.seasons || []).filter(s => s.season_number > 0);
  const episodeCountBySeason = new Map(seasons.map(s => [s.season_number, s.episode_count]));
  const seasonHeaderProgressEls = new Map();

  function updateOverallProgress() {
    progressEl.textContent = `${watchedSet.size}/${data.number_of_episodes} episodes watched`;
  }
  updateOverallProgress();

  function updateSeasonHeaderProgress(seasonNumber) {
    const el = seasonHeaderProgressEls.get(seasonNumber);
    if (!el) return;
    const total = episodeCountBySeason.get(seasonNumber);
    if (!total) {
      el.textContent = '';
      return;
    }
    const count = [...watchedSet].filter(key => key.startsWith(`${seasonNumber}:`)).length;
    el.textContent = `${count}/${total} watched`;
  }

  // Marks a single episode watched: hits the API, updates the shared watchedSet, and syncs
  // the visual state of that episode's button if it's already rendered (its season may not
  // be expanded, in which case there's nothing in the DOM yet to update).
  async function markEpisodeWatched(seasonNumber, episodeNumber) {
    await fetch(`/api/watched/shows/${item.tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`, {
      method: 'POST',
      credentials: 'same-origin',
    });
    const key = `${seasonNumber}:${episodeNumber}`;
    watchedSet.add(key);
    const btn = accordion.querySelector(`[data-episode-key="${key}"]`);
    if (btn) btn.classList.add('active');
    updateSeasonHeaderProgress(seasonNumber);
  }

  // Every (season, episode) that airs before the given one, across all seasons, that isn't
  // already watched — the candidates for the "catch up" prompt.
  function findUnwatchedBefore(seasonNumber, episodeNumber) {
    const before = [];
    episodeCountBySeason.forEach((episodeCount, sNum) => {
      const lastEpisode = sNum < seasonNumber ? episodeCount : sNum === seasonNumber ? episodeNumber - 1 : 0;
      for (let e = 1; e <= lastEpisode; e++) {
        if (!watchedSet.has(`${sNum}:${e}`)) before.push({ seasonNumber: sNum, episodeNumber: e });
      }
    });
    return before;
  }

  async function offerCatchUp(seasonNumber, episodeNumber) {
    const before = findUnwatchedBefore(seasonNumber, episodeNumber);
    if (before.length === 0) return;

    const confirmed = await showConfirmDialog(
      `You have ${before.length} unwatched episode${before.length === 1 ? '' : 's'} before this one. Mark them as watched too?`
    );
    if (!confirmed) return;

    await Promise.all(before.map(e => markEpisodeWatched(e.seasonNumber, e.episodeNumber)));
    updateOverallProgress();
  }

  seasons.forEach(season => {
    const block = document.createElement('div');
    block.className = 'season-block';

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'season-header';

    const headerLabel = document.createElement('span');
    headerLabel.textContent = season.episode_count > 0
      ? `${season.name} — ${season.episode_count} episodes`
      : `${season.name} — Coming Soon`;
    if (newSeasonSet.has(season.season_number)) {
      const newLabel = document.createElement('span');
      newLabel.className = 'new-label';
      newLabel.textContent = 'New';
      headerLabel.appendChild(newLabel);
    }
    const headerProgress = document.createElement('span');
    headerProgress.className = 'season-header-progress';
    seasonHeaderProgressEls.set(season.season_number, headerProgress);
    header.appendChild(headerLabel);
    header.appendChild(headerProgress);
    updateSeasonHeaderProgress(season.season_number);

    const episodesEl = document.createElement('div');
    episodesEl.className = 'episode-cards';
    episodesEl.hidden = true;

    let loaded = false;
    header.addEventListener('click', async () => {
      episodesEl.hidden = !episodesEl.hidden;
      if (episodesEl.hidden || loaded) return;
      loaded = true;

      episodesEl.textContent = 'Loading episodes…';
      const seasonData = await fetch(`/api/tmdb/tv/${item.tmdbId}/season/${season.season_number}`, { credentials: 'same-origin' }).then(r => r.json());

      episodesEl.innerHTML = '';
      (seasonData.episodes || []).forEach(episode => {
        episodesEl.appendChild(buildEpisodeCard(episode, season, item, watchedSet, {
          onToggle: () => {
            updateSeasonHeaderProgress(season.season_number);
            updateOverallProgress();
          },
          onMarkedWatched: () => offerCatchUp(season.season_number, episode.episode_number),
          lastWatchedAt,
        }));
      });
    });

    block.appendChild(header);
    block.appendChild(episodesEl);
    accordion.appendChild(block);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'main.html';
  });

  const { mediaType, tmdbId } = getParams();
  if (!mediaType || !tmdbId || !['movie', 'tv'].includes(mediaType)) {
    document.querySelector('main').innerHTML = '<p>Invalid content.</p>';
    return;
  }

  const [data, context] = await Promise.all([
    fetch(`/api/tmdb/${mediaType}/${tmdbId}?append_to_response=credits,videos`, { credentials: 'same-origin' }).then(r => r.json()),
    fetchStandardActionContext(),
  ]);

  const item = toStandardItem(data, mediaType);
  document.title = item.title;

  renderHero(data, mediaType);
  renderTrailer(data);
  renderCast(data);
  renderActions(item, context);

  if (mediaType === 'tv') {
    renderSeasons(data, item);
  }
});
