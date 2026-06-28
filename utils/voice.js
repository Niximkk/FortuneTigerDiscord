const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const path = require('path');
const fs = require('fs');
const config = require('../config.json');

const activeConnections = new Map();

async function playBigWinSound(guild, voiceChannel) {
  console.log('[Voice] playBigWinSound chamado para guild', guild.id, 'channel', voiceChannel.id);

  if (activeConnections.has(guild.id)) {
    console.log(`[Voice] Já tocando áudio no servidor ${guild.id}, ignorando.`);
    return false;
  }

  const audioPath = path.resolve(config.audio.bigWinFile);
  if (!fs.existsSync(audioPath)) {
    console.log(`[Voice] Arquivo de áudio não encontrado: ${audioPath}`);
    return false;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  activeConnections.set(guild.id, connection);
  console.log('[Voice] Conexão criada. Estado:', connection.state.status);

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    console.log('[Voice] Conexão está pronta!');
  } catch (error) {
    console.error('[Voice] Timeout ao aguardar conexão ficar pronta:', error.message);
    connection.destroy();
    activeConnections.delete(guild.id);
    return false;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(audioPath);
  const subscription = connection.subscribe(player);
  console.log('[Voice] Player inscrito na conexão');

  player.play(resource);
  console.log('[Voice] Player.play() chamado');

  const fileSize = fs.statSync(audioPath).size;
  const estimatedDuration = Math.max(30, Math.ceil((fileSize * 8) / 128 / 1000) + 10);
  const timeoutMs = Math.min(estimatedDuration * 1000, 120_000);
  console.log(`[Voice] Timeout configurado para ${timeoutMs}ms (estimado ${estimatedDuration}s)`);

  let safetyTimeout;

  return new Promise((resolve) => {
    player.on(AudioPlayerStatus.Playing, () => {
      console.log('[Voice] Áudio começou a tocar de fato');
    });

    player.on(AudioPlayerStatus.Idle, () => {
      console.log('[Voice] Áudio terminou, limpando...');
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      connection.destroy();
      activeConnections.delete(guild.id);
      resolve(true);
    });

    player.on('error', (error) => {
      console.error(`[Voice] Erro no player: ${error.message}`, error);
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      connection.destroy();
      activeConnections.delete(guild.id);
      resolve(false);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log('[Voice] Conexão desconectada durante reprodução');
      clearTimeout(safetyTimeout);
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signing, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        connection.destroy();
        activeConnections.delete(guild.id);
        resolve(false);
      }
    });

    connection.on('error', (error) => {
      console.error(`[Voice] Erro na conexão: ${error.message}`);
      clearTimeout(safetyTimeout);
      connection.destroy();
      activeConnections.delete(guild.id);
      resolve(false);
    });

    safetyTimeout = setTimeout(() => {
      const currentState = player.state.status;
      console.log(`[Voice] Timeout de segurança - player ainda em "${currentState}". Forçando desconexão.`);
      subscription.unsubscribe();
      connection.destroy();
      activeConnections.delete(guild.id);
      resolve(currentState === AudioPlayerStatus.Playing);
    }, timeoutMs);
  });
}

async function startAudio(guild, voiceChannel, audioPath) {
  if (!fs.existsSync(audioPath)) {
    console.log(`[Voice] Arquivo não encontrado: ${audioPath}`);
    return null;
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (error) {
    console.error('[Voice] Timeout conexão:', error.message);
    connection.destroy();
    return null;
  }

  const player = createAudioPlayer();
  const resource = createAudioResource(audioPath);
  const subscription = connection.subscribe(player);
  player.play(resource);

  return { connection, player, subscription };
}

function stopAudio(handle) {
  if (!handle) return false;
  const { connection, player, subscription } = handle;
  try { player.stop(); } catch {}
  try { subscription.unsubscribe(); } catch {}
  try { connection.destroy(); } catch {}
  return true;
}

function getActiveConnectionCount() {
  return activeConnections.size;
}

async function playCardSong(guild, voiceChannel) {
  const audioPath = path.resolve(config.audio.cardSongFile);
  return startAudio(guild, voiceChannel, audioPath);
}

async function switchToBigWin(handle) {
  if (!handle) return false;
  const audioPath = path.resolve(config.audio.bigWinFile);
  if (!fs.existsSync(audioPath)) {
    console.log('[Voice] big_win.mp3 não encontrado');
    return false;
  }

  const fileSize = fs.statSync(audioPath).size;
  const estimatedDuration = Math.max(30, Math.ceil((fileSize * 8) / 128 / 1000) + 10);
  const timeoutMs = Math.min(estimatedDuration * 1000, 120_000);

  handle.player.stop();
  handle.subscription.unsubscribe();

  return new Promise((resolve) => {
    const player = createAudioPlayer();
    const resource = createAudioResource(audioPath);
    const subscription = handle.connection.subscribe(player);
    player.play(resource);

    let safetyTimeout;

    player.on(AudioPlayerStatus.Idle, () => {
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      handle.connection.destroy();
      resolve(true);
    });

    player.on('error', (error) => {
      console.error('[Voice] Erro switchToBigWin:', error.message);
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
      handle.connection.destroy();
      resolve(false);
    });

    safetyTimeout = setTimeout(() => {
      subscription.unsubscribe();
      handle.connection.destroy();
      resolve(false);
    }, timeoutMs);
  });
}

module.exports = { playBigWinSound, playCardSong, stopAudio, switchToBigWin, getActiveConnectionCount };
