import { db } from '../db/index';
import { recipes, mealHistory, suggestions } from '../db/schema';
import type { WeatherSnapshot, Season, WeatherTag } from '../db/schema';
import { getCurrentWeather, getWeatherTags, getCurrentSeason } from './weather';
import { eq, desc, and, gte, lt } from 'drizzle-orm';
import { format, differenceInDays } from 'date-fns';

interface SuggestionScore {
  recipeId: number;
  recipeName: string;
  totalScore: number;
  breakdown: {
    seasonScore: number;
    weatherScore: number;
    recencyScore: number;
  };
}

async function getDaysSinceEaten(recipeId: number): Promise<number> {
  const lastEaten = await db.query.mealHistory.findFirst({
    where: eq(mealHistory.recipeId, recipeId),
    orderBy: desc(mealHistory.eatenAt),
  });

  if (!lastEaten) return 999; // Never eaten = high priority

  return differenceInDays(new Date(), lastEaten.eatenAt);
}

async function scoreRecipe(
  recipe: typeof recipes.$inferSelect,
  weather: WeatherSnapshot,
  currentSeason: Season,
  weatherTags: WeatherTag[]
): Promise<SuggestionScore> {
  const daysSinceEaten = await getDaysSinceEaten(recipe.id);

  // Parse JSON fields
  const recipeSeasons: Season[] = recipe.seasons ? JSON.parse(recipe.seasons as string) : [];
  const recipeWeatherTags: WeatherTag[] = recipe.weatherTags ? JSON.parse(recipe.weatherTags as string) : [];

  // Season score (0-30)
  let seasonScore = 15; // Neutral default
  if (recipeSeasons.length > 0) {
    seasonScore = recipeSeasons.includes(currentSeason) ? 30 : 5;
  }

  // Weather score (0-30)
  let weatherScore = 10; // Neutral default
  if (recipeWeatherTags.length > 0) {
    const matchingTags = recipeWeatherTags.filter(t => weatherTags.includes(t));
    weatherScore = Math.min(30, matchingTags.length * 15);
  }

  // Recency score (0-40) - higher for longer time since eaten
  let recencyScore = 0;
  if (daysSinceEaten >= 14) recencyScore = 40;
  else if (daysSinceEaten >= 7) recencyScore = 30;
  else if (daysSinceEaten >= 3) recencyScore = 15;
  else recencyScore = 0; // Recently eaten = low priority

  return {
    recipeId: recipe.id,
    recipeName: recipe.name,
    totalScore: seasonScore + weatherScore + recencyScore,
    breakdown: { seasonScore, weatherScore, recencyScore },
  };
}

export async function generateSuggestion(excludeRecipeIds: number[] = []): Promise<{
  recipe: typeof recipes.$inferSelect;
  score: SuggestionScore;
  weather: WeatherSnapshot;
}> {
  // Get current weather and season
  const weather = await getCurrentWeather();
  const currentSeason = getCurrentSeason();
  const weatherTags = getWeatherTags(weather);

  // Get all recipes, excluding already suggested ones today
  const allRecipes = await db.query.recipes.findMany();
  const availableRecipes = allRecipes.filter(r => !excludeRecipeIds.includes(r.id));

  if (availableRecipes.length === 0) {
    // If all recipes exhausted, use all recipes again
    if (allRecipes.length === 0) {
      throw new Error('No recipes in database');
    }
    // Reset and use all
    return generateSuggestion([]);
  }

  // Score available recipes
  const scores = await Promise.all(
    availableRecipes.map(r => scoreRecipe(r, weather, currentSeason, weatherTags))
  );

  // Sort by score descending
  scores.sort((a, b) => b.totalScore - a.totalScore);

  // Select randomly from top 3
  const topCandidates = scores.slice(0, Math.min(3, scores.length));
  const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

  // Get full recipe data
  const recipe = availableRecipes.find(r => r.id === selected.recipeId)!;

  return { recipe, score: selected, weather };
}

export async function getTodaySuggestion() {
  const today = format(new Date(), 'yyyy-MM-dd');

  // Check if we have an accepted suggestion for today - show that first
  const accepted = await db.select()
    .from(suggestions)
    .where(eq(suggestions.suggestedFor, today))
    .orderBy(desc(suggestions.createdAt))
    .limit(1);

  if (accepted.length > 0 && accepted[0].status === 'accepted') {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, accepted[0].recipeId),
    });
    return { suggestion: accepted[0], recipe };
  }

  // Check if we have a pending suggestion for today
  if (accepted.length > 0 && accepted[0].status === 'pending') {
    const recipe = await db.query.recipes.findFirst({
      where: eq(recipes.id, accepted[0].recipeId),
    });
    return { suggestion: accepted[0], recipe };
  }

  // Get all rejected recipe IDs for today
  const todaysSuggestions = await db.select()
    .from(suggestions)
    .where(eq(suggestions.suggestedFor, today));
  const excludeIds = todaysSuggestions.map(s => s.recipeId);

  // Generate new suggestion excluding already suggested recipes
  const { recipe, score, weather } = await generateSuggestion(excludeIds);

  // Store suggestion
  const [suggestion] = await db.insert(suggestions).values({
    recipeId: recipe.id,
    suggestedFor: today,
    status: 'pending',
    reason: JSON.stringify(score.breakdown),
    weatherData: JSON.stringify(weather),
    createdAt: new Date(),
  }).returning();

  return { suggestion, recipe };
}

export async function acceptSuggestion(suggestionId: number) {
  // Update suggestion status
  await db.update(suggestions)
    .set({ status: 'accepted' })
    .where(eq(suggestions.id, suggestionId));

  // Get suggestion to find recipe
  const suggestion = await db.query.suggestions.findFirst({
    where: eq(suggestions.id, suggestionId),
  });

  if (!suggestion) throw new Error('Suggestion not found');

  // Log meal in history
  await db.insert(mealHistory).values({
    recipeId: suggestion.recipeId,
    eatenAt: new Date(),
    createdAt: new Date(),
  });

  return { success: true };
}

export async function rejectSuggestion(suggestionId: number) {
  // Get the suggestion first to check if it was accepted
  const suggestion = await db.query.suggestions.findFirst({
    where: eq(suggestions.id, suggestionId),
  });

  // If suggestion was accepted, also delete the meal history entry from today
  if (suggestion && suggestion.status === 'accepted') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    await db.delete(mealHistory)
      .where(and(
        eq(mealHistory.recipeId, suggestion.recipeId),
        gte(mealHistory.eatenAt, todayStart),
        lt(mealHistory.eatenAt, tomorrowStart)
      ));
  }

  // Update suggestion status
  await db.update(suggestions)
    .set({ status: 'rejected' })
    .where(eq(suggestions.id, suggestionId));

  // Get all suggested recipe IDs for today (to exclude them)
  const today = format(new Date(), 'yyyy-MM-dd');
  const todaysSuggestions = await db.select()
    .from(suggestions)
    .where(eq(suggestions.suggestedFor, today));
  const excludeIds = todaysSuggestions.map(s => s.recipeId);

  // Generate alternative suggestion excluding already suggested recipes
  const { recipe, score, weather } = await generateSuggestion(excludeIds);

  // Store new suggestion
  const [newSuggestion] = await db.insert(suggestions).values({
    recipeId: recipe.id,
    suggestedFor: today,
    status: 'pending',
    reason: JSON.stringify(score.breakdown),
    weatherData: JSON.stringify(weather),
    createdAt: new Date(),
  }).returning();

  return { suggestion: newSuggestion, recipe };
}
