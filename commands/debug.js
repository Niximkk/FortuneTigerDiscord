const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('../config.json');
const { emojis, ui } = require('../utils/emojis');
const { formatCurrency } = require('../utils/format');
const slotUtils = require('../utils/slot');
const versionData = require('../version.json');

const OWNER_ID = '973010982282596412';

const GIF_URLS = {
  'idle.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/jkfl1hbp.gif',
  'wild.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/8k4c80wc.gif',
  'throw_card.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/e699clqp.gif',
  'big_win.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/pmsxmssj.gif',
};

const ACCENT = 0xd2a838;
const FAKE_BALANCE = 100000;

let debugBet = 5;
let debugBalance = FAKE_BALANCE;
let debugGrid = null;
let debugResult = null;
let debugLog = [];
let lastInteraction = null;

function addLog(msg) {
  debugLog.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${msg}`);
  if (debugLog.length > 40) debugLog.shift();
}

function getSymbolEmoji(symbol) {
  return emojis[symbol.id] || symbol.id;
}

function buildGridRows(grid, winPosSet, enabled) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c = 0; c < 3; c++) {
      const cell = grid[r][c];
      if (!cell) {
        btns.push(new ButtonBuilder().setCustomId(`cell_${r}_${c}`).setLabel('·').setStyle(ButtonStyle.Secondary).setDisabled(true));
        continue;
      }
      const key = `${c},${r}`;
      const isWin = winPosSet && winPosSet.has(key);
      btns.push(
        new ButtonBuilder()
          .setCustomId(`cell_${r}_${c}`)
          .setEmoji(getSymbolEmoji(cell))
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(true),
      );
    }
    rows.push(new ActionRowBuilder().addComponents(btns));
  }
  return rows;
}

function buildActionRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('debug_less').setEmoji(ui.less).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('debug_spin').setLabel('SPIN').setEmoji(ui.spinner).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('debug_plus').setEmoji(ui.plus).setStyle(ButtonStyle.Secondary),
  );
}

function buildForceRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('force_win').setLabel('WIN').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('force_bigwin').setLabel('BIG').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('force_feature').setLabel('FEAT').setEmoji('🃏').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('force_full').setLabel('FULL').setEmoji('🔟').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('force_auto').setLabel('AUTO').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
  );
}

function pickGif(result) {
  if (!result) return 'idle.gif';
  if (result.isBigWin) return 'big_win.gif';
  if (result.featureActive) return 'throw_card.gif';
  const flat = result.grid.flat();
  if (flat.some((s) => s && s.id === 'Wild')) return 'wild.gif';
  if (result.totalWin > 0) return 'big_win.gif';
  return 'idle.gif';
}

async function doSpin(bet, forceOpts) {
  const opts = forceOpts || {};

  if (opts.feature) {
    const target = slotUtils.pickTargetSymbol();
    addLog(`Feature forçado — alvo: ${target.id}`);
    const raw = slotUtils.performRespins(target, config.slot.maxRespins);
    const evalRes = slotUtils.evaluatePaylines(raw.grid, bet);
    let totalWin = evalRes.totalWin;
    if (raw.isFull) totalWin *= config.slot.fullScreenMultiplier;
    const winPosSet = slotUtils.getWinningPositionsSet(evalRes.winningLines);
    const isBigWin = totalWin >= bet * config.audio.bigWinThreshold;
    addLog(`Feature: ${raw.respinCount} respins, full=${raw.isFull}, win=${formatCurrency(totalWin)}`);
    return { grid: raw.grid, totalWin: Math.round(totalWin * 100) / 100, winningLines: evalRes.winningLines, winPosSet, featureActive: true, fullScreenX10: raw.isFull, respinCount: raw.respinCount, isBigWin };
  }

  if (opts.forceWin) {
    addLog(`Forçando WIN (tentativas até acertar)`);
    let raw;
    let attempts = 0;
    do {
      raw = slotUtils.spin(bet);
      attempts++;
    } while (raw.totalWin <= 0 && attempts < 1000);
    const winPosSet = slotUtils.getWinningPositionsSet(raw.winningLines);
    const isBigWin = raw.totalWin >= bet * config.audio.bigWinThreshold;
    addLog(`Win após ${attempts} tentativas: ${formatCurrency(raw.totalWin)}`);
    return { ...raw, winPosSet, isBigWin };
  }

  if (opts.bigWin) {
    addLog(`Forçando BIG WIN`);
    const grid = Array.from({ length: 3 }, () =>
      Array.from({ length: 3 }, () => ({ id: 'ObjetosDourados', weight: 1, payout: 100 }))
    );
    const evalRes = slotUtils.evaluatePaylines(grid, bet);
    const totalWin = evalRes.totalWin;
    const winPosSet = slotUtils.getWinningPositionsSet(evalRes.winningLines);
    addLog(`BigWin forçado: ${formatCurrency(totalWin)}`);
    return { grid, totalWin: Math.round(totalWin * 100) / 100, winningLines: evalRes.winningLines, winPosSet, featureActive: false, fullScreenX10: false, respinCount: 0, isBigWin: true };
  }

  if (opts.fullScreen) {
    addLog(`Forçando FULL SCREEN (feature 3x3 completo)`);
    const target = slotUtils.pickTargetSymbol();
    let bestResult = null;
    for (let attempt = 0; attempt < 100; attempt++) {
      const raw = slotUtils.performRespins(target, config.slot.maxRespins);
      if (raw.isFull) {
        const evalRes = slotUtils.evaluatePaylines(raw.grid, bet);
        let totalWin = evalRes.totalWin * config.slot.fullScreenMultiplier;
        const winPosSet = slotUtils.getWinningPositionsSet(evalRes.winningLines);
        const isBigWin = true;
        addLog(`FullScreen no attempt ${attempt + 1}: ${raw.respinCount} respins, win=${formatCurrency(totalWin)}`);
        bestResult = { grid: raw.grid, totalWin: Math.round(totalWin * 100) / 100, winningLines: evalRes.winningLines, winPosSet, featureActive: true, fullScreenX10: true, respinCount: raw.respinCount, isBigWin };
        break;
      }
    }
    if (!bestResult) {
      addLog(`⚠️ FullScreen falhou após 100 tentativas, gerando manual`);
      const grid = Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => ({ id: 'SacoDeMoedas', weight: 1, payout: 10 }))
      );
      const evalRes = slotUtils.evaluatePaylines(grid, bet);
      let totalWin = evalRes.totalWin * config.slot.fullScreenMultiplier;
      const winPosSet = slotUtils.getWinningPositionsSet(evalRes.winningLines);
      bestResult = { grid, totalWin: Math.round(totalWin * 100) / 100, winningLines: evalRes.winningLines, winPosSet, featureActive: true, fullScreenX10: true, respinCount: 0, isBigWin: true };
    }
    return bestResult;
  }

  const raw = slotUtils.spin(bet);
  const winPosSet = slotUtils.getWinningPositionsSet(raw.winningLines);
  const isBigWin = raw.totalWin >= bet * config.audio.bigWinThreshold || raw.fullScreenX10;
  addLog(`Spin: win=${formatCurrency(raw.totalWin)}, feature=${raw.featureActive}, lines=${raw.winningLines.length}`);
  if (raw.featureActive && raw.respinCount > 0) {
    addLog(`  → ${raw.respinCount} respins, target=${raw.targetSymbol}, full=${raw.fullScreenX10}`);
  }
  for (const l of raw.winningLines) {
    addLog(`  → ${l.line}: ${l.symbol.id} x${l.multiplier}`);
  }
  const totalCost = raw.featureActive && raw.fullScreenX10 ? bet : bet;
  debugBalance = debugBalance - totalCost + raw.totalWin;
  return { ...raw, winPosSet, isBigWin };
}

async function render(interaction) {
  const c = new ContainerBuilder().setAccentColor(ACCENT);
  const line1 = debugResult
    ? `🔬 **Fortune Tiger — DEBUG** ─ ${debugResult.featureActive ? (debugResult.fullScreenX10 ? '🎰 FULL SCREEN' : '🃏 FEATURE') : debugResult.totalWin > 0 ? (debugResult.isBigWin ? '💥 BIG WIN' : '💰 WIN') : '❌ PERDEU'}`
    : '🔬 **Fortune Tiger — DEBUG** ─ Pronto para girar';
  c.addTextDisplayComponents((td) => td.setContent(line1));
  c.addSeparatorComponents((s) => s);

  const gifUrl = GIF_URLS[pickGif(debugResult)];
  c.addMediaGalleryComponents((mg) => mg.addItems((item) => item.setURL(gifUrl)));
  c.addSeparatorComponents((s) => s);

  const winPosSet = debugResult ? (debugResult.winPosSet || new Set()) : new Set();
  const gridToShow = debugGrid || (debugResult ? debugResult.grid : slotUtils.generateGrid());
  for (const gr of buildGridRows(gridToShow, winPosSet, true)) c.addActionRowComponents(() => gr);

  if (debugResult && debugResult.featureActive && debugResult.respinCount > 0) {
    c.addTextDisplayComponents((td) => td.setContent(`${emojis.Carta} ${debugResult.respinCount} giros extras`));
    c.addSeparatorComponents((s) => s);
  }

  if (debugResult && debugResult.totalWin > 0) {
    c.addTextDisplayComponents((td) => td.setContent(`**${debugResult.isBigWin ? 'BIG WIN' : 'WIN'} ${formatCurrency(debugResult.totalWin)}**`));
  }
  c.addTextDisplayComponents((td) =>
    td.setContent(`${ui.profile} ${formatCurrency(debugBalance)}  |  WIN ${formatCurrency(debugResult ? debugResult.totalWin : 0)}  |  ${ui.profile} ${formatCurrency(debugBet)}`)
  );
  c.addSeparatorComponents((s) => s);
  c.addActionRowComponents(buildActionRow);
  c.addActionRowComponents(buildForceRow);

  // Debug detail panel
  const detailLines = [];
  if (debugResult) {
    detailLines.push(`RNG    | featureChance=${config.slot.featureBaseChance}`);
    detailLines.push(`State  | bet=${debugBet} | bal=${formatCurrency(debugBalance)} | totalWin=${formatCurrency(debugResult.totalWin)}`);
    detailLines.push(`Grid   | ${debugResult.grid.flat().map((s) => s ? s.id : 'null').join(', ')}`);
    detailLines.push(`Paylines | ${debugResult.winningLines.length} winning`);
    detailLines.push(`Feature | active=${debugResult.featureActive} | respins=${debugResult.respinCount} | full=${debugResult.fullScreenX10}`);
  } else {
    detailLines.push(`Pronto para girar | bet=${debugBet} | balance=${formatCurrency(debugBalance)}`);
  }

  const detailC = new ContainerBuilder().setAccentColor(ACCENT);
  detailC.addTextDisplayComponents((td) => td.setContent('**Debug Info**'));
  detailC.addSeparatorComponents((s) => s);
  detailC.addTextDisplayComponents((td) => td.setContent(`\`\`\`yaml\n${detailLines.join('\n')}\n\`\`\``));
  if (debugLog.length > 0) {
    detailC.addSeparatorComponents((s) => s);
    detailC.addTextDisplayComponents((td) => td.setContent(`\`\`\`prolog\n${debugLog.slice(-12).join('\n')}\n\`\`\``));
  }

  await interaction.editReply({ components: [c, detailC], flags: MessageFlags.IsComponentsV2 });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('debug')
    .setDescription('[Owner] Slot Debug — saldo fictício, não altera DB'),
  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: 'Apenas o dono do bot.', ephemeral: true });
    }
    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

    // Loading screen
    const lc = new ContainerBuilder().setAccentColor(ACCENT);
    lc.addTextDisplayComponents((td) => td.setContent('<:777:1520875188797833267> **Carregando Debug**'));
    lc.addSeparatorComponents((s) => s);
    lc.addMediaGalleryComponents((mg) =>
      mg.addItems(
        (item) => item.setURL(GIF_URLS['idle.gif']).setSpoiler(true),
        (item) => item.setURL(GIF_URLS['wild.gif']).setSpoiler(true),
        (item) => item.setURL(GIF_URLS['throw_card.gif']).setSpoiler(true),
        (item) => item.setURL(GIF_URLS['big_win.gif']).setSpoiler(true),
      )
    );
    lc.addSeparatorComponents((s) => s);
    lc.addTextDisplayComponents((td) => td.setContent('Saldo fictício — nada é salvo no banco'));
    await interaction.editReply({ components: [lc], flags: MessageFlags.IsComponentsV2 });
    await new Promise((r) => setTimeout(r, 1500));

    // Init session state
    debugBet = 5;
    debugBalance = FAKE_BALANCE;
    debugGrid = null;
    debugResult = null;
    debugLog = [];
    lastInteraction = interaction;
    addLog('Sessão debug iniciada');
    addLog(`Saldo: ${formatCurrency(FAKE_BALANCE)}, Bet: R$ 5`);

    // Generate lobby grid (no-win)
    let attempts = 0;
    do {
      debugGrid = slotUtils.generateGrid();
      attempts++;
    } while (slotUtils.evaluatePaylines(debugGrid, 1).totalWin > 0 && attempts < 10);
    addLog('Grid lobby gerado');

    await render(interaction);

    const reply = await interaction.fetchReply().catch(() => null);
    if (!reply) return;

    const collector = reply.createMessageComponentCollector({ time: 300000 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== OWNER_ID) {
        return btn.reply({ content: 'Painel exclusivo.', ephemeral: true });
      }
      await btn.deferUpdate();
      const id = btn.customId;

      switch (id) {
        case 'debug_spin': {
          debugResult = await doSpin(debugBet);
          await render(interaction);
          return;
        }
        case 'debug_less': {
          debugBet = Math.max(config.currency.minBet, debugBet - 0.5);
          addLog(`Bet: R$ ${debugBet}`);
          await render(interaction);
          return;
        }
        case 'debug_plus': {
          debugBet = Math.min(config.currency.maxBet, debugBet + 0.5);
          addLog(`Bet: R$ ${debugBet}`);
          await render(interaction);
          return;
        }
        case 'force_win': {
          debugResult = await doSpin(debugBet, { forceWin: true });
          await render(interaction);
          return;
        }
        case 'force_bigwin': {
          debugResult = await doSpin(debugBet, { bigWin: true });
          await render(interaction);
          return;
        }
        case 'force_feature': {
          debugResult = await doSpin(debugBet, { feature: true });
          await render(interaction);
          return;
        }
        case 'force_full': {
          debugResult = await doSpin(debugBet, { fullScreen: true });
          await render(interaction);
          return;
        }
        case 'force_auto': {
          const modal = new ModalBuilder()
            .setCustomId('debug_modal_auto')
            .setTitle('Autospin Debug')
            .addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('count').setLabel('Rodadas (1-20)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(2).setPlaceholder('Ex: 5').setRequired(true),
            ));
          try { await btn.showModal(modal); } catch { return; }
          try {
            const modalSubmit = await btn.awaitModalSubmit({ time: 30000, filter: (m) => m.user.id === btn.user.id });
            await modalSubmit.deferUpdate();
            const count = Math.min(20, Math.max(1, parseInt(modalSubmit.fields.getTextInputValue('count'), 10) || 5));
            addLog(`Autospin ${count}x iniciado`);
            await render(interaction);

            for (let i = count; i > 0; i--) {
              debugResult = await doSpin(debugBet);
              await render(interaction);
              if (i > 1) await new Promise((r) => setTimeout(r, 1500));
            }
            addLog(`Autospin ${count}x concluído`);
          } catch {
            addLog('Autospin cancelado (timeout)');
            await render(interaction);
          }
          return;
        }
      }
    });

    collector.on('end', () => {
      const c = new ContainerBuilder().setAccentColor(ACCENT);
      c.addTextDisplayComponents((td) => td.setContent('🔒 Sessão debug expirada. Use `/debug` para nova.'));
      interaction.editReply({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    });
  },
};

process.on('unhandledRejection', (err) => {
  if (err.code !== 10062) console.error('[Debug] Unhandled:', err);
});
