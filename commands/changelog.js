const {
  SlashCommandBuilder,
  ContainerBuilder,
  MessageFlags,
} = require('discord.js');
const versionData = require('../version.json');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Ver as alterações da versão mais recente do bot'),
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

    const ACCENT = 0xd2a838;
    const containers = [];

    // Only the latest version
    const log = versionData.changelogs[0];
    if (!log) {
      return interaction.editReply({ content: 'Nenhum changelog disponível.', flags: MessageFlags.IsComponentsV2 });
    }

    const container = new ContainerBuilder().setAccentColor(ACCENT);

    container.addTextDisplayComponents((td) =>
      td.setContent(`📋 **Changelog v${log.version}** ─ ${log.date}`)
    );
    container.addSeparatorComponents((s) => s);

    if (log.added && log.added.length > 0) {
      const lines = log.added.map((item) => `+ ${item}`).join('\n');
      container.addTextDisplayComponents((td) =>
        td.setContent(`\`\`\`diff\n${lines}\n\`\`\``)
      );
    }

    if (log.fixed && log.fixed.length > 0) {
      container.addTextDisplayComponents((td) =>
        td.setContent('**🔧 Corrigido**')
      );
      const lines = log.fixed.map((item) => `• ${item}`).join('\n');
      container.addTextDisplayComponents((td) =>
        td.setContent(lines)
      );
    }

    if (log.changed && log.changed.length > 0) {
      container.addTextDisplayComponents((td) =>
        td.setContent('**🔄 Alterado**')
      );
      const lines = log.changed.map((item) => `• ${item}`).join('\n');
      container.addTextDisplayComponents((td) =>
        td.setContent(lines)
      );
    }

    if (log.removed && log.removed.length > 0) {
      const lines = log.removed.map((item) => `- ${item}`).join('\n');
      container.addTextDisplayComponents((td) =>
        td.setContent(`\`\`\`diff\n${lines}\n\`\`\``)
      );
    }

    container.addSeparatorComponents((s) => s);
    container.addTextDisplayComponents((td) =>
      td.setContent(`✅ **Versão atual: ${versionData.currentVersion}**`)
    );

    containers.push(container);

    await interaction.editReply({
      components: containers,
      flags: MessageFlags.IsComponentsV2,
    });
  },
};
