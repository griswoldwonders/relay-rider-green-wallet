import { CHECKLIST_ITEMS } from '../shared/contract.js';
import { activateHub, activatePilot, completeChecklistItem } from './pilotService.js';
import { applyMigrations, openDatabase } from './db.js';
import { seedDatabase } from './seed.js';

export function memoryPilot() {
  const db = openDatabase(':memory:');
  applyMigrations(db);
  seedDatabase(db);
  const admin = db.prepare("SELECT * FROM users WHERE id = 'user-admin-01'").get();
  const participant = db.prepare("SELECT * FROM users WHERE id = 'user-participant-a'").get();
  const riderB = db.prepare("SELECT * FROM users WHERE id = 'user-participant-b'").get();
  const outsider = db.prepare("SELECT * FROM users WHERE id = 'user-outsider'").get();
  return { db, admin, participant, riderB, outsider };
}

export function readyPilot(options = {}) {
  const ctx = memoryPilot();
  activatePilot(ctx.db, ctx.admin, { effectiveAt: options.effectiveAt || '2026-09-01T07:00:00.000Z' });
  const hubId = options.hubId || 'hub-marengo-charging-plaza';
  for (const item of CHECKLIST_ITEMS) {
    completeChecklistItem(ctx.db, ctx.admin, hubId, item.key);
  }
  activateHub(ctx.db, ctx.admin, hubId);
  return { ...ctx, hubId };
}

export function offPeakStart(localDate) {
  return `${localDate}T16:00:00.000Z`;
}
