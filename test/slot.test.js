const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SYMBOLS, evaluatePaylines, getRespinStates } = require('../utils/slot');

test('wild substitutes for symbols and incomplete lines do not pay', () => {
  const orange = SYMBOLS.find(s => s.id === 'Laranja');
  const wild = SYMBOLS.find(s => s.id === 'Wild');
  const result = evaluatePaylines([
    [orange, wild, orange],
    [null, null, null],
    [null, null, null],
  ], 5);
  assert.equal(result.totalWin, orange.payout);
  assert.equal(result.winningLines.length, 1);
});

test('all-wild grid pays all five lines', () => {
  const wild = SYMBOLS.find(s => s.id === 'Wild');
  const result = evaluatePaylines(Array.from({ length: 3 }, () => Array(3).fill(wild)), 5);
  assert.equal(result.totalWin, 5 * wild.payout);
  assert.equal(result.winningLines.length, 5);
});

test('respin snapshots preserve locked symbols and respect the limit', () => {
  const target = SYMBOLS.find(s => s.id === 'Laranja');
  const states = getRespinStates(target, 6);
  assert.ok(states.length <= 7);
  assert.ok(states[0].grid.flat().every(s => s === null));
  for (let i = 1; i < states.length; i++) {
    states[i - 1].grid.forEach((row, r) => row.forEach((cell, c) => {
      if (cell) assert.equal(states[i].grid[r][c], cell);
    }));
  }
});
