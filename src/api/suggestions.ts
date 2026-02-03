import { Hono } from 'hono';
import { db } from '../db/index';
import { suggestions, recipes } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { getTodaySuggestion, acceptSuggestion, rejectSuggestion, generateSuggestion } from '../services/suggestion';
import { getCurrentWeather, getWeatherDescription } from '../services/weather';

// Safe JSON parse - returns default if invalid
function safeJsonParse<T>(value: unknown, defaultValue: T): T {
  if (!value) return defaultValue;
  if (typeof value !== 'string') return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    if (Array.isArray(defaultValue) && value.length > 0) {
      return [value] as T;
    }
    return defaultValue;
  }
}

const app = new Hono();

// GET /api/suggestions/today - Get today's suggestion
app.get('/today', async (c) => {
  try {
    const { suggestion, recipe } = await getTodaySuggestion();

    const weather = suggestion.weatherData ? JSON.parse(suggestion.weatherData as string) : null;

    return c.json({
      suggestion: {
        ...suggestion,
        reason: suggestion.reason ? JSON.parse(suggestion.reason as string) : null,
        weatherData: weather,
      },
      recipe: {
        ...recipe,
        ingredients: safeJsonParse(recipe?.ingredients, []),
        instructions: safeJsonParse(recipe?.instructions, []),
        seasons: safeJsonParse(recipe?.seasons, []),
        weatherTags: safeJsonParse(recipe?.weatherTags, []),
      },
      weatherDescription: weather ? getWeatherDescription(weather) : null,
    });
  } catch (e) {
    return c.json({ error: `Failed to get suggestion: ${e}` }, 500);
  }
});

// POST /api/suggestions/generate - Force generate new suggestion
app.post('/generate', async (c) => {
  try {
    const { recipe, score, weather } = await generateSuggestion();

    return c.json({
      recipe: {
        ...recipe,
        ingredients: safeJsonParse(recipe.ingredients, []),
        instructions: safeJsonParse(recipe.instructions, []),
        seasons: safeJsonParse(recipe.seasons, []),
        weatherTags: safeJsonParse(recipe.weatherTags, []),
      },
      score: score.breakdown,
      weather,
      weatherDescription: getWeatherDescription(weather),
    });
  } catch (e) {
    return c.json({ error: `Failed to generate: ${e}` }, 500);
  }
});

// PUT /api/suggestions/:id/accept - Accept suggestion
app.put('/:id/accept', async (c) => {
  const id = parseInt(c.req.param('id'));
  try {
    await acceptSuggestion(id);
    return c.json({ success: true });
  } catch (e) {
    return c.json({ error: `Failed: ${e}` }, 500);
  }
});

// PUT /api/suggestions/:id/reject - Reject and get new suggestion
app.put('/:id/reject', async (c) => {
  const id = parseInt(c.req.param('id'));
  try {
    const { suggestion, recipe } = await rejectSuggestion(id);
    return c.json({
      suggestion: {
        ...suggestion,
        reason: suggestion.reason ? JSON.parse(suggestion.reason as string) : null,
        weatherData: suggestion.weatherData ? JSON.parse(suggestion.weatherData as string) : null,
      },
      recipe: {
        ...recipe,
        ingredients: safeJsonParse(recipe.ingredients, []),
        instructions: safeJsonParse(recipe.instructions, []),
        seasons: safeJsonParse(recipe.seasons, []),
        weatherTags: safeJsonParse(recipe.weatherTags, []),
      },
    });
  } catch (e) {
    return c.json({ error: `Failed: ${e}` }, 500);
  }
});

// GET /api/suggestions/history - Past suggestions
app.get('/history', async (c) => {
  const results = await db.select({
    suggestion: suggestions,
    recipe: recipes,
  })
    .from(suggestions)
    .innerJoin(recipes, eq(suggestions.recipeId, recipes.id))
    .orderBy(desc(suggestions.createdAt))
    .limit(30);

  return c.json(results.map(r => ({
    ...r.suggestion,
    recipe: {
      id: r.recipe.id,
      name: r.recipe.name,
      imageUrl: r.recipe.imageUrl,
      category: r.recipe.category,
    },
  })));
});

// GET /api/weather - Current weather
app.get('/weather', async (c) => {
  try {
    const weather = await getCurrentWeather();
    return c.json({
      ...weather,
      description: getWeatherDescription(weather),
    });
  } catch (e) {
    return c.json({ error: `Weather API error: ${e}` }, 500);
  }
});

export default app;
