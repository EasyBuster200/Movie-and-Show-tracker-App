const express = require('express');
const db = require('../db');
const { fetchTmdb, fetchMediaSummary } = require('../tmdbClient');

const router = express.Router();

const upsertWatchedMovie = db.prepare(
  'INSERT OR REPLACE INTO watched_movies (user_id, tmdb_id, watched_at) VALUES (?, ?, datetime(\'now\'))'
);
const deleteWatchedMovie = db.prepare('DELETE FROM watched_movies WHERE user_id = ? AND tmdb_id = ?');
const getWatchedMovies = db.prepare('SELECT tmdb_id FROM watched_movies WHERE user_id = ?');
const getDistinctWatchedShows = db.prepare(
  'SELECT show_id, COUNT(*) AS watched_count FROM watched_episodes WHERE user_id = ? GROUP BY show_id'
);

const upsertWatchedEpisode = db.prepare(
  `INSERT OR REPLACE INTO watched_episodes (user_id, show_id, season_number, episode_number, watched_at)
   VALUES (?, ?, ?, ?, datetime('now'))`
);
const deleteWatchedEpisode = db.prepare(
  'DELETE FROM watched_episodes WHERE user_id = ? AND show_id = ? AND season_number = ? AND episode_number = ?'
);
const getWatchedEpisodes = db.prepare(
  'SELECT season_number, episode_number FROM watched_episodes WHERE user_id = ? AND show_id = ?'
);
const countWatchedEpisodes = db.prepare(
  'SELECT COUNT(*) AS count FROM watched_episodes WHERE user_id = ? AND show_id = ?'
);

router.post('/movies/:tmdbId', (req, res) => {
  upsertWatchedMovie.run(req.session.userId, req.params.tmdbId);
  res.status(204).end();
});

router.delete('/movies/:tmdbId', (req, res) => {
  deleteWatchedMovie.run(req.session.userId, req.params.tmdbId);
  res.status(204).end();
});

router.get('/movies', (req, res) => {
  const rows = getWatchedMovies.all(req.session.userId);
  res.json(rows.map(r => r.tmdb_id));
});

router.get('/movies/details', async (req, res) => {
  const rows = getWatchedMovies.all(req.session.userId);
  const enriched = await Promise.all(rows.map(row => fetchMediaSummary(row.tmdb_id, 'movie')));
  res.json(enriched.filter(Boolean));
});

router.get('/shows', async (req, res) => {
  const rows = getDistinctWatchedShows.all(req.session.userId);
  const enriched = await Promise.all(rows.map(async row => {
    const [summary, show] = await Promise.all([
      fetchMediaSummary(row.show_id, 'tv'),
      fetchTmdb(`/tv/${row.show_id}`),
    ]);
    if (!summary) return null;
    return { ...summary, watched: row.watched_count, total: show ? show.number_of_episodes : null };
  }));
  res.json(enriched.filter(Boolean));
});

router.post('/shows/:tmdbId/season/:seasonNumber/episode/:episodeNumber', (req, res) => {
  upsertWatchedEpisode.run(req.session.userId, req.params.tmdbId, req.params.seasonNumber, req.params.episodeNumber);
  res.status(204).end();
});

router.delete('/shows/:tmdbId/season/:seasonNumber/episode/:episodeNumber', (req, res) => {
  deleteWatchedEpisode.run(req.session.userId, req.params.tmdbId, req.params.seasonNumber, req.params.episodeNumber);
  res.status(204).end();
});

router.get('/shows/:tmdbId/episodes', (req, res) => {
  const rows = getWatchedEpisodes.all(req.session.userId, req.params.tmdbId);
  res.json(rows.map(r => ({ seasonNumber: r.season_number, episodeNumber: r.episode_number })));
});

router.get('/shows/:tmdbId/progress', async (req, res) => {
  const show = await fetchTmdb(`/tv/${req.params.tmdbId}`);
  const total = show ? show.number_of_episodes : null;
  const { count } = countWatchedEpisodes.get(req.session.userId, req.params.tmdbId);
  res.json({ watched: count, total });
});

module.exports = router;
