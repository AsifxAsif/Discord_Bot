/**
 * Shared game plumbing: sessions, embed/button helpers.
 */
const crypto = require('crypto');
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');

const BRAND = 'PXD_BOT';
const EPH = MessageFlags.Ephemeral;
const COLORS = { info: 0x5865f2, success: 0x57f287, danger: 0xed4245, warn: 0xfee75c, gold: 0xf1c40f, neutral: 0x99aab5 };

/* ---------- sessions ---------- */
const sessions = new Map();

function createSession(type, data) {
  const id = crypto.randomBytes(4).toString('hex'); // 8 chars — keeps customIds short
  const s = { id, type, createdAt: Date.now(), timers: {}, ...data };
  sessions.set(id, s);
  return s;
}
const getSession = (id) => sessions.get(id) || null;

function clearTimers(s) {
  for (const t of Object.values(s.timers)) clearTimeout(t);
  s.timers = {};
}
function endSession(id) {
  const s = sessions.get(id);
  if (!s) return;
  clearTimers(s);
  sessions.delete(id);
}
function setTimer(s, name, ms, fn) {
  clearTimeout(s.timers[name]);
  s.timers[name] = setTimeout(async () => {
    try {
      await fn();
    } catch (e) {
      console.error(`[games] timer ${name} failed:`, e.message);
    }
  }, ms);
}
// sweep abandoned sessions
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, s] of sessions) if (s.createdAt < cutoff) endSession(id);
}, 10 * 60 * 1000).unref();

/* ---------- UI helpers ---------- */
function embed({ title, description, color = 'info', fields, footer } = {}) {
  const e = new EmbedBuilder().setColor(COLORS[color] ?? color);
  if (title) e.setTitle(title);
  if (description) e.setDescription(description);
  if (fields && fields.length) e.addFields(fields);
  e.setFooter({ text: footer ? `${BRAND} · ${footer}` : `${BRAND} · Games` });
  return e;
}

function btn(id, label, style = ButtonStyle.Secondary, { emoji, disabled } = {}) {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(emoji);
  if (disabled) b.setDisabled(true);
  return b;
}
const row = (...components) => new ActionRowBuilder().addComponents(...components);

function modal(id, title, inputId, label, { placeholder, max, style = TextInputStyle.Short } = {}) {
  const t = new TextInputBuilder().setCustomId(inputId).setLabel(label.slice(0, 45)).setStyle(style).setRequired(true);
  if (placeholder) t.setPlaceholder(placeholder);
  if (max) t.setMaxLength(max);
  return new ModalBuilder().setCustomId(id).setTitle(title.slice(0, 45)).addComponents(row(t));
}

const bar = (v, max, len = 10) => {
  const f = Math.max(0, Math.min(len, Math.round((v / max) * len)));
  return '▰'.repeat(f) + '▱'.repeat(len - f);
};
const hearts = (n, max) => '❤️'.repeat(Math.max(0, n)) + '🖤'.repeat(Math.max(0, max - n));
const mention = (id) => `<@${id}>`;
const ts = (ms) => Math.floor(ms / 1000);

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** reply (new ephemeral message) or update (edit the clicked message) */
const respond = (interaction, payload, update = false) =>
  update ? interaction.update(payload) : interaction.reply({ ...payload, flags: EPH });

const expired = (interaction) =>
  interaction.reply({
    embeds: [embed({ title: '⌛ Game expired', description: 'That game has ended. Start a new one with `/games`.', color: 'neutral' })],
    flags: EPH,
  });

module.exports = {
  BRAND, EPH, COLORS, ButtonStyle,
  createSession, getSession, endSession, clearTimers, setTimer,
  embed, btn, row, modal, bar, hearts, mention, ts, shuffle, randInt, pick, respond, expired,
};
