const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
} = require('discord.js');
const db = require('../database/db');
const { formatCurrency } = require('../utils/format');
const { emojis, ui } = require('../utils/emojis');

const ITEMS_PER_PAGE = 10;

const rankEmojis = [
  emojis.ObjetosDourados,
  emojis.JoiasVerdes,
  emojis.SacoDeMoedas,
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Ver o ranking dos usuários mais ricos'),
  async execute(interaction) {
    const allUsers = db.getTopUsers(100);
    const totalPages = Math.ceil(allUsers.length / ITEMS_PER_PAGE) || 1;
    let currentPage = 1;

    function buildContainer(page) {
      const start = (page - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageUsers = allUsers.slice(start, end);

      const container = new ContainerBuilder()
        .setAccentColor(0xffd700)
        .addTextDisplayComponents((td) => td.setContent('**Ranking — Maiores Fortunas**'))
        .addSeparatorComponents((s) => s);

      if (pageUsers.length === 0) {
        container.addTextDisplayComponents((td) => td.setContent('Nenhum usuário encontrado.'));
      } else {
        for (let i = 0; i < pageUsers.length; i++) {
          const pos = start + i + 1;
          const emoji = pos <= 3 ? rankEmojis[pos - 1] : `**${pos}°**`;
          container.addTextDisplayComponents((td) =>
            td.setContent(`${emoji} <@${pageUsers[i].userId}> — **${formatCurrency(pageUsers[i].balance)}**`),
          );
        }
      }

      container
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) =>
          td.setContent(`📄 Página **${page}/${totalPages}**`),
        );

      return container;
    }

    function buildButtons(page) {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('prev')
          .setLabel('Anterior')
          .setEmoji('⬅️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId('next')
          .setLabel('Próxima')
          .setEmoji('➡️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
      );
    }

    const replyRes = await interaction.reply({
      components: [buildContainer(currentPage), ...(totalPages > 1 ? [buildButtons(currentPage)] : [])],
      flags: MessageFlags.IsComponentsV2,
      withResponse: true,
    });
    const reply = replyRes.resource.message;

    if (totalPages <= 1) return;

    const collector = response.createMessageComponentCollector({ time: 120000 });

    collector.on('collect', async (btn) => {
      if (btn.user.id !== interaction.user.id) {
        return btn.reply({ content: 'Estes botões não são para você!', ephemeral: true });
      }

      if (btn.customId === 'prev' && currentPage > 1) currentPage--;
      else if (btn.customId === 'next' && currentPage < totalPages) currentPage++;
      else return;

      await btn.update({
        components: [buildContainer(currentPage), buildButtons(currentPage)],
        flags: MessageFlags.IsComponentsV2,
      });
    });

    collector.on('end', async () => {
      try { await interaction.editReply({ components: [buildContainer(currentPage)], flags: MessageFlags.IsComponentsV2 }); } catch {}
    });
  },
};
