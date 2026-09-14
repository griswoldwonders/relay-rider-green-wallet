import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { authenticate, createSession, destroySession, loadSessionUser, parseCookies } from './auth.js';
import {
  activateHub,
  activatePilot,
  adminDashboard,
  completeChecklistItem,
  confirmReceipt,
  enrollParticipant,
  getPilot,
  listHubs,
  monthlyReport,
  participantDashboard,
  publicUser,
  reportToCsv,
  requestRedemption,
  reviewEvidence,
  submitChargingEvidence,
  submitCommuteEvidence,
  transitionRedemption,
  updatePilotEffectiveDate,
} from './pilotService.js';
import { PilotError, newId, nowIso } from './util.js';
import { USER_ROLES } from '../shared/contract.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApp(db, options = {}) {
  const uploadDir = options.uploadDir || join(process.cwd(), 'data', 'evidence');
  mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const cookies = parseCookies(req.headers.cookie);
    req.sessionId = cookies.pilot_session;
    req.actor = loadSessionUser(db, req.sessionId);
    if (!SAFE_METHODS.has(req.method)) {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const host = new URL(origin).host;
          const allowed = [
            req.headers.host,
            'localhost:5173',
            '127.0.0.1:5173',
            'localhost:8787',
            '127.0.0.1:8787',
            process.env.PILOT_PUBLIC_HOST,
          ].filter(Boolean);
          if (!allowed.includes(host)) return res.status(403).json({ error: 'CSRF_ORIGIN' });
        } catch {
          return res.status(403).json({ error: 'CSRF_ORIGIN' });
        }
      }
      const csrf = req.headers['x-csrf-token'];
      if (req.path !== '/api/login' && (!req.actor || csrf !== req.actor.csrf_token)) {
        return res.status(403).json({ error: 'CSRF' });
      }
    }
    next();
  });

  function requireAuth(req, res, next) {
    if (!req.actor) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    next();
  }
  function requireAdmin(req, res, next) {
    if (req.actor?.role !== USER_ROLES.administrator) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  }
  function requireParticipant(req, res, next) {
    if (req.actor?.role !== USER_ROLES.participant) return res.status(403).json({ error: 'FORBIDDEN' });
    next();
  }
  const handle = (fn) => (req, res, next) => {
    try {
      fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };

  app.get('/api/health', (_req, res) => {
    const pilot = getPilot(db);
    res.json({ ok: true, pilotEnabled: Boolean(pilot?.enabled), researchStage: true });
  });

  app.post('/api/login', handle((req, res) => {
    const user = authenticate(db, req.body?.email, req.body?.password);
    if (!user) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    const session = createSession(db, user);
    res.setHeader('Set-Cookie', `pilot_session=${session.id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`);
    res.json({ user: publicUser(user), csrfToken: session.csrf });
  }));

  app.post('/api/logout', requireAuth, handle((req, res) => {
    destroySession(db, req.sessionId);
    res.setHeader('Set-Cookie', 'pilot_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0');
    res.json({ ok: true });
  }));

  app.get('/api/session', requireAuth, handle((req, res) => {
    res.json({ user: publicUser(req.actor), csrfToken: req.actor.csrf_token, pilot: getPilot(db) });
  }));

  app.get('/api/participant/dashboard', requireAuth, requireParticipant, handle((req, res) => {
    res.json(participantDashboard(db, req.actor));
  }));

  app.post('/api/participant/commute-evidence', requireAuth, requireParticipant, handle((req, res) => {
    res.status(201).json(submitCommuteEvidence(db, req.actor, req.body || {}));
  }));

  app.post('/api/participant/charging-evidence', requireAuth, requireParticipant, handle((req, res) => {
    res.status(201).json(submitChargingEvidence(db, req.actor, req.body || {}));
  }));

  app.post('/api/participant/redemptions', requireAuth, requireParticipant, handle((req, res) => {
    if (req.body?.status) return res.status(403).json({ error: 'CLIENT_STATUS_FORBIDDEN' });
    const created = requestRedemption(db, req.actor, {
      credits: req.body?.credits,
      deliveryMethod: req.body?.deliveryMethod,
      hubId: req.body?.hubId,
      idempotencyKey: req.headers['idempotency-key'],
    });
    res.status(201).json(created);
  }));

  app.post('/api/participant/redemptions/:id/confirm-receipt', requireAuth, requireParticipant, handle((req, res) => {
    res.json(confirmReceipt(db, req.actor, req.params.id));
  }));

  app.get('/api/participant/evidence-files/:id', requireAuth, handle((req, res) => {
    const file = db.prepare('SELECT * FROM evidence_files WHERE id = ?').get(req.params.id);
    if (!file) return res.status(404).json({ error: 'NOT_FOUND' });
    const sameTenant = file.tenant_id === req.actor.tenant_id;
    const owner = file.owner_participant_id === req.actor.id;
    if (req.actor.role === USER_ROLES.participant && (!owner || !sameTenant)) {
      return res.status(403).json({ error: 'EVIDENCE_PRIVACY' });
    }
    if (req.actor.role === USER_ROLES.administrator && !sameTenant) {
      return res.status(403).json({ error: 'EVIDENCE_PRIVACY' });
    }
    res.setHeader('Content-Type', file.mime_type);
    res.send(readFileSync(join(uploadDir, file.stored_name)));
  }));

  app.post('/api/participant/evidence-files', requireAuth, requireParticipant, handle((req, res) => {
    const { filename, mimeType, contentBase64 } = req.body || {};
    if (!filename || !contentBase64) return res.status(400).json({ error: 'FILE_REQUIRED' });
    const buffer = Buffer.from(contentBase64, 'base64');
    if (buffer.length > 1_000_000) return res.status(413).json({ error: 'FILE_TOO_LARGE' });
    const stored = `${newId('evf')}.bin`;
    createWriteStream(join(uploadDir, stored)).end(buffer);
    const id = newId('file');
    db.prepare(`INSERT INTO evidence_files (id, tenant_id, owner_participant_id, stored_name, original_name, mime_type, byte_size, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.actor.tenant_id, req.actor.id, stored, filename, mimeType || 'application/octet-stream', buffer.length, nowIso());
    res.status(201).json({ id, byteSize: buffer.length, originalName: filename });
  }));

  app.get('/api/admin/dashboard', requireAuth, requireAdmin, handle((req, res) => {
    res.json(adminDashboard(db, req.actor));
  }));

  app.post('/api/admin/pilot/activate', requireAuth, requireAdmin, handle((req, res) => {
    res.json(activatePilot(db, req.actor, { effectiveAt: req.body?.effectiveAt }));
  }));

  app.post('/api/admin/pilot/effective-date', requireAuth, requireAdmin, handle((req, res) => {
    res.json(updatePilotEffectiveDate(db, req.actor, req.body?.effectiveAt));
  }));

  app.post('/api/admin/participants/:id/enroll', requireAuth, requireAdmin, handle((req, res) => {
    res.json(enrollParticipant(db, req.actor, req.params.id));
  }));

  app.post('/api/admin/hubs/:id/checklist/:itemKey', requireAuth, requireAdmin, handle((req, res) => {
    res.json(completeChecklistItem(db, req.actor, req.params.id, req.params.itemKey));
  }));

  app.post('/api/admin/hubs/:id/activate', requireAuth, requireAdmin, handle((req, res) => {
    res.json(activateHub(db, req.actor, req.params.id));
  }));

  app.get('/api/hubs', requireAuth, handle((_req, res) => {
    res.json({ hubs: listHubs(db) });
  }));

  app.post('/api/admin/evidence/:type/:id/review', requireAuth, requireAdmin, handle((req, res) => {
    res.json(reviewEvidence(db, req.actor, {
      type: req.params.type,
      id: req.params.id,
      decision: req.body?.decision,
      notes: req.body?.notes,
    }));
  }));

  app.post('/api/admin/redemptions/:id/transition', requireAuth, requireAdmin, handle((req, res) => {
    if (req.body?.status && !req.body?.action) {
      return res.status(403).json({ error: 'CLIENT_STATUS_FORBIDDEN', message: 'clients may not assign administrative statuses directly' });
    }
    res.json(transitionRedemption(db, req.actor, {
      redemptionId: req.params.id,
      action: req.body?.action,
      reason: req.body?.reason,
      delivery: req.body?.delivery,
    }));
  }));

  app.get('/api/admin/reports/monthly', requireAuth, requireAdmin, handle((req, res) => {
    const month = String(req.query.month || nowIso().slice(0, 7));
    const report = monthlyReport(db, req.actor, month);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="pasadena-pilot-${month}.csv"`);
      return res.send(reportToCsv(report));
    }
    res.json(report);
  }));

  app.use((error, _req, res, _next) => {
    if (error instanceof PilotError) {
      return res.status(error.httpStatus).json({ error: error.code, message: error.message });
    }
    console.error(error);
    res.status(500).json({ error: 'INTERNAL' });
  });

  return app;
}
