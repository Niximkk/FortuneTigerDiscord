const { Events } = require('discord.js');
const { autospinUsers, handleAutospinModal } = require('../commands/slot');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const tag = interaction.user.tag;
      const opts = interaction.options.data.map(o => `${o.name}=${o.value}`).join(' ');
      console.log(`[Cmd] /${interaction.commandName} por ${tag} (${interaction.user.id})${opts ? ` | ${opts}` : ''}`);
    }

    // Durante autospin: autospin → parar (remove do map); outros → shield
    if (interaction.isButton() && autospinUsers.has(interaction.user.id)) {
      if (interaction.customId.startsWith('autospin_')) {
        autospinUsers.delete(interaction.user.id);
      }
      return interaction.deferUpdate();
    }

    // Modal do autospin
    if (interaction.isModalSubmit() && interaction.customId.startsWith('autospin_modal_')) {
      return handleAutospinModal(interaction);
    }

    // Comandos slash
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[Bot] Comando não encontrado: ${interaction.commandName}`);
        return;
      }
      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[Cmd] ERRO /${interaction.commandName}:`, error);
        const reply = { content: 'Ocorreu um erro ao executar este comando. Tente novamente.', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
        else await interaction.reply(reply).catch(() => {});
      }
    }
  },
};
