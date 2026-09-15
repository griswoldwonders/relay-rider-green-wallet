import { applyMigrations, openDatabase, resolveDbPath, rollbackLastMigration } from './db.js';
import { seedDatabase } from './seed.js';

const db = openDatabase(resolveDbPath());
const command = process.argv[2] || 'up';
if (command === 'down') {
  const rolled = rollbackLastMigration(db);
  console.log(rolled ? `rolled back ${rolled}` : 'no migrations to roll back');
} else {
  applyMigrations(db);
  seedDatabase(db);
  console.log('migrations applied');
}
db.close();
