const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db');
const { formatCurrency } = require('../utils/format');
const config = require('../config.json');
const { ui } = require('../utils/emojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Receba sua recompensa diária'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = db.createUserIfNotExists(userId);

    const now = Date.now();
    const cooldown = config.daily.cooldownHours * 60 * 60 * 1000;

    if (user.lastDaily) {
      const elapsed = now - user.lastDaily;
      if (elapsed < cooldown) {
        const remaining = cooldown - elapsed;
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);

        const container = new ContainerBuilder()
          .setAccentColor(0xffd700)
          .addTextDisplayComponents((td) => td.setContent('📅 **Recompensa Diária**'))
          .addSeparatorComponents((s) => s)
          .addTextDisplayComponents((td) =>
            td.setContent(`⏳ Volte em **${hours}h ${minutes}min** para coletar novamente.`),
          );

        return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral });
      }

      if (elapsed > 2 * cooldown) {
        db.setDailyStreak(userId, 0);
        user.dailyStreak = 0;
      }
    }

    const streak = (user.dailyStreak || 0) + 1;
    const streakBonus = Math.min(
      (streak - 1) * config.daily.streakBonus,
      config.daily.maxStreakBonus,
    );
    const reward = config.daily.baseReward + streakBonus;

    db.updateBalance(userId, reward);
    db.setCooldown(userId, 'lastDaily', now);
    db.setDailyStreak(userId, streak);
    console.log(`[Daily] ${interaction.user.tag} recebeu R$ ${reward} | streak=${streak}`);

    const nextClaim = new Date(now + cooldown);

    const container = new ContainerBuilder()
      .setAccentColor(0xffd700)
      .addTextDisplayComponents((td) => td.setContent('📅 **Recompensa Diária**'))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(`${ui.profile} Você recebeu **${formatCurrency(reward)}**!`),
      );

    if (streak > 1) {
      container.addTextDisplayComponents((td) =>
        td.setContent(`🔥 Streak de **${streak}** dia(s) consecutivo(s) (**+${formatCurrency(streakBonus)}**)`),
      );
    }

    container
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(`🕐 Próxima coleta: <t:${Math.floor(nextClaim / 1000)}:R>`),
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
