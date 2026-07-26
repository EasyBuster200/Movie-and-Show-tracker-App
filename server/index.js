require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('./sessionStore');
const authRoutes = require('./routes/auth');
const tmdbRoutes = require('./routes/tmdb');
const listsRoutes = require('./routes/lists');
const watchedRoutes = require('./routes/watched');
const ratingsRoutes = require('./routes/ratings');
const favoritesRoutes = require('./routes/favorites');
const statsRoutes = require('./routes/stats');
const recommendationsRoutes = require('./routes/recommendations');
const requireAuth = require('./middleware/requireAuth');

const app = express();

app.use(express.json());
app.use(session({
  store: new SqliteSessionStore(),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  },
}));

app.use('/api/auth', authRoutes);
app.use('/api/tmdb', tmdbRoutes);
app.use('/api/lists', requireAuth, listsRoutes);
app.use('/api/watched', requireAuth, watchedRoutes);
app.use('/api/ratings', requireAuth, ratingsRoutes);
app.use('/api/favorites', requireAuth, favoritesRoutes);
app.use('/api/stats', requireAuth, statsRoutes);
app.use('/api/recommendations', requireAuth, recommendationsRoutes);

app.use(express.static(path.join(__dirname, '..')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
