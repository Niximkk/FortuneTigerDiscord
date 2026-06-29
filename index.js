require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const { initDatabase } = require('./database/db');
const { currentVersion } = require('./version.json');

initDatabase();
console.log(`[Bot] Iniciando v${currentVersion}...`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
  } else {
    console.log(`[Bot] Aviso: ${file} está faltando "data" ou "execute".`);
  }
}
console.log(`[Bot] ${commandFiles.length} comandos carregados: ${client.commands.map(c => c.data.name).join(', ')}`);

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}
console.log(`[Bot] ${eventFiles.length} eventos carregados: ${eventFiles.map(f => f.replace('.js', '')).join(', ')}`);
console.log('[Bot] Conectando ao Discord...');

client.on('error', (err) => console.error('[Bot] Client error:', err.message));

process.on('unhandledRejection', (err) => console.error('[Bot] Unhandled rejection:', err));

client.login(process.env.DISCORD_TOKEN);
