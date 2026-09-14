const crypto = require('node:crypto');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function validPassword(password, stored) {
  const [salt, expected] = String(stored).split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return actual.length === expected.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 1) continue;
    try { result[decodeURIComponent(part.slice(0, separator).trim())] = decodeURIComponent(part.slice(separator + 1).trim()); } catch {}
  }
  return result;
}

function createLoginLimiter({ attempts = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map();
  return {
    blocked(key, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry || now - entry.startedAt >= windowMs) { failures.delete(key); return false; }
      return entry.count >= attempts;
    },
    fail(key, now = Date.now()) {
      const entry = failures.get(key);
      if (!entry || now - entry.startedAt >= windowMs) failures.set(key, { count: 1, startedAt: now });
      else entry.count += 1;
    },
    clear(key) { failures.delete(key); }
  };
}

module.exports = { cookies, createLoginLimiter, hashPassword, validPassword };
