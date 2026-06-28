const {
  SlashCommandBuilder,
  ContainerBuilder,
  MessageFlags,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const dbModule = require('../database/db');

const OWNER_ID = '973010982282596412';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('db')
    .setDescription('Gerenciar o banco de dados (apenas dono)')
    .addSubcommand((sub) =>
      sub
        .setName('exportar')
        .setDescription('Exportar o banco de dados atual'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('importar')
        .setDescription('Importar um banco de dados')
        .addAttachmentOption((opt) =>
          opt
            .setName('arquivo')
            .setDescription('Arquivo .sqlite para importar')
            .setRequired(true),
        ),
    ),
  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      const container = new ContainerBuilder()
        .setAccentColor(0xff4444)
        .addTextDisplayComponents((td) => td.setContent('❌ **Acesso Negado**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) => td.setContent('Apenas o dono do bot pode usar este comando.'));

      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'exportar') {
      const dbPath = dbModule.getDbPath();

      if (!fs.existsSync(dbPath)) {
        return interaction.reply({ content: '❌ Banco de dados não encontrado.', ephemeral: true });
      }

      await interaction.reply({
        content: '📦 Aqui está o banco de dados:',
        files: [dbPath],
      });
    }

    if (sub === 'importar') {
      const attachment = interaction.options.getAttachment('arquivo');

      if (!attachment.name.endsWith('.sqlite') && !attachment.name.endsWith('.db')) {
        return interaction.reply({
          content: '❌ O arquivo precisa ser um banco SQLite (.sqlite ou .db).',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

      const dbPath = dbModule.getDbPath();
      const backupPath = path.join(path.dirname(dbPath), 'database.backup.sqlite');

      try {
        // Download the attachment
        const response = await fetch(attachment.url);
        const buffer = Buffer.from(await response.arrayBuffer());

        // Backup current db
        if (fs.existsSync(dbPath)) {
          fs.copyFileSync(dbPath, backupPath);
        }

        // Close current connection and replace
        dbModule.closeDb();
        fs.writeFileSync(dbPath, buffer);

        // Reinitialize with new db
        dbModule.initDatabase();
      } catch (err) {
        // Restore backup if something went wrong
        if (fs.existsSync(backupPath)) {
          dbModule.closeDb();
          fs.copyFileSync(backupPath, dbPath);
          fs.unlinkSync(backupPath);
          dbModule.initDatabase();
        }

        console.error('[DB] Erro ao importar:', err);
        return interaction.editReply({
          content: '❌ Erro ao importar o banco de dados. Backup restaurado.',
        });
      }

      // Remove backup on success
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);

      const container = new ContainerBuilder()
        .setAccentColor(0x00ff88)
        .addTextDisplayComponents((td) => td.setContent('📦 **Banco de Dados**'))
        .addSeparatorComponents((s) => s)
        .addTextDisplayComponents((td) => td.setContent('Banco importado com sucesso!'));

      await interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }
  },
};
