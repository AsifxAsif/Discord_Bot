/**
 * Gift code redemption via official endpoints (multiple backups).
 * Rate-limit requests — do not spam.
 */
const crypto = require('crypto');

// Primary + backup redeem hosts (same protocol; try next on network/5xx failure)
const REDEEM_URLS = [
  'https://ks-giftcode.centurygame.com/api/gift_code',
  'https://kingshot-giftcode.centurygame.com/api/gift_code',
];

const ENCRYPT_KEY = 'mN4!pQs6JrYwV9';
const DELAY_MS = Number(process.env.REDEEMDELAYMS || 2500);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function sign(params) {
  const keys = Object.keys(params).sort();
  const raw = keys.map((k) => `${k}=${params[k]}`).join('&') + ENCRYPT_KEY;
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex');
}

function classify(json, httpStatus) {
  const err = json.err_code ?? json.code;
  const msg = String(json.msg || json.message || '').toLowerCase();

  if (err === 0 || err === 20000 || json.code === 0) {
    return { ok: true, status: 'success', message: json.msg || 'OK', raw: json };
  }
  if (err === 40008 || msg.includes('already') || msg.includes('claimed') || msg.includes('used')) {
    return { ok: true, status: 'already', message: json.msg || 'Already redeemed', raw: json };
  }
  if (err === 40005 || msg.includes('expir') || msg.includes('period')) {
    return { ok: false, status: 'expired', message: json.msg || 'Expired', raw: json };
  }
  if (err === 40001 || err === 40007 || err === 40014 || msg.includes('invalid') || msg.includes('not exist')) {
    return { ok: false, status: 'invalid', message: json.msg || 'Invalid code', raw: json };
  }
  if (
    httpStatus === 429 ||
    err === 429 ||
    msg.includes('too many') ||
    msg.includes('busy') ||
    msg.includes('rate')
  ) {
    return { ok: false, status: 'rate_limit', message: json.msg || 'Rate limited', raw: json };
  }
  return {
    ok: false,
    status: 'error',
    message: json.msg || json.message || `err ${err}`,
    raw: json,
  };
}

/**
 * @returns {{ ok: boolean, status: string, message: string, raw?: object }}
 */
async function redeemOne(fid, kid, code) {
  const time = String(Math.floor(Date.now() / 1000));
  const base = {
    cdk: String(code).trim(),
    fid: String(fid),
    kid: String(kid),
    time,
  };
  const payload = { ...base, sign: sign(base) };
  const body = new URLSearchParams(payload).toString();

  const headerVariants = [
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Origin: 'https://ks-giftcode.centurygame.com',
      Referer: 'https://ks-giftcode.centurygame.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Origin: 'https://kingshot-giftcode.centurygame.com',
      Referer: 'https://kingshot-giftcode.centurygame.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  ];

  let lastErr = null;

  for (let i = 0; i < REDEEM_URLS.length; i++) {
    const url = REDEEM_URLS[i];
    const headers = headerVariants[i] || headerVariants[0];
    try {
      const res = await fetch(url, { method: 'POST', headers, body });
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        lastErr = `Non-JSON (${res.status})`;
        // try next host on bad response body / 5xx
        if (res.status >= 500 || res.status === 0) continue;
        lastErr = `Bad response (${res.status})`;
        continue;
      }

      const result = classify(json, res.status);

      // Server-side definitive answers — do not retry other host
      if (
        result.status === 'success' ||
        result.status === 'already' ||
        result.status === 'expired' ||
        result.status === 'invalid' ||
        result.status === 'rate_limit'
      ) {
        return result;
      }

      // Generic error: try backup host once
      lastErr = result.message;
      if (i < REDEEM_URLS.length - 1) continue;
      return result;
    } catch (e) {
      lastErr = e.message;
      // network failure → try next URL
    }
  }

  return { ok: false, status: 'error', message: lastErr || 'Request failed' };
}

async function redeemAll(members, code, { onProgress, delayMs } = {}) {
  let wait = delayMs;
  if (wait == null) {
    try {
      wait = require('./store').getEffectiveDelayMs();
    } catch {
      wait = DELAY_MS;
    }
  }
  const results = [];
  const total = members.length;
  for (let i = 0; i < total; i++) {
    const m = members[i];
    const result = await redeemOne(m.fid, m.kid != null ? m.kid : '', code);
    results.push({ fid: m.fid, name: m.name, ...result });
    if (onProgress) await onProgress(i + 1, total, m, result);
    if (i < total - 1) await sleep(wait);
  }
  return results;
}

function summarize(results) {
  const s = { success: 0, already: 0, expired: 0, invalid: 0, error: 0, rate_limit: 0 };
  for (const r of results) s[r.status] = (s[r.status] || 0) + 1;
  return s;
}

module.exports = { redeemOne, redeemAll, summarize, DELAY_MS };
