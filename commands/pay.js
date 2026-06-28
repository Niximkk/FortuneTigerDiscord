const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { formatCurrency } = require('../utils/format');
const { ui } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Transferir Créulas para outro usuário')
    .addUserOption((option) =>
      option
        .setName('usuário')
        .setDescription('Usuário que receberá o pagamento')
        .setRequired(true),
    )
    .addNumberOption((option) =>
      option
        .setName('quantia')
        .setDescription('Valor a transferir')
        .setRequired(true)
        .setMinValue(0.01),
    ),
  async execute(interaction) {
    const senderId = interaction.user.id;
    const target = interaction.options.getUser('usuário');
    const amount = interaction.options.getNumber('quantia');

    if (target.id === senderId) {
      const container = new ContainerBuilder()
        .setAccentColor(0xff4444)
        .addTextDisplayComponents((td) => td.setContent('❌ **Transferência**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) => td.setContent('Você não pode transferir Créulas para si mesmo!'));

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    if (target.bot) {
      const container = new ContainerBuilder()
        .setAccentColor(0xff4444)
        .addTextDisplayComponents((td) => td.setContent('❌ **Transferência**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) => td.setContent('Você não pode transferir Créulas para bots!'));

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const sender = db.createUserIfNotExists(senderId);
    db.createUserIfNotExists(target.id);

    if (sender.balance < amount) {
      const container = new ContainerBuilder()
        .setAccentColor(0xff4444)
        .addTextDisplayComponents((td) => td.setContent('❌ **Transferência**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) =>
          td.setContent(`Saldo insuficiente! Você tem ${formatCurrency(sender.balance)} e precisa de ${formatCurrency(amount)}.`),
        );

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    try {
      db.transaction(() => {
        db.updateBalance(senderId, -amount);
        db.updateBalance(target.id, amount);
      });
    } catch (error) {
      console.error('[Pay] Erro na transação:', error);

      const container = new ContainerBuilder()
        .setAccentColor(0xff4444)
        .addTextDisplayComponents((td) => td.setContent('❌ **Transferência**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) => td.setContent('Ocorreu um erro ao processar a transferência. Tente novamente.'));

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const container = new ContainerBuilder()
      .setAccentColor(0x00ff88)
      .addTextDisplayComponents((td) => td.setContent('💰 **Transferência Realizada**'))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(`${ui.profile} **${interaction.user.displayName}** transferiu **${formatCurrency(amount)}** para **${target.displayName}**!`),
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
