const express = require('express');
const db = require('../db');
const { fetchTmdb, fetchMediaSummary } = require('../tmdbClient');
const { computeNewEpisodeSeasons } = require('../newEpisodes');

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
const getLastWatchedAtForShow = db.prepare(
  'SELECT MAX(watched_at) AS lastWatchedAt FROM watched_episodes WHERE user_id = ? AND show_id = ?'
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
  const userId = req.session.userId;
  const includeNew = req.query.includeNewEpisodes === 'true';
  const rows = getDistinctWatchedShows.all(userId);
  const enriched = await Promise.all(rows.map(async row => {
    const [summary, show] = await Promise.all([
      fetchMediaSummary(row.show_id, 'tv'),
      fetchTmdb(`/tv/${row.show_id}`),
    ]);
    if (!summary) return null;
    const total = show ? show.number_of_episodes : null;
    const watched = row.watched_count;

    let hasNewEpisodes = false;
    if (includeNew && total != null && watched < total) {
      const watchedRows = getWatchedEpisodes.all(userId, row.show_id);
      const { lastWatchedAt } = getLastWatchedAtForShow.get(userId, row.show_id);
      ({ hasNewEpisodes } = await computeNewEpisodeSeasons({
        tmdbId: row.show_id,
        watchedRows,
        lastWatchedAt,
        show,
      }));
    }

    return { ...summary, watched, total, hasNewEpisodes };
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

router.get('/shows/:tmdbId/episodes', async (req, res) => {
  const userId = req.session.userId;
  const tmdbId = req.params.tmdbId;

  const watchedRows = getWatchedEpisodes.all(userId, tmdbId);
  const { lastWatchedAt } = getLastWatchedAtForShow.get(userId, tmdbId);

  let newSeasonNumbers = [];
  if (lastWatchedAt) {
    const show = await fetchTmdb(`/tv/${tmdbId}`);
    if (show) {
      ({ newSeasonNumbers } = await computeNewEpisodeSeasons({ tmdbId, watchedRows, lastWatchedAt, show }));
    }
  }

  res.json({
    episodes: watchedRows.map(r => ({ seasonNumber: r.season_number, episodeNumber: r.episode_number })),
    lastWatchedAt,
    newSeasonNumbers,
  });
});

router.get('/shows/:tmdbId/progress', async (req, res) => {
  const show = await fetchTmdb(`/tv/${req.params.tmdbId}`);
  const total = show ? show.number_of_episodes : null;
  const { count } = countWatchedEpisodes.get(req.session.userId, req.params.tmdbId);
  res.json({ watched: count, total });
});

module.exports = router;
