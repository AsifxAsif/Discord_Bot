/**
 * Shared schedule helpers (UTC) - used by event reminders AND scheduled blogs.
 * Types: once | daily | every_x_days | weekly | monthly
 */
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');
/** "20:30", "20.30", "20" -> { hour, minute } | null */
function parseTime(raw) {
	const m = String(raw || '').trim().match(/^(\d{1,2})(?:\s*[:.]\s*(\d{1,2}))?$/);
	if (!m) return null;
	const hour = Number(m[1]);
	const minute = m[2] != null ? Number(m[2]) : 0;
	if (hour > 23 || minute > 59) return null;
	return {
 hour,
 minute
	};
}
/** "60,10" -> [60,10] (unique, descending, max 5) */
function parseOffsets(raw, fallback = [60, 10]) {
	const list = String(raw || '').split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && n >= 0 && n <= 10080);
	const uniq = [...new Set(list)].sort((a, b) => b - a).slice(0, 5);
	return uniq.length ? uniq : fallback;
}
/**
 * Validate the type-specific modal field.
 * @param {string} type
 * @param {(id:string)=>string} get safe text-input getter ('' when missing)
 * @returns {{error:string}|{data:object}}
 */
function parseDetails(type, get) {
	if (type === 'once') {
 const date = get('date').trim();
 const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
 if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) {
 return {
 error: 'Date must be a real date like `2026-11-20`.'
 };
 }
 return {
 data: {
 date
 }
 };
	}
	if (type === 'every_x_days') {
 const n = parseInt(get('interval'), 10);
 if (!Number.isFinite(n) || n < 1 || n > 365) return {
 error: 'Interval must be 1-365 days.'
 };
 return {
 data: {
 intervalDays: n
 }
 };
	}
	if (type === 'weekly') {
 const days = [...new Set(get('weekdays').split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => n >= 0 && n <= 6)), ].sort();
 if (!days.length) return {
 error: 'Weekdays must be numbers 0-6 (0=Sun ... 6=Sat), e.g. `1,3,5`.'
 };
 return {
 data: {
 weekdays: days
 }
 };
	}
	if (type === 'monthly') {
 const n = parseInt(get('monthday'), 10);
 if (!Number.isFinite(n) || n < 1 || n > 31) return {
 error: 'Day of month must be 1-31.'
 };
 return {
 data: {
 monthDay: n
 }
 };
	}
	return {
 data: {}
	}; // daily
}

function formatSchedule(r) {
	const time = `${pad(r.hour)}:${pad(r.minute)} UTC`;
	switch (r.type) {
 case 'once':
 return `One-time | ${r.date} at ${time}`;
 case 'daily':
 return `Daily at ${time}`;
 case 'every_x_days':
 return `Every ${r.intervalDays} day(s) at ${time}`;
 case 'weekly':
 return `Weekly (${(r.weekdays || []).map((d) => DAY_NAMES[d]).join(', ')}) at ${time}`;
 case 'monthly':
 return `Monthly on day ${r.monthDay} at ${time}`;
 default:
 return time;
	}
}
/** Next occurrence (UTC) strictly after `from`, or null. */
function getNextOccurrence(r, from = new Date()) {
	const now = from.getTime();
	const h = r.hour;
	const m = r.minute;
	if (r.type === 'once') {
 if (!r.date) return null;
 const d = new Date(`${r.date}T${pad(h)}:${pad(m)}:00Z`);
 return d.getTime() > now ? d : null;
	}
	if (r.type === 'daily') {
 let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), h, m, 0));
 if (d.getTime() <= now) d = new Date(d.getTime() + DAY_MS);
 return d;
	}
	if (r.type === 'every_x_days') {
 const interval = Math.max(1, Number(r.intervalDays) || 1);
 const anchor = r.date ? new Date(`${r.date}T00:00:00Z`) : new Date(r.createdAt || now);
 let d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate(), h, m, 0));
 if (d.getTime() <= now) {
 const steps = Math.floor((now - d.getTime()) / (interval * DAY_MS)) + 1;
 d = new Date(d.getTime() + steps * interval * DAY_MS);
 }
 return d;
	}
	if (r.type === 'weekly') {
 const days = (r.weekdays || []).map(Number);
 if (!days.length) return null;
 for (let i = 0; i < 8; i++) {
 const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + i, h, m, 0));
 if (d.getTime() <= now) continue;
 if (days.includes(d.getUTCDay())) return d;
 }
 return null;
	}
	if (r.type === 'monthly') {
 const day = Number(r.monthDay) || 1;
 const y = from.getUTCFullYear();
 const mo = from.getUTCMonth();
 // Skip months that don't have this day (e.g. 31st) instead of rolling into the next month
 for (let i = 0; i < 24; i++) {
 const d = new Date(Date.UTC(y, mo + i, day, h, m, 0));
 if (d.getUTCDate() === day && d.getUTCMonth() === (mo + i) % 12 && d.getTime() > now) return d;
 }
 return null;
	}
	return null;
}
module.exports = {
	DAY_NAMES,
	pad,
	parseTime,
	parseOffsets,
	parseDetails,
	formatSchedule,
	getNextOccurrence
};
