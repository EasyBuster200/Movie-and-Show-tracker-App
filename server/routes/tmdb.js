const express = require('express');

const router = express.Router();
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

async function proxyToTmdb(tmdbPath, req, res) {
  const query = new URLSearchParams(req.query).toString();
  const url = `${TMDB_BASE_URL}${tmdbPath}${query ? `?${query}` : ''}`;

  try {
    const tmdbResponse = await fetch(url, {
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${process.env.TMDB_ACCESS_TOKEN}`,
      },
    });
    const data = await tmdbResponse.json();
    res.status(tmdbResponse.status).json(data);
  } catch (error) {
    console.error('TMDB proxy error:', error);
    res.status(502).json({ error: 'Failed to reach TMDB' });
  }
}

router.get('/trending/movie/day', (req, res) => proxyToTmdb('/trending/movie/day', req, res));
router.get('/trending/tv/day', (req, res) => proxyToTmdb('/trending/tv/day', req, res));
router.get('/search/multi', (req, res) => proxyToTmdb('/search/multi', req, res));
router.get('/movie/:id', (req, res) => proxyToTmdb(`/movie/${req.params.id}`, req, res));
router.get('/tv/:id', (req, res) => proxyToTmdb(`/tv/${req.params.id}`, req, res));
router.get('/tv/:id/season/:seasonNumber', (req, res) =>
  proxyToTmdb(`/tv/${req.params.id}/season/${req.params.seasonNumber}`, req, res)
);

module.exports = router;
