const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { formatCurrency } = require('../utils/format');
const config = require('../config.json');
const { ui } = require('../utils/emojis');

const workMessages = [
  '💻 Você fez freelance como programador e recebeu o pagamento.',
  '📋 Você fez horas extras no escritório e ganhou um bônus.',
  '🌿 Você cuidou do jardim da vizinhança e foi recompensado.',
  '🎨 Você vendeu artesanato na feira e lucrou bem.',
  '🔨 Você ajudou na reforma da casa do tio e ele te pagou.',
  '📚 Você deu aulas particulares e recebeu pelo trabalho.',
  '🚴 Você fez entregas de bicicleta pela cidade e ganhou gorjetas.',
  '🍸 Você trabalhou como bartender em um evento e faturou uma grana.',
  '🚗 Você fez um bico como motorista de aplicativo.',
  '🌐 Você criou um site para um cliente e recebeu o pagamento.',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Trabalhe para ganhar Créulas'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = db.createUserIfNotExists(userId);

    const now = Date.now();
    const cooldown = config.work.cooldownHours * 60 * 60 * 1000;

    if (user.lastWork) {
      const elapsed = now - user.lastWork;
      if (elapsed < cooldown) {
        const remaining = cooldown - elapsed;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);

        const container = new ContainerBuilder()
          .setAccentColor(0x00aaff)
          .addTextDisplayComponents((td) => td.setContent('💼 **Trabalho**'))
          .addSeparatorComponents((s) => s)
          .addTextDisplayComponents((td) =>
            td.setContent(`⏳ Você já trabalhou! Volte em **${hours}h ${minutes}min**.`),
          );

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }
    }

    const reward =
      Math.floor(Math.random() * (config.work.maxReward - config.work.minReward + 1)) +
      config.work.minReward;

    db.updateBalance(userId, reward);
    db.setCooldown(userId, 'lastWork', now);
    console.log(`[Work] ${interaction.user.tag} recebeu R$ ${reward}`);

    const message = workMessages[Math.floor(Math.random() * workMessages.length)];

    const container = new ContainerBuilder()
      .setAccentColor(0x00aaff)
      .addTextDisplayComponents((td) => td.setContent('💼 **Trabalho Concluído**'))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) => td.setContent(message))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(`${ui.profile} Você recebeu **${formatCurrency(reward)}**!`),
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
