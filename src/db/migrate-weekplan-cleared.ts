import { Database } from 'bun:sqlite';

const db = new Database('./data/recipes.sqlite');

// Add cleared column and make recipe_id nullable
try {
  db.run(`ALTER TABLE week_plan ADD COLUMN cleared INTEGER DEFAULT 0`);
  console.log('Added cleared column to week_plan');
} catch (e: any) {
  if (e.message.includes('duplicate column')) {
    console.log('cleared column already exists');
  } else {
    throw e;
  }
}

// SQLite doesn't support ALTER COLUMN, but NULL inserts work even with NOT NULL
// if the column has a default or we use the new schema going forward.
// For safety, recreate the table:
try {
  db.run(`
    CREATE TABLE IF NOT EXISTS week_plan_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
      cleared INTEGER DEFAULT 0,
      temp INTEGER,
      icon TEXT,
      description TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
  db.run(`INSERT OR IGNORE INTO week_plan_new SELECT id, date, recipe_id, COALESCE(cleared, 0), temp, icon, description, created_at FROM week_plan`);
  db.run(`DROP TABLE week_plan`);
  db.run(`ALTER TABLE week_plan_new RENAME TO week_plan`);
  console.log('Migrated week_plan: recipe_id now nullable, cleared column added');
} catch (e: any) {
  console.error('Migration error:', e.message);
}
