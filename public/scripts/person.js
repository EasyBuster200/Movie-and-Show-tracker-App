// An actor's or crew member's page (?id=<tmdbId>), opened from a cast card or search: photo with
// department, name, birth date and place; biography; Known For (their most-voted titles); and the
// filmography - every movie and show credit, newest release first, with All / Movies / Shows
// chips and paging.

const FILMOGRAPHY_PAGE_SIZE = 12;
const KNOWN_FOR_COUNT = 10;

function getPersonId() {
  return new URLSearchParams(window.location.search).get('id');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return parseLocalDate(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function calculateAge(birthday, deathday) {
  if (!birthday) return null;
  const end = deathday ? parseLocalDate(deathday) : new Date();
  const start = parseLocalDate(birthday);
  let age = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < start.getDate())) age -= 1;
  return age;
}

function renderHeader(data) {
  const photo = document.getElementById('person-photo');
  if (data.profile_path) {
    const img = document.createElement('img');
    img.src = profileUrl(data.profile_path);
    img.alt = data.name;
    photo.appendChild(img);
  } else {
    photo.textContent = titleInitials(data.name);
  }

  document.getElementById('person-dept').textContent = data.known_for_department || '';
  document.getElementById('person-name').textContent = data.name;

  const age = calculateAge(data.birthday, data.deathday);
  let born = '';
  if (data.birthday && data.deathday) born = `${formatDate(data.birthday)} – ${formatDate(data.deathday)}${age != null ? ` (${age})` : ''}`;
  else if (data.birthday) born = `Born ${formatDate(data.birthday)}${age != null ? ` (age ${age})` : ''}`;
  document.getElementById('person-born').textContent = born;
  document.getElementById('person-place').textContent = data.place_of_birth || '';

  const bioEl = document.getElementById('person-biography');
  const toggleBtn = document.getElementById('bio-toggle-btn');
  bioEl.textContent = textOrEnglish(data, 'biography') || 'No biography available.';
  toggleBtn.addEventListener('click', () => {
    const expanded = bioEl.classList.toggle('expanded');
    toggleBtn.textContent = expanded ? 'Show less' : 'Show more';
    toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  });
  requestAnimationFrame(() => { toggleBtn.hidden = bioEl.scrollHeight <= bioEl.clientHeight; });
}

// Cast and crew credits as one list: crew first, so the cast credit wins when someone both
// acted in and worked on the same title.
function dedupeCredits(combinedCredits) {
  const byKey = new Map();
  (combinedCredits.crew || []).forEach(credit => byKey.set(`${credit.media_type}:${credit.id}`, credit));
  (combinedCredits.cast || []).forEach(credit => byKey.set(`${credit.media_type}:${credit.id}`, credit));
  return [...byKey.values()].filter(c => c.media_type === 'movie' || c.media_type === 'tv');
}

const releaseDateOf = credit => credit.release_date || credit.first_air_date || '';

// Newest release first. Credits with no date yet (unannounced projects) go last.
function sortNewestFirst(credits) {
  return credits.slice().sort((a, b) => {
    const da = releaseDateOf(a);
    const db = releaseDateOf(b);
    if (!da || !db) return da ? -1 : db ? 1 : 0;
    return db.localeCompare(da);
  });
}

function creditCard(raw, context) {
  const item = toStandardItem(raw);
  const card = buildCard(item);
  if (item.mediaType === 'tv') addCardDetail(card, 'TV');
  attachStandardActions(card, item, context);
  return card;
}

function renderKnownFor(credits, context) {
  const known = credits
    .filter(c => (c.vote_count || 0) > 0)
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0))
    .slice(0, KNOWN_FOR_COUNT);
  if (!known.length) return;
  const row = document.getElementById('known-for');
  known.forEach(raw => row.appendChild(creditCard(raw, context)));
  document.getElementById('known-for-section').hidden = false;
}

const FILMOGRAPHY_FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'movie', label: 'Movies', match: c => c.media_type === 'movie' },
  { id: 'tv', label: 'Shows', match: c => c.media_type === 'tv' },
];

function renderFilmography(credits, context) {
  const grid = document.getElementById('filmography-grid');
  const emptyEl = document.getElementById('filmography-empty');
  const pager = document.getElementById('filmography-pagination');
  const chips = document.getElementById('filmography-filters');
  let filter = 'all';

  function renderPage(page) {
    const shown = credits.filter(FILMOGRAPHY_FILTERS.find(f => f.id === filter).match);
    grid.innerHTML = '';
    emptyEl.hidden = shown.length > 0;
    // combined_credits is one response, so paging is just slicing what's already loaded.
    shown.slice((page - 1) * FILMOGRAPHY_PAGE_SIZE, page * FILMOGRAPHY_PAGE_SIZE)
      .forEach(raw => grid.appendChild(creditCard(raw, context)));
    renderPagination(pager, page, Math.max(1, Math.ceil(shown.length / FILMOGRAPHY_PAGE_SIZE)), renderPage);
  }

  function renderChips() {
    chips.innerHTML = '';
    FILMOGRAPHY_FILTERS.forEach(f => chips.appendChild(buildChip(f.label, {
      selected: filter === f.id,
      count: credits.filter(f.match).length,
      onClick: () => { filter = f.id; renderChips(); renderPage(1); },
    })));
  }

  renderChips();
  renderPage(1);
}

document.addEventListener('DOMContentLoaded', async () => {
  const personId = getPersonId();
  if (!personId) {
    document.querySelector('main').innerHTML = '<p class="empty-note">This person couldn\'t be found.</p>';
    return;
  }

  const grid = document.getElementById('filmography-grid');
  renderSkeletonRow(grid, 9);

  try {
    const [data, combinedCredits, context] = await Promise.all([
      fetchJson(`/api/tmdb/person/${personId}${withTranslations() ? `?append_to_response=${withTranslations()}` : ''}`),
      fetchJson(`/api/tmdb/person/${personId}/combined_credits`),
      fetchStandardActionContext(),
    ]);
    document.title = data.name || 'Person';
    renderHeader(data);
    const credits = sortNewestFirst(dedupeCredits(combinedCredits));
    renderKnownFor(credits, context);
    renderFilmography(credits, context);
  } catch (error) {
    console.error('Failed to load person:', error);
    grid.innerHTML = '';
    grid.appendChild(el('p', 'empty-note', "Couldn't load this person. Check your connection."));
  }
});
