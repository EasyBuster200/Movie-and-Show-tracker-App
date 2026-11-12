// The one definition of the "standard item shape" passed around everywhere a movie/show is
// handled client-side: { tmdbId, mediaType, title, year, releaseDate, posterPath, voteAverage }.
// Shared by localApi.js (enriched summaries, recommendations), media.js (TMDB list results) and
// detail.js (the page's own item) - these used to be four separate copies of the same mapping
// that had to be kept in sync by hand. Plain globals, no bundler (see CLAUDE.md); loaded before
// localDb.js/localApi.js on every page that uses either. Has no DOM dependencies, so the Node
// test suite (tests/) loads it as-is.

const STANDARD_SUMMARY_FIELDS = ['title', 'year', 'releaseDate', 'posterPath', 'voteAverage'];

// `raw` is any TMDB movie/tv object (a /movie/{id} or /tv/{id} response, or one entry of a
// results/parts/cast array). `mediaType` defaults to the raw object's own media_type, which
// TMDB only includes on mixed-type endpoints (trending, multi-search, combined_credits) -
// single-type callers must pass it explicitly.
function toStandardItem(raw, mediaType = raw && raw.media_type === 'movie' ? 'movie' : 'tv') {
  const releaseDate = raw.release_date || raw.first_air_date || null;
  return {
    tmdbId: raw.id,
    mediaType,
    title: raw.title || raw.name || 'Untitled',
    year: releaseDate ? releaseDate.split('-')[0] : null,
    releaseDate,
    posterPath: raw.poster_path,
    voteAverage: raw.vote_average,
  };
}

// The placeholder for an item whose TMDB lookup failed - rendered as a blank "Unknown" card.
function unknownStandardItem(tmdbId, mediaType) {
  return { tmdbId, mediaType, title: 'Unknown', year: null, releaseDate: null, posterPath: null, voteAverage: null };
}

// The display fields worth denormalizing onto a watched_movies/favorites row (see localApi.js's
// summaryFromRowOrFetch). Only copies keys actually present on `source`, so a caller with no
// display data handy doesn't stamp explicit `undefined`s onto the row.
function pickSummaryFields(source) {
  const fields = {};
  STANDARD_SUMMARY_FIELDS.forEach(key => {
    if (source && source[key] !== undefined) fields[key] = source[key];
  });
  return fields;
}

// Unreleased-content gating: a movie's releaseDate or an episode's air_date that's missing or
// in the future means "can't be marked watched yet". Used by media.js's watched button,
// detail.js's episode cards, movies.js's Coming Soon filter, and localApi.js's new-episode check.
function isUnreleased(dateStr, now = new Date()) {
  return !dateStr || new Date(dateStr) > now;
}
