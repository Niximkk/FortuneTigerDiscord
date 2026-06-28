const config = require('../config.json');

const SYMBOLS = [
  { id: 'Wild', weight: 2, payout: 250 },
  { id: 'ObjetosDourados', weight: 3, payout: 100 },
  { id: 'SacoDeMoedas', weight: 6, payout: 10 },
  { id: 'JoiasVerdes', weight: 8, payout: 25 },
  { id: 'FogosDeArtificio', weight: 15, payout: 5 },
  { id: 'CartasDeMoedas', weight: 20, payout: 8 },
  { id: 'Laranja', weight: 30, payout: 3 },
];

const PAYLINES = [
  { name: 'Top', positions: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }] },
  { name: 'Middle', positions: [{ col: 0, row: 1 }, { col: 1, row: 1 }, { col: 2, row: 1 }] },
  { name: 'Bottom', positions: [{ col: 0, row: 2 }, { col: 1, row: 2 }, { col: 2, row: 2 }] },
  { name: 'Diagonal 1', positions: [{ col: 0, row: 0 }, { col: 1, row: 1 }, { col: 2, row: 2 }] },
  { name: 'Diagonal 2', positions: [{ col: 0, row: 2 }, { col: 1, row: 1 }, { col: 2, row: 0 }] },
];

function weightedPick(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  let rand = Math.random() * totalWeight;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

function pickTargetSymbol() {
  const featureWeights = [
    { id: 'ObjetosDourados', weight: 2, payout: 100 },
    { id: 'JoiasVerdes', weight: 5, payout: 25 },
    { id: 'SacoDeMoedas', weight: 9, payout: 10 },
    { id: 'CartasDeMoedas', weight: 14, payout: 8 },
    { id: 'FogosDeArtificio', weight: 18, payout: 5 },
    { id: 'Laranja', weight: 22, payout: 3 },
  ];
  return weightedPick(featureWeights);
}

function generateGrid() {
  const grid = [];
  for (let row = 0; row < 3; row++) {
    const r = [];
    for (let col = 0; col < 3; col++) {
      r.push(weightedPick(SYMBOLS));
    }
    grid.push(r);
  }
  return grid;
}

function evaluatePaylines(grid, totalBet) {
  const betPerLine = totalBet / PAYLINES.length;
  let totalWin = 0;
  const winningLines = [];

  for (const line of PAYLINES) {
    const symbols = line.positions.map((p) => grid[p.row][p.col]);

    if (symbols.some((s) => s === null)) continue;

    const firstNonWild = symbols.find((s) => s.id !== 'Wild') || symbols[0];

    const allMatch = symbols.every(
      (s) => s.id === firstNonWild.id || s.id === 'Wild'
    );

    if (allMatch) {
      const payoutMultiplier = firstNonWild.payout;
      totalWin += payoutMultiplier * betPerLine;
      winningLines.push({ line: line.name, symbol: firstNonWild, multiplier: payoutMultiplier });
    }
  }

  return { totalWin, winningLines };
}

function getWinningPositionsSet(winningLines) {
  const posSet = new Set();
  for (const wl of winningLines) {
    const lineDef = PAYLINES.find((l) => l.name === wl.line);
    if (lineDef) {
      for (const p of lineDef.positions) {
        posSet.add(`${p.col},${p.row}`);
      }
    }
  }
  return posSet;
}

function performRespins(targetSymbol, maxRespins) {
  const grid = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];

  const fixed = [
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ];

  const { respinTargetChance, respinWildChance, minRespins } = config.slot;

  let respinCount = 0;
  let changed = true;

  while ((changed || respinCount < minRespins) && respinCount < maxRespins) {
    changed = false;
    respinCount++;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (fixed[row][col]) continue;

        const roll = Math.random();
        if (roll < respinTargetChance) {
          grid[row][col] = targetSymbol;
          fixed[row][col] = true;
          changed = true;
        } else if (roll < respinTargetChance + respinWildChance) {
          const wild = SYMBOLS.find((s) => s.id === 'Wild');
          grid[row][col] = wild;
          fixed[row][col] = true;
          changed = true;
        }
      }
    }
  }

  const isFull = grid.every((row) => row.every((cell) => cell !== null));
  return { grid, respinCount, isFull };
}

function getRespinStates(targetSymbol, maxRespins) {
  const states = [];

  const grid = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];

  const fixed = [
    [false, false, false],
    [false, false, false],
    [false, false, false],
  ];

  const { respinTargetChance, respinWildChance, minRespins } = config.slot;

  states.push({
    grid: grid.map((row) => [...row]),
    respinIndex: 0,
    changed: false,
    isFull: false,
  });

  let respinCount = 0;
  let changed = true;

  while ((changed || respinCount < minRespins) && respinCount < maxRespins) {
    changed = false;
    respinCount++;

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        if (fixed[row][col]) continue;

        const roll = Math.random();
        if (roll < respinTargetChance) {
          grid[row][col] = targetSymbol;
          fixed[row][col] = true;
          changed = true;
        } else if (roll < respinTargetChance + respinWildChance) {
          const wild = SYMBOLS.find((s) => s.id === 'Wild');
          grid[row][col] = wild;
          fixed[row][col] = true;
          changed = true;
        }
      }
    }

    states.push({
      grid: grid.map((row) => [...row]),
      respinIndex: respinCount,
      changed,
      isFull: grid.every((row) => row.every((cell) => cell !== null)),
    });
  }

  if (states.length > 1 && states[states.length - 1].isFull) {
    const last = states[states.length - 1];
    states[states.length - 1] = { ...last, isFull: true };
  }

  return states;
}

function spin(bet) {
  const triggerChance = config.slot.featureBaseChance;
  const featureTriggered = Math.random() < triggerChance;

  let grid;
  let winningLines = [];
  let totalWin = 0;
  let featureActive = false;
  let fullScreenX10 = false;
  let respinCount = 0;
  let targetSymbol = null;
  let respinStates = null;

  if (featureTriggered) {
    featureActive = true;
    targetSymbol = pickTargetSymbol();
    const result = performRespins(targetSymbol, config.slot.maxRespins);
    grid = result.grid;
    respinCount = result.respinCount;
    fullScreenX10 = result.isFull;

    const evalResult = evaluatePaylines(grid, bet);
    totalWin = evalResult.totalWin;
    winningLines = evalResult.winningLines;

    if (fullScreenX10) {
      totalWin *= config.slot.fullScreenMultiplier;
    }
  } else {
    const rawGrid = generateGrid();
    const evalResult = evaluatePaylines(rawGrid, bet);
    totalWin = evalResult.totalWin;
    winningLines = evalResult.winningLines;
    grid = rawGrid;
  }

  return {
    grid,
    totalWin: Math.round(totalWin * 100) / 100,
    winningLines,
    featureActive,
    fullScreenX10,
    respinCount,
    targetSymbol: targetSymbol ? targetSymbol.id : null,
  };
}

module.exports = {
  SYMBOLS,
  PAYLINES,
  spin,
  evaluatePaylines,
  getWinningPositionsSet,
  generateGrid,
  pickTargetSymbol,
  getRespinStates,
  performRespins,
};
