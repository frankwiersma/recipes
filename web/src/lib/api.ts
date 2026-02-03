export interface Ingredient {
  name: string;
  amount?: number;
  unit?: string;
  scalable?: boolean;
}

export interface Recipe {
  id: number;
  name: string;
  slug: string;
  description?: string;
  category: string;
  ingredients: Ingredient[];
  instructions?: string[];
  defaultServings: number;
  imageUrl?: string;
  sourceUrl?: string;
  sourceType?: 'manual' | 'markdown' | 'picnic' | 'ah' | 'hellofresh' | 'instagram' | 'other';
  seasons: string[];
  weatherTags: string[];
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  createdAt: string;
  updatedAt: string;
  tags?: Tag[];
  lastEaten?: string;
}

// Get source display name
export function getSourceDisplayName(sourceType?: string): string | null {
  const names: Record<string, string> = {
    'ah': 'Albert Heijn',
    'hellofresh': 'HelloFresh',
    'picnic': 'Picnic',
    'instagram': 'Instagram',
    'leukerecepten': 'Leuke Recepten',
    'ohmyfoodness': 'Oh My Foodness',
    'uitpaulineskeuken': 'Uit Paulines Keuken',
  };
  return sourceType ? names[sourceType] || null : null;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
  type: string;
}

export interface Suggestion {
  id: number;
  recipe: Recipe;
  suggestedFor: string;
  status: string;
  reason?: {
    seasonScore: number;
    weatherScore: number;
    recencyScore: number;
    totalScore: number;
  };
  weatherData?: {
    temp: number;
    description: string;
    icon: string;
  };
}

interface SuggestionResponse {
  suggestion: {
    id: number;
    recipeId: number;
    suggestedFor: string;
    status: string;
    reason?: any;
    weatherData?: any;
  };
  recipe: Recipe;
  weatherDescription?: string;
}

export interface MealHistory {
  id: number;
  recipeId: number;
  eatenAt: string;
  servings: number;
  notes?: string;
  rating?: number;
  recipe?: Recipe;
}

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  if (!res.ok) {
    // Try to get error message from response
    try {
      const errorData = await res.json();
      throw new Error(errorData.error || `API error: ${res.status}`);
    } catch (e) {
      if (e instanceof Error && !e.message.startsWith('API error:')) {
        throw e;
      }
      throw new Error(`API error: ${res.status}`);
    }
  }
  return res.json();
}

export const api = {
  baseUrl: API_BASE,

  // Recipes
  getRecipes: (category?: string) =>
    fetchJson<Recipe[]>(`/recipes${category ? `?category=${category}` : ''}`),

  getRecipe: (id: number) =>
    fetchJson<Recipe>(`/recipes/${id}`),

  searchRecipes: (q: string) =>
    fetchJson<Recipe[]>(`/recipes/search?q=${encodeURIComponent(q)}`),

  createRecipe: (data: Partial<Recipe>) =>
    fetchJson<Recipe>('/recipes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRecipe: (id: number, data: Partial<Recipe>) =>
    fetchJson<Recipe>(`/recipes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRecipe: (id: number) =>
    fetchJson<{ success: boolean }>(`/recipes/${id}`, {
      method: 'DELETE',
    }),

  importFromUrl: (url: string, category: string) =>
    fetchJson<Recipe>('/recipes/import/url', {
      method: 'POST',
      body: JSON.stringify({ url, category }),
    }),

  // Suggestions
  getTodaySuggestion: async (): Promise<Suggestion> => {
    const res = await fetchJson<SuggestionResponse>('/suggestions/today');
    return {
      id: res.suggestion.id,
      recipe: res.recipe,
      suggestedFor: res.suggestion.suggestedFor,
      status: res.suggestion.status,
      reason: res.suggestion.reason,
      weatherData: res.suggestion.weatherData,
    };
  },

  generateSuggestion: async (): Promise<Suggestion> => {
    const res = await fetchJson<any>('/suggestions/generate', {
      method: 'POST',
    });
    // Generate returns { recipe, score, weather }
    // We need to create a suggestion-like object
    return {
      id: 0,
      recipe: res.recipe,
      suggestedFor: new Date().toISOString().split('T')[0],
      status: 'pending',
      reason: res.score,
      weatherData: res.weather,
    };
  },

  acceptSuggestion: (id: number) =>
    fetchJson<{ success: boolean }>(`/suggestions/${id}/accept`, {
      method: 'PUT',
    }),

  rejectSuggestion: async (id: number): Promise<Suggestion> => {
    const res = await fetchJson<SuggestionResponse>(`/suggestions/${id}/reject`, {
      method: 'PUT',
    });
    return {
      id: res.suggestion.id,
      recipe: res.recipe,
      suggestedFor: res.suggestion.suggestedFor,
      status: res.suggestion.status,
      reason: res.suggestion.reason,
      weatherData: res.suggestion.weatherData,
    };
  },

  // History
  getHistory: () =>
    fetchJson<MealHistory[]>('/history'),

  logMeal: (recipeId: number, servings?: number, notes?: string, rating?: number) =>
    fetchJson<MealHistory>('/history', {
      method: 'POST',
      body: JSON.stringify({ recipeId, servings, notes, rating }),
    }),

  deleteHistory: (id: number) =>
    fetchJson<{ success: boolean }>(`/history/${id}`, {
      method: 'DELETE',
    }),

  // Tags
  getTags: () =>
    fetchJson<Record<string, Tag[]>>('/tags'),

  // Weather
  getWeather: () =>
    fetchJson<{ temp: number; description: string; icon: string }>('/weather'),

  // Week plan
  getWeekPlan: () =>
    fetchJson<WeekDay[]>('/weekplan'),

  regenerateDay: (date: string) =>
    fetchJson<{ date: string; recipe: { id: number; name: string; category: string; imageUrl?: string } }>(`/weekplan/${date}/regenerate`, {
      method: 'POST',
    }),

  setDayRecipe: (date: string, recipeId: number) =>
    fetchJson<{ success: boolean; date: string; recipe: { id: number; name: string; category: string; imageUrl?: string } }>(`/weekplan/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ recipeId }),
    }),

  // Shopping list
  getShoppingList: () =>
    fetchJson<ShoppingListData>('/shopping'),
};

export interface ShoppingItem {
  name: string;
  displayName: string;
  amount: number | null;
  unit: string | null;
  category: string;
  sources: Array<{ recipeName: string; recipeId: number; amount: number | null; unit: string | null }>;
}

export interface ShoppingListData {
  items: ShoppingItem[];
  grouped: Record<string, ShoppingItem[]>;
  recipes: Array<{ id: number; name: string; date: string; servings: number }>;
  generatedAt: string;
}

export interface WeekDay {
  date: string;
  dayName: string;
  temp: number;
  icon: string;
  description: string;
  status?: string; // 'pending' | 'accepted' | 'rejected' for today
  recipe: {
    id: number;
    name: string;
    category: string;
    imageUrl?: string;
  } | null;
}
