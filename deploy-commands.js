require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

for (const name of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']) {
  if (!process.env[name]?.trim()) throw new Error(`Defina ${name} no arquivo .env.`);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.log(`[Deploy] Aviso: comando em ${filePath} está faltando "data".`);
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log(`[Deploy] Registrando ${commands.length} comandos...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log(`[Deploy] ${data.length} comandos registrados com sucesso!`);
  } catch (error) {
    console.error('[Deploy] Erro:', error);
    process.exitCode = 1;
  }
})();
