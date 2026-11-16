const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { makeEmbed } = require('../lib/ui');

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('How to use the bot'),

  async execute(interaction) {
    const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) || false;

    const fields = [
      {
        name: '📝 Account',
        value: '`/register` · `/myregistrations` · `/roster` · `/show` · `/codes`',
      },
      {
        name: '🎮 Games',
        value:
          '**Private:** trivia · guess · hangman · scramble · daily\n' +
          '**Versus:** rps · tictactoe · connect4 · reaction\n' +
          '`/games <name>`',
      },
      { name: 'Other', value: '`/ping` · `/help`' },
    ];

    if (isAdmin) {
      fields.push({
        name: '⚙️ Admin (hidden from members)',
        value:
          '`/eventreminder setup` — interactive dropdowns + modal\n' +
          '`/eventreminder list|delete|toggle|test`\n' +
          '`/eventblog post` — form modal\n' +
          '`/eventblog quick` — quick LIVE post\n' +
          '`/auto` · `/stats`',
      });
    }

    await interaction.reply({
      embeds: [
        makeEmbed({
          title: '🎁 Kingshot Bot',
          color: 'info',
          description: 'Gift codes · event tools · games',
          fields,
          footer: 'Admin commands use menus & modals — no long option lists',
        }),
      ],
      ephemeral: true,
    });
  },
};
