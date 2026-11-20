// The detail page for one movie or show (?type=movie|tv&id=): backdrop, poster, title and
// TMDB rating, the watched/save/favourite/trailer buttons, the overview, then
// Seasons (shows - each season opens episodes.html), Cast, the movie's collection, and More
// Like This (movies).

const CAST_PREVIEW_COUNT = 12;
const SIMILAR_PREVIEW_COUNT = 12;

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return { mediaType: params.get('type'), tmdbId: params.get('id') };
}

function formatRuntime(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, '0')}m` : `${mins}m`;
}

function renderHeader(data, mediaType, item) {
  const backdrop = backdropUrl(data.backdrop_path);
  if (backdrop) document.getElementById('detail-hero').style.backgroundImage = `url('${backdrop}')`;

  const posterSlot = document.getElementById('detail-poster');
  posterSlot.replaceWith(buildPosterArt(item.title, posterUrl(item.posterPath), { lazy: false }));

  document.getElementById('detail-title').textContent = item.title;

  const parts = [item.year];
  if (data.genres && data.genres.length) parts.push(data.genres[0].name);
  if (mediaType === 'movie') {
    parts.push(formatRuntime(data.runtime));
  } else if (data.number_of_seasons) {
    parts.push(`${data.number_of_seasons} season${data.number_of_seasons === 1 ? '' : 's'}`);
  }
  document.getElementById('detail-meta').textContent = parts.filter(Boolean).join(' • ');

  const ratingEl = document.getElementById('detail-rating');
  if (data.vote_average) {
    ratingEl.innerHTML = `${ratingStarSvg(16)}<span>${Number(data.vote_average).toFixed(1)}/10</span>`;
    ratingEl.hidden = false;
  }

  const overview = document.getElementById('detail-overview');
  const toggle = document.getElementById('overview-toggle');
  overview.textContent = textOrEnglish(data, 'overview') || 'No overview available.';
  requestAnimationFrame(() => {
    toggle.hidden = overview.scrollHeight <= overview.clientHeight;
  });
  toggle.addEventListener('click', () => {
    const expanded = overview.classList.toggle('expanded');
    toggle.textContent = expanded ? 'Show less' : 'Show more';
  });
}

// A round secondary icon button whose icon fills while it's on - the detail page's watched,
// save and favourite buttons, driven by media.js's attach*Button helpers.
function buildIconButton(icon) {
  const btn = el('button', 'tt-btn tt-btn--secondary tt-btn--icon');
  btn.type = 'button';
  btn.setOn = on => {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.innerHTML = ttIcon(icon, { size: 20, filled: on });
  };
  btn.setOn(false);
  return btn;
}

function findTrailer(data) {
  const videos = (data.videos && data.videos.results) || [];
  return videos.find(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
    || videos.find(v => v.site === 'YouTube' && v.type === 'Trailer');
}

function renderActions(data, item, context) {
  const actionsEl = document.getElementById('detail-actions');

  if (item.mediaType === 'movie') {
    const watched = buildIconButton('eye');
    actionsEl.appendChild(watched);
    attachWatchedButton(null, item, context.watchedMovieIds, null, { button: watched });
  }

  // The save popover positions itself against the button's parent.
  const saveAnchor = el('span', 'save-anchor');
  const save = buildIconButton('bookmark');
  saveAnchor.appendChild(save);
  actionsEl.appendChild(saveAnchor);
  attachSaveButton(null, item, context, { button: save });

  const favorite = buildIconButton('heart');
  actionsEl.appendChild(favorite);
  attachFavoriteButton(null, item, context.favoriteIds, null, { button: favorite });

  const trailer = findTrailer(data);
  if (trailer) {
    const link = el('a', 'tt-btn tt-btn--secondary');
    link.href = `https://www.youtube.com/watch?v=${trailer.key}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.innerHTML = `${ttIcon('play', { size: 20 })}<span>Trailer</span>`;
    actionsEl.appendChild(link);
  }
}

// ---------- Seasons ----------

async function renderSeasons(data, item) {
  const section = document.getElementById('seasons-section');
  const rowsEl = document.getElementById('season-rows');
  section.hidden = false;

  const { episodes: watchedEpisodes, newSeasonNumbers } = await fetchJson(`/api/watched/shows/${item.tmdbId}/episodes`)
    .catch(() => ({ episodes: [], newSeasonNumbers: [] }));
  const newSeasons = new Set(newSeasonNumbers || []);
  const watchedBySeason = new Map();
  watchedEpisodes.forEach(e => watchedBySeason.set(e.seasonNumber, (watchedBySeason.get(e.seasonNumber) || 0) + 1));

  const total = data.number_of_episodes || 0;
  document.getElementById('show-progress-label').textContent = `${watchedEpisodes.length}/${total} episodes watched`;
  document.getElementById('show-progress-bar').appendChild(buildProgressBar(watchedEpisodes.length, total, 'Episodes watched'));

  (data.seasons || []).filter(s => s.season_number > 0).forEach(season => {
    const comingSoon = season.episode_count === 0;
    const watched = watchedBySeason.get(season.season_number) || 0;
    const done = !comingSoon && watched >= season.episode_count;

    const row = el(comingSoon ? 'div' : 'a', `tt-row${done ? ' tt-row--done' : ''}${comingSoon ? ' tt-row--disabled' : ''}`);
    if (!comingSoon) row.href = `episodes.html?id=${item.tmdbId}&season=${season.season_number}`;

    const label = el('span', 'tt-row__label', season.name || `Season ${season.season_number}`);
    if (newSeasons.has(season.season_number)) label.appendChild(el('span', 'new-pill', 'New'));
    row.appendChild(label);

    const count = el('span', 'tt-row__count');
    if (comingSoon) {
      count.textContent = 'Coming soon';
    } else {
      if (done) count.insertAdjacentHTML('beforeend', ttIcon('check', { size: 16, strokeWidth: 2.2 }));
      count.appendChild(document.createTextNode(`${watched}/${season.episode_count} watched`));
      count.insertAdjacentHTML('beforeend', ttIcon('chevron', { size: 16 }));
    }
    row.appendChild(count);
    rowsEl.appendChild(row);
  });
}

// ---------- Cast, collection, more like this ----------

function renderCast(data) {
  const container = document.getElementById('cast-list');
  const toggle = document.getElementById('cast-toggle');
  const cast = (data.credits && data.credits.cast) || [];
  if (cast.length === 0) {
    document.getElementById('cast-section').hidden = true;
    return;
  }

  const render = all => {
    container.innerHTML = '';
    cast.slice(0, all ? cast.length : CAST_PREVIEW_COUNT).forEach(person => {
      container.appendChild(buildCastCard({ tmdbId: person.id, name: person.name, role: person.character, profilePath: person.profile_path }));
    });
    container.classList.toggle('expanded', all);
    toggle.textContent = all ? 'Show less' : 'See all';
  };

  let expanded = false;
  toggle.hidden = cast.length <= CAST_PREVIEW_COUNT;
  toggle.addEventListener('click', () => { expanded = !expanded; render(expanded); });
  render(false);
}

async function renderCollection(collectionId, currentTmdbId, context) {
  const collection = await fetchJson(`/api/tmdb/collection/${collectionId}`).catch(() => null);
  if (!collection) return;
  const parts = (collection.parts || [])
    .filter(part => part.id !== currentTmdbId)
    .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
  if (parts.length === 0) return;

  document.getElementById('collection-title').textContent = collection.name || 'Collection';
  const listEl = document.getElementById('collection-list');
  parts.forEach(part => {
    const item = toStandardItem(part, 'movie');
    const card = buildCard(item);
    attachStandardActions(card, item, context);
    listEl.appendChild(card);
  });
  document.getElementById('collection-section').hidden = false;
}

function renderSimilar(data, item, context) {
  const results = (data.recommendations && data.recommendations.results) || [];
  if (results.length === 0) return;
  const listEl = document.getElementById('similar-list');
  results.slice(0, SIMILAR_PREVIEW_COUNT).forEach(raw => {
    const similar = toStandardItem(raw, item.mediaType);
    const card = buildCard(similar);
    attachStandardActions(card, similar, context);
    listEl.appendChild(card);
  });
  document.getElementById('similar-see-all').href = `media-list.html?source=similar&type=${item.mediaType}&id=${item.tmdbId}`;
  document.getElementById('similar-section').hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  const { mediaType, tmdbId } = getParams();
  if (!mediaType || !tmdbId || !['movie', 'tv'].includes(mediaType)) {
    document.querySelector('main').innerHTML = '<p class="empty-note">This title couldn\'t be found.</p>';
    return;
  }

  // Highlight Movies or Shows in the bottom nav, depending on what this is.
  const nav = document.getElementById('bottom-nav');
  nav.dataset.active = mediaType === 'movie' ? 'movies' : 'shows';
  renderBottomNav(nav);

  const extras = [mediaType === 'movie' ? 'credits,videos,recommendations' : 'credits,videos', withTranslations()].filter(Boolean).join(',');
  const [data, context] = await Promise.all([
    fetchJson(`/api/tmdb/${mediaType}/${tmdbId}?append_to_response=${extras}`),
    fetchStandardActionContext(),
  ]);

  const item = toStandardItem(data, mediaType);
  document.title = item.title;

  renderHeader(data, mediaType, item);
  renderActions(data, item, context);
  renderCast(data);

  if (mediaType === 'tv') renderSeasons(data, item);
  if (mediaType === 'movie' && data.belongs_to_collection) renderCollection(data.belongs_to_collection.id, data.id, context);
  if (mediaType === 'movie') renderSimilar(data, item, context);
});
