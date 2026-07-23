const express = require('express');
const db = require('../db');
const { fetchTmdb } = require('../tmdbClient');

const router = express.Router();

const getWatchedMovieIds = db.prepare('SELECT tmdb_id FROM watched_movies WHERE user_id = ?');
const getEpisodeCountsByShow = db.prepare(
  'SELECT show_id, COUNT(*) AS watched_count FROM watched_episodes WHERE user_id = ? GROUP BY show_id'
);
const getFavoritesCount = db.prepare('SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?');
const getRatingsAggregate = db.prepare('SELECT COUNT(*) AS count, AVG(rating) AS average FROM ratings WHERE user_id = ?');

const DEFAULT_EPISODE_RUNTIME_MINUTES = 30;

router.get('/', async (req, res) => {
  const userId = req.session.userId;

  const watchedMovies = getWatchedMovieIds.all(userId);
  const episodeCountsByShow = getEpisodeCountsByShow.all(userId);
  const episodesWatched = episodeCountsByShow.reduce((sum, row) => sum + row.watched_count, 0);
  const favoritesCount = getFavoritesCount.get(userId).count;
  const ratingsAggregate = getRatingsAggregate.get(userId);

  const [movieRuntimes, showRuntimes] = await Promise.all([
    Promise.all(watchedMovies.map(row => fetchTmdb(`/movie/${row.tmdb_id}`).then(data => (data && data.runtime) || 0))),
    Promise.all(episodeCountsByShow.map(async row => {
      const show = await fetchTmdb(`/tv/${row.show_id}`);
      const episodeRuntime = (show && show.episode_run_time && show.episode_run_time[0]) || DEFAULT_EPISODE_RUNTIME_MINUTES;
      return episodeRuntime * row.watched_count;
    })),
  ]);

  const totalWatchMinutes = [...movieRuntimes, ...showRuntimes].reduce((sum, minutes) => sum + minutes, 0);

  res.json({
    moviesWatched: watchedMovies.length,
    showsTracked: episodeCountsByShow.length,
    episodesWatched,
    favorites: favoritesCount,
    ratingsGiven: ratingsAggregate.count,
    averageRating: ratingsAggregate.average ? Math.round(ratingsAggregate.average * 10) / 10 : null,
    totalWatchMinutes,
  });
});

module.exports = router;
