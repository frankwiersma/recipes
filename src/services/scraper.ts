import * as cheerio from 'cheerio';
import type { Ingredient } from '../db/schema';
import { parseIngredientString } from './parser';

// Decode HTML entities like &amp; &quot; &lt; &gt; etc.
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Strip HTML tags and clean up text
export function stripHtml(text: string): string {
  return text
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '') // Remove all remaining HTML tags
    .replace(/\*\*/g, '') // Remove markdown bold
    .replace(/\n{3,}/g, '\n\n') // Collapse multiple newlines
    .trim();
}

// Clean instruction text
function cleanInstruction(text: string): string {
  return stripHtml(decodeHtmlEntities(text)).trim();
}

interface ScrapedRecipe {
  name: string;
  description: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  imageUrl: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  defaultServings: number;
}

// Parse ISO 8601 duration (PT30M, PT1H30M, etc.)
function parseDuration(duration: string | undefined): number | null {
  if (!duration) return null;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return null;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  return hours * 60 + minutes;
}

// Parse JSON-LD Recipe schema
function parseJsonLdRecipe(jsonLd: any): ScrapedRecipe {
  const ingredients: Ingredient[] = (jsonLd.recipeIngredient || []).map((ing: string) =>
    parseIngredientString(ing)
  );

  const instructions: string[] = [];
  if (jsonLd.recipeInstructions) {
    if (Array.isArray(jsonLd.recipeInstructions)) {
      for (const inst of jsonLd.recipeInstructions) {
        if (typeof inst === 'string') {
          instructions.push(inst);
        } else if (inst['@type'] === 'HowToSection' && inst.itemListElement) {
          // Handle HowToSection containing HowToStep items
          for (const step of inst.itemListElement) {
            if (step.text) {
              instructions.push(step.text);
            } else if (step.name) {
              instructions.push(step.name);
            }
          }
        } else if (inst.text) {
          instructions.push(inst.text);
        } else if (inst.name && inst['@type'] !== 'HowToSection') {
          instructions.push(inst.name);
        }
      }
    } else if (typeof jsonLd.recipeInstructions === 'string') {
      instructions.push(jsonLd.recipeInstructions);
    }
  }

  // Get image URL
  let imageUrl: string | null = null;
  if (jsonLd.image) {
    if (typeof jsonLd.image === 'string') {
      imageUrl = jsonLd.image;
    } else if (Array.isArray(jsonLd.image)) {
      imageUrl = jsonLd.image.find((img: any) => typeof img === 'string' && img.length > 0) || jsonLd.image[0];
    } else if (jsonLd.image.url) {
      imageUrl = jsonLd.image.url;
    }
  }

  // Parse servings
  let servings = 2;
  if (jsonLd.recipeYield) {
    const yieldMatch = String(jsonLd.recipeYield).match(/(\d+)/);
    if (yieldMatch) servings = parseInt(yieldMatch[1]);
  }

  // Clean up instructions - strip HTML and split bullet points into separate steps
  const cleanedInstructions: string[] = [];
  for (const inst of instructions.filter(i => i && i.length > 0)) {
    const cleaned = cleanInstruction(inst);
    // Split bullet points into separate steps
    if (cleaned.includes('•')) {
      const bullets = cleaned.split('•').map(s => s.trim()).filter(s => s.length > 5);
      cleanedInstructions.push(...bullets);
    } else if (cleaned.includes('\n')) {
      const lines = cleaned.split('\n').map(s => s.trim()).filter(s => s.length > 5);
      cleanedInstructions.push(...lines);
    } else if (cleaned.length > 5) {
      cleanedInstructions.push(cleaned);
    }
  }

  return {
    name: decodeHtmlEntities(jsonLd.name || 'Onbekend recept'),
    description: jsonLd.description ? decodeHtmlEntities(jsonLd.description) : null,
    ingredients,
    instructions: cleanedInstructions,
    imageUrl,
    prepTimeMinutes: parseDuration(jsonLd.prepTime),
    cookTimeMinutes: parseDuration(jsonLd.cookTime) || parseDuration(jsonLd.totalTime),
    defaultServings: servings,
  };
}

// Picnic ingredient from embedded JSON
interface PicnicIngredient {
  id: string;
  name: string;
  displayIngredientQuantity: number | null;
  displayUnitOfMeasurement: string | null;
  displayTextSuffix?: string | null;
  image?: string;
}

// Picnic step from embedded JSON
interface PicnicStep {
  id: string;
  body: string;
}

// Scrape Picnic recipe from embedded Next.js data
async function scrapePicnicRecipe($: cheerio.CheerioAPI, html: string): Promise<ScrapedRecipe> {
  // Picnic uses Next.js with embedded JSON data in scripts
  const ingredients: Ingredient[] = [];
  const instructions: string[] = [];
  let name = '';
  let description: string | null = null;
  let imageUrl: string | null = null;
  let prepTimeMinutes: number | null = null;

  // Try to find recipe JSON in the HTML (quotes may be escaped)
  const ingredientsMatch = html.match(/\\?"ingredients\\?":\[(\{[^\]]+)\]/);
  const nameMatch = html.match(/\\?"recipe\\?":\{[^}]*\\?"name\\?":\\?"([^"\\]+)\\?"/);
  const descMatch = html.match(/\\?"description\\?":\\?"([^"\\]+)\\?"/);
  const prepTimeMatch = html.match(/\\?"preparationTimeInMinutes\\?":(\d+)/);
  const imageIdMatch = html.match(/\\?"imageId\\?":\\?"([a-f0-9]+)\\?"/);
  const stepsMatch = html.match(/\\?"steps\\?":\[(\{[^\]]+)\]/);

  // Get name from title tag (most reliable for Picnic)
  const titleText = $('title').text();
  if (titleText && titleText.includes('|')) {
    name = decodeHtmlEntities(titleText.split('|')[0].trim());
  } else if (nameMatch) {
    name = decodeHtmlEntities(nameMatch[1].replace(/\\"/g, '"'));
  } else {
    name = decodeHtmlEntities($('h1').first().text().trim());
  }

  if (descMatch) {
    // Remove markdown formatting
    description = decodeHtmlEntities(descMatch[1].replace(/\*\*/g, '').replace(/\\"/g, '"'));
  }

  if (prepTimeMatch) {
    prepTimeMinutes = parseInt(prepTimeMatch[1]);
  }

  if (imageIdMatch) {
    imageUrl = `https://storefront-prod.nl.picnicinternational.com/static/images/recipes/${imageIdMatch[1]}/filled-600x600.webp`;
  }

  // Parse ingredients from JSON
  if (ingredientsMatch) {
    try {
      const ingredientsJson = '[' + ingredientsMatch[1] + ']';
      // Fix escaped quotes for JSON parsing
      const fixedJson = ingredientsJson.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      const ingredientsData: PicnicIngredient[] = JSON.parse(fixedJson);

      for (const ing of ingredientsData) {
        const amount = ing.displayIngredientQuantity;
        const unit = ing.displayUnitOfMeasurement;
        const suffix = ing.displayTextSuffix;

        ingredients.push({
          name: ing.name + (suffix ? ` ${suffix}` : ''),
          amount: amount ?? undefined,
          unit: amount ? (unit || undefined) : undefined, // Only show unit if there's an amount
          scalable: amount != null && amount > 0,
        });
      }
    } catch (e) {
      // JSON parse failed, try fallback
    }
  }

  // Parse steps - look for instruction-like sentences in the HTML
  // Picnic instructions are embedded as text with markdown formatting
  const instructionVerbs = ['Verwarm', 'Snijd', 'Meng', 'Scheur', 'Bak', 'Kook', 'Voeg', 'Rooster',
    'Verdeel', 'Laat', 'Leg', 'Giet', 'Pers', 'Schil', 'Hak', 'Rasp', 'Klop', 'Schenk', 'Breng',
    'Pel', 'Was', 'Dep', 'Bestrooi', 'Garneer', 'Serveer', 'Maak', 'Zet', 'Doe', 'Neem'];

  // Find sentences starting with cooking verbs
  const verbPattern = new RegExp(`(${instructionVerbs.join('|')})[^.!?]+[.!?]`, 'g');
  const stepMatches = html.match(verbPattern);

  if (stepMatches) {
    const seen = new Set<string>();
    for (const step of stepMatches) {
      // Clean up the step text
      let cleaned = step
        .replace(/\*\*/g, '') // Remove markdown bold
        .replace(/<[^>]+>/g, '') // Remove any HTML tags
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

      // Skip duplicates, garbage data, and irrelevant steps
      if (cleaned.length > 20 && cleaned.length < 300 && !seen.has(cleaned) &&
          !cleaned.includes('bezorgen') && !cleaned.includes('Picnic') &&
          !cleaned.includes('Outlines') && !cleaned.includes('ix\":') &&
          !cleaned.includes('{') && !cleaned.includes('}')) {
        seen.add(cleaned);
        instructions.push(decodeHtmlEntities(cleaned));
      }
    }
  }

  // Fallback to page scraping if JSON parsing failed
  if (ingredients.length === 0 || !name) {
    const pageText = $('body').text();
    name = name || decodeHtmlEntities($('h1').first().text().trim());

    // Try to find ingredients in visible text
    const ingredientSection = pageText.match(/Ingrediënten[\s\S]*?(?=Bereiding|Stap\s*1|$)/i);
    if (ingredientSection) {
      const lines = ingredientSection[0].split('\n').filter(l => l.trim().length > 0);
      for (const line of lines.slice(1)) {
        const trimmed = line.trim();
        if (trimmed.length > 2 && trimmed.length < 100 && !trimmed.toLowerCase().includes('bereiding')) {
          ingredients.push(parseIngredientString(trimmed));
        }
      }
    }
  }

  return {
    name: name || 'Picnic recept',
    description,
    ingredients,
    instructions,
    imageUrl,
    prepTimeMinutes,
    cookTimeMinutes: null,
    defaultServings: 2,
  };
}

// Main scraper function
export async function scrapeRecipe(url: string): Promise<ScrapedRecipe> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  // Try to find JSON-LD Recipe schema - first try cheerio parsed scripts
  const jsonLdScripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < jsonLdScripts.length; i++) {
    try {
      const content = $(jsonLdScripts[i]).html();
      if (!content) continue;

      const data = JSON.parse(content);

      // Handle arrays of schema objects
      if (Array.isArray(data)) {
        const recipe = data.find(d => d['@type'] === 'Recipe');
        if (recipe) return parseJsonLdRecipe(recipe);
      }

      // Handle @graph structure
      if (data['@graph']) {
        const recipe = data['@graph'].find((d: any) => d['@type'] === 'Recipe');
        if (recipe) return parseJsonLdRecipe(recipe);
      }

      // Direct Recipe object
      if (data['@type'] === 'Recipe') {
        return parseJsonLdRecipe(data);
      }
    } catch (e) {
      // Invalid JSON, continue to next script
    }
  }

  // Fallback: try to extract JSON-LD from raw HTML (handles malformed cheerio output)
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    try {
      let content = match[1].trim();
      if (!content.includes('Recipe')) continue;

      // Clean up whitespace issues in JSON
      content = content
        .replace(/\r\n/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ');

      const data = JSON.parse(content);

      if (Array.isArray(data)) {
        const recipe = data.find(d => d['@type'] === 'Recipe');
        if (recipe) return parseJsonLdRecipe(recipe);
      }

      if (data['@graph']) {
        const recipe = data['@graph'].find((d: any) => d['@type'] === 'Recipe');
        if (recipe) return parseJsonLdRecipe(recipe);
      }

      if (data['@type'] === 'Recipe') {
        return parseJsonLdRecipe(data);
      }
    } catch (e) {
      // Invalid JSON, continue
    }
  }

  // Fallback: custom scraping for Picnic
  if (url.includes('picnic.app')) {
    return scrapePicnicRecipe($, html);
  }

  // Generic fallback - try to extract basic info from HTML
  const name = decodeHtmlEntities($('h1').first().text().trim() || 'Onbekend recept');
  const imageUrl = $('meta[property="og:image"]').attr('content') ||
                   $('img[src*="recipe"]').first().attr('src') ||
                   null;
  const description = $('meta[property="og:description"]').attr('content') || null;

  return {
    name,
    description: description ? decodeHtmlEntities(description) : null,
    ingredients: [],
    instructions: [],
    imageUrl,
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    defaultServings: 2,
  };
}
