import type { Ingredient, Season, WeatherTag, Category } from '../db/schema';

interface ParsedRecipe {
  name: string;
  slug: string;
  category: Category;
  sourceUrl: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  seasons: Season[];
  weatherTags: WeatherTag[];
  sourceType: string;
}

// Category to season/weather mapping
const categoryDefaults: Record<string, { seasons: Season[], weatherTags: WeatherTag[] }> = {
  'curry': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
  'soep': { seasons: ['herfst', 'winter'], weatherTags: ['koud', 'regenachtig'] },
  'salade': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
  'pokebowl': { seasons: ['lente', 'zomer'], weatherTags: ['warm', 'zonnig'] },
  'pasta': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
  'wraps': { seasons: ['lente', 'zomer'], weatherTags: ['warm'] },
  'plaattaart': { seasons: ['herfst', 'winter'], weatherTags: ['koud'] },
  'shakshuka': { seasons: ['lente', 'zomer', 'herfst', 'winter'], weatherTags: [] },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function detectCategory(name: string, currentCategory: string | null): Category {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('curry') || nameLower.includes('wok')) return 'curry';
  if (nameLower.includes('soep')) return 'soep';
  if (nameLower.includes('pokebowl') || nameLower.includes('sushibowl') || nameLower.includes('bowl')) return 'pokebowl';
  if (nameLower.includes('salade')) return 'salade';
  if (nameLower.includes('plaattaart')) return 'plaattaart';
  if (nameLower.includes('pasta') || nameLower.includes('spaghetti') || nameLower.includes('penne') ||
      nameLower.includes('tagliatelle') || nameLower.includes('gnocchi') || nameLower.includes('orzo')) return 'pasta';
  if (nameLower.includes('wrap')) return 'wraps';
  if (nameLower.includes('shakshuka')) return 'shakshuka';

  // Use current category from section header
  if (currentCategory) {
    const catLower = currentCategory.toLowerCase();
    if (catLower.includes('curry') || catLower.includes('aziatisch')) return 'curry';
    if (catLower.includes('soep')) return 'soep';
    if (catLower.includes('pokebowl') || catLower.includes('bowl')) return 'pokebowl';
    if (catLower.includes('salade')) return 'salade';
    if (catLower.includes('plaattaart')) return 'plaattaart';
    if (catLower.includes('pasta')) return 'pasta';
    if (catLower.includes('wrap')) return 'wraps';
    if (catLower.includes('shakshuka')) return 'shakshuka';
  }

  return 'pasta'; // default
}

export function parseMarkdownRecipes(markdown: string): ParsedRecipe[] {
  const recipes: ParsedRecipe[] = [];
  const lines = markdown.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let currentCategory: string | null = null;
  let i = 0;

  // Skip the first line if it's a header like "Raw notebook of my wife Hillene"
  if (lines[0]?.toLowerCase().includes('notebook') || lines[0]?.toLowerCase().includes('raw')) {
    i = 1;
  }

  while (i < lines.length) {
    const line = lines[i];

    // Check if this is a category header (line without URL, followed by recipes)
    const nextLine = lines[i + 1];
    const isUrlLine = (l: string) => l.startsWith('http') || l.includes('(http');
    const hasUrlInLine = (l: string) => /\(https?:\/\/[^)]+\)/.test(l) || l.startsWith('http');

    // Category headers don't have URLs and aren't recipe names with URLs
    if (!hasUrlInLine(line) && !isUrlLine(line) &&
        (nextLine && (hasUrlInLine(nextLine) || isUrlLine(nextLine) || !isUrlLine(nextLine)))) {
      // This might be a category header
      const potentialCategory = line.replace(/[#*]/g, '').trim();
      if (potentialCategory.length > 0 && potentialCategory.length < 50) {
        // Check if next line is a recipe (has URL or is followed by URL)
        if (nextLine && (hasUrlInLine(nextLine) || isUrlLine(lines[i + 2] || ''))) {
          currentCategory = potentialCategory;
          i++;
          continue;
        }
      }
    }

    // Parse recipe: either "Name (URL)" format or "Name" followed by "URL" on next line
    let name: string | null = null;
    let url: string | null = null;

    // Format 1: "Recipe Name (https://...)"
    const inlineMatch = line.match(/^(.+?)\s*\(?(https?:\/\/[^)\s]+)\)?$/);
    if (inlineMatch) {
      name = inlineMatch[1].trim();
      url = inlineMatch[2];
      i++;
    }
    // Format 2: "Recipe Name" on one line, "https://..." on next line
    else if (!line.startsWith('http') && nextLine?.startsWith('http')) {
      name = line;
      url = nextLine;
      i += 2;
    }
    // Format 3: Just a URL (use URL to derive name)
    else if (line.startsWith('http')) {
      url = line;
      // Try to extract name from URL
      const urlMatch = url.match(/\/([^/]+)(?:\/)?$/);
      name = urlMatch ? urlMatch[1].replace(/-/g, ' ') : 'Onbekend recept';
      i++;
    }
    else {
      // Skip lines that aren't recipes
      i++;
      continue;
    }

    if (name) {
      // Clean up name
      name = name.replace(/[#*]/g, '').trim();
      if (name.length === 0) continue;

      const category = detectCategory(name, currentCategory);
      const defaults = categoryDefaults[category] || { seasons: [], weatherTags: [] };

      recipes.push({
        name,
        slug: slugify(name),
        category,
        sourceUrl: url,
        ingredients: [], // Will be filled by scraper
        instructions: [], // Will be filled by scraper
        seasons: defaults.seasons,
        weatherTags: defaults.weatherTags,
        sourceType: 'markdown',
      });
    }
  }

  return recipes;
}

// Parse ingredient string like "2 uien" or "750 g spinazie"
export function parseIngredientString(text: string): Ingredient {
  const patterns = [
    // "2 el olijfolie", "750 g spinazie", "200 ml kokosmelk"
    /^(\d+(?:[,.]\d+)?)\s*(gram|g|ml|l|el|tl|stuks?|teen|tenen|bosje|blikje|blikjes|stuk)\s+(.+)$/i,
    // "2 uien" (number + name)
    /^(\d+(?:[,.]\d+)?)\s+(.+)$/,
    // "naar smaak peper" or just ingredient name
    /^(.+)$/
  ];

  for (const pattern of patterns) {
    const match = text.trim().match(pattern);
    if (match) {
      if (match.length === 4) {
        // Full format: amount + unit + name
        return {
          amount: parseFloat(match[1].replace(',', '.')),
          unit: match[2].toLowerCase(),
          name: match[3].trim(),
          scalable: true,
        };
      } else if (match.length === 3 && /^\d/.test(match[1])) {
        // Number + name without unit
        return {
          amount: parseFloat(match[1].replace(',', '.')),
          unit: 'stuk',
          name: match[2].trim(),
          scalable: true,
        };
      } else {
        // Just name (naar smaak, etc.)
        return {
          amount: null,
          unit: null,
          name: match[1].trim(),
          scalable: false,
        };
      }
    }
  }

  return {
    amount: null,
    unit: null,
    name: text.trim(),
    scalable: false,
  };
}
