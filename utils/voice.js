const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');
const path = require('node:path');
const fs = require('node:fs');
const config = require('../config.json');

const activeConnections = new Map();
const MAX_PLAYBACK_MS = 120_000;

function audioPath(file) {
  return path.resolve(__dirname, '..', file);
}

function stopAudio(handle) {
  if (!handle || handle.closed) return;
  handle.closed = true;
  clearTimeout(handle.timeout);
  handle.player.stop();
  handle.subscription?.unsubscribe();
  if (handle.connection.state.status !== VoiceConnectionStatus.Destroyed) {
    handle.connection.destroy();
  }
  if (activeConnections.get(handle.guildId) === handle) {
    activeConnections.delete(handle.guildId);
  }
  handle.finish?.(false);
}

async function startAudio(guild, voiceChannel, file) {
  const filePath = audioPath(file);
  if (activeConnections.has(guild.id) || !fs.existsSync(filePath)) return null;

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  const handle = { guildId: guild.id, connection, player: createAudioPlayer(), closed: false };
  activeConnections.set(guild.id, handle);
  const onError = (error) => {
    console.error('[Voice]', error.message);
    stopAudio(handle);
  };
  connection.on('error', onError);
  handle.player.on('error', onError);
  connection.on(VoiceConnectionStatus.Disconnected, () => stopAudio(handle));
  handle.player.on(AudioPlayerStatus.Idle, () => handle.finish?.(true));

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    if (handle.closed) return null;
    handle.subscription = connection.subscribe(handle.player);
    handle.timeout = setTimeout(() => stopAudio(handle), MAX_PLAYBACK_MS);
    handle.player.play(createAudioResource(filePath));
    return handle;
  } catch (error) {
    onError(error);
    return null;
  }
}

function waitForPlayback(handle) {
  if (!handle || handle.closed) return Promise.resolve(false);
  return new Promise((resolve) => {
    handle.finish = (success) => {
      handle.finish = null;
      stopAudio(handle);
      resolve(success);
    };
    if (handle.player.state.status === AudioPlayerStatus.Idle) handle.finish(true);
  });
}

async function playBigWinSound(guild, voiceChannel) {
  return waitForPlayback(await startAudio(guild, voiceChannel, config.audio.bigWinFile));
}

async function playCardSong(guild, voiceChannel) {
  return startAudio(guild, voiceChannel, config.audio.cardSongFile);
}

async function switchToBigWin(handle) {
  if (!handle || handle.closed) return false;
  const filePath = audioPath(config.audio.bigWinFile);
  if (!fs.existsSync(filePath)) {
    stopAudio(handle);
    return false;
  }
  try {
    handle.player.play(createAudioResource(filePath));
    clearTimeout(handle.timeout);
    handle.timeout = setTimeout(() => stopAudio(handle), MAX_PLAYBACK_MS);
    return waitForPlayback(handle);
  } catch (error) {
    console.error('[Voice]', error.message);
    stopAudio(handle);
    return false;
  }
}

module.exports = { playBigWinSound, playCardSong, switchToBigWin, stopAudio };
