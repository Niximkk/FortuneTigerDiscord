const { test, after } = require('node:test');
const assert = require('node:assert/strict');
process.env.DB_PATH = ':memory:';
const db = require('../database/db');
const config = require('../config.json');
after(() => db.closeDb());

test('initialization is idempotent and applies the mute migration', () => {
  assert.equal(db.initDatabase(), db.initDatabase());
  const user = db.createUserIfNotExists('new');
  assert.equal(user.balance, config.currency.initialBalance);
  assert.equal(user.muted, 0);
});

test('balance updates round cents and reject non-finite values', () => {
  db.createUserIfNotExists('rounding');
  db.updateBalance('rounding', 0.1);
  db.updateBalance('rounding', 0.2);
  assert.equal(db.getUser('rounding').balance, config.currency.initialBalance + 0.3);
  assert.throws(() => db.updateBalance('rounding', NaN), TypeError);
});

test('failed transfers roll back both balances', () => {
  db.createUserIfNotExists('sender');
  db.createUserIfNotExists('recipient');
  db.updateBalance('sender', 10);
  const before = db.getUser('sender').balance;
  assert.throws(() => db.transaction(() => {
    db.updateBalance('sender', -5);
    db.updateBalance('recipient', 5);
    throw new Error('rollback');
  }));
  assert.equal(db.getUser('sender').balance, before);
  assert.equal(db.getUser('recipient').balance, config.currency.initialBalance);
});
