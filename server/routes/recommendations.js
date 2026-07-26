const express = require('express');
const db = require('../db');
const { fetchTmdb } = require('../tmdbClient');

const router = express.Router();

const SEED_COUNT = 5;
const RESULT_CAP = 20;

const getWatchedMoviesWithTs = db.prepare('SELECT tmdb_id, watched_at AS ts FROM watched_movies WHERE user_id = ?');
const getWatchedShowsLastTs = db.prepare(
  'SELECT show_id AS tmdb_id, MAX(watched_at) AS ts FROM watched_episodes WHERE user_id = ? GROUP BY show_id'
);
const getListItemsByType = db.prepare(`
  SELECT li.tmdb_id, li.added_at AS ts
  FROM list_items li
  JOIN lists l ON l.id = li.list_id
  WHERE l.user_id = ? AND li.media_type = ?
`);

function validMediaType(req, res, next) {
  if (!['movie', 'tv'].includes(req.params.mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }
  next();
}

function normalizeRecommendation(raw, mediaType) {
  const releaseDate = raw.release_date || raw.first_air_date || null;
  return {
    tmdbId: raw.id,
    mediaType,
    title: raw.title || raw.name || 'Untitled',
    year: releaseDate ? releaseDate.split('-')[0] : null,
    posterPath: raw.poster_path,
    voteAverage: raw.vote_average,
  };
}

router.get('/:mediaType', validMediaType, async (req, res) => {
  const userId = req.session.userId;
  const mediaType = req.params.mediaType;

  const watchedRows = mediaType === 'movie'
    ? getWatchedMoviesWithTs.all(userId)
    : getWatchedShowsLastTs.all(userId);
  const listRows = getListItemsByType.all(userId, mediaType);

  const latestTsById = new Map();
  [...watchedRows, ...listRows].forEach(row => {
    const existing = latestTsById.get(row.tmdb_id);
    if (!existing || row.ts > existing) latestTsById.set(row.tmdb_id, row.ts);
  });

  const excludeIds = new Set(latestTsById.keys());
  const seeds = [...latestTsById.entries()]
    .sort((a, b) => (a[1] < b[1] ? 1 : -1))
    .slice(0, SEED_COUNT)
    .map(([tmdbId]) => tmdbId);

  if (seeds.length === 0) {
    return res.json({ seedCount: 0, items: [] });
  }

  const recommendationLists = await Promise.all(
    seeds.map(tmdbId => fetchTmdb(`/${mediaType}/${tmdbId}/recommendations`))
  );

  const merged = new Map();
  recommendationLists.forEach(data => {
    const results = (data && data.results) || [];
    const seenInThisSeed = new Set();
    results.forEach(raw => {
      if (seenInThisSeed.has(raw.id)) return;
      seenInThisSeed.add(raw.id);
      if (excludeIds.has(raw.id) || seeds.includes(raw.id)) return;

      const existing = merged.get(raw.id);
      if (existing) {
        existing.matchCount += 1;
      } else {
        merged.set(raw.id, { raw, matchCount: 1 });
      }
    });
  });

  const ranked = [...merged.values()].sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
    const aScore = a.raw.popularity ?? a.raw.vote_count ?? 0;
    const bScore = b.raw.popularity ?? b.raw.vote_count ?? 0;
    return bScore - aScore;
  });

  const items = ranked.slice(0, RESULT_CAP).map(({ raw }) => normalizeRecommendation(raw, mediaType));

  res.json({ seedCount: seeds.length, items });
});

module.exports = router;
