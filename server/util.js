import crypto from 'node:crypto';

export class PilotError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function newCorrelationId() {
  return crypto.randomUUID();
}

export function fingerprintEvidence({ participantId, hubId, chargingDate, startAt, energyWh, sessionIdentifier }) {
  const payload = [participantId, hubId, chargingDate, startAt, String(energyWh), sessionIdentifier || ''].join('|').toLowerCase();
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function hashSecret(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function scryptHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function scryptVerify(password, stored) {
  const [scheme, salt, derived] = String(stored).split(':');
  if (scheme !== 'scrypt' || !salt || !derived) return false;
  const check = crypto.scryptSync(password, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(check, 'hex'));
}
