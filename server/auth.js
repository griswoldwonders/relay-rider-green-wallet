import { scryptVerify, newId, nowIso } from './util.js';

const SESSION_MS = 12 * 60 * 60 * 1000;

export function createSession(db, user) {
  const id = newId('ses');
  const csrf = newId('csrf');
  const expires = new Date(Date.now() + SESSION_MS).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, csrf_token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, user.id, csrf, expires, nowIso());
  return { id, csrf, expiresAt: expires };
}

export function destroySession(db, sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function loadSessionUser(db, sessionId) {
  if (!sessionId) return null;
  const row = db.prepare(`SELECT sessions.id AS session_id, sessions.csrf_token, sessions.expires_at, users.*
    FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ?`).get(sessionId);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    destroySession(db, sessionId);
    return null;
  }
  return row;
}

export function authenticate(db, email, password) {
  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email || ''));
  if (!user || !scryptVerify(password, user.password_hash)) return null;
  return user;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (!key) continue;
    out[key] = decodeURIComponent(rest.join('='));
  }
  return out;
}
