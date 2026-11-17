/**
 * Solo games (private / ephemeral): trivia, guess, hangman, scramble, daily.
 * customId format: g:<key>:<sessionId>:<action>[:arg]
 */
const crypto = require('crypto');
const { ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const core = require('./core');
const data = require('./data');
const stats = require('../lib/gamestats');

const { embed, btn, row, bar, hearts, ts, respond, EPH } = core;

/** Pick `count` items this player hasn't seen yet; when the pool runs dry, start a new cycle. */
function pickFresh(userId, kind, pool, count) {
  const seen = new Set(stats.getSeen(userId, kind));
  let chosen = core.shuffle(pool.filter((x) => !seen.has(data.idOf(x)))).slice(0, count);
  if (chosen.length < count) {
    stats.forgetSeen(userId, kind, new Set(pool.map(data.idOf)));
    const rest = core.shuffle(pool.filter((x) => !chosen.includes(x))).slice(0, count - chosen.length);
    chosen = chosen.concat(rest);
  }
  stats.markSeen(userId, kind, chosen.map(data.idOf));
  return chosen;
}

const notYours = (i) => i.reply({ content: '🚫 This is not your game.', flags: EPH });
const again = (key, label = '🔁 Play again') => row(btn(`g:${key}:0:again`, label, ButtonStyle.Primary));

/* =====================================================================
 * TRIVIA — 5 questions, multiple choice, timer, streak bonus
 * ===================================================================== */
const TRIVIA_ROUND = 5;
const TRIVIA_TIME = 20000;
const LETTERS = ['A', 'B', 'C', 'D'];

function triviaStart(interaction, update = false) {
  // 2 Kingshot questions + 3 from the other categories, never repeating until the pool is used up
  const uid = interaction.user.id;
  const picked = core.shuffle([
    ...pickFresh(uid, 'trivia', data.TRIVIA.filter((x) => x.cat === 'Kingshot'), 2),
    ...pickFresh(uid, 'trivia', data.TRIVIA.filter((x) => x.cat !== 'Kingshot'), TRIVIA_ROUND - 2),
  ]);
  const qs = picked.map((item) => {
    const opts = core.shuffle([item.a, ...item.w]);
    return { q: item.q, cat: item.cat, opts, correct: opts.indexOf(item.a) };
  });
  const s = core.createSession('trivia', {
    userId: interaction.user.id, qs, i: 0, score: 0, correct: 0, streak: 0, answered: null,
    deadline: Date.now() + TRIVIA_TIME,
  });
  return respond(interaction, triviaView(s), update);
}

function triviaView(s) {
  const q = s.qs[s.i];
  const a = s.answered;
  const lines = q.opts.map((o, i) => `**${LETTERS[i]}.** ${o}`).join('\n');
  let status;
  let color = 'info';
  if (!a) status = `⏳ Time left: <t:${ts(s.deadline)}:R>`;
  else if (a.ok) {
    color = 'success';
    status = `✅ **Correct!** +${a.gain} pts${s.streak >= 2 ? ` · 🔥 ${s.streak} streak` : ''}`;
  } else {
    color = 'danger';
    status = `${a.timeout ? "⌛ **Time's up!**" : '❌ **Wrong!**'} Answer: **${q.opts[q.correct]}**`;
  }
  const buttons = q.opts.map((o, i) =>
    btn(
      `g:trivia:${s.id}:ans:${i}`,
      LETTERS[i],
      a ? (i === q.correct ? ButtonStyle.Success : i === a.idx && !a.ok ? ButtonStyle.Danger : ButtonStyle.Secondary) : ButtonStyle.Primary,
      { disabled: !!a }
    )
  );
  buttons.push(
    a
      ? btn(`g:trivia:${s.id}:next`, s.i === s.qs.length - 1 ? '🏁 Results' : 'Next ▶', ButtonStyle.Primary)
      : btn(`g:trivia:${s.id}:quit`, '✖', ButtonStyle.Secondary)
  );
  return {
    embeds: [
      embed({
        title: `🧠 ${q.cat} Trivia · Question ${s.i + 1}/${s.qs.length}`,
        description: `**${q.q}**\n\n${lines}\n\n${status}`,
        color,
        fields: [
          { name: 'Score', value: `**${s.score}**`, inline: true },
          { name: 'Streak', value: `🔥 ${s.streak}`, inline: true },
          { name: 'Progress', value: bar(s.i + (a ? 1 : 0), s.qs.length, 10), inline: true },
        ],
      }),
    ],
    components: [row(...buttons)],
  };
}

function triviaFinish(s) {
  core.endSession(s.id);
  stats.record(s.userId, 'trivia', s.correct >= 3 ? 'win' : 'loss', s.score);
  const total = s.qs.length;
  const tier = s.correct === total ? '👑 Kingshot Legend' : s.correct >= 4 ? '🥇 Veteran Governor' : s.correct >= 3 ? '🥈 Rising Lord' : s.correct >= 1 ? '🥉 Recruit' : '🪵 Fresh Settler';
  return {
    embeds: [
      embed({
        title: '🏁 Trivia complete',
        description: `**${tier}**\n\n✅ Correct: **${s.correct}/${total}**\n⭐ Points earned: **${s.score}**`,
        color: s.correct >= 3 ? 'success' : 'warn',
      }),
    ],
    components: [again('trivia')],
  };
}

async function triviaAction(interaction, s, action, arg) {
  if (action === 'quit') return interaction.update(triviaFinish(s));
  if (action === 'next') {
    if (!s.answered) return interaction.deferUpdate();
    if (s.i >= s.qs.length - 1) return interaction.update(triviaFinish(s));
    s.i++;
    s.answered = null;
    s.deadline = Date.now() + TRIVIA_TIME;
    return interaction.update(triviaView(s));
  }
  if (action === 'ans') {
    if (s.answered) return interaction.deferUpdate();
    const idx = Number(arg);
    const q = s.qs[s.i];
    const late = Date.now() > s.deadline + 1500;
    const ok = !late && idx === q.correct;
    let gain = 0;
    if (ok) {
      gain = 10 + Math.min(s.streak, 5) * 2;
      s.streak++;
      s.correct++;
      s.score += gain;
    } else s.streak = 0;
    s.answered = { idx, ok, gain, timeout: late };
    return interaction.update(triviaView(s));
  }
}

/* =====================================================================
 * GUESS THE NUMBER — narrowing range, hint, hearts
 * ===================================================================== */
function guessStart(interaction, update = false, max = 100) {
  const maxTries = Math.ceil(Math.log2(max)) + 2;
  const s = core.createSession('guess', {
    userId: interaction.user.id, max, secret: core.randInt(1, max),
    tries: 0, maxTries, lo: 1, hi: max, log: [], hint: null, over: null,
  });
  s.max = max;
  return respond(interaction, guessView(s), update);
}

function rangeBar(lo, hi, max, len = 24) {
  let out = '';
  for (let i = 0; i < len; i++) {
    const a = 1 + Math.floor((i * max) / len);
    const b = Math.max(a, Math.floor(((i + 1) * max) / len));
    out += b >= lo && a <= hi ? '█' : '░';
  }
  return out;
}

function guessView(s) {
  const left = s.maxTries - s.tries;
  let title = '🎯 Guess the Number';
  let color = 'info';
  let desc = `I'm thinking of a number between **1** and **${s.max}**.\n\n**Possible range:** ${s.lo} – ${s.hi}\n\`${rangeBar(s.lo, s.hi, s.max)}\``;
  if (s.over === 'win') {
    title = '🎉 You got it!';
    color = 'success';
    desc = `The number was **${s.secret}** — found in **${s.tries}** ${s.tries === 1 ? 'try' : 'tries'}!`;
  } else if (s.over === 'lose') {
    title = '💀 Out of tries';
    color = 'danger';
    desc = `The number was **${s.secret}**. Better luck next time!`;
  } else if (s.over === 'quit') {
    title = '🏳️ Gave up';
    color = 'neutral';
    desc = `The number was **${s.secret}**.`;
  }
  const fields = [
    { name: 'Tries left', value: hearts(left, s.maxTries), inline: false },
  ];
  if (s.log.length) fields.push({ name: 'Your guesses', value: s.log.slice(-8).join('\n'), inline: false });
  if (s.hint) fields.push({ name: '💡 Hint', value: s.hint, inline: false });

  const components = s.over
    ? [row(btn(`g:guess:0:again:${s.max}`, '🔁 Play again', ButtonStyle.Primary))]
    : [
        row(
          btn(`g:guess:${s.id}:ask`, '🎯 Make a guess', ButtonStyle.Primary),
          btn(`g:guess:${s.id}:hint`, '💡 Hint (−1 try)', ButtonStyle.Secondary, { disabled: !!s.hint || left <= 1 }),
          btn(`g:guess:${s.id}:quit`, '🏳️ Give up', ButtonStyle.Danger)
        ),
      ];
  return { embeds: [embed({ title, description: desc, color, fields })], components };
}

function guessFinish(s, result) {
  s.over = result;
  core.endSession(s.id);
  if (result === 'win') stats.record(s.userId, 'guess', 'win', 5 + (s.maxTries - s.tries) * 2);
  else stats.record(s.userId, 'guess', 'loss', 0);
}

async function guessAction(interaction, s, action) {
  if (action === 'ask') {
    return interaction.showModal(core.modal(`g:guess:${s.id}:modal`, `Guess 1–${s.max}`, 'n', `Your guess (1-${s.max})`, { placeholder: 'e.g. 42', max: 5 }));
  }
  if (action === 'hint') {
    s.hint = `The number is **${s.secret % 2 === 0 ? 'even' : 'odd'}**.`;
    s.tries++;
    return interaction.update(guessView(s));
  }
  if (action === 'quit') {
    guessFinish(s, 'quit');
    return interaction.update(guessView(s));
  }
  if (action === 'modal') {
    const n = parseInt(interaction.fields.getTextInputValue('n'), 10);
    if (!Number.isFinite(n) || n < 1 || n > s.max) {
      return interaction.reply({ content: `Enter a whole number between 1 and ${s.max}.`, flags: EPH });
    }
    s.tries++;
    if (n === s.secret) {
      s.log.push(`**${n}** ➜ 🎯 Correct!`);
      guessFinish(s, 'win');
      return interaction.update(guessView(s));
    }
    const diff = Math.abs(n - s.secret);
    const close = diff <= Math.max(2, Math.round(s.max * 0.05)) ? ' · 🔥 very close!' : diff <= Math.round(s.max * 0.15) ? ' · 🌶️ warm' : '';
    if (n < s.secret) {
      s.lo = Math.max(s.lo, n + 1);
      s.log.push(`**${n}** ➜ ⬆️ Higher${close}`);
    } else {
      s.hi = Math.min(s.hi, n - 1);
      s.log.push(`**${n}** ➜ ⬇️ Lower${close}`);
    }
    if (s.tries >= s.maxTries) guessFinish(s, 'lose');
    return interaction.update(guessView(s));
  }
}

/* =====================================================================
 * HANGMAN — gallows art + A–M / N–Z letter menus
 * ===================================================================== */
const GALLOWS = [
  ['  ┌───┐', '  │', '  │', '  │', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │', '  │', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │   │', '  │', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │  /│', '  │', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │  /│\\', '  │', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │  /│\\', '  │  /', '  │', '──┴──'],
  ['  ┌───┐', '  │   O', '  │  /│\\', '  │  / \\', '  │', '──┴──'],
].map((l) => l.join('\n'));
const MAX_LIVES = 6;

function hangStart(interaction, update = false) {
  const s = core.createSession('hang', {
    userId: interaction.user.id, word: pickFresh(interaction.user.id, 'words', data.WORDS, 1)[0], guessed: [], lives: MAX_LIVES, over: null, hintUsed: false,
  });
  return respond(interaction, hangView(s), update);
}

function letterMenu(s, group, n) {
  const free = group.split('').filter((l) => !s.guessed.includes(l));
  const m = new StringSelectMenuBuilder().setCustomId(`g:hang:${s.id}:pick${n}`).setPlaceholder(`Letters ${group[0]}–${group[group.length - 1]}`);
  if (!free.length) m.setDisabled(true).addOptions({ label: '—', value: 'none' });
  else m.addOptions(free.map((l) => ({ label: l, value: l })));
  return row(m);
}

function hangView(s) {
  const wrong = s.guessed.filter((l) => !s.word.includes(l));
  const display = s.word.split('').map((c) => (s.guessed.includes(c) || s.over ? c : '_')).join(' ');
  let title = '🪝 Hangman';
  let color = 'info';
  let status = `Kingdom & war word · **${s.word.length}** letters`;
  if (s.over === 'win') { title = '🎉 You saved him!'; color = 'success'; status = `The word was **${s.word}**.`; }
  if (s.over === 'lose') { title = '💀 Game over'; color = 'danger'; status = `The word was **${s.word}**.`; }
  if (s.over === 'quit') { title = '🏳️ Gave up'; color = 'neutral'; status = `The word was **${s.word}**.`; }

  const components = s.over
    ? [again('hang')]
    : [
        letterMenu(s, 'ABCDEFGHIJKLM', 1),
        letterMenu(s, 'NOPQRSTUVWXYZ', 2),
        row(
          btn(`g:hang:${s.id}:hint`, '💡 Reveal a letter (−1 life)', ButtonStyle.Secondary, { disabled: s.hintUsed || s.lives <= 1 }),
          btn(`g:hang:${s.id}:quit`, '🏳️ Give up', ButtonStyle.Danger)
        ),
      ];
  return {
    embeds: [
      embed({
        title,
        description: `\`\`\`\n${GALLOWS[MAX_LIVES - s.lives]}\n\`\`\`\n# \`${display}\`\n${status}`,
        color,
        fields: [
          { name: 'Lives', value: hearts(s.lives, MAX_LIVES), inline: true },
          { name: 'Wrong letters', value: wrong.length ? wrong.join(' ') : '—', inline: true },
        ],
      }),
    ],
    components,
  };
}

function hangCheck(s) {
  if (s.word.split('').every((c) => s.guessed.includes(c))) {
    s.over = 'win';
    stats.record(s.userId, 'hangman', 'win', 5 + s.lives * 2);
  } else if (s.lives <= 0) {
    s.over = 'lose';
    stats.record(s.userId, 'hangman', 'loss', 0);
  }
  if (s.over) core.endSession(s.id);
}

async function hangAction(interaction, s, action) {
  if (action === 'quit') {
    s.over = 'quit';
    core.endSession(s.id);
    stats.record(s.userId, 'hangman', 'loss', 0);
    return interaction.update(hangView(s));
  }
  if (action === 'hint') {
    const hidden = [...new Set(s.word.split('').filter((c) => !s.guessed.includes(c)))];
    if (hidden.length) {
      s.guessed.push(core.pick(hidden));
      s.hintUsed = true;
      s.lives--;
    }
    hangCheck(s);
    return interaction.update(hangView(s));
  }
  if (action === 'pick1' || action === 'pick2') {
    const letter = interaction.values[0];
    if (!/^[A-Z]$/.test(letter) || s.guessed.includes(letter)) return interaction.update(hangView(s));
    s.guessed.push(letter);
    if (!s.word.includes(letter)) s.lives--;
    hangCheck(s);
    return interaction.update(hangView(s));
  }
}

/* =====================================================================
 * SCRAMBLE — rounds, hints, speed-based points
 * ===================================================================== */
function scrambleWord(word) {
  let s = word;
  for (let i = 0; i < 10 && s === word; i++) s = core.shuffle(word.split('')).join('');
  return s;
}

function scrambleNewWord(s) {
  s.word = pickFresh(s.userId, 'words', data.WORDS.filter((w) => w !== s.word), 1)[0];
  s.mixed = scrambleWord(s.word);
  s.hints = 0;
  s.attempts = 0;
  s.startedAt = Date.now();
  s.result = null;
}

function scrambleStart(interaction, update = false) {
  const s = core.createSession('scr', { userId: interaction.user.id, round: 1, score: 0, solved: 0, word: '', result: null });
  scrambleNewWord(s);
  return respond(interaction, scrambleView(s), update);
}

function scrambleView(s) {
  const spaced = s.mixed.split('').join(' ');
  const hintLine = s.hints ? `\n💡 \`${s.word.slice(0, s.hints).split('').join(' ')} ${'_ '.repeat(s.word.length - s.hints).trim()}\`` : '';
  let status = `Attempts: **${s.attempts}** · Hints: **${s.hints}**`;
  let color = 'info';
  if (s.result) {
    color = s.result.ok ? 'success' : 'neutral';
    status = s.result.ok
      ? `✅ **${s.word}** — +${s.result.gain} pts`
      : `⏭️ It was **${s.word}**`;
  }
  const components = s.result
    ? [row(btn(`g:scr:${s.id}:next`, 'Next word ▶', ButtonStyle.Primary), btn(`g:scr:${s.id}:finish`, '🏁 Finish', ButtonStyle.Secondary))]
    : [
        row(
          btn(`g:scr:${s.id}:ask`, '✏️ Answer', ButtonStyle.Primary),
          btn(`g:scr:${s.id}:hint`, '💡 Hint', ButtonStyle.Secondary, { disabled: s.hints >= Math.min(3, s.word.length - 2) }),
          btn(`g:scr:${s.id}:skip`, '⏭️ Skip', ButtonStyle.Secondary),
          btn(`g:scr:${s.id}:finish`, '🏁 Finish', ButtonStyle.Danger)
        ),
      ];
  return {
    embeds: [
      embed({
        title: `🔤 Word Scramble · Round ${s.round}`,
        description: `Unscramble this word:\n# \`${spaced}\`${hintLine}\n${s.word.length} letters\n\n${status}`,
        color,
        fields: [
          { name: 'Score', value: `**${s.score}**`, inline: true },
          { name: 'Solved', value: `**${s.solved}**`, inline: true },
        ],
      }),
    ],
    components,
  };
}

function scrambleFinish(s) {
  core.endSession(s.id);
  stats.record(s.userId, 'scramble', s.solved > 0 ? 'win' : 'loss', s.score);
  return {
    embeds: [embed({ title: '🏁 Scramble finished', description: `Words solved: **${s.solved}**\n⭐ Points earned: **${s.score}**`, color: s.solved ? 'success' : 'warn' })],
    components: [again('scr')],
  };
}

async function scrambleAction(interaction, s, action) {
  if (action === 'finish') return interaction.update(scrambleFinish(s));
  if (action === 'ask') {
    return interaction.showModal(core.modal(`g:scr:${s.id}:modal`, 'Word Scramble', 'a', `Unscramble: ${s.mixed}`, { placeholder: 'Your answer', max: 30 }));
  }
  if (action === 'hint') {
    s.hints++;
    return interaction.update(scrambleView(s));
  }
  if (action === 'skip') {
    s.result = { ok: false };
    return interaction.update(scrambleView(s));
  }
  if (action === 'next') {
    s.round++;
    scrambleNewWord(s);
    return interaction.update(scrambleView(s));
  }
  if (action === 'modal') {
    if (s.result) return interaction.deferUpdate();
    const ans = interaction.fields.getTextInputValue('a').toUpperCase().trim();
    s.attempts++;
    if (ans === s.word) {
      const elapsed = (Date.now() - s.startedAt) / 1000;
      const gain = Math.max(2, 10 - s.hints * 3 - Math.floor(elapsed / 15));
      s.score += gain;
      s.solved++;
      s.result = { ok: true, gain };
    }
    return interaction.update(scrambleView(s));
  }
}

/* =====================================================================
 * DAILY — same number for everyone each UTC day, 7 tries, persistent streak
 * ===================================================================== */
const DAILY_MAX = 100;
const DAILY_TRIES = 7;

const dailyNumber = (date) => (crypto.createHash('md5').update(`pxd-daily-${date}`).digest().readUInt32BE(0) % DAILY_MAX) + 1;
const nextResetTs = () => {
  const d = new Date();
  return ts(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
};

function temperature(diff) {
  if (diff <= 2) return '🔥 Burning';
  if (diff <= 5) return '🌶️ Hot';
  if (diff <= 10) return '😊 Warm';
  if (diff <= 20) return '❄️ Cold';
  return '🧊 Freezing';
}

function dailyDoneView(userId) {
  const d = stats.getDaily(userId);
  const r = d.result;
  return {
    embeds: [
      embed({
        title: '📅 Daily Challenge — done!',
        description:
          (r?.solved ? `✅ You solved today's number in **${r.tries}** ${r.tries === 1 ? 'try' : 'tries'}!` : '❌ You didn\'t crack today\'s number.') +
          `\n\n🔥 Streak: **${d.streak}** · 🏆 Best: **${d.best}**\n⏳ New challenge <t:${nextResetTs()}:R>`,
        color: r?.solved ? 'success' : 'neutral',
      }),
    ],
    components: [],
  };
}

function dailyStart(interaction) {
  const date = stats.todayStr();
  const d = stats.getDaily(interaction.user.id);
  if (d.result && d.result.date === date) return interaction.reply({ ...dailyDoneView(interaction.user.id), flags: EPH });
  const guesses = d.progress && d.progress.date === date ? d.progress.guesses : [];
  const s = core.createSession('daily', { userId: interaction.user.id, date, secret: dailyNumber(date), guesses, over: null });
  return interaction.reply({ ...dailyView(s), flags: EPH });
}

function dailyView(s) {
  const left = DAILY_TRIES - s.guesses.length;
  const log = s.guesses.map((n) => {
    if (n === s.secret) return `**${n}** ➜ 🎯 Correct!`;
    return `**${n}** ➜ ${n < s.secret ? '⬆️ Higher' : '⬇️ Lower'} · ${temperature(Math.abs(n - s.secret))}`;
  });
  const d = stats.getDaily(s.userId);
  let title = '📅 Daily Challenge';
  let color = 'info';
  let desc = `Everyone gets the **same number** today (1–${DAILY_MAX}). **${DAILY_TRIES} tries.**\n🔥 Streak: **${d.streak}**\n⏳ Resets <t:${nextResetTs()}:R>`;
  if (s.over === 'win') { title = '🎉 Daily solved!'; color = 'success'; desc = `Solved in **${s.guesses.length}** ${s.guesses.length === 1 ? 'try' : 'tries'}!\n🔥 Streak: **${d.streak}** · ⭐ +${s.points} pts\n⏳ New challenge <t:${nextResetTs()}:R>`; }
  if (s.over === 'lose') { title = '💀 Daily failed'; color = 'danger'; desc = `The number was **${s.secret}**.\n⏳ New challenge <t:${nextResetTs()}:R>`; }
  const fields = [{ name: 'Tries left', value: hearts(left, DAILY_TRIES), inline: false }];
  if (log.length) fields.push({ name: 'Your guesses', value: log.join('\n'), inline: false });
  return {
    embeds: [embed({ title, description: desc, color, fields })],
    components: s.over ? [] : [row(btn(`g:daily:${s.id}:ask`, '🎯 Make a guess', ButtonStyle.Primary))],
  };
}

async function dailyAction(interaction, s, action) {
  if (action === 'ask') {
    return interaction.showModal(core.modal(`g:daily:${s.id}:modal`, 'Daily Challenge', 'n', `Guess a number (1-${DAILY_MAX})`, { placeholder: 'e.g. 42', max: 3 }));
  }
  if (action === 'modal') {
    const n = parseInt(interaction.fields.getTextInputValue('n'), 10);
    if (!Number.isFinite(n) || n < 1 || n > DAILY_MAX) {
      return interaction.reply({ content: `Enter a whole number between 1 and ${DAILY_MAX}.`, flags: EPH });
    }
    if (s.guesses.includes(n)) return interaction.reply({ content: 'You already tried that number.', flags: EPH });
    s.guesses.push(n);
    if (n === s.secret || s.guesses.length >= DAILY_TRIES) {
      const solved = n === s.secret;
      const prev = stats.getDaily(s.userId);
      const points = solved ? 15 - (s.guesses.length - 1) * 2 + Math.min(prev.streak, 7) : 0;
      s.points = points;
      s.over = solved ? 'win' : 'lose';
      stats.finishDaily(s.userId, s.date, { solved, tries: s.guesses.length, points });
      core.endSession(s.id);
    } else {
      stats.saveDailyProgress(s.userId, s.date, s.guesses);
    }
    return interaction.update(dailyView(s));
  }
}

/* =====================================================================
 * Router
 * ===================================================================== */
const STARTERS = {
  trivia: triviaStart,
  guess: guessStart,
  hang: hangStart,
  scr: scrambleStart,
  daily: (i) => dailyStart(i),
};
const ACTIONS = { trivia: triviaAction, guess: guessAction, hang: hangAction, scr: scrambleAction, daily: dailyAction };
const KEYS = new Set(Object.keys(ACTIONS));

/** /games <sub> → key */
const SUB_TO_KEY = { trivia: 'trivia', guess: 'guess', hangman: 'hang', scramble: 'scr', daily: 'daily' };

async function handle(interaction, parts) {
  const [, key, gid, action] = parts;
  if (action === 'again' && gid === '0') return STARTERS[key](interaction, true, Number(parts[4]) || undefined);
  const s = core.getSession(gid);
  if (!s || s.type !== key) return core.expired(interaction);
  if (s.userId !== interaction.user.id) return notYours(interaction);
  return ACTIONS[key](interaction, s, action, parts[4]);
}

module.exports = {
  KEYS, SUB_TO_KEY, STARTERS, handle,
  // exported for tests
  _t: { triviaStart, triviaView, guessView, hangView, scrambleView, dailyView, dailyNumber, rangeBar },
};
