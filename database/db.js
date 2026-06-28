const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.resolve(__dirname, '..', 'database.sqlite');
let db;

function initDatabase() {
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      userId TEXT PRIMARY KEY,
      balance REAL NOT NULL DEFAULT 0,
      lastWork INTEGER DEFAULT NULL,
      lastDaily INTEGER DEFAULT NULL,
      dailyStreak INTEGER NOT NULL DEFAULT 0
    )
  `);

  try {
    db.exec('ALTER TABLE users ADD COLUMN muted INTEGER NOT NULL DEFAULT 0');
  } catch {}

  return db;
}

function getDb() {
  if (!db) initDatabase();
  return db;
}

function getUser(userId) {
  const stmt = getDb().prepare('SELECT * FROM users WHERE userId = ?');
  return stmt.get(userId);
}

function createUserIfNotExists(userId) {
  const stmt = getDb().prepare(
    'INSERT OR IGNORE INTO users (userId, balance) VALUES (?, 0)'
  );
  stmt.run(userId);
  return getUser(userId);
}

function updateBalance(userId, amount) {
  const stmt = getDb().prepare(
    'UPDATE users SET balance = balance + ? WHERE userId = ?'
  );
  stmt.run(amount, userId);
}

function setCooldown(userId, field, timestamp) {
  const allowed = ['lastWork', 'lastDaily'];
  if (!allowed.includes(field)) throw new Error(`Invalid field: ${field}`);

  const stmt = getDb().prepare(
    `UPDATE users SET ${field} = ? WHERE userId = ?`
  );
  stmt.run(timestamp, userId);
}

function setDailyStreak(userId, streak) {
  const stmt = getDb().prepare(
    'UPDATE users SET dailyStreak = ? WHERE userId = ?'
  );
  stmt.run(streak, userId);
}

function setMuted(userId, muted) {
  const stmt = getDb().prepare(
    'UPDATE users SET muted = ? WHERE userId = ?'
  );
  stmt.run(muted ? 1 : 0, userId);
}

function getTopUsers(limit = 10) {
  const stmt = getDb().prepare(
    'SELECT userId, balance FROM users ORDER BY balance DESC LIMIT ?'
  );
  return stmt.all(limit);
}

function transaction(callback) {
  const trx = getDb().transaction(callback);
  return trx();
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function getDbPath() {
  return dbPath;
}

module.exports = {
  initDatabase,
  getDb,
  getUser,
  createUserIfNotExists,
  updateBalance,
  setCooldown,
  setDailyStreak,
  setMuted,
  getTopUsers,
  transaction,
  closeDb,
  getDbPath,
};
