const express = require('express');
const db = require('../db');
const { fetchMediaSummary } = require('../tmdbClient');

const router = express.Router();

const getListsForUser = db.prepare(`
  SELECT l.id, l.name, l.is_default, COUNT(li.id) AS item_count
  FROM lists l
  LEFT JOIN list_items li ON li.list_id = l.id
  WHERE l.user_id = ?
  GROUP BY l.id
  ORDER BY l.is_default DESC, l.created_at ASC
`);
const insertList = db.prepare('INSERT INTO lists (user_id, name) VALUES (?, ?)');
const findListOwnedByUser = db.prepare('SELECT * FROM lists WHERE id = ? AND user_id = ?');
const deleteList = db.prepare('DELETE FROM lists WHERE id = ?');
const getListItems = db.prepare('SELECT tmdb_id, media_type, added_at FROM list_items WHERE list_id = ? ORDER BY added_at DESC');
const insertListItem = db.prepare('INSERT OR IGNORE INTO list_items (list_id, tmdb_id, media_type) VALUES (?, ?, ?)');
const deleteListItem = db.prepare('DELETE FROM list_items WHERE list_id = ? AND tmdb_id = ? AND media_type = ?');
const getMembership = db.prepare(`
  SELECT li.list_id
  FROM list_items li
  JOIN lists l ON l.id = li.list_id
  WHERE l.user_id = ? AND li.tmdb_id = ? AND li.media_type = ?
`);

function requireOwnedList(req, res, next) {
  const list = findListOwnedByUser.get(req.params.listId, req.session.userId);
  if (!list) return res.status(404).json({ error: 'List not found' });
  req.list = list;
  next();
}

router.get('/', (req, res) => {
  res.json(getListsForUser.all(req.session.userId));
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const { lastInsertRowid } = insertList.run(req.session.userId, name.trim());
    res.status(201).json({ id: lastInsertRowid, name: name.trim(), is_default: 0, item_count: 0 });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'You already have a list with that name' });
    }
    throw err;
  }
});

router.get('/membership/:mediaType/:tmdbId', (req, res) => {
  const rows = getMembership.all(req.session.userId, req.params.tmdbId, req.params.mediaType);
  res.json({ listIds: rows.map(r => r.list_id) });
});

router.delete('/:listId', requireOwnedList, (req, res) => {
  if (req.list.is_default) {
    return res.status(400).json({ error: 'Cannot delete the default Bookmarks list' });
  }
  deleteList.run(req.list.id);
  res.status(204).end();
});

router.get('/:listId/items', requireOwnedList, async (req, res) => {
  const items = getListItems.all(req.list.id);
  const enriched = await Promise.all(
    items.map(async item => {
      const summary = await fetchMediaSummary(item.tmdb_id, item.media_type);
      return summary || { tmdbId: item.tmdb_id, mediaType: item.media_type, title: 'Unknown', year: null, posterPath: null, voteAverage: null };
    })
  );
  res.json(enriched);
});

router.post('/:listId/items', requireOwnedList, (req, res) => {
  const { tmdbId, mediaType } = req.body || {};
  if (!tmdbId || !['movie', 'tv'].includes(mediaType)) {
    return res.status(400).json({ error: 'tmdbId and mediaType (movie|tv) are required' });
  }
  insertListItem.run(req.list.id, tmdbId, mediaType);
  res.status(201).end();
});

router.delete('/:listId/items/:tmdbId/:mediaType', requireOwnedList, (req, res) => {
  deleteListItem.run(req.list.id, req.params.tmdbId, req.params.mediaType);
  res.status(204).end();
});

module.exports = router;
