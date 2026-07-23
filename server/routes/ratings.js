const express = require('express');
const db = require('../db');

const router = express.Router();

const upsertRating = db.prepare(
  `INSERT INTO ratings (user_id, tmdb_id, media_type, rating, rated_at)
   VALUES (?, ?, ?, ?, datetime('now'))
   ON CONFLICT (user_id, tmdb_id, media_type) DO UPDATE SET rating = excluded.rating, rated_at = excluded.rated_at`
);
const deleteRating = db.prepare('DELETE FROM ratings WHERE user_id = ? AND tmdb_id = ? AND media_type = ?');
const getRating = db.prepare('SELECT rating FROM ratings WHERE user_id = ? AND tmdb_id = ? AND media_type = ?');

function validMediaType(req, res, next) {
  if (!['movie', 'tv'].includes(req.params.mediaType)) {
    return res.status(400).json({ error: 'mediaType must be movie or tv' });
  }
  next();
}

router.get('/:mediaType/:tmdbId', validMediaType, (req, res) => {
  const row = getRating.get(req.session.userId, req.params.tmdbId, req.params.mediaType);
  res.json({ rating: row ? row.rating : null });
});

router.put('/:mediaType/:tmdbId', validMediaType, (req, res) => {
  const { rating } = req.body || {};
  const value = Number(rating);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    return res.status(400).json({ error: 'rating must be an integer between 1 and 10' });
  }
  upsertRating.run(req.session.userId, req.params.tmdbId, req.params.mediaType, value);
  res.status(204).end();
});

router.delete('/:mediaType/:tmdbId', validMediaType, (req, res) => {
  deleteRating.run(req.session.userId, req.params.tmdbId, req.params.mediaType);
  res.status(204).end();
});

module.exports = router;
