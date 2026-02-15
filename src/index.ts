import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import recipesApi from './api/recipes';
import suggestionsApi from './api/suggestions';
import historyApi from './api/history';
import tagsApi from './api/tags';
import shoppingApi from './api/shopping';
import { getCurrentWeather, getWeatherDescription, getWeekForecast } from './services/weather';

// Get local date in YYYY-MM-DD format (not UTC)
function getLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Initialize database
import './db/index';

const app = new Hono();

// CORS for frontend
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
}));

// API routes
app.route('/api/recipes', recipesApi);
app.route('/api/suggestions', suggestionsApi);
app.route('/api/history', historyApi);
app.route('/api/tags', tagsApi);
app.route('/api/shopping', shoppingApi);

// Weather endpoint
app.get('/api/weather', async (c) => {
  try {
    const weather = await getCurrentWeather();
    return c.json({
      temp: weather.temp,
      description: weather.description,
      icon: weather.icon,
    });
  } catch (e) {
    return c.json({ error: `Weather API error: ${e}` }, 500);
  }
});

// Week plan with forecast and recipe suggestions
app.get('/api/weekplan', async (c) => {
  try {
    const forecast = await getWeekForecast();
    const currentWeather = await getCurrentWeather();
    const { db } = await import('./db/index');
    const { recipes, weekPlan } = await import('./db/schema');
    const { getCurrentSeason } = await import('./services/weather');
    const { eq } = await import('drizzle-orm');

    const allRecipes = await db.query.recipes.findMany();
    const currentSeason = getCurrentSeason();
    const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

    // Make sure today is included
    const today = getLocalDateString();
    const todayData = {
      date: today,
      dayName: dayNames[new Date().getDay()],
      temp: currentWeather.temp,
      icon: currentWeather.icon,
      description: currentWeather.description,
      weatherTags: [] as any[],
    };

    // Combine today with forecast, avoiding duplicates
    const allDays = [todayData, ...forecast.filter(d => d.date !== today)].slice(0, 7);

    // Get today's suggestion from the suggestions table (source of truth for today)
    const { suggestions } = await import('./db/schema');
    const { desc } = await import('drizzle-orm');
    const todaySuggestion = await db.select()
      .from(suggestions)
      .where(eq(suggestions.suggestedFor, today))
      .orderBy(desc(suggestions.createdAt))
      .limit(1);

    // Build the week plan, using stored values where available
    const result = [];
    const usedRecipeIds: number[] = [];

    for (const day of allDays) {
      // For today, use the current suggestion from suggestions table
      if (day.date === today && todaySuggestion.length > 0) {
        const suggestion = todaySuggestion[0];
        
        // If cleared, show empty day
        if (suggestion.status === 'cleared') {
          result.push({
            date: day.date,
            dayName: dayNames[new Date(day.date).getDay()],
            temp: day.temp,
            icon: day.icon,
            description: day.description,
            status: 'cleared',
            recipe: null,
          });
          continue;
        }
        
        const recipe = allRecipes.find(r => r.id === suggestion.recipeId);
        if (recipe) {
          usedRecipeIds.push(recipe.id);
          result.push({
            date: day.date,
            dayName: dayNames[new Date(day.date).getDay()],
            temp: day.temp,
            icon: day.icon,
            description: day.description,
            status: suggestion.status, // Include status for today
            recipe: {
              id: recipe.id,
              name: recipe.name,
              category: recipe.category,
              imageUrl: recipe.imageUrl,
            },
          });
          continue;
        }
      }

      // Check if we have a stored plan for this date
      const stored = await db.query.weekPlan.findFirst({
        where: eq(weekPlan.date, day.date),
      });

      if (stored) {
        // If day was cleared, show empty
        if (stored.cleared) {
          result.push({
            date: day.date,
            dayName: dayNames[new Date(day.date).getDay()],
            temp: stored.temp ?? day.temp,
            icon: stored.icon ?? day.icon,
            description: stored.description ?? day.description,
            status: 'cleared',
            recipe: null,
          });
          continue;
        }

        const recipe = stored.recipeId ? allRecipes.find(r => r.id === stored.recipeId) : null;
        if (stored.recipeId) usedRecipeIds.push(stored.recipeId);
        result.push({
          date: day.date,
          dayName: dayNames[new Date(day.date).getDay()],
          temp: stored.temp ?? day.temp,
          icon: stored.icon ?? day.icon,
          description: stored.description ?? day.description,
          recipe: recipe ? {
            id: recipe.id,
            name: recipe.name,
            category: recipe.category,
            imageUrl: recipe.imageUrl,
          } : null,
        });
      } else {
        // Generate new suggestion for this day
        const availableRecipes = allRecipes.filter(r => !usedRecipeIds.includes(r.id));

        const scored = availableRecipes.map(recipe => {
          const recipeSeasons = recipe.seasons ? JSON.parse(recipe.seasons as string) : [];
          const recipeWeatherTags = recipe.weatherTags ? JSON.parse(recipe.weatherTags as string) : [];

          let score = 0;
          if (recipeSeasons.includes(currentSeason)) score += 30;
          const matchingTags = recipeWeatherTags.filter((t: string) => day.weatherTags.includes(t as any));
          score += matchingTags.length * 15;
          score += Math.random() * 10;

          return { recipe, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const topRecipe = scored[0]?.recipe;

        if (topRecipe) {
          usedRecipeIds.push(topRecipe.id);

          // Store the plan
          await db.insert(weekPlan).values({
            date: day.date,
            recipeId: topRecipe.id,
            temp: day.temp,
            icon: day.icon,
            description: day.description,
            createdAt: new Date(),
          }).onConflictDoNothing();
        }

        result.push({
          date: day.date,
          dayName: dayNames[new Date(day.date).getDay()],
          temp: day.temp,
          icon: day.icon,
          description: day.description,
          recipe: topRecipe ? {
            id: topRecipe.id,
            name: topRecipe.name,
            category: topRecipe.category,
            imageUrl: topRecipe.imageUrl,
          } : null,
        });
      }
    }

    return c.json(result);
  } catch (e) {
    return c.json({ error: `Week plan error: ${e}` }, 500);
  }
});

// Set specific recipe for a day (manual planning)
app.put('/api/weekplan/:date', async (c) => {
  try {
    const date = c.req.param('date');
    const { recipeId } = await c.req.json();

    if (!recipeId || typeof recipeId !== 'number') {
      return c.json({ error: 'recipeId is required' }, 400);
    }

    const { db } = await import('./db/index');
    const { recipes, weekPlan, suggestions } = await import('./db/schema');
    const { getCurrentWeather } = await import('./services/weather');
    const { eq } = await import('drizzle-orm');

    // Verify recipe exists
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, recipeId),
    });

    if (!recipe) {
      return c.json({ error: 'Recipe not found' }, 404);
    }

    const today = getLocalDateString();
    const isToday = date === today;

    if (isToday) {
      // For today, update suggestions table
      const weather = await getCurrentWeather();

      // Mark previous suggestions as rejected
      await db.update(suggestions)
        .set({ status: 'rejected' })
        .where(eq(suggestions.suggestedFor, date));

      // Create new suggestion with accepted status (manually chosen)
      await db.insert(suggestions).values({
        recipeId: recipe.id,
        suggestedFor: date,
        status: 'accepted',
        reason: JSON.stringify({ manual: true }),
        weatherData: JSON.stringify(weather),
        createdAt: new Date(),
      });
    } else {
      // For other days, update/insert week_plan
      const currentPlan = await db.query.weekPlan.findFirst({
        where: eq(weekPlan.date, date),
      });

      if (currentPlan) {
        await db.update(weekPlan)
          .set({ recipeId: recipe.id, cleared: false })
          .where(eq(weekPlan.date, date));
      } else {
        await db.insert(weekPlan).values({
          date,
          recipeId: recipe.id,
          cleared: false,
          temp: 0,
          icon: '01d',
          description: '',
          createdAt: new Date(),
        });
      }
    }

    return c.json({
      success: true,
      date,
      recipe: {
        id: recipe.id,
        name: recipe.name,
        category: recipe.category,
        imageUrl: recipe.imageUrl,
      },
    });
  } catch (e) {
    return c.json({ error: `Set recipe error: ${e}` }, 500);
  }
});

// Clear recipe for a day (set to empty)
app.delete('/api/weekplan/:date', async (c) => {
  try {
    const date = c.req.param('date');

    const { db } = await import('./db/index');
    const { weekPlan, suggestions } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');

    const today = getLocalDateString();
    const isToday = date === today;

    if (isToday) {
      // For today, mark all suggestions as cleared
      await db.update(suggestions)
        .set({ status: 'cleared' })
        .where(eq(suggestions.suggestedFor, date));
    }

    // Mark day as cleared in week_plan (upsert)
    const existing = await db.query.weekPlan.findFirst({
      where: eq(weekPlan.date, date),
    });

    if (existing) {
      await db.update(weekPlan)
        .set({ cleared: true, recipeId: null })
        .where(eq(weekPlan.date, date));
    } else {
      await db.insert(weekPlan).values({
        date,
        recipeId: null,
        cleared: true,
        createdAt: new Date(),
      });
    }

    return c.json({
      success: true,
      date,
      recipe: null,
    });
  } catch (e) {
    return c.json({ error: `Clear recipe error: ${e}` }, 500);
  }
});

// Regenerate suggestion for a specific day
app.post('/api/weekplan/:date/regenerate', async (c) => {
  try {
    const date = c.req.param('date');
    const { db } = await import('./db/index');
    const { recipes, weekPlan, suggestions } = await import('./db/schema');
    const { getCurrentSeason, getCurrentWeather, getWeatherTags } = await import('./services/weather');
    const { eq, ne } = await import('drizzle-orm');

    const today = getLocalDateString();
    const isToday = date === today;

    // Get all recipes used in the current week (excluding this date)
    const otherPlans = await db.select()
      .from(weekPlan)
      .where(ne(weekPlan.date, date));

    const usedRecipeIds = otherPlans.map(p => p.recipeId);

    // Also exclude today's previous suggestions
    if (isToday) {
      const todaysSuggestions = await db.select()
        .from(suggestions)
        .where(eq(suggestions.suggestedFor, date));
      todaysSuggestions.forEach(s => {
        if (!usedRecipeIds.includes(s.recipeId)) {
          usedRecipeIds.push(s.recipeId);
        }
      });
    }

    const allRecipes = await db.query.recipes.findMany();
    const availableRecipes = allRecipes.filter(r => !usedRecipeIds.includes(r.id));
    const currentSeason = getCurrentSeason();

    // Score and pick new recipe
    const scored = availableRecipes.map(recipe => {
      const recipeSeasons = recipe.seasons ? JSON.parse(recipe.seasons as string) : [];
      let score = 0;
      if (recipeSeasons.includes(currentSeason)) score += 30;
      score += Math.random() * 20;
      return { recipe, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const newRecipe = scored[0]?.recipe;

    if (!newRecipe) {
      return c.json({ error: 'No recipes available' }, 400);
    }

    // If this is today, update the suggestions table (source of truth for today)
    if (isToday) {
      const weather = await getCurrentWeather();
      const weatherTags = getWeatherTags(weather);

      // Mark previous suggestions as rejected
      await db.update(suggestions)
        .set({ status: 'rejected' })
        .where(eq(suggestions.suggestedFor, date));

      // Create new suggestion
      await db.insert(suggestions).values({
        recipeId: newRecipe.id,
        suggestedFor: date,
        status: 'pending',
        reason: JSON.stringify({ seasonScore: 30, weatherScore: 10, recencyScore: 40 }),
        weatherData: JSON.stringify(weather),
        createdAt: new Date(),
      });
    } else {
      // For other days, update the week_plan table
      const currentPlan = await db.query.weekPlan.findFirst({
        where: eq(weekPlan.date, date),
      });

      if (currentPlan) {
        await db.update(weekPlan)
          .set({ recipeId: newRecipe.id })
          .where(eq(weekPlan.date, date));
      } else {
        await db.insert(weekPlan).values({
          date,
          recipeId: newRecipe.id,
          temp: 0,
          icon: '01d',
          description: '',
          createdAt: new Date(),
        });
      }
    }

    return c.json({
      date,
      recipe: {
        id: newRecipe.id,
        name: newRecipe.name,
        category: newRecipe.category,
        imageUrl: newRecipe.imageUrl,
      },
    });
  } catch (e) {
    return c.json({ error: `Regenerate error: ${e}` }, 500);
  }
});

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// Serve generated images from public folder
app.use('/images/*', serveStatic({ root: './public' }));

// Serve static files from web/dist in production
app.use('/*', serveStatic({ root: './web/dist' }));

// Fallback to index.html for SPA routing
app.get('*', serveStatic({ path: './web/dist/index.html' }));

// Run migrations on startup
try {
  const { Database } = await import('bun:sqlite');
  const migDb = new Database('./data/recipes.sqlite');
  // Add cleared column + make recipe_id nullable
  try { migDb.run(`ALTER TABLE week_plan ADD COLUMN cleared INTEGER DEFAULT 0`); } catch {}
  // Check if recipe_id is still NOT NULL — recreate table if needed
  const tableInfo = migDb.prepare(`PRAGMA table_info(week_plan)`).all() as any[];
  const recipeIdCol = tableInfo.find((c: any) => c.name === 'recipe_id');
  if (recipeIdCol && recipeIdCol.notnull === 1) {
    migDb.run(`CREATE TABLE IF NOT EXISTS week_plan_new (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL UNIQUE, recipe_id INTEGER REFERENCES recipes(id) ON DELETE CASCADE, cleared INTEGER DEFAULT 0, temp INTEGER, icon TEXT, description TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()))`);
    migDb.run(`INSERT OR IGNORE INTO week_plan_new SELECT id, date, recipe_id, COALESCE(cleared, 0), temp, icon, description, created_at FROM week_plan`);
    migDb.run(`DROP TABLE week_plan`);
    migDb.run(`ALTER TABLE week_plan_new RENAME TO week_plan`);
    console.log('Migrated week_plan: recipe_id nullable + cleared column');
  }
  migDb.close();
} catch (e) { console.warn('Migration check:', e); }

const port = parseInt(process.env.PORT || '3000');

console.log(`Server running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
