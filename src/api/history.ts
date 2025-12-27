import { Hono } from 'hono';
import { db } from '../db/index';
import { mealHistory, recipes } from '../db/schema';
import { eq, desc } from 'drizzle-orm';

const app = new Hono();

// GET /api/history - Get meal history
app.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');

  const results = await db.select({
    history: mealHistory,
    recipe: recipes,
  })
    .from(mealHistory)
    .innerJoin(recipes, eq(mealHistory.recipeId, recipes.id))
    .orderBy(desc(mealHistory.eatenAt))
    .limit(limit);

  return c.json(results.map(r => ({
    ...r.history,
    recipe: {
      id: r.recipe.id,
      name: r.recipe.name,
      imageUrl: r.recipe.imageUrl,
      category: r.recipe.category,
    },
  })));
});

// POST /api/history - Log a meal
app.post('/', async (c) => {
  const body = await c.req.json();

  const [entry] = await db.insert(mealHistory).values({
    recipeId: body.recipeId,
    eatenAt: body.eatenAt ? new Date(body.eatenAt) : new Date(),
    servings: body.servings || 2,
    notes: body.notes || null,
    rating: body.rating || null,
    createdAt: new Date(),
  }).returning();

  return c.json(entry, 201);
});

// PUT /api/history/:id - Update entry
app.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();

  const [entry] = await db.update(mealHistory)
    .set({
      eatenAt: body.eatenAt ? new Date(body.eatenAt) : undefined,
      servings: body.servings,
      notes: body.notes,
      rating: body.rating,
    })
    .where(eq(mealHistory.id, id))
    .returning();

  return c.json(entry);
});

// DELETE /api/history/:id - Delete entry
app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  await db.delete(mealHistory).where(eq(mealHistory.id, id));
  return c.json({ success: true });
});

// GET /api/history/recipe/:recipeId - History for specific recipe
app.get('/recipe/:recipeId', async (c) => {
  const recipeId = parseInt(c.req.param('recipeId'));

  const results = await db.select()
    .from(mealHistory)
    .where(eq(mealHistory.recipeId, recipeId))
    .orderBy(desc(mealHistory.eatenAt));

  return c.json(results);
});

export default app;
