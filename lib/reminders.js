/**
 * Event Reminder System — UTC based
 * Supports: one-time, daily, every X days, weekly, monthly
 * Tracks the messages it posts so older ones can be auto-removed.
 */
const fs = require('fs');
const path = require('path');
const { getNextOccurrence } = require('./schedule');

const dataDir = process.env.DATADIR || path.join(__dirname, '..', 'data');
const remindersPath = path.join(dataDir, 'reminders.json');

const PRESET_EVENTS = [
  'Bear Trap 1',
  'Bear Trap 2',
  'Arena',
  'Swordland Legion 1',
  'Swordland Legion 2',
  'Viking Vengeance 1',
  'Viking Vengeance 2',
  'Castle Battle',
  'Tri-Alliance Legion 1',
  'Tri-Alliance Legion 2',
  'KVK',
  'Cesares',
  'Strongest Governor',
  'Alliance Brawl',
  'Custom',
];

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(remindersPath)) {
    fs.writeFileSync(remindersPath, JSON.stringify({ reminders: [] }, null, 2));
  }
}
function load() {
  ensure();
  return JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
}
function save(data) {
  ensure();
  fs.writeFileSync(remindersPath, JSON.stringify(data, null, 2));
}
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function createReminder(opts) {
  const data = load();
  const reminder = {
    id: generateId(),
    guildId: opts.guildId,
    name: opts.name,
    note: opts.note || '', // event rules / extra info shown in the reminder
    type: opts.type, // 'once' | 'daily' | 'every_x_days' | 'weekly' | 'monthly'
    hour: opts.hour,
    minute: opts.minute,
    date: opts.date || null,
    intervalDays: opts.intervalDays || null,
    weekdays: opts.weekdays || null,
    monthDay: opts.monthDay || null,
    channelId: opts.channelId,
    mention: opts.mention || '@everyone',
    offsets: opts.offsets || [60, 10],
    enabled: true,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    lastFired: {},
    sent: [], // [{ offset, messageId, channelId, eventMs }]
  };
  data.reminders.push(reminder);
  save(data);
  return reminder;
}

function listReminders(guildId) {
  return load().reminders.filter((r) => r.guildId === guildId);
}
function getReminder(id) {
  return load().reminders.find((r) => r.id === id) || null;
}
function deleteReminder(id) {
  const data = load();
  const before = data.reminders.length;
  data.reminders = data.reminders.filter((r) => r.id !== id);
  save(data);
  return before !== data.reminders.length;
}
function setEnabled(id, enabled) {
  const data = load();
  const r = data.reminders.find((x) => x.id === id);
  if (!r) return false;
  r.enabled = !!enabled;
  save(data);
  return true;
}
function updateLastFired(id, offset, iso) {
  const data = load();
  const r = data.reminders.find((x) => x.id === id);
  if (!r) return;
  r.lastFired = r.lastFired || {};
  r.lastFired[String(offset)] = iso;
  save(data);
}

/* ---------- Sent-message tracking (auto-remove) ---------- */

function addSent(id, entry) {
  const data = load();
  const r = data.reminders.find((x) => x.id === id);
  if (!r) return;
  r.sent = r.sent || [];
  r.sent.push(entry);
  save(data);
}

/** Earlier reminders (bigger offset) for the SAME event occurrence — removed once a newer one posts. */
function takeSuperseded(id, eventMs, offset) {
  const data = load();
  const r = data.reminders.find((x) => x.id === id);
  if (!r || !Array.isArray(r.sent)) return [];
  const old = r.sent.filter((s) => s.eventMs === eventMs && s.offset > offset);
  if (!old.length) return [];
  r.sent = r.sent.filter((s) => !old.includes(s));
  save(data);
  return old;
}

/**
 * Messages that should be deleted now:
 *  - offset > 0 → at event start
 *  - offset = 0 ("starting now") → 10 min after start
 */
function takeDueDeletions(nowMs = Date.now()) {
  const data = load();
  const out = [];
  let changed = false;
  for (const r of data.reminders) {
    if (!Array.isArray(r.sent) || !r.sent.length) continue;
    const keep = [];
    for (const s of r.sent) {
      const deleteAt = s.offset > 0 ? s.eventMs : s.eventMs + 10 * 60 * 1000;
      if (nowMs >= deleteAt) {
        out.push({ reminderId: r.id, ...s });
        changed = true;
      } else keep.push(s);
    }
    r.sent = keep;
  }
  if (changed) save(data);
  return out;
}

/** Reminders that should fire now → [{ reminder, offset, eventTime }] */
function getDueReminders(now = new Date()) {
  const data = load();
  const due = [];
  const nowMs = now.getTime();

  for (const r of data.reminders) {
    if (!r.enabled) continue;
    const next = getNextOccurrence(r, new Date(nowMs - 120000));
    if (!next) continue;
    const eventMs = next.getTime();

    for (const offset of r.offsets || [60]) {
      const fireAt = eventMs - offset * 60 * 1000;
      if (nowMs >= fireAt && nowMs < fireAt + 90000) {
        const last = r.lastFired?.[String(offset)];
        if (last && Math.abs(new Date(last).getTime() - fireAt) < 5 * 60 * 1000) continue;
        due.push({ reminder: r, offset, eventTime: next });
      }
    }
  }
  return due;
}

module.exports = {
  PRESET_EVENTS,
  createReminder,
  listReminders,
  getReminder,
  deleteReminder,
  setEnabled,
  updateLastFired,
  addSent,
  takeSuperseded,
  takeDueDeletions,
  getNextOccurrence,
  getDueReminders,
};
