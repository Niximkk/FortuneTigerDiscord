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
const db = require('../database/db');
const { spin, generateGrid, getRespinStates, evaluatePaylines, getWinningPositionsSet, pickTargetSymbol } = require('../utils/slot');
const { emojis, ui } = require('../utils/emojis');
const { formatCurrency } = require('../utils/format');
const { playBigWinSound, playCardSong, switchToBigWin } = require('../utils/voice');
const config = require('../config.json');

const RESPIN_DELAY = 1500;

const TIPS = [
  'Win up to 2500x!',
  'Respins in Fortune Tiger Feature!',
  'x10 multiplier with full screen win!',
];
function nextTip() { return `*${TIPS[Math.floor(Date.now() / 30000) % TIPS.length]}*`; }

const GIF_URLS = {
  'idle.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/jkfl1hbp.gif',
  'wild.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/8k4c80wc.gif',
  'throw_card.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/e699clqp.gif',
  'big_win.gif': 'https://r2.e-z.host/4d0a0bea-60f8-44d6-9e74-3032a64a9f32/pmsxmssj.gif',
};

function getGifUrl(name) { return GIF_URLS[name] || null; }

function pickGif(result, grid, isBigWin) {
  if (result.featureActive && isBigWin) return 'big_win.gif';
  if (result.featureActive && !isBigWin) return 'throw_card.gif';
  if (isBigWin) return 'big_win.gif';
  const flat = grid.flat();
  if (flat.some((s) => s.id === 'Wild')) return 'wild.gif';
  return 'idle.gif';
}

function getSymbolEmoji(symbol) {
  return emojis[symbol.id] || symbol.id;
}

const autospinUsers = new Map();
const autospinOriginals = new Map();

class DeletionTimer {
  constructor(interaction, buildComponents) {
    this.interaction = interaction;
    this.buildComponents = buildComponents;
    this.cancelled = false;
    this._warning = null;
    this._delete = null;
    this._start();
  }
  _start() {
    this._warning = setTimeout(() => this._warn(), 50000);
    this._delete = setTimeout(() => this._deleteNow(), 55000);
  }
  async _warn() {
    if (this.cancelled) return;
    try {
      const deleteAt = Math.floor(Date.now() / 1000) + 10;
      const comps = this.buildComponents(`**Fortune Tiger** ─ Apagando <t:${deleteAt}:R>`);
      await this.interaction.editReply({ components: comps, flags: MessageFlags.IsComponentsV2 });
    } catch {}
  }
  async _deleteNow() {
    if (this.cancelled) return;
    try { await this.interaction.deleteReply(); } catch {}
  }
  cancel() {
    if (this.cancelled) return;
    this.cancelled = true;
    if (this._warning) clearTimeout(this._warning);
    if (this._delete) clearTimeout(this._delete);
  }
}

async function showLoadingScreen(interaction) {
  const ACCENT = 0xd2a838;
  const container = new ContainerBuilder().setAccentColor(ACCENT);
  container.addTextDisplayComponents((td) => td.setContent('<:777:1520875188797833267> **Carregando assets**'));
  container.addSeparatorComponents((s) => s);
  container.addMediaGalleryComponents((mg) =>
    mg.addItems(
      (item) => item.setURL(GIF_URLS['idle.gif']).setSpoiler(true),
      (item) => item.setURL(GIF_URLS['wild.gif']).setSpoiler(true),
      (item) => item.setURL(GIF_URLS['throw_card.gif']).setSpoiler(true),
      (item) => item.setURL(GIF_URLS['big_win.gif']).setSpoiler(true),
    )
  );
  container.addSeparatorComponents((s) => s);
  container.addTextDisplayComponents((td) => td.setContent('Isso só vai levar um instante'));
  await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  await new Promise((r) => setTimeout(r, 2000));
}

function buildGridRows(grid, winPosSet, enabled) {
  const rows = [];
  for (let r = 0; r < 3; r++) {
    const btns = [];
    for (let c = 0; c < 3; c++) {
      const cell = grid[r][c];
      const key = `${c},${r}`;
      const isWin = winPosSet && winPosSet.has(key);
      if (!cell) {
        btns.push(new ButtonBuilder().setCustomId(`cell_${r}_${c}`).setLabel('·').setStyle(ButtonStyle.Secondary).setDisabled(true));
        continue;
      }
      btns.push(
        new ButtonBuilder()
          .setCustomId(`cell_${r}_${c}`)
          .setEmoji(getSymbolEmoji(cell))
          .setStyle(isWin ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setDisabled(!enabled),
      );
    }
    rows.push(new ActionRowBuilder().addComponents(btns));
  }
  return rows;
}

function buildActionRow(bet, disabled, autospinRemaining) {
  const isAuto = autospinRemaining !== undefined;
  const autoBtn = new ButtonBuilder()
    .setCustomId(`autospin_${bet}`)
    .setEmoji(ui.autospin)
    .setStyle(isAuto ? ButtonStyle.Danger : ButtonStyle.Secondary)
    .setDisabled(disabled);
  if (isAuto) autoBtn.setLabel(` ${autospinRemaining}`);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`exit_${bet}`).setEmoji('<:Exit:1520728973053657230>').setStyle(ButtonStyle.Secondary).setDisabled(disabled || isAuto),
    new ButtonBuilder().setCustomId(`less_${bet}`).setEmoji(ui.less).setStyle(ButtonStyle.Secondary).setDisabled(disabled || isAuto),
    new ButtonBuilder().setCustomId(`spinner_${bet}`).setEmoji(ui.spinner).setStyle(ButtonStyle.Primary).setDisabled(disabled || isAuto),
    new ButtonBuilder().setCustomId(`plus_${bet}`).setEmoji(ui.plus).setStyle(ButtonStyle.Secondary).setDisabled(disabled || isAuto),
    autoBtn,
  );
}

function buildLobbyComponents(grid, bet, balance, disabled, minimized, title) {
  const ACCENT = 0xd2a838;
  const actualTitle = title || '**Fortune Tiger**';
  const container = new ContainerBuilder().setAccentColor(ACCENT);
  if (minimized) {
    container.addTextDisplayComponents((td) => td.setContent(actualTitle));
    container.addSeparatorComponents((s) => s);
    container.addTextDisplayComponents((td) => td.setContent(`${ui.profile} Saldo: ${formatCurrency(balance)}`));
    container.addSeparatorComponents((s) => s);
    container.addActionRowComponents(() => buildActionRow(bet, true));
    return [container];
  }
  container.addTextDisplayComponents((td) => td.setContent(actualTitle));
  container.addSeparatorComponents((s) => s);
  container.addMediaGalleryComponents((mg) => mg.addItems((item) => item.setURL(GIF_URLS['idle.gif'])));
  container.addSeparatorComponents((s) => s);
  const winPosSet = new Set();
  for (const gr of buildGridRows(grid, winPosSet, !disabled)) container.addActionRowComponents(() => gr);
  container.addSeparatorComponents((s) => s);
  container.addTextDisplayComponents((td) => td.setContent(nextTip()));
  container.addTextDisplayComponents((td) => td.setContent(`${ui.profile} ${formatCurrency(balance)}  |  WIN ${formatCurrency(0)}  |  ${ui.profile} ${formatCurrency(bet)}`));
  container.addSeparatorComponents((s) => s);
  container.addActionRowComponents(() => buildActionRow(bet, disabled));
  return [container];
}

function buildMessageComponents(result, bet, balance, disabled, autospinRemaining, minimized, title) {
  const ACCENT = 0xd2a838;
  const actualTitle = title || '**Fortune Tiger**';
  const isBigWin = result.isBigWin !== undefined ? result.isBigWin : (result.totalWin >= (result.bet || bet) * config.audio.bigWinThreshold || result.fullScreenX10);
  const winLabel = isBigWin ? 'BIG WIN' : 'WIN';
  const gifName = minimized ? null : pickGif(result, result.grid, isBigWin);
  const gifUrl = minimized || !gifName ? null : getGifUrl(gifName);
  const gridRows = minimized ? [] : buildGridRows(result.grid, result.winPosSet, !disabled);
  const actionRow = buildActionRow(bet, disabled, autospinRemaining);
  const container = new ContainerBuilder().setAccentColor(ACCENT);
  if (minimized) {
    container.addTextDisplayComponents((td) => td.setContent(actualTitle));
    container.addSeparatorComponents((s) => s);
    container.addTextDisplayComponents((td) => td.setContent(`${ui.profile} Saldo: ${formatCurrency(balance)}`));
    const net = result.totalWin - bet;
    if (net > 0) { container.addTextDisplayComponents((td) => td.setContent(`📈 Ganho: **${formatCurrency(net)}**`)); }
    else if (net < 0) { container.addTextDisplayComponents((td) => td.setContent(`📉 Perda: **${formatCurrency(Math.abs(net))}**`)); }
    else { container.addTextDisplayComponents((td) => td.setContent(`➖ Resultado: ${formatCurrency(0)}`)); }
    container.addSeparatorComponents((s) => s);
    container.addActionRowComponents(() => buildActionRow(bet, true));
    return { comps: [container], gifName: null };
  }
  container.addTextDisplayComponents((td) => td.setContent(actualTitle));
  container.addSeparatorComponents((s) => s);
  if (gifUrl) {
    container.addMediaGalleryComponents((mg) => mg.addItems((item) => item.setURL(gifUrl)));
    container.addSeparatorComponents((s) => s);
  }
  for (const gr of gridRows) container.addActionRowComponents(() => gr);
  if (result.featureActive && result.respinCount > 0) {
    container.addTextDisplayComponents((td) => td.setContent(`${emojis.Carta} ${result.respinCount} giros`));
    container.addSeparatorComponents((s) => s);
  }
  container.addTextDisplayComponents((td) => td.setContent(result.totalWin > 0 ? `**${winLabel} ${formatCurrency(result.totalWin)}**` : nextTip()));
  container.addTextDisplayComponents((td) => td.setContent(`${ui.profile} ${formatCurrency(balance)}  |  WIN ${formatCurrency(result.totalWin)}  |  ${ui.profile} ${formatCurrency(bet)}`));
  container.addSeparatorComponents((s) => s);
  container.addActionRowComponents(() => actionRow);
  return { comps: [container], gifName };
}

async function animateFeature(interaction, bet, targetSymbolObj) {
  const states = getRespinStates(targetSymbolObj, config.slot.maxRespins);
  const gifUrl = getGifUrl('throw_card.gif');
  const ACCENT = 0xd2a838;
  let step = 0;
  for (let i = 0; i < states.length; i++) {
    if (i === 0) continue;
    if (!states[i].changed && i < states.length - 1) continue;
    if (step > 0) await new Promise((r) => setTimeout(r, RESPIN_DELAY));
    step++;
    const state = states[i];
    const container = new ContainerBuilder().setAccentColor(ACCENT);
    container.addTextDisplayComponents((td) => td.setContent('**Fortune Tiger**'));
    container.addSeparatorComponents((s) => s);
    if (gifUrl) {
      container.addMediaGalleryComponents((mg) => mg.addItems((item) => item.setURL(gifUrl)));
      container.addSeparatorComponents((s) => s);
    }
    container.addTextDisplayComponents((td) => td.setContent(`${emojis.x10} O Tigre soltou a carta: ${emojis[targetSymbolObj.id]} ${targetSymbolObj.id}`));
    container.addTextDisplayComponents((td) => td.setContent(`${emojis.Carta} ${step}/${states.length - 1} giros`));
    container.addSeparatorComponents((s) => s);
    for (const gr of buildGridRows(state.grid, new Set(), false)) container.addActionRowComponents(() => gr);
    if (state.isFull) container.addTextDisplayComponents((td) => td.setContent(`**${emojis.x10} FULL SCREEN x10! ${emojis.x10}**`));
    container.addSeparatorComponents((s) => s);
    container.addActionRowComponents(() => buildActionRow(bet, true));
    await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  }
  await new Promise((r) => setTimeout(r, 800));
  const finalGrid = states[states.length - 1].grid;
  const evalResult = evaluatePaylines(finalGrid, bet);
  let totalWin = evalResult.totalWin;
  const winningLines = evalResult.winningLines;
  const isFull = states[states.length - 1].isFull;
  if (isFull) totalWin *= config.slot.fullScreenMultiplier;
  const winPosSet = getWinningPositionsSet(winningLines);
  return { grid: finalGrid, totalWin: Math.round(totalWin * 100) / 100, winningLines, featureActive: true, fullScreenX10: isFull, respinCount: states.length - 1, targetSymbol: targetSymbolObj.id, winPosSet, bet };
}

function setupResultCollector(interaction, userId, result, bet, minimized, minimizeTimeout, deleteTimer) {
  const reply = interaction.fetchReply().then((r) => {
    const collector = r.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (btn) => {
      try {
        if (btn.user.id !== userId) {
          return btn.reply({ content: 'Estes botões não são para você!', ephemeral: true });
        }
        if (deleteTimer) deleteTimer.cancel();
        const id = btn.customId;
        const uUser = db.getUser(userId);

        if (id.startsWith('cell_')) return btn.deferUpdate();

        if (id.startsWith('exit_')) {
          minimized = !minimized;
          await btn.deferUpdate();
          if (minimized) {
            if (minimizeTimeout) clearTimeout(minimizeTimeout);
            minimizeTimeout = setTimeout(async () => { try { await interaction.deleteReply(); } catch {} }, 10000);
          } else {
            if (minimizeTimeout) clearTimeout(minimizeTimeout);
          }
          const nc = buildMessageComponents(result, bet, uUser.balance, false, undefined, minimized);
          await interaction.editReply({ components: nc.comps, flags: MessageFlags.IsComponentsV2 });
          return;
        }

        if (id.startsWith('autospin_')) {
          if (autospinUsers.has(userId)) {
            autospinUsers.delete(userId);
            await btn.deferUpdate();
            const nc = buildMessageComponents(result, bet, uUser.balance, false, undefined, minimized);
            await interaction.editReply({ components: nc.comps, flags: MessageFlags.IsComponentsV2 });
            return;
          }
          autospinOriginals.set(userId, interaction);
          collector.stop();
          const modal = new ModalBuilder()
            .setCustomId(`autospin_modal_${userId}_${bet}`)
            .setTitle('Rodadas Automáticas')
            .addComponents(new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('autospin_count').setLabel('Número de rodadas (1-100)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(3).setPlaceholder('Ex: 10').setRequired(true),
            ));
          try { await btn.showModal(modal); } catch (err) { console.error('[Slot] Erro ao mostrar modal:', err.message); }
          return;
        }

        if (id.startsWith('less_')) {
          const current = parseFloat(id.replace('less_', ''));
          const newBet = Math.max(config.currency.minBet, current - 0.5);
          if (newBet === current) return btn.deferUpdate();
          await btn.deferUpdate();
          bet = newBet;
          const nc = buildMessageComponents(result, bet, uUser.balance, false, undefined, minimized);
          await interaction.editReply({ components: nc.comps, flags: MessageFlags.IsComponentsV2 });
          return;
        }

        if (id.startsWith('plus_')) {
          const current = parseFloat(id.replace('plus_', ''));
          const newBet = Math.min(config.currency.maxBet, current + 0.5);
          if (newBet === current) return btn.deferUpdate();
          await btn.deferUpdate();
          bet = newBet;
          const nc = buildMessageComponents(result, bet, uUser.balance, false, undefined, minimized);
          await interaction.editReply({ components: nc.comps, flags: MessageFlags.IsComponentsV2 });
          return;
        }

        if (id.startsWith('spinner_')) {
          const spinBet = parseFloat(id.replace('spinner_', ''));
          if (uUser.balance < spinBet) {
            await btn.deferUpdate();
            const nc = buildMessageComponents(result, spinBet, uUser.balance, true, undefined, minimized);
            await interaction.editReply({ components: nc.comps, flags: MessageFlags.IsComponentsV2 });
            await new Promise((r) => setTimeout(r, 1500));
            const nc2 = buildMessageComponents(result, spinBet, uUser.balance, false, undefined, minimized);
            await interaction.editReply({ components: nc2.comps, flags: MessageFlags.IsComponentsV2 });
            return;
          }
          await btn.deferUpdate();
          collector.stop();
          await handleSlotSpin(interaction, spinBet);
          return;
        }
      } catch {}
    });

    collector.on('end', () => {
      try {
        const { comps: dc } = buildMessageComponents(result, bet, db.getUser(userId).balance, true, undefined, minimized);
        interaction.editReply({ components: dc, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      } catch {}
    });
  }).catch(() => {});
}

async function handleSlotSpin(interaction, bet, autospinRemaining) {
  const userId = interaction.user.id;
  const user = db.createUserIfNotExists(userId);

  if (bet < config.currency.minBet || bet > config.currency.maxBet) {
    return interaction.editReply({ content: `Aposta deve ser entre ${formatCurrency(config.currency.minBet)} e ${formatCurrency(config.currency.maxBet)}.` });
  }

  if (user.balance < bet) {
    autospinUsers.delete(userId);
    return interaction.editReply({ content: `Saldo insuficiente! Você tem ${formatCurrency(user.balance)} e precisa de ${formatCurrency(bet)}.` });
  }

  db.updateBalance(userId, -bet);

  let result;
  let featureAudioHandle = null;
  const featureTriggered = Math.random() < config.slot.featureBaseChance;

  if (featureTriggered) {
    const targetSymbol = pickTargetSymbol();
    console.log(`[Slot] ${interaction.user.tag} | FEATURE | alvo=${targetSymbol.id}`);
    try {
      const member = !user.muted ? await interaction.guild.members.fetch(interaction.user.id) : null;
      if (member?.voice?.channel) {
        featureAudioHandle = await playCardSong(interaction.guild, member.voice.channel);
      }
    } catch (err) {
      console.error(`[Slot] card_song erro: ${err.message}`);
    }
    result = await animateFeature(interaction, bet, targetSymbol);
    result.isBigWin = result.totalWin >= (result.bet || bet) * config.audio.bigWinThreshold || result.fullScreenX10;
  } else {
    const rawSpin = spin(bet);
    const winPosSet = getWinningPositionsSet(rawSpin.winningLines);
    result = { grid: rawSpin.grid, totalWin: rawSpin.totalWin, winningLines: rawSpin.winningLines, featureActive: false, fullScreenX10: false, respinCount: 0, winPosSet, bet, isBigWin: rawSpin.totalWin >= bet * config.audio.bigWinThreshold };
  }

  const isBigWin = result.isBigWin;
  const tag = interaction.user.tag;
  const winLabel = isBigWin ? 'BIGWIN' : result.totalWin > 0 ? 'WIN' : 'LOSS';
  const featLabel = result.featureActive ? ` feat=${result.respinCount}r` : '';
  console.log(`[Slot] ${tag} | $${bet} → ${winLabel} $${result.totalWin}${featLabel}`);

  const updatedUser = db.getUser(userId);
  db.updateBalance(userId, result.totalWin);

  let minimized = false;
  let minimizeTimeout = null;
  let deleteTimer = null;

  const isAuto = autospinRemaining !== undefined;
  const autoLabel = isAuto && autospinRemaining - 1 > 0 ? autospinRemaining - 1 : undefined;

  const { comps } = buildMessageComponents(result, bet, updatedUser.balance, false, autoLabel, minimized);
  try {
    await interaction.editReply({ components: comps, flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    if (err.code === 50027) {
      console.log(`[Auto] ${tag} | Token expirado, parando autospin`);
      autospinUsers.delete(userId);
      return;
    }
    throw err;
  }

  let inVoice = false;
  if (isBigWin) {
    try {
      const { comps: dc } = buildMessageComponents(result, bet, updatedUser.balance, true, autoLabel, minimized);
      await interaction.editReply({ components: dc, flags: MessageFlags.IsComponentsV2 });
    } catch {}

    const userData = db.getUser(userId);
    if (!userData.muted) {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member?.voice?.channel) {
          inVoice = true;
          if (result.featureActive && featureAudioHandle) {
            await switchToBigWin(featureAudioHandle);
          } else {
            await playBigWinSound(interaction.guild, member.voice.channel);
          }
        }
      } catch (err) {
        console.error('[Slot] Erro ao tocar big_win:', err.message);
      }
    }
  }

  if (isBigWin) {
    await new Promise((r) => setTimeout(r, inVoice ? 5000 : 3000));
    try {
      const { comps: ec } = buildMessageComponents(result, bet, db.getUser(userId).balance, false, autoLabel, minimized);
      await interaction.editReply({ components: ec, flags: MessageFlags.IsComponentsV2 });
    } catch {}
  }

  // === Autospin loop ===
  if (isAuto) {
    console.log(`[Auto] ${tag} | ${autospinRemaining}/${autospinRemaining} restantes`);
    if (!autospinUsers.has(userId)) {
      console.log(`[Auto] ${tag} | Parado pelo usuário`);
      // Parado pelo usuário: reabilita + setupResultCollector
      try {
        const { comps: nc } = buildMessageComponents(result, bet, db.getUser(userId).balance, false, undefined, minimized);
        await interaction.editReply({ components: nc, flags: MessageFlags.IsComponentsV2 });
      } catch {}
      return setupResultCollector(interaction, userId, result, bet, minimized, minimizeTimeout, null);
    }
    if (autospinRemaining > 1) {
      console.log(`[Auto] ${tag} | ${autospinRemaining - 1} restantes`);
      await new Promise((r) => setTimeout(r, 1500));
      if (!autospinUsers.has(userId)) {
        console.log(`[Auto] ${tag} | Parado durante delay`);
        try {
          const { comps: nc } = buildMessageComponents(result, bet, db.getUser(userId).balance, false, undefined, minimized);
          await interaction.editReply({ components: nc, flags: MessageFlags.IsComponentsV2 });
        } catch {}
        return setupResultCollector(interaction, userId, result, bet, minimized, minimizeTimeout, null);
      }
      return handleSlotSpin(interaction, bet, autospinRemaining - 1);
    }
    // Último giro do autospin
    autospinUsers.delete(userId);
    console.log(`[Auto] ${tag} | Concluído`);
    try {
      const { comps: nc } = buildMessageComponents(result, bet, db.getUser(userId).balance, false, undefined, minimized);
      await interaction.editReply({ components: nc, flags: MessageFlags.IsComponentsV2 });
    } catch {}
  }

  // === Collector setup (single spin OU após autospin terminar) ===
  deleteTimer = new DeletionTimer(interaction, (title) =>
    buildMessageComponents(result, bet, db.getUser(userId).balance, false, undefined, minimized, title).comps
  );

  setupResultCollector(interaction, userId, result, bet, minimized, minimizeTimeout, deleteTimer);
}

async function handleAutospinModal(modalInteraction) {
  const parts = modalInteraction.customId.split('_');
  const bet = parseFloat(parts[parts.length - 1]);
  const count = parseInt(modalInteraction.fields.getTextInputValue('autospin_count'), 10);

  if (isNaN(count) || count < 1 || count > 100) {
    return modalInteraction.reply({ content: 'O número de rodadas deve ser entre 1 e 100.', ephemeral: true });
  }

  const originalInteraction = autospinOriginals.get(modalInteraction.user.id) || modalInteraction;
  autospinOriginals.delete(modalInteraction.user.id);

  autospinUsers.set(modalInteraction.user.id, true);
  await modalInteraction.deferUpdate();
  console.log(`[Auto] ${modalInteraction.user.tag} | Iniciado: ${count}x R$ ${bet}`);
  try {
    await handleSlotSpin(originalInteraction, bet, count);
  } catch (err) {
    console.error(`[Auto] ${modalInteraction.user.tag} | Erro: ${err.message}`);
    autospinUsers.delete(modalInteraction.user.id);
  }
}

module.exports = {
  autospinUsers,
  handleAutospinModal,
  data: new SlashCommandBuilder()
    .setName('slot')
    .setDescription('Jogar Fortune Tiger')
    .addNumberOption((opt) =>
      opt.setName('aposta')
        .setDescription('Valor da aposta (opcional)')
        .setMinValue(config.currency.minBet)
        .setMaxValue(config.currency.maxBet),
    ),
  async execute(interaction) {
    const userId = interaction.user.id;
    const bet = interaction.options.getNumber('aposta') || config.currency.minBet;

    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });
    await showLoadingScreen(interaction);

    let currentBet = Math.max(config.currency.minBet, Math.min(bet, config.currency.maxBet));
    let user = db.createUserIfNotExists(userId);

    let lobbyGrid;
    let attempts = 0;
    do {
      lobbyGrid = generateGrid();
      attempts++;
    } while (evaluatePaylines(lobbyGrid, 1).totalWin > 0 && attempts < 10);

    let minimized = false;
    let minimizeTimeout = null;
    let deleteTimer = null;

    await interaction.editReply({
      components: buildLobbyComponents(lobbyGrid, currentBet, user.balance, false, false),
      flags: MessageFlags.IsComponentsV2,
    });

    deleteTimer = new DeletionTimer(interaction, (title) =>
      buildLobbyComponents(lobbyGrid, currentBet, user.balance, false, minimized, title)
    );

    const reply = await interaction.fetchReply();
    const lobbyCollector = reply.createMessageComponentCollector({ time: 120000 });

    lobbyCollector.on('collect', async (btn) => {
      if (btn.user.id !== userId) {
        return btn.reply({ content: 'Estes botões não são para você!', ephemeral: true });
      }
      if (deleteTimer) deleteTimer.cancel();

      const id = btn.customId;

      if (id.startsWith('exit_')) {
        minimized = !minimized;
        await btn.deferUpdate();
        if (minimized) {
          if (minimizeTimeout) clearTimeout(minimizeTimeout);
          minimizeTimeout = setTimeout(async () => { try { await interaction.deleteReply(); } catch {} }, 10000);
        } else {
          if (minimizeTimeout) clearTimeout(minimizeTimeout);
        }
        await interaction.editReply({
          components: buildLobbyComponents(lobbyGrid, currentBet, user.balance, false, minimized),
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id.startsWith('less_')) {
        const current = parseFloat(id.replace('less_', ''));
        currentBet = Math.max(config.currency.minBet, current - 0.5);
        if (currentBet === current) return btn.deferUpdate();
        await btn.deferUpdate();
        user = db.getUser(userId);
        await interaction.editReply({
          components: buildLobbyComponents(lobbyGrid, currentBet, user.balance, false, minimized),
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id.startsWith('plus_')) {
        const current = parseFloat(id.replace('plus_', ''));
        currentBet = Math.min(config.currency.maxBet, current + 0.5);
        if (currentBet === current) return btn.deferUpdate();
        await btn.deferUpdate();
        user = db.getUser(userId);
        await interaction.editReply({
          components: buildLobbyComponents(lobbyGrid, currentBet, user.balance, false, minimized),
          flags: MessageFlags.IsComponentsV2,
        });
        return;
      }

      if (id.startsWith('spinner_')) {
        const spinBet = parseFloat(id.replace('spinner_', ''));
        user = db.getUser(userId);
        if (user.balance < spinBet) {
          await btn.deferUpdate();
          await interaction.editReply({
            components: buildLobbyComponents(lobbyGrid, spinBet, user.balance, true, minimized),
            flags: MessageFlags.IsComponentsV2,
          });
          await new Promise((r) => setTimeout(r, 2000));
          await interaction.editReply({
            components: buildLobbyComponents(lobbyGrid, spinBet, user.balance, false, minimized),
            flags: MessageFlags.IsComponentsV2,
          });
          return;
        }
        await btn.deferUpdate();
        lobbyCollector.stop();
        await handleSlotSpin(interaction, spinBet);
        return;
      }

      if (id.startsWith('autospin_')) {
        const modalBet = parseFloat(id.replace('autospin_', ''));
        autospinOriginals.set(userId, interaction);
        lobbyCollector.stop();
        const modal = new ModalBuilder()
          .setCustomId(`autospin_modal_${userId}_${modalBet}`)
          .setTitle('Rodadas Automáticas')
          .addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('autospin_count').setLabel('Número de rodadas (1-100)').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(3).setPlaceholder('Ex: 10').setRequired(true),
          ));
        try { await btn.showModal(modal); } catch (err) { console.error('[Slot] Erro ao mostrar modal:', err.message); }
        return;
      }
    });

    lobbyCollector.on('end', () => {
      if (deleteTimer) deleteTimer.cancel();
      try {
        interaction.editReply({
          components: buildLobbyComponents(lobbyGrid, currentBet, db.getUser(userId).balance, true, minimized),
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
      } catch {}
    });
  },
};
