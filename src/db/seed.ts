import { db } from './index';
import { recipes, tags, recipeTags } from './schema';
import { parseMarkdownRecipes } from '../services/parser';
import { scrapeRecipe } from '../services/scraper';
import { readFileSync } from 'fs';
import { eq } from 'drizzle-orm';

// Default tags to create
const defaultTags = {
  diet: ['vegetarisch', 'veganistisch', 'met-vis', 'met-vlees'],
  difficulty: ['makkelijk', 'gemiddeld'],
  cuisine: ['aziatisch', 'italiaans', 'hollands', 'indiaas', 'mediterraans', 'mexicaans'],
  mood: ['comfortfood', 'gezond', 'doordeweeks', 'snel-klaar'],
  meal_type: ['lunch', 'diner'],
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function seedTags() {
  console.log('Seeding tags...');
  for (const [type, tagNames] of Object.entries(defaultTags)) {
    for (const name of tagNames) {
      const slug = slugify(name);
      try {
        await db.insert(tags).values({ name, slug, type }).onConflictDoNothing();
      } catch (e) {
        // Tag already exists
      }
    }
  }
  console.log('Tags seeded.');
}

async function seedRecipes() {
  console.log('Reading raw-note.md...');
  const markdown = readFileSync('./raw-note.md', 'utf-8');
  const parsedRecipes = parseMarkdownRecipes(markdown);

  console.log(`Found ${parsedRecipes.length} recipes in markdown.`);

  for (const recipe of parsedRecipes) {
    console.log(`Processing: ${recipe.name}`);

    // Check if recipe already exists
    const existing = await db.query.recipes.findFirst({
      where: eq(recipes.slug, recipe.slug),
    });

    if (existing) {
      console.log(`  Skipping (already exists)`);
      continue;
    }

    // Try to scrape additional data if URL exists
    let scrapedData = null;
    if (recipe.sourceUrl) {
      try {
        console.log(`  Scraping ${recipe.sourceUrl}...`);
        scrapedData = await scrapeRecipe(recipe.sourceUrl);
        console.log(`  Got ${scrapedData.ingredients.length} ingredients, ${scrapedData.instructions.length} instructions`);
      } catch (e) {
        console.log(`  Failed to scrape: ${e}`);
      }
    }

    // Insert recipe
    const [inserted] = await db.insert(recipes).values({
      name: scrapedData?.name || recipe.name,
      slug: recipe.slug,
      description: scrapedData?.description || null,
      category: recipe.category,
      ingredients: JSON.stringify(scrapedData?.ingredients || recipe.ingredients),
      instructions: scrapedData?.instructions ? JSON.stringify(scrapedData.instructions) : null,
      defaultServings: scrapedData?.defaultServings || 2,
      imageUrl: scrapedData?.imageUrl || null,
      sourceUrl: recipe.sourceUrl,
      sourceType: recipe.sourceType,
      seasons: JSON.stringify(recipe.seasons),
      weatherTags: JSON.stringify(recipe.weatherTags),
      prepTimeMinutes: scrapedData?.prepTimeMinutes || null,
      cookTimeMinutes: scrapedData?.cookTimeMinutes || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    console.log(`  Inserted with ID ${inserted.id}`);

    // Auto-tag based on category
    const categoryTagMap: Record<string, string[]> = {
      'curry': ['aziatisch', 'doordeweeks'],
      'soep': ['comfortfood', 'doordeweeks'],
      'salade': ['gezond', 'makkelijk'],
      'pokebowl': ['aziatisch', 'gezond'],
      'pasta': ['italiaans', 'doordeweeks'],
      'wraps': ['makkelijk', 'snel-klaar'],
      'shakshuka': ['vegetarisch', 'doordeweeks'],
      'plaattaart': ['doordeweeks'],
    };

    const autoTags = categoryTagMap[recipe.category] || [];

    // Check ingredients for vegetarian detection
    const ingredientText = JSON.stringify(scrapedData?.ingredients || []).toLowerCase();
    const hasMeat = ['kip', 'rund', 'varken', 'ham', 'spek', 'bacon', 'gehakt'].some(m => ingredientText.includes(m));
    const hasFish = ['zalm', 'vis', 'garnaal', 'tonijn', 'kabeljauw'].some(f => ingredientText.includes(f));

    if (!hasMeat && !hasFish) {
      autoTags.push('vegetarisch');
    } else if (hasFish && !hasMeat) {
      autoTags.push('met-vis');
    } else if (hasMeat) {
      autoTags.push('met-vlees');
    }

    // Add prep time tag
    if (scrapedData?.prepTimeMinutes && scrapedData.prepTimeMinutes <= 20) {
      autoTags.push('snel-klaar');
    }

    // Insert recipe tags
    for (const tagName of [...new Set(autoTags)]) {
      const tag = await db.query.tags.findFirst({
        where: eq(tags.slug, slugify(tagName)),
      });
      if (tag) {
        try {
          await db.insert(recipeTags).values({
            recipeId: inserted.id,
            tagId: tag.id,
          }).onConflictDoNothing();
        } catch (e) {
          // Already tagged
        }
      }
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('Done seeding recipes!');
}

async function main() {
  await seedTags();
  await seedRecipes();
}

main().catch(console.error);
