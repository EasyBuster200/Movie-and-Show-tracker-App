const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function fetchTmdb(tmdbPath) {
  const response = await fetch(`${TMDB_BASE_URL}${tmdbPath}`, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
    },
  });
  if (!response.ok) return null;
  return response.json();
}

async function fetchMediaSummary(tmdbId, mediaType) {
  const data = await fetchTmdb(`/${mediaType}/${tmdbId}`);
  if (!data) return null;
  const title = data.title || data.name;
  const releaseDate = data.release_date || data.first_air_date || null;
  return {
    tmdbId,
    mediaType,
    title,
    year: releaseDate ? releaseDate.split('-')[0] : null,
    posterPath: data.poster_path,
    voteAverage: data.vote_average,
  };
}

module.exports = { fetchTmdb, fetchMediaSummary };
