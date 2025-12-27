import { Hono } from 'hono';
import { db } from '../db/index';
import { tags, recipeTags } from '../db/schema';
import { eq } from 'drizzle-orm';

const app = new Hono();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// GET /api/tags - Get all tags
app.get('/', async (c) => {
  const allTags = await db.query.tags.findMany();

  // Group by type
  const grouped = allTags.reduce((acc, tag) => {
    if (!acc[tag.type]) acc[tag.type] = [];
    acc[tag.type].push(tag);
    return acc;
  }, {} as Record<string, typeof allTags>);

  return c.json(grouped);
});

// GET /api/tags/:type - Get tags by type
app.get('/:type', async (c) => {
  const type = c.req.param('type');
  const typeTags = await db.select()
    .from(tags)
    .where(eq(tags.type, type));

  return c.json(typeTags);
});

// POST /api/tags - Create tag
app.post('/', async (c) => {
  const body = await c.req.json();

  const [tag] = await db.insert(tags).values({
    name: body.name,
    slug: slugify(body.name),
    type: body.type || 'custom',
  }).returning();

  return c.json(tag, 201);
});

// POST /api/recipes/:recipeId/tags - Add tags to recipe
app.post('/recipe/:recipeId', async (c) => {
  const recipeId = parseInt(c.req.param('recipeId'));
  const { tagIds } = await c.req.json();

  for (const tagId of tagIds) {
    await db.insert(recipeTags).values({
      recipeId,
      tagId,
    }).onConflictDoNothing();
  }

  return c.json({ success: true });
});

// DELETE /api/recipes/:recipeId/tags/:tagId - Remove tag from recipe
app.delete('/recipe/:recipeId/:tagId', async (c) => {
  const recipeId = parseInt(c.req.param('recipeId'));
  const tagId = parseInt(c.req.param('tagId'));

  await db.delete(recipeTags)
    .where(eq(recipeTags.recipeId, recipeId))
    .where(eq(recipeTags.tagId, tagId));

  return c.json({ success: true });
});

export default app;
