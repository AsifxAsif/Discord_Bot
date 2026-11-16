/**
 * Event Reminder System — UTC based
 * Supports: one-time, daily, every X days, weekly, monthly
 */
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const remindersPath = path.join(dataDir, 'reminders.json');

const PRESET_EVENTS = [
  'Bear Trap',
  'Arena',
  'Swordland',
  'Viking',
  'Castle Battle',
  'Tri-Alliance',
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

/**
 * Create a reminder
 * @param {object} opts
 */
function createReminder(opts) {
  const data = load();
  const reminder = {
    id: generateId(),
    guildId: opts.guildId,
    name: opts.name,
    type: opts.type, // 'once' | 'daily' | 'every_x_days' | 'weekly' | 'monthly'
    // time in UTC: { hour: 0-23, minute: 0-59 }
    hour: opts.hour,
    minute: opts.minute,
    // for once
    date: opts.date || null, // YYYY-MM-DD
    // for every_x_days
    intervalDays: opts.intervalDays || null,
    // for weekly: array of 0-6 (Sun-Sat)
    weekdays: opts.weekdays || null,
    // for monthly: day of month 1-31
    monthDay: opts.monthDay || null,
    channelId: opts.channelId,
    mention: opts.mention || '@everyone', // '@everyone' or role id
    // minutes before event to send reminder
    offsets: opts.offsets || [60, 10],
    enabled: true,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    lastFired: {}, // offset -> ISO timestamp
  };
  data.reminders.push(reminder);
  save(data);
  return reminder;
}

function listReminders(guildId) {
  const data = load();
  return data.reminders.filter((r) => r.guildId === guildId);
}

function getReminder(id) {
  const data = load();
  return data.reminders.find((r) => r.id === id) || null;
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

/**
 * Calculate next occurrence of a reminder (UTC)
 * Returns Date or null
 */
function getNextOccurrence(reminder, from = new Date()) {
  const now = from.getTime();
  const h = reminder.hour;
  const m = reminder.minute;

  if (reminder.type === 'once') {
    if (!reminder.date) return null;
    const d = new Date(`${reminder.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
    return d.getTime() > now ? d : null;
  }

  if (reminder.type === 'daily') {
    let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), h, m, 0));
    if (d.getTime() <= now) d = new Date(d.getTime() + 86400000);
    return d;
  }

  if (reminder.type === 'every_x_days') {
    const interval = Math.max(1, Number(reminder.intervalDays) || 1);
    // Use createdAt or a stored anchor
    const anchor = reminder.date
      ? new Date(`${reminder.date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
      : new Date(reminder.createdAt);
    let d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), h, m, 0));
    while (d.getTime() <= now) {
      d = new Date(d.getTime() + interval * 86400000);
    }
    return d;
  }

  if (reminder.type === 'weekly') {
    const days = (reminder.weekdays || []).map(Number);
    if (!days.length) return null;
    for (let i = 0; i < 8; i++) {
      const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i, h, m, 0));
      if (d.getTime() <= now) continue;
      if (days.includes(d.getUTCDay())) return d;
    }
    return null;
  }

  if (reminder.type === 'monthly') {
    const day = Number(reminder.monthDay) || 1;
    let year = from.getUTCFullYear();
    let month = from.getUTCMonth();
    let d = new Date(Date.UTC(year, month, day, h, m, 0));
    if (d.getTime() <= now) {
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      d = new Date(Date.UTC(year, month, day, h, m, 0));
    }
    return d;
  }

  return null;
}

/**
 * Check all reminders and return those that should fire now
 * Returns array of { reminder, offset, eventTime }
 */
function getDueReminders(now = new Date()) {
  const data = load();
  const due = [];
  const nowMs = now.getTime();

  for (const r of data.reminders) {
    if (!r.enabled) continue;
    const next = getNextOccurrence(r, new Date(nowMs - 120000)); // small lookback
    if (!next) continue;
    const eventMs = next.getTime();

    for (const offset of r.offsets || [60]) {
      const fireAt = eventMs - offset * 60 * 1000;
      // fire window: within last 90 seconds
      if (nowMs >= fireAt && nowMs < fireAt + 90000) {
        const key = String(offset);
        const last = r.lastFired?.[key];
        if (last) {
          const lastMs = new Date(last).getTime();
          // already fired for this occurrence
          if (Math.abs(lastMs - fireAt) < 5 * 60 * 1000) continue;
        }
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
  getNextOccurrence,
  getDueReminders,
};
