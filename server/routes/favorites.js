const express = require('express');
const db = require('../db');
const { fetchMediaSummary } = require('../tmdbClient');

const router = express.Router();

const upsertFavorite = db.prepare(
  `INSERT OR REPLACE INTO favorites (user_id, tmdb_id, media_type, favorited_at)
   VALUES (?, ?, ?, datetime('now'))`
);
const deleteFavorite = db.prepare('DELETE FROM favorites WHERE user_id = ? AND tmdb_id = ? AND media_type = ?');
const getFavoriteIdsByType = db.prepare('SELECT tmdb_id FROM favorites WHERE user_id = ? AND media_type = ?');

function validMediaType(req, res, next) {
  if (!['movie', 'tv'].includes(req.params.mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }
  next();
}

async function enrichedFavorites(userId, mediaType) {
  const rows = getFavoriteIdsByType.all(userId, mediaType);
  const enriched = await Promise.all(rows.map(row => fetchMediaSummary(row.tmdb_id, mediaType)));
  return enriched.filter(Boolean);
}

router.get('/ids', (req, res) => {
  res.json({
    movie: getFavoriteIdsByType.all(req.session.userId, 'movie').map(r => r.tmdb_id),
    tv: getFavoriteIdsByType.all(req.session.userId, 'tv').map(r => r.tmdb_id),
  });
});

router.get('/movies', async (req, res) => {
  res.json(await enrichedFavorites(req.session.userId, 'movie'));
});

router.get('/tv', async (req, res) => {
  res.json(await enrichedFavorites(req.session.userId, 'tv'));
});

router.post('/:mediaType/:tmdbId', validMediaType, (req, res) => {
  upsertFavorite.run(req.session.userId, req.params.tmdbId, req.params.mediaType);
  res.status(204).end();
});

router.delete('/:mediaType/:tmdbId', validMediaType, (req, res) => {
  deleteFavorite.run(req.session.userId, req.params.tmdbId, req.params.mediaType);
  res.status(204).end();
});

module.exports = router;
