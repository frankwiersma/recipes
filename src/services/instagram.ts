import { parseRecipeWithGemini, type ParsedInstagramRecipe } from './gemini';

export interface InstagramPost {
  shortcode: string;
  caption: string;
  username: string;
  displayUrl: string;
  timestamp: number;
}

/**
 * Extract shortcode from Instagram URL
 * Supports formats:
 * - https://www.instagram.com/p/ABC123/
 * - https://www.instagram.com/reel/ABC123/
 * - https://instagram.com/p/ABC123
 * - https://instagr.am/p/ABC123
 */
export function extractInstagramShortcode(url: string): string | null {
  const patterns = [
    /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/,
    /instagr\.am\/p\/([A-Za-z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  return null;
}

/**
 * Check if URL is an Instagram post/reel URL
 */
export function isInstagramUrl(url: string): boolean {
  return /instagram\.com\/(p|reel)\//.test(url) || /instagr\.am\/p\//.test(url);
}

/**
 * Parse recipe from Instagram caption text (manual input)
 * Use this when the caption is provided directly by the user
 */
export async function parseInstagramCaption(caption: string, url?: string): Promise<{
  recipe: ParsedInstagramRecipe;
  post: InstagramPost;
}> {
  const shortcode = url ? extractInstagramShortcode(url) : 'manual';

  // Parse the caption with Gemini
  const recipe = await parseRecipeWithGemini(caption);

  const post: InstagramPost = {
    shortcode: shortcode || 'manual',
    caption,
    username: 'unknown',
    displayUrl: '', // No image when manually pasted
    timestamp: Math.floor(Date.now() / 1000),
  };

  return { recipe, post };
}

/**
 * Scrape recipe from Instagram URL
 * Note: Instagram blocks most programmatic access. This will throw an error
 * asking the user to paste the caption manually.
 */
export async function scrapeInstagramRecipe(url: string): Promise<{
  recipe: ParsedInstagramRecipe;
  post: InstagramPost;
}> {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) {
    throw new Error('Invalid Instagram URL - could not extract post shortcode');
  }

  // Instagram blocks programmatic API access - inform the user
  throw new Error(
    'Instagram blokkeert automatisch ophalen. ' +
    'Kopieer de caption tekst van de Instagram post en plak deze in het tekstveld.'
  );
}
