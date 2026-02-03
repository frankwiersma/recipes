<script lang="ts">
  import { api, type Recipe, type WeekDay } from './api';

  interface Props {
    date: string;
    dayName: string;
    onClose: () => void;
    onSuccess?: (recipe: { id: number; name: string; category: string; imageUrl?: string }) => void;
  }

  let { date, dayName, onClose, onSuccess }: Props = $props();

  let recipes: Recipe[] = $state([]);
  let filteredRecipes: Recipe[] = $state([]);
  let loading = $state(true);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let searchQuery = $state('');

  function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'curry': '🍛', 'soep': '🍲', 'pasta': '🍝', 'salade': '🥗',
      'pokebowl': '🥙', 'wraps': '🌯', 'plaattaart': '🥧', 'shakshuka': '🍳',
    };
    return emojis[category] || '🍽️';
  }

  async function loadRecipes() {
    loading = true;
    error = null;
    try {
      recipes = await api.getRecipes();
      filteredRecipes = recipes;
    } catch (e) {
      error = 'Kon recepten niet laden';
      console.error(e);
    }
    loading = false;
  }

  function filterRecipes() {
    if (searchQuery.length < 2) {
      filteredRecipes = recipes;
      return;
    }
    const q = searchQuery.toLowerCase();
    filteredRecipes = recipes.filter(r =>
      r.name.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      r.ingredients.some(i => i.name.toLowerCase().includes(q))
    );
  }

  async function selectRecipe(recipe: Recipe) {
    saving = true;
    error = null;
    try {
      const result = await api.setDayRecipe(date, recipe.id);
      onSuccess?.(result.recipe);
      onClose();
    } catch (e) {
      error = `Kon niet opslaan: ${e}`;
      console.error(e);
    }
    saving = false;
  }

  // Load on mount
  $effect(() => {
    loadRecipes();
  });

  // Filter when search changes
  $effect(() => {
    searchQuery;
    filterRecipes();
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 bg-black/50 z-40"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="0"
></div>

<!-- Modal -->
<div class="fixed inset-x-4 top-8 bottom-8 max-w-lg mx-auto bg-white rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden">
  <!-- Header -->
  <div class="bg-orange-50 px-4 py-3 border-b border-orange-100 shrink-0">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="font-semibold text-gray-800">Kies recept</h2>
        <p class="text-sm text-gray-600 capitalize">{dayName}</p>
      </div>
      <button onclick={onClose} class="p-1 hover:bg-orange-100 rounded-full transition-colors">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  </div>

  <!-- Search -->
  <div class="px-4 py-3 border-b border-gray-100 shrink-0">
    <input
      type="text"
      placeholder="Zoek recept..."
      bind:value={searchQuery}
      class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
    />
  </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto p-4">
    {#if error}
      <div class="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
    {/if}

    {#if loading}
      <div class="flex justify-center py-8">
        <div class="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    {:else if filteredRecipes.length === 0}
      <div class="text-center py-8 text-gray-500">
        Geen recepten gevonden
      </div>
    {:else}
      <div class="space-y-2">
        {#each filteredRecipes as recipe}
          <button
            onclick={() => selectRecipe(recipe)}
            disabled={saving}
            class="w-full flex items-center gap-3 p-3 rounded-xl border-2 border-gray-100 hover:border-orange-200 hover:bg-orange-50 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {#if recipe.imageUrl}
              <img src={recipe.imageUrl} alt={recipe.name} class="w-12 h-12 rounded-lg object-cover shrink-0" />
            {:else}
              <div class="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center text-xl shrink-0">
                {getCategoryEmoji(recipe.category)}
              </div>
            {/if}
            <div class="flex-1 min-w-0">
              <p class="font-medium text-gray-800 truncate">{recipe.name}</p>
              <p class="text-xs text-gray-500">{getCategoryEmoji(recipe.category)} {recipe.category}</p>
            </div>
            <svg class="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
