import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Categories
export const categories = [
  'curry',
  'soep',
  'pokebowl',
  'salade',
  'plaattaart',
  'pasta',
  'wraps',
  'shakshuka'
] as const;

export type Category = typeof categories[number];

// Seasons
export const seasons = ['lente', 'zomer', 'herfst', 'winter'] as const;
export type Season = typeof seasons[number];

// Weather tags
export const weatherTags = ['koud', 'warm', 'regenachtig', 'zonnig'] as const;
export type WeatherTag = typeof weatherTags[number];

// Tag types
export const tagTypes = ['diet', 'difficulty', 'cuisine', 'mood', 'meal_type', 'main_ingredient', 'custom'] as const;
export type TagType = typeof tagTypes[number];

// Ingredient type
export interface Ingredient {
  name: string;
  amount: number | null;
  unit: string | null;
  scalable: boolean;
  notes?: string;
}

// Weather snapshot
export interface WeatherSnapshot {
  temp: number;
  feelsLike: number;
  condition: string;
  description: string;
  humidity: number;
  windSpeed: number;
  icon: string;
}

// ============ RECIPES TABLE ============
export const recipes = sqliteTable('recipes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  category: text('category').notNull(),
  ingredients: text('ingredients', { mode: 'json' }).notNull().$type<Ingredient[]>(),
  instructions: text('instructions', { mode: 'json' }).$type<string[]>(),
  defaultServings: integer('default_servings').default(2),
  imageUrl: text('image_url'),
  sourceUrl: text('source_url'),
  sourceType: text('source_type'),
  seasons: text('seasons', { mode: 'json' }).$type<Season[]>(),
  weatherTags: text('weather_tags', { mode: 'json' }).$type<WeatherTag[]>(),
  prepTimeMinutes: integer('prep_time_minutes'),
  cookTimeMinutes: integer('cook_time_minutes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============ TAGS TABLE ============
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  type: text('type').notNull(),
});

// ============ RECIPE_TAGS TABLE ============
export const recipeTags = sqliteTable('recipe_tags', {
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.recipeId, table.tagId] }),
}));

// ============ MEAL HISTORY TABLE ============
export const mealHistory = sqliteTable('meal_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  eatenAt: integer('eaten_at', { mode: 'timestamp' }).notNull(),
  servings: integer('servings').default(2),
  notes: text('notes'),
  rating: integer('rating'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============ SUGGESTIONS TABLE ============
export const suggestions = sqliteTable('suggestions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  suggestedFor: text('suggested_for').notNull(),
  status: text('status').default('pending'),
  reason: text('reason', { mode: 'json' }),
  weatherData: text('weather_data', { mode: 'json' }).$type<WeatherSnapshot>(),
  emailSentAt: integer('email_sent_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ============ WEEK PLAN TABLE ============
export const weekPlan = sqliteTable('week_plan', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(), // YYYY-MM-DD
  recipeId: integer('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
  temp: integer('temp'),
  icon: text('icon'),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});
