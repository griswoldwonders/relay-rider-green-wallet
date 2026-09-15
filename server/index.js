import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { applyMigrations, openDatabase, resolveDbPath } from './db.js';
import { createApp } from './app.js';
import { seedDatabase } from './seed.js';

const here = dirname(fileURLToPath(import.meta.url));
const db = openDatabase(resolveDbPath());
applyMigrations(db);
seedDatabase(db);

const app = createApp(db, { uploadDir: process.env.PILOT_UPLOAD_DIR });
const dist = join(here, '..', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(join(dist, 'index.html'));
  });
}

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  console.log(`Pasadena charging-benefit pilot listening on ${host}:${port}`);
});
