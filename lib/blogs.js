/**
 * Scheduled event blogs (announcements) — same schedule types as reminders.
 */
const fs = require('fs');
const path = require('path');
const { getNextOccurrence } = require('./schedule');

const dataDir = process.env.DATADIR || path.join(__dirname, '..', 'data');
const blogsPath = path.join(dataDir, 'scheduled_blogs.json');

function ensure() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(blogsPath)) fs.writeFileSync(blogsPath, JSON.stringify({ blogs: [] }, null, 2));
}
function load() {
  ensure();
  return JSON.parse(fs.readFileSync(blogsPath, 'utf8'));
}
function save(data) {
  ensure();
  fs.writeFileSync(blogsPath, JSON.stringify(data, null, 2));
}
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function createBlog(opts) {
  const data = load();
  const blog = {
    id: genId(),
    guildId: opts.guildId,
    event: opts.event,
    title: opts.title,
    content: opts.content,
    image: opts.image || '',
    color: opts.color || 0x5865f2,
    mention: opts.mention || '', // '@everyone' | '' | roleId
    channelId: opts.channelId,
    type: opts.type,
    hour: opts.hour,
    minute: opts.minute,
    date: opts.date || null,
    intervalDays: opts.intervalDays || null,
    weekdays: opts.weekdays || null,
    monthDay: opts.monthDay || null,
    enabled: true,
    createdBy: opts.createdBy,
    createdAt: new Date().toISOString(),
    lastFiredFor: null, // eventMs of the last occurrence that was posted
  };
  data.blogs.push(blog);
  save(data);
  return blog;
}

const listBlogs = (guildId) => load().blogs.filter((b) => b.guildId === guildId);
const getBlog = (id) => load().blogs.find((b) => b.id === id) || null;

function deleteBlog(id) {
  const data = load();
  const before = data.blogs.length;
  data.blogs = data.blogs.filter((b) => b.id !== id);
  save(data);
  return before !== data.blogs.length;
}

function setBlogEnabled(id, enabled) {
  const data = load();
  const b = data.blogs.find((x) => x.id === id);
  if (!b) return false;
  b.enabled = !!enabled;
  save(data);
  return true;
}

function markFired(id, eventMs) {
  const data = load();
  const b = data.blogs.find((x) => x.id === id);
  if (!b) return;
  b.lastFiredFor = eventMs;
  if (b.type === 'once') b.enabled = false; // one-time posts switch themselves off
  save(data);
}

/** Blogs whose post time is now → [{ blog, eventMs }] */
function getDueBlogs(now = new Date()) {
  const nowMs = now.getTime();
  const due = [];
  for (const b of load().blogs) {
    if (!b.enabled) continue;
    const next = getNextOccurrence(b, new Date(nowMs - 120000));
    if (!next) continue;
    const eventMs = next.getTime();
    if (nowMs >= eventMs && nowMs < eventMs + 90000 && b.lastFiredFor !== eventMs) {
      due.push({ blog: b, eventMs });
    }
  }
  return due;
}

module.exports = { createBlog, listBlogs, getBlog, deleteBlog, setBlogEnabled, markFired, getDueBlogs };
