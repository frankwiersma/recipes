import { Hono } from 'hono';
import { db } from '../db/index';
import { recipes, weekPlan, suggestions, type Ingredient } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';

const app = new Hono();

// Safe JSON parse
function safeJsonParse<T>(value: unknown, defaultValue: T): T {
  if (!value) return defaultValue;
  if (typeof value !== 'string') return defaultValue;
  try {
    return JSON.parse(value);
  } catch {
    return defaultValue;
  }
}

// Ingredient categories for grouping
const ingredientCategories: Record<string, string[]> = {
  'Groente & Fruit': [
    'ui', 'uien', 'knoflook', 'tomaat', 'tomaten', 'paprika', 'wortel', 'wortels',
    'spinazie', 'sla', 'komkommer', 'courgette', 'aubergine', 'broccoli', 'bloemkool',
    'champignon', 'champignons', 'prei', 'bosui', 'lente-ui', 'gember', 'citroen',
    'limoen', 'avocado', 'pompoen', 'zoete aardappel', 'aardappel', 'aardappelen',
    'paksoi', 'sperziebonen', 'mais', 'erwten', 'kikkererwten', 'bonen', 'linzen',
    'appel', 'banaan', 'mango', 'ananas', 'granaatappel', 'basilicum', 'koriander',
    'peterselie', 'munt', 'bieslook', 'dille', 'rode ui', 'sjalot', 'bleekselderij',
  ],
  'Zuivel & Eieren': [
    'melk', 'room', 'slagroom', 'crème fraîche', 'yoghurt', 'kwark', 'kaas',
    'mozzarella', 'parmezaan', 'geitenkaas', 'feta', 'ricotta', 'mascarpone',
    'boter', 'ei', 'eieren', 'halloumi', 'cottage cheese',
  ],
  'Vlees & Vis': [
    'kip', 'kipfilet', 'kippenbouten', 'gehakt', 'rundergehakt', 'varkensvlees',
    'spek', 'bacon', 'worst', 'chorizo', 'zalm', 'garnalen', 'tonijn', 'kabeljauw',
    'makreel', 'mosselen', 'vis', 'kalkoen', 'eend', 'lam',
  ],
  'Pasta, Rijst & Granen': [
    'pasta', 'spaghetti', 'penne', 'tagliatelle', 'orzo', 'gnocchi', 'noedels',
    'rijst', 'basmatirijst', 'risottorijst', 'couscous', 'bulgur', 'quinoa',
    'brood', 'tortilla', 'wraps', 'naanbrood', 'pitabrood', 'bladerdeeg',
  ],
  'Conserven & Sauzen': [
    'tomatenpuree', 'passata', 'gepelde tomaten', 'tomatenblokjes', 'kokosmelk',
    'sojasaus', 'oestersaus', 'vissaus', 'sriracha', 'sambal', 'ketjap',
    'mayonaise', 'mosterd', 'ketchup', 'pesto', 'olijven', 'kappertjes',
    'zongedroogde tomaten', 'bonen', 'kidneybonen', 'witte bonen', 'linzen',
  ],
  'Kruiden & Specerijen': [
    'zout', 'peper', 'paprikapoeder', 'komijn', 'kurkuma', 'koriander', 'kaneel',
    'nootmuskaat', 'cayennepeper', 'chilipoeder', 'oregano', 'tijm', 'rozemarijn',
    'laurier', 'currypoeder', 'garam masala', 'ras el hanout', 'za\'atar',
    'chilivlokken', 'kruidnagel', 'kardemom', 'foelie', 'venkelzaad',
  ],
  'Noten & Zaden': [
    'cashewnoten', 'pinda\'s', 'amandelen', 'walnoten', 'pijnboompitten',
    'sesamzaad', 'zonnebloempitten', 'pompoenpitten', 'lijnzaad', 'chiazaad',
  ],
  'Olie & Azijn': [
    'olijfolie', 'zonnebloemolie', 'sesamolie', 'kokosolie', 'azijn', 'balsamico',
    'wijnazijn', 'rijstazijn', 'appelazijn',
  ],
  'Overig': [],
};

// Categorize an ingredient
function categorizeIngredient(name: string): string {
  const lowerName = name.toLowerCase();
  
  for (const [category, keywords] of Object.entries(ingredientCategories)) {
    if (category === 'Overig') continue;
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Overig';
}

// Normalize ingredient name for merging
function normalizeIngredientName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    // Remove common descriptors
    .replace(/^(verse?|biologische?|grote?|kleine?|rode?|groene?|gele?|witte?)\s+/i, '')
    .replace(/\s+(vers|biologisch|groot|klein|rood|groen|geel|wit)$/i, '');
}

// Merge similar ingredients
function mergeIngredients(ingredients: Array<Ingredient & { recipeName: string; recipeId: number }>): Array<{
  name: string;
  displayName: string;
  amount: number | null;
  unit: string | null;
  category: string;
  sources: Array<{ recipeName: string; recipeId: number; amount: number | null; unit: string | null }>;
}> {
  const merged = new Map<string, {
    name: string;
    displayName: string;
    amounts: Array<{ amount: number | null; unit: string | null }>;
    category: string;
    sources: Array<{ recipeName: string; recipeId: number; amount: number | null; unit: string | null }>;
  }>();

  for (const ing of ingredients) {
    const normalizedName = normalizeIngredientName(ing.name);
    const key = normalizedName;

    if (merged.has(key)) {
      const existing = merged.get(key)!;
      existing.amounts.push({ amount: ing.amount, unit: ing.unit });
      existing.sources.push({ 
        recipeName: ing.recipeName, 
        recipeId: ing.recipeId,
        amount: ing.amount,
        unit: ing.unit 
      });
    } else {
      merged.set(key, {
        name: normalizedName,
        displayName: ing.name, // Keep original display name
        amounts: [{ amount: ing.amount, unit: ing.unit }],
        category: categorizeIngredient(ing.name),
        sources: [{ 
          recipeName: ing.recipeName, 
          recipeId: ing.recipeId,
          amount: ing.amount,
          unit: ing.unit 
        }],
      });
    }
  }

  // Combine amounts where possible
  return Array.from(merged.values()).map(item => {
    // Try to sum amounts if same unit
    const unitGroups = new Map<string, number>();
    let hasNull = false;

    for (const { amount, unit } of item.amounts) {
      if (amount === null) {
        hasNull = true;
        continue;
      }
      const unitKey = (unit || '').toLowerCase();
      unitGroups.set(unitKey, (unitGroups.get(unitKey) || 0) + amount);
    }

    // If all same unit, combine
    if (unitGroups.size === 1 && !hasNull) {
      const [[unit, total]] = Array.from(unitGroups.entries());
      return {
        name: item.name,
        displayName: item.displayName,
        amount: total,
        unit: unit || null,
        category: item.category,
        sources: item.sources,
      };
    }

    // Otherwise, return first amount
    return {
      name: item.name,
      displayName: item.displayName,
      amount: item.amounts[0].amount,
      unit: item.amounts[0].unit,
      category: item.category,
      sources: item.sources,
    };
  });
}

// GET /api/shopping - Get shopping list for current week
app.get('/', async (c) => {
  try {
    // Get local date
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Get all week plan entries
    const weekPlans = await db.select().from(weekPlan);
    
    // Get today's suggestion
    const todaySuggestion = await db.select()
      .from(suggestions)
      .where(eq(suggestions.suggestedFor, today))
      .orderBy(suggestions.createdAt)
      .limit(1);

    // Collect all recipe IDs
    const recipeIds = new Set<number>();
    const dateToRecipeId = new Map<string, number>();
    
    // Add today's suggestion
    if (todaySuggestion.length > 0) {
      recipeIds.add(todaySuggestion[0].recipeId);
      dateToRecipeId.set(today, todaySuggestion[0].recipeId);
    }

    // Add week plan recipes
    for (const plan of weekPlans) {
      recipeIds.add(plan.recipeId);
      dateToRecipeId.set(plan.date, plan.recipeId);
    }

    if (recipeIds.size === 0) {
      return c.json({
        items: [],
        grouped: {},
        recipes: [],
        generatedAt: new Date().toISOString(),
      });
    }

    // Fetch all recipes
    const recipeList = await db.select()
      .from(recipes)
      .where(inArray(recipes.id, Array.from(recipeIds)));

    // Build recipe map
    const recipeMap = new Map(recipeList.map(r => [r.id, r]));

    // Collect all ingredients with recipe info
    const allIngredients: Array<Ingredient & { recipeName: string; recipeId: number }> = [];
    const recipesInPlan: Array<{ id: number; name: string; date: string; servings: number }> = [];

    // Sort dates and get next 7 days only
    const sortedDates = Array.from(dateToRecipeId.entries())
      .filter(([date]) => date >= today)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 7);

    for (const [date, recipeId] of sortedDates) {
      const recipe = recipeMap.get(recipeId);
      if (!recipe) continue;

      const ingredients = safeJsonParse<Ingredient[]>(recipe.ingredients, []);
      const servings = recipe.defaultServings || 2;

      recipesInPlan.push({
        id: recipe.id,
        name: recipe.name,
        date,
        servings,
      });

      for (const ing of ingredients) {
        allIngredients.push({
          ...ing,
          recipeName: recipe.name,
          recipeId: recipe.id,
        });
      }
    }

    // Merge ingredients
    const mergedIngredients = mergeIngredients(allIngredients);

    // Group by category
    const grouped: Record<string, typeof mergedIngredients> = {};
    const categoryOrder = [
      'Groente & Fruit',
      'Zuivel & Eieren',
      'Vlees & Vis',
      'Pasta, Rijst & Granen',
      'Conserven & Sauzen',
      'Kruiden & Specerijen',
      'Noten & Zaden',
      'Olie & Azijn',
      'Overig',
    ];

    for (const cat of categoryOrder) {
      grouped[cat] = [];
    }

    for (const item of mergedIngredients) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category].push(item);
    }

    // Sort items within each category
    for (const cat of Object.keys(grouped)) {
      grouped[cat].sort((a, b) => a.displayName.localeCompare(b.displayName, 'nl'));
    }

    // Remove empty categories
    for (const cat of Object.keys(grouped)) {
      if (grouped[cat].length === 0) {
        delete grouped[cat];
      }
    }

    return c.json({
      items: mergedIngredients,
      grouped,
      recipes: recipesInPlan,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Shopping list error:', e);
    return c.json({ error: `Shopping list error: ${e}` }, 500);
  }
});

// GET /api/shopping/text - Get shopping list as plain text (for copying)
app.get('/text', async (c) => {
  try {
    const response = await app.request(new Request('http://localhost/api/shopping'));
    const data = await response.json() as any;

    if (data.error) {
      return c.text(`Error: ${data.error}`);
    }

    const lines: string[] = [];
    lines.push('🛒 Boodschappenlijst');
    lines.push('');

    for (const [category, items] of Object.entries(data.grouped as Record<string, any[]>)) {
      lines.push(`## ${category}`);
      for (const item of items) {
        const amount = item.amount ? `${item.amount}${item.unit ? ' ' + item.unit : ''}` : '';
        lines.push(`- ${amount ? amount + ' ' : ''}${item.displayName}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`Recepten: ${data.recipes.map((r: any) => r.name).join(', ')}`);

    return c.text(lines.join('\n'));
  } catch (e) {
    return c.text(`Error: ${e}`);
  }
});

export default app;
