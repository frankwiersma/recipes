import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from './schema';

const sqlite = new Database(process.env.DATABASE_URL || './data/recipes.sqlite');
sqlite.exec('PRAGMA journal_mode = WAL;');

export const db = drizzle(sqlite, { schema });

// Create tables if they don't exist
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT,
    default_servings INTEGER DEFAULT 2,
    image_url TEXT,
    source_url TEXT,
    source_type TEXT,
    seasons TEXT,
    weather_tags TEXT,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recipe_tags (
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (recipe_id, tag_id)
  );

  CREATE TABLE IF NOT EXISTS meal_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    eaten_at INTEGER NOT NULL,
    servings INTEGER DEFAULT 2,
    notes TEXT,
    rating INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    suggested_for TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    reason TEXT,
    weather_data TEXT,
    email_sent_at INTEGER,
    created_at INTEGER NOT NULL
  );
`);

// Create FTS table
try {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS recipes_fts USING fts5(
      name,
      description,
      ingredients_text,
      content='recipes',
      content_rowid='id'
    );
  `);
} catch (e) {
  // Already exists
}

// Create triggers for FTS
try {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS recipes_ai AFTER INSERT ON recipes BEGIN
      INSERT INTO recipes_fts(rowid, name, description, ingredients_text)
      VALUES (new.id, new.name, new.description, new.ingredients);
    END;
  `);
} catch (e) {
  // Trigger may already exist
}

export { sqlite };
