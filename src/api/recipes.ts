import { Hono } from 'hono';
import { db, sqlite } from '../db/index';
import { recipes, tags, recipeTags, mealHistory } from '../db/schema';
import { eq, like, desc, sql } from 'drizzle-orm';
import { scrapeRecipe } from '../services/scraper';
import { isInstagramUrl, scrapeInstagramRecipe, parseInstagramCaption } from '../services/instagram';
import { generateRecipeImage } from '../services/gemini';

const app = new Hono();

// Helper to slugify
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Safe JSON parse - returns default if invalid
// Handles double-encoded JSON (from Drizzle mode:'json' + manual JSON.stringify)
function safeJsonParse<T>(value: unknown, defaultValue: T): T {
  if (!value) return defaultValue;
  if (typeof value !== 'string') {
    // Already parsed (e.g. by Drizzle), check if it needs another round
    if (typeof value === 'string') return safeJsonParse(value, defaultValue);
    return value as T;
  }
  try {
    let parsed = JSON.parse(value);
    // Handle double-encoded JSON: if result is still a string, parse again
    if (typeof parsed === 'string') {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        // Single string value, not double-encoded
      }
    }
    return parsed;
  } catch {
    // If it's a string that looks like instructions, wrap in array
    if (Array.isArray(defaultValue) && value.length > 0) {
      return [value] as T;
    }
    return defaultValue;
  }
}

// GET /api/recipes - List all recipes
app.get('/', async (c) => {
  const category = c.req.query('category');
  const tag = c.req.query('tag');

  let query = db.select().from(recipes);

  if (category) {
    query = query.where(eq(recipes.category, category)) as any;
  }

  const results = await query.orderBy(desc(recipes.updatedAt));

  // Parse JSON fields (with safe parsing for corrupted data)
  const parsed = results.map(r => ({
    ...r,
    ingredients: safeJsonParse(r.ingredients, []),
    instructions: safeJsonParse(r.instructions, []),
    seasons: safeJsonParse(r.seasons, []),
    weatherTags: safeJsonParse(r.weatherTags, []),
  }));

  return c.json(parsed);
});

// GET /api/recipes/search - Fuzzy search
app.get('/search', async (c) => {
  const q = c.req.query('q');
  if (!q || q.length < 2) {
    return c.json([]);
  }

  // Use FTS5 for search
  const searchTerm = q.replace(/[^\w\s]/g, '') + '*';

  try {
    const results = sqlite.query(`
      SELECT r.*
      FROM recipes_fts
      JOIN recipes r ON recipes_fts.rowid = r.id
      WHERE recipes_fts MATCH ?
      ORDER BY bm25(recipes_fts)
      LIMIT 20
    `).all(searchTerm) as any[];

    const parsed = results.map(r => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      category: r.category,
      ingredients: safeJsonParse(r.ingredients, []),
      instructions: safeJsonParse(r.instructions, []),
      defaultServings: r.default_servings,
      imageUrl: r.image_url,
      sourceUrl: r.source_url,
      sourceType: r.source_type,
      seasons: safeJsonParse(r.seasons, []),
      weatherTags: safeJsonParse(r.weather_tags, []),
      prepTimeMinutes: r.prep_time_minutes,
      cookTimeMinutes: r.cook_time_minutes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));

    return c.json(parsed);
  } catch (e) {
    // Fallback to LIKE search
    const results = await db.select().from(recipes)
      .where(like(recipes.name, `%${q}%`))
      .limit(20);

    const parsed = results.map(r => ({
      ...r,
      ingredients: safeJsonParse(r.ingredients, []),
      instructions: safeJsonParse(r.instructions, []),
      seasons: safeJsonParse(r.seasons, []),
      weatherTags: safeJsonParse(r.weatherTags, []),
    }));

    return c.json(parsed);
  }
});

// GET /api/recipes/:id - Get single recipe
app.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const recipe = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
  });

  if (!recipe) {
    return c.json({ error: 'Recipe not found' }, 404);
  }

  // Get tags for this recipe
  const recipeTags_ = await db.select({
    tag: tags,
  })
    .from(recipeTags)
    .innerJoin(tags, eq(recipeTags.tagId, tags.id))
    .where(eq(recipeTags.recipeId, id));

  // Get last eaten date
  const lastEaten = await db.query.mealHistory.findFirst({
    where: eq(mealHistory.recipeId, id),
    orderBy: desc(mealHistory.eatenAt),
  });

  return c.json({
    ...recipe,
    ingredients: safeJsonParse(recipe.ingredients, []),
    instructions: safeJsonParse(recipe.instructions, []),
    seasons: safeJsonParse(recipe.seasons, []),
    weatherTags: safeJsonParse(recipe.weatherTags, []),
    tags: recipeTags_.map(rt => rt.tag),
    lastEaten: lastEaten?.eatenAt || null,
  });
});

// POST /api/recipes - Create recipe
app.post('/', async (c) => {
  const body = await c.req.json();

  const slug = slugify(body.name);

  const [recipe] = await db.insert(recipes).values({
    name: body.name,
    slug,
    description: body.description || null,
    category: body.category || 'pasta',
    ingredients: JSON.stringify(body.ingredients || []),
    instructions: body.instructions ? JSON.stringify(body.instructions) : null,
    defaultServings: body.defaultServings || 2,
    imageUrl: body.imageUrl || null,
    sourceUrl: body.sourceUrl || null,
    sourceType: body.sourceType || 'manual',
    seasons: JSON.stringify(body.seasons || []),
    weatherTags: JSON.stringify(body.weatherTags || []),
    prepTimeMinutes: body.prepTimeMinutes || null,
    cookTimeMinutes: body.cookTimeMinutes || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning();

  return c.json(recipe, 201);
});

// PUT /api/recipes/:id - Update recipe
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const [recipe] = await db.update(recipes)
    .set({
      name: body.name,
      description: body.description,
      category: body.category,
      ingredients: JSON.stringify(body.ingredients || []),
      instructions: body.instructions ? JSON.stringify(body.instructions) : null,
      defaultServings: body.defaultServings,
      imageUrl: body.imageUrl,
      seasons: JSON.stringify(body.seasons || []),
      weatherTags: JSON.stringify(body.weatherTags || []),
      prepTimeMinutes: body.prepTimeMinutes,
      cookTimeMinutes: body.cookTimeMinutes,
      updatedAt: new Date(),
    })
    .where(eq(recipes.id, id))
    .returning();

  return c.json(recipe);
});

// DELETE /api/recipes/:id - Delete recipe
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await db.delete(recipes).where(eq(recipes.id, id));
  return c.json({ success: true });
});

// Extract URL from shared text (e.g. Picnic share: "Ik kwam een lekker recept... https://picnic.app/nl/go/xxx")
function extractUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed) && !trimmed.includes(' ')) return trimmed;
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : trimmed;
}

// POST /api/recipes/import/url - Import from URL
app.post('/import/url', async (c) => {
  const body = await c.req.json();
  const url = body.url ? extractUrl(body.url) : '';
  const category = body.category;

  if (!url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  try {
    // Default seasons/weather based on category
    const categoryDefaults: Record<string, { seasons: string[], weatherTags: string[] }> = {
      'curry': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
      'soep': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
      'salade': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
      'pokebowl': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
      'pasta': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
      'wraps': { seasons: ['lente', 'zomer'], weatherTags: ['warm'] },
      'plaattaart': { seasons: ['herfst', 'winter'], weatherTags: ['koud'] },
      'shakshuka': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
    };

    let name: string;
    let description: string | null;
    let ingredients: any[];
    let instructions: string[] | null;
    let defaultServings: number;
    let imageUrl: string | null;
    let sourceType: string;
    let prepTimeMinutes: number | null;
    let cookTimeMinutes: number | null;
    let detectedCategory: string | null = null;

    // Check if this is an Instagram URL
    if (isInstagramUrl(url)) {
      const { recipe: instagramRecipe, post } = await scrapeInstagramRecipe(url);

      name = instagramRecipe.name;
      description = instagramRecipe.description;
      ingredients = instagramRecipe.ingredients;
      instructions = instagramRecipe.instructions;
      defaultServings = instagramRecipe.servings;
      imageUrl = post.displayUrl;
      sourceType = 'instagram';
      prepTimeMinutes = instagramRecipe.prepTimeMinutes;
      cookTimeMinutes = instagramRecipe.cookTimeMinutes;
      detectedCategory = instagramRecipe.category;
    } else {
      // Existing web scraper logic
      const scraped = await scrapeRecipe(url);

      name = scraped.name;
      description = scraped.description;
      ingredients = scraped.ingredients;
      instructions = scraped.instructions;
      defaultServings = scraped.defaultServings;
      imageUrl = scraped.imageUrl;
      sourceType = url.includes('picnic') ? 'picnic' : 'other';
      prepTimeMinutes = scraped.prepTimeMinutes;
      cookTimeMinutes = scraped.cookTimeMinutes;
    }

    const slug = slugify(name);

    // Priority: user selection > Gemini detection > 'pasta' fallback
    const finalCategory = category || detectedCategory || 'pasta';
    const defaults = categoryDefaults[finalCategory] || { seasons: [], weatherTags: [] };

    const [recipe] = await db.insert(recipes).values({
      name,
      slug,
      description,
      category: finalCategory,
      ingredients: JSON.stringify(ingredients),
      instructions: instructions ? JSON.stringify(instructions) : null,
      defaultServings,
      imageUrl,
      sourceUrl: url,
      sourceType,
      seasons: JSON.stringify(defaults.seasons),
      weatherTags: JSON.stringify(defaults.weatherTags),
      prepTimeMinutes,
      cookTimeMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: recipes.slug,
      set: {
        description,
        category: finalCategory,
        ingredients: JSON.stringify(ingredients),
        instructions: instructions ? JSON.stringify(instructions) : null,
        defaultServings,
        imageUrl,
        sourceUrl: url,
        prepTimeMinutes,
        cookTimeMinutes,
        updatedAt: new Date(),
      },
    }).returning();

    const isUpdate = recipe.createdAt?.getTime() !== recipe.updatedAt?.getTime();
    return c.json(recipe, isUpdate ? 200 : 201);
  } catch (e) {
    return c.json({ error: `Failed to scrape: ${e}` }, 500);
  }
});

// POST /api/recipes/import/instagram - Import from Instagram caption text
app.post('/import/instagram', async (c) => {
  const { caption, url, category } = await c.req.json();

  if (!caption) {
    return c.json({ error: 'Caption text is required' }, 400);
  }

  try {
    const { recipe: instagramRecipe, post } = await parseInstagramCaption(caption, url);

    // Default seasons/weather based on category
    const categoryDefaults: Record<string, { seasons: string[], weatherTags: string[] }> = {
      'curry': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
      'soep': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
      'salade': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
      'pokebowl': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
      'pasta': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
      'wraps': { seasons: ['lente', 'zomer'], weatherTags: ['warm'] },
      'plaattaart': { seasons: ['herfst', 'winter'], weatherTags: ['koud'] },
      'shakshuka': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
    };

    const slug = slugify(instagramRecipe.name);

    // Priority: user selection > Gemini detection > 'pasta' fallback
    const finalCategory = category || instagramRecipe.category || 'pasta';
    const defaults = categoryDefaults[finalCategory] || { seasons: [], weatherTags: [] };

    // Generate recipe image using Gemini (nano banana)
    const ingredientNames = instagramRecipe.ingredients.map(i => i.name);
    const generatedImageUrl = await generateRecipeImage(instagramRecipe.name, ingredientNames);

    const [recipe] = await db.insert(recipes).values({
      name: instagramRecipe.name,
      slug,
      description: instagramRecipe.description,
      category: finalCategory,
      ingredients: JSON.stringify(instagramRecipe.ingredients),
      instructions: instagramRecipe.instructions ? JSON.stringify(instagramRecipe.instructions) : null,
      defaultServings: instagramRecipe.servings,
      imageUrl: generatedImageUrl || post.displayUrl || null,
      sourceUrl: url || null,
      sourceType: 'instagram',
      seasons: JSON.stringify(defaults.seasons),
      weatherTags: JSON.stringify(defaults.weatherTags),
      prepTimeMinutes: instagramRecipe.prepTimeMinutes,
      cookTimeMinutes: instagramRecipe.cookTimeMinutes,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: recipes.slug,
      set: {
        description: instagramRecipe.description,
        category: finalCategory,
        ingredients: JSON.stringify(instagramRecipe.ingredients),
        instructions: instagramRecipe.instructions ? JSON.stringify(instagramRecipe.instructions) : null,
        defaultServings: instagramRecipe.servings,
        imageUrl: generatedImageUrl || post.displayUrl || null,
        prepTimeMinutes: instagramRecipe.prepTimeMinutes,
        cookTimeMinutes: instagramRecipe.cookTimeMinutes,
        updatedAt: new Date(),
      },
    }).returning();

    const isUpdate = recipe.createdAt?.getTime() !== recipe.updatedAt?.getTime();
    return c.json(recipe, isUpdate ? 200 : 201);
  } catch (e) {
    return c.json({ error: `Failed to parse Instagram recipe: ${e}` }, 500);
  }
});

// POST /api/recipes/:id/rescrape - Re-scrape an existing recipe from its source URL
app.post('/:id/rescrape', async (c) => {
  const id = parseInt(c.req.param('id'));

  const existing = await db.query.recipes.findFirst({
    where: eq(recipes.id, id),
  });

  if (!existing) {
    return c.json({ error: 'Recipe not found' }, 404);
  }

  if (!existing.sourceUrl) {
    return c.json({ error: 'Recipe has no source URL to scrape' }, 400);
  }

  try {
    const scraped = await scrapeRecipe(existing.sourceUrl);

    const [recipe] = await db.update(recipes)
      .set({
        name: scraped.name,
        description: scraped.description || existing.description,
        ingredients: JSON.stringify(scraped.ingredients),
        instructions: scraped.instructions?.length ? JSON.stringify(scraped.instructions) : existing.instructions,
        defaultServings: scraped.defaultServings,
        imageUrl: scraped.imageUrl || existing.imageUrl,
        prepTimeMinutes: scraped.prepTimeMinutes || existing.prepTimeMinutes,
        cookTimeMinutes: scraped.cookTimeMinutes || existing.cookTimeMinutes,
        updatedAt: new Date(),
      })
      .where(eq(recipes.id, id))
      .returning();

    return c.json({
      ...recipe,
      ingredients: safeJsonParse(recipe.ingredients, []),
      instructions: safeJsonParse(recipe.instructions, []),
      seasons: safeJsonParse(recipe.seasons, []),
      weatherTags: safeJsonParse(recipe.weatherTags, []),
    });
  } catch (e) {
    return c.json({ error: `Failed to scrape: ${e}` }, 500);
  }
});

export default app;
