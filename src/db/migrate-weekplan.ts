import { Database } from 'bun:sqlite';

const db = new Database('./data/recipes.sqlite');

db.run(`
  CREATE TABLE IF NOT EXISTS week_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    temp INTEGER,
    icon TEXT,
    description TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`);

console.log('Week plan table created');
