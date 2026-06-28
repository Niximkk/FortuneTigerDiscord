const { SlashCommandBuilder, ContainerBuilder, MessageFlags } = require('discord.js');
const db = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Ativar ou desativar o som do bot para você'),
  async execute(interaction) {
    const userId = interaction.user.id;
    const user = db.createUserIfNotExists(userId);
    const muted = !user.muted;

    db.setMuted(userId, muted);

    const container = new ContainerBuilder()
      .setAccentColor(muted ? 0xff4444 : 0x00ff88)
      .addTextDisplayComponents((td) => td.setContent('🔇 **Áudio**'))
      .addSeparatorComponents((s) => s)
      .addTextDisplayComponents((td) =>
        td.setContent(
          muted
            ? 'Som desativado! O bot não entrará mais em calls de voz para você.'
            : 'Som ativado! O bot poderá entrar em calls de voz novamente.',
        ),
      );

    await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
  },
};
