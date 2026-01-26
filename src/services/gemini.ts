import type { Ingredient, Category, categories } from '../db/schema';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
// Nano Banana Pro - Gemini 3 Pro Image generation
const NANO_BANANA_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

export interface ParsedInstagramRecipe {
  name: string;
  description: string | null;
  ingredients: Ingredient[];
  instructions: string[];
  servings: number;
  category: Category | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
}

const RECIPE_PARSE_PROMPT = `Je bent een expert in het extraheren van receptinformatie uit Nederlandse Instagram posts.

Analyseer de volgende Instagram post caption en extraheer de receptinformatie in JSON formaat.

BELANGRIJK:
- Alle tekst is in het Nederlands
- Hoeveelheden kunnen geschreven zijn als "2 el" (eetlepels), "tl" (theelepels), "g" (gram), "ml" (milliliter), "stuks", "teen" (teentje knoflook), etc.
- Instructies beginnen vaak met * of - of staan op nieuwe regels
- Als het aantal personen niet vermeld wordt, gebruik 2 als standaard
- Categorieën zijn: curry, soep, pokebowl, salade, plaattaart, pasta, wraps, shakshuka
- Detecteer de categorie automatisch op basis van de ingrediënten en beschrijving
- Als geen categorie past, gebruik null

Geef je antwoord ALLEEN als valid JSON in dit exacte formaat (geen extra tekst):
{
  "name": "Naam van het recept",
  "description": "Korte beschrijving of null",
  "servings": 2,
  "category": "pasta",
  "prepTimeMinutes": 15,
  "cookTimeMinutes": 20,
  "ingredients": [
    {"name": "ingredientnaam", "amount": 2, "unit": "el", "scalable": true},
    {"name": "zout naar smaak", "amount": null, "unit": null, "scalable": false}
  ],
  "instructions": [
    "Eerste stap",
    "Tweede stap"
  ]
}

Instagram post caption:
`;

export async function parseRecipeWithGemini(caption: string): Promise<ParsedInstagramRecipe> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: RECIPE_PARSE_PROMPT + caption
        }]
      }],
      generationConfig: {
        temperature: 0.1,
        topP: 0.8,
        maxOutputTokens: 4096,
      }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  // Extract text from Gemini response
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) {
    throw new Error('Empty response from Gemini');
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = responseText.trim();
  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateAndNormalizeRecipe(parsed);
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${e}\nResponse was: ${jsonStr.substring(0, 500)}`);
  }
}

const validCategories: readonly string[] = ['curry', 'soep', 'pokebowl', 'salade', 'plaattaart', 'pasta', 'wraps', 'shakshuka'];

function validateAndNormalizeRecipe(data: any): ParsedInstagramRecipe {
  // Ensure required fields exist
  if (!data.name || typeof data.name !== 'string') {
    throw new Error('Recipe must have a name');
  }

  // Normalize ingredients
  const ingredients: Ingredient[] = (data.ingredients || []).map((ing: any) => ({
    name: String(ing.name || '').trim(),
    amount: typeof ing.amount === 'number' ? ing.amount : null,
    unit: ing.unit ? String(ing.unit).trim() : null,
    scalable: Boolean(ing.scalable ?? (ing.amount != null)),
  })).filter((ing: Ingredient) => ing.name.length > 0);

  // Normalize instructions - remove * and - prefixes, clean up whitespace
  const instructions: string[] = (data.instructions || [])
    .map((inst: any) => String(inst).trim().replace(/^[\*\-]\s*/, ''))
    .filter((inst: string) => inst.length > 0);

  // Validate category
  const category = validCategories.includes(data.category) ? data.category as Category : null;

  return {
    name: data.name.trim(),
    description: data.description ? String(data.description).trim() : null,
    ingredients,
    instructions,
    servings: typeof data.servings === 'number' && data.servings > 0 ? data.servings : 2,
    category,
    prepTimeMinutes: typeof data.prepTimeMinutes === 'number' && data.prepTimeMinutes > 0 ? data.prepTimeMinutes : null,
    cookTimeMinutes: typeof data.cookTimeMinutes === 'number' && data.cookTimeMinutes > 0 ? data.cookTimeMinutes : null,
  };
}

/**
 * Generate a recipe image using Gemini Nano Banana (native image generation)
 * Returns the URL path to the saved image
 */
export async function generateRecipeImage(recipeName: string, ingredients: string[]): Promise<string | null> {
  if (!GEMINI_API_KEY) {
    console.warn('GEMINI_API_KEY not configured, skipping image generation');
    return null;
  }

  try {
    // Create a prompt for appetizing food photography
    const mainIngredients = ingredients.slice(0, 5).join(', ');
    const prompt = `Generate an image: Professional food photography of "${recipeName}". A beautifully plated dish with ${mainIngredients}. Appetizing, warm lighting, shallow depth of field, top-down or 45-degree angle, restaurant quality presentation on a ceramic plate.`;

    const response = await fetch(`${NANO_BANANA_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Nano Banana generation error:', response.status, error);
      return null;
    }

    const data = await response.json();

    // Find the image part in the response
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith('image/'));

    if (!imagePart?.inlineData?.data) {
      console.warn('No image in Nano Banana response:', JSON.stringify(data).substring(0, 500));
      return null;
    }

    // Save the image to the public folder
    const imagesDir = path.join(process.cwd(), 'public', 'images', 'generated');
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true });
    }

    // Create a filename from the recipe name
    const slug = recipeName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const filename = `${slug}-${Date.now()}.png`;
    const filepath = path.join(imagesDir, filename);

    // Decode base64 and save
    const imageBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    await writeFile(filepath, imageBuffer);

    console.log('Generated recipe image:', filename);

    // Return the full URL (backend serves the images)
    const backendUrl = process.env.APP_URL || 'http://localhost:3000';
    return `${backendUrl}/images/generated/${filename}`;
  } catch (error) {
    console.error('Failed to generate recipe image:', error);
    return null;
  }
}
