const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { formatCurrency } = require('../utils/format');
const { ui } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your Creulas balance')
    .addUserOption((option) =>
      option
        .setName('usuário')
        .setDescription('Usuário para consultar (opcional)')
        .setRequired(false),
    ),
  async execute(interaction) {
    const targetUser = interaction.options.getUser('usuário') || interaction.user;
    const user = db.createUserIfNotExists(targetUser.id);

    const isSelf = targetUser.id === interaction.user.id;

    const container = new ContainerBuilder()
      .setAccentColor(0x00ff88)
      .addTextDisplayComponents((td) => td.setContent('💰 **Saldo**'))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(
          isSelf
            ? `${ui.profile} Seu saldo: **${formatCurrency(user.balance)}**`
            : `${ui.profile} Saldo de **${targetUser.displayName}**: **${formatCurrency(user.balance)}**`,
        ),
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
