function getPersonId() {
  return new URLSearchParams(window.location.search).get('id');
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function calculateAge(birthday, deathday) {
  if (!birthday) return null;
  const end = deathday ? new Date(deathday) : new Date();
  const start = new Date(birthday);
  let age = end.getFullYear() - start.getFullYear();
  const monthDiff = end.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < start.getDate())) age -= 1;
  return age;
}

function renderHero(data) {
  const photo = document.getElementById('person-photo');
  photo.src = profileUrl(data.profile_path);
  photo.alt = data.name;
  document.getElementById('person-name').textContent = data.name;

  const metaParts = [];
  if (data.known_for_department) metaParts.push(data.known_for_department);
  if (data.birthday) {
    const age = calculateAge(data.birthday, data.deathday);
    metaParts.push(
      data.deathday
        ? `${formatDate(data.birthday)} – ${formatDate(data.deathday)}${age != null ? ` (${age})` : ''}`
        : `Born ${formatDate(data.birthday)}${age != null ? ` (age ${age})` : ''}`
    );
  }
  if (data.place_of_birth) metaParts.push(data.place_of_birth);
  document.getElementById('person-meta-row').textContent = metaParts.join(' • ');

  const bioEl = document.getElementById('person-biography');
  const toggleBtn = document.getElementById('bio-toggle-btn');
  bioEl.textContent = data.biography || 'No biography available.';
  bioEl.classList.remove('expanded');
  toggleBtn.textContent = 'Show more';
  toggleBtn.onclick = () => {
    const expanded = bioEl.classList.toggle('expanded');
    toggleBtn.textContent = expanded ? 'Show less' : 'Show more';
  };
  // Only worth offering when the clamp (.person-biography's -webkit-line-clamp) is actually
  // cutting text off - scrollHeight only exceeds clientHeight once there's hidden overflow.
  // Needs a layout pass first, so this runs after the text/class reset above, not before.
  toggleBtn.hidden = bioEl.scrollHeight <= bioEl.clientHeight;
}

// Combines cast + crew credits into one deduped filmography - an actor who also directed an
// episode of something they starred in would otherwise show up twice; crew is populated first
// so the cast credit (their more prominent role here) wins when both exist for the same title.
function dedupeCredits(combinedCredits) {
  const byKey = new Map();
  (combinedCredits.crew || []).forEach(credit => byKey.set(`${credit.media_type}:${credit.id}`, credit));
  (combinedCredits.cast || []).forEach(credit => byKey.set(`${credit.media_type}:${credit.id}`, credit));
  return [...byKey.values()];
}

const FILMOGRAPHY_PAGE_SIZE = 8;

async function renderFilmography(personId, context) {
  const grid = document.getElementById('filmography-grid');
  const emptyEl = document.getElementById('filmography-empty');
  const paginationEl = document.getElementById('filmography-pagination');
  grid.hidden = false;
  emptyEl.hidden = true;
  renderSkeletonRow(grid);

  try {
    const combinedCredits = await fetch(`/api/tmdb/person/${personId}/combined_credits`, { credentials: 'same-origin' })
      .then(r => r.json());

    const credits = dedupeCredits(combinedCredits)
      .filter(c => c.media_type === 'movie' || c.media_type === 'tv')
      .sort((a, b) => (b.release_date || b.first_air_date || '').localeCompare(a.release_date || a.first_air_date || ''));

    grid.innerHTML = '';
    if (credits.length === 0) {
      grid.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    // combined_credits returns the whole filmography in one response - there's no TMDB-side
    // pagination to ask for less. Paging here is purely client-side slicing over the array
    // already sitting in memory, so switching pages re-renders instantly with no further
    // network requests.
    const totalPages = Math.max(1, Math.ceil(credits.length / FILMOGRAPHY_PAGE_SIZE));
    function renderPage(page) {
      grid.innerHTML = '';
      credits
        .slice((page - 1) * FILMOGRAPHY_PAGE_SIZE, page * FILMOGRAPHY_PAGE_SIZE)
        .forEach(raw => {
          const item = normalizeTmdbTrendingItem(raw);
          const card = buildCard(item);
          attachStandardActions(card, item, context);
          grid.appendChild(card);
        });
      renderPagination(paginationEl, page, totalPages, renderPage);
    }
    renderPage(1);
  } catch (error) {
    console.error('Failed to load filmography:', error);
    grid.innerHTML = '<p>Failed to load filmography.</p>';
    paginationEl.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('back-btn').addEventListener('click', () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = 'main.html';
  });

  const personId = getPersonId();
  if (!personId) {
    document.querySelector('main').innerHTML = '<p>Invalid person.</p>';
    return;
  }

  const [data, context] = await Promise.all([
    fetch(`/api/tmdb/person/${personId}`, { credentials: 'same-origin' }).then(r => r.json()),
    fetchStandardActionContext(),
  ]);

  document.title = data.name || 'Person';
  renderHero(data);
  renderFilmography(personId, context);
});
