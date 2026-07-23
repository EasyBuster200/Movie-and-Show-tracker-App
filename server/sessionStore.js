const session = require('express-session');
const db = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid     TEXT PRIMARY KEY,
    sess    TEXT NOT NULL,
    expired INTEGER NOT NULL
  )
`);

const getStmt = db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?');
const setStmt = db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)');
const destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
const pruneStmt = db.prepare('DELETE FROM sessions WHERE expired < ?');

class SqliteSessionStore extends session.Store {
  get(sid, callback) {
    try {
      const row = getStmt.get(sid);
      if (!row || row.expired < Date.now()) return callback(null, null);
      callback(null, JSON.parse(row.sess));
    } catch (err) {
      callback(err);
    }
  }

  set(sid, sessionData, callback) {
    try {
      const expired = Date.now() + (sessionData.cookie.maxAge || 86400000);
      setStmt.run(sid, JSON.stringify(sessionData), expired);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      destroyStmt.run(sid);
      callback(null);
    } catch (err) {
      callback(err);
    }
  }

  touch(sid, sessionData, callback) {
    this.set(sid, sessionData, callback);
  }
}

setInterval(() => pruneStmt.run(Date.now()), 60 * 60 * 1000);

module.exports = SqliteSessionStore;
