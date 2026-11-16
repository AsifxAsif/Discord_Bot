const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  setGame,
  getGame,
  endGame,
  hasActiveGame,
  randomInt,
  pick,
  TRIVIA_QUESTIONS,
  SCRAMBLE_WORDS,
} = require('../lib/games');
const { makeEmbed, errorEmbed, resultEmbed } = require('../lib/ui');

/* ---------- Helpers ---------- */
function scramble(word) {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const s = arr.join('');
  return s === word ? scramble(word) : s;
}

/* ---------- Tic-Tac-Toe ---------- */
function emptyBoard() {
  return Array(9).fill(null);
}
function renderBoard(board) {
  const symbols = board.map((c, i) => (c === 'X' ? '❌' : c === 'O' ? '⭕' : `\`${i + 1}\``));
  return (
    `${symbols[0]} | ${symbols[1]} | ${symbols[2]}\n` +
    `---------\n` +
    `${symbols[3]} | ${symbols[4]} | ${symbols[5]}\n` +
    `---------\n` +
    `${symbols[6]} | ${symbols[7]} | ${symbols[8]}`
  );
}
function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  if (board.every((c) => c)) return 'draw';
  return null;
}

/* ---------- Connect Four ---------- */
function emptyC4() {
  return Array.from({ length: 6 }, () => Array(7).fill(null));
}
function renderC4(board) {
  const map = (c) => (c === 'R' ? '🔴' : c === 'Y' ? '🟡' : '⚪');
  let s = '';
  for (let r = 0; r < 6; r++) {
    s += board[r].map(map).join('') + '\n';
  }
  s += '1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣';
  return s;
}
function dropC4(board, col, piece) {
  for (let r = 5; r >= 0; r--) {
    if (!board[r][col]) {
      board[r][col] = piece;
      return r;
    }
  }
  return -1;
}
function checkC4(board, row, col, piece) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < 6 && c >= 0 && c < 7 && board[r][c] === piece) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('games')
    .setDescription('Play interactive & competitive games')
    .addSubcommand((s) => s.setName('trivia').setDescription('Kingshot trivia (private)'))
    .addSubcommand((s) =>
      s
        .setName('guess')
        .setDescription('Guess the number — private (1-100)')
        .addIntegerOption((o) =>
          o.setName('max').setDescription('Max number (default 100)').setRequired(false).setMinValue(10).setMaxValue(1000)
        )
    )
    .addSubcommand((s) => s.setName('hangman').setDescription('Kingshot hangman (private)'))
    .addSubcommand((s) => s.setName('scramble').setDescription('Unscramble a word (private)'))
    .addSubcommand((s) =>
      s
        .setName('rps')
        .setDescription('Rock Paper Scissors vs another member')
        .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('tictactoe')
        .setDescription('Tic-Tac-Toe 1v1')
        .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('connect4')
        .setDescription('Connect Four 1v1')
        .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('reaction')
        .setDescription('Reaction duel — first to click wins')
        .addUserOption((o) => o.setName('opponent').setDescription('Who to challenge').setRequired(true))
    )
    .addSubcommand((s) => s.setName('daily').setDescription('Daily challenge (private, 1 per day)')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    /* ===== TRIVIA (private via modal) ===== */
    if (sub === 'trivia') {
      const q = pick(TRIVIA_QUESTIONS);
      const key = `trivia:${userId}:${Date.now()}`;
      setGame(key, { answers: q.a, q: q.q });

      const modal = new ModalBuilder()
        .setCustomId(`game_trivia:${key}`)
        .setTitle('Kingshot Trivia');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(q.q.slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Type your answer…')
        )
      );
      return interaction.showModal(modal);
    }

    /* ===== GUESS (private via modal rounds) ===== */
    if (sub === 'guess') {
      const max = interaction.options.getInteger('max') || 100;
      const secret = randomInt(1, max);
      const key = `guess:${userId}`;
      if (hasActiveGame(key)) endGame(key);
      setGame(key, { secret, max, tries: 0 });

      const modal = new ModalBuilder()
        .setCustomId(`game_guess:${key}`)
        .setTitle(`Guess 1–${max}`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('guess')
            .setLabel(`Guess a number (1-${max}) · 8 tries`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('e.g. 42')
        )
      );
      return interaction.showModal(modal);
    }

    /* ===== HANGMAN (private via modal) ===== */
    if (sub === 'hangman') {
      const word = pick(SCRAMBLE_WORDS);
      const key = `hang:${userId}`;
      if (hasActiveGame(key)) endGame(key);
      setGame(key, { word, guessed: [], lives: 6 });

      const display = word.split('').map(() => '_').join(' ');
      const modal = new ModalBuilder()
        .setCustomId(`game_hang:${key}`)
        .setTitle('Hangman — type one letter');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('letter')
            .setLabel(`${display} · Lives: 6`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(1)
            .setPlaceholder('A letter')
        )
      );
      return interaction.showModal(modal);
    }

    /* ===== SCRAMBLE (private via modal) ===== */
    if (sub === 'scramble') {
      const word = pick(SCRAMBLE_WORDS);
      const mixed = scramble(word);
      const key = `scramble:${userId}:${Date.now()}`;
      setGame(key, { word });

      const modal = new ModalBuilder()
        .setCustomId(`game_scramble:${key}`)
        .setTitle('Word Scramble');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(`Unscramble: ${mixed}`)
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('Your answer')
        )
      );
      return interaction.showModal(modal);
    }

    /* ===== DAILY (private via modal) ===== */
    if (sub === 'daily') {
      const today = new Date().toISOString().slice(0, 10);
      const key = `daily:${userId}:${today}`;
      if (hasActiveGame(key)) {
        return interaction.reply({
          embeds: [errorEmbed('Already done', 'You already completed today’s challenge.')],
          ephemeral: true,
        });
      }
      const secret = randomInt(1, 50);
      setGame(key, { secret, done: false });

      const modal = new ModalBuilder()
        .setCustomId(`game_daily:${key}`)
        .setTitle('Daily Challenge');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('guess')
            .setLabel('Guess a number 1–50 (one try only)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setPlaceholder('e.g. 27')
        )
      );
      return interaction.showModal(modal);
    }

    /* ===== RPS (1v1 — public challenge) ===== */
    if (sub === 'rps') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) {
        return interaction.reply({ embeds: [errorEmbed('Invalid opponent', 'Choose a real member.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_accept:${userId}:${opponent.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rps_decline:${userId}:${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: `${opponent}, you are challenged to **Rock Paper Scissors** by ${interaction.user}!`,
        components: [row],
      });
      return;
    }

    /* ===== TICTACTOE ===== */
    if (sub === 'tictactoe') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) {
        return interaction.reply({ embeds: [errorEmbed('Invalid opponent', 'Choose a real member.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ttt_accept:${userId}:${opponent.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`ttt_decline:${userId}:${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: `${opponent}, you are challenged to **Tic-Tac-Toe** by ${interaction.user}!`,
        components: [row],
      });
      return;
    }

    /* ===== CONNECT 4 ===== */
    if (sub === 'connect4') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) {
        return interaction.reply({ embeds: [errorEmbed('Invalid opponent', 'Choose a real member.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`c4_accept:${userId}:${opponent.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`c4_decline:${userId}:${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: `${opponent}, you are challenged to **Connect Four** by ${interaction.user}!`,
        components: [row],
      });
      return;
    }

    /* ===== REACTION DUEL ===== */
    if (sub === 'reaction') {
      const opponent = interaction.options.getUser('opponent');
      if (opponent.bot || opponent.id === userId) {
        return interaction.reply({ embeds: [errorEmbed('Invalid opponent', 'Choose a real member.')], ephemeral: true });
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`react_accept:${userId}:${opponent.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`react_decline:${userId}:${opponent.id}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
      );
      await interaction.reply({
        content: `${opponent}, **Reaction Duel** challenge from ${interaction.user}!`,
        components: [row],
      });
      return;
    }
  },
};

module.exports.emptyBoard = emptyBoard;
module.exports.renderBoard = renderBoard;
module.exports.checkWinner = checkWinner;
module.exports.emptyC4 = emptyC4;
module.exports.renderC4 = renderC4;
module.exports.dropC4 = dropC4;
module.exports.checkC4 = checkC4;
