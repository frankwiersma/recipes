<script lang="ts">
  import { api, type WeekDay, type Recipe } from './api';

  interface Props {
    recipe: Recipe | { id: number; name: string; category: string; imageUrl?: string };
    onClose: () => void;
    onSuccess?: (date: string) => void;
  }

  let { recipe, onClose, onSuccess }: Props = $props();

  let weekPlan: WeekDay[] = $state([]);
  let loading = $state(true);
  let saving = $state<string | null>(null);
  let error = $state<string | null>(null);

  function getLocalDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function isToday(date: string): boolean {
    return date === getLocalDateString();
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  async function loadWeekPlan() {
    loading = true;
    error = null;
    try {
      weekPlan = await api.getWeekPlan();
    } catch (e) {
      error = 'Kon weekplan niet laden';
      console.error(e);
    }
    loading = false;
  }

  async function selectDay(date: string) {
    saving = date;
    error = null;
    try {
      await api.setDayRecipe(date, recipe.id);
      onSuccess?.(date);
      onClose();
    } catch (e) {
      error = `Kon niet opslaan: ${e}`;
      console.error(e);
    }
    saving = null;
  }

  function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'curry': '🍛', 'soep': '🍲', 'pasta': '🍝', 'salade': '🥗',
      'pokebowl': '🥙', 'wraps': '🌯', 'plaattaart': '🥧', 'shakshuka': '🍳',
    };
    return emojis[category] || '🍽️';
  }

  // Load on mount
  $effect(() => {
    loadWeekPlan();
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
<div class="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white rounded-2xl shadow-xl z-50 overflow-hidden">
  <!-- Header -->
  <div class="bg-orange-50 px-4 py-3 border-b border-orange-100">
    <div class="flex items-center justify-between">
      <h2 class="font-semibold text-gray-800">Plan recept</h2>
      <button onclick={onClose} class="p-1 hover:bg-orange-100 rounded-full transition-colors">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <!-- Recipe preview -->
    <div class="mt-2 flex items-center gap-2">
      {#if recipe.imageUrl}
        <img src={recipe.imageUrl} alt={recipe.name} class="w-10 h-10 rounded-lg object-cover" />
      {:else}
        <div class="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center text-lg">
          {getCategoryEmoji(recipe.category)}
        </div>
      {/if}
      <div class="flex-1 min-w-0">
        <p class="font-medium text-gray-800 truncate">{recipe.name}</p>
        <p class="text-xs text-gray-500">{getCategoryEmoji(recipe.category)} {recipe.category}</p>
      </div>
    </div>
  </div>

  <!-- Content -->
  <div class="p-4 max-h-80 overflow-y-auto">
    {#if error}
      <div class="mb-3 p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>
    {/if}

    {#if loading}
      <div class="flex justify-center py-8">
        <div class="animate-spin w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full"></div>
      </div>
    {:else}
      <p class="text-sm text-gray-600 mb-3">Kies een dag:</p>
      <div class="space-y-2">
        {#each weekPlan as day}
          <button
            onclick={() => selectDay(day.date)}
            disabled={saving !== null}
            class="w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all
              {isToday(day.date) ? 'border-orange-300 bg-orange-50' : 'border-gray-100 hover:border-orange-200 hover:bg-orange-50'}
              {saving === day.date ? 'opacity-50' : ''}
              disabled:cursor-not-allowed"
          >
            <!-- Day info -->
            <div class="flex-1 text-left">
              <div class="flex items-center gap-2">
                <span class="font-medium text-gray-800 capitalize">{day.dayName}</span>
                {#if isToday(day.date)}
                  <span class="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">vandaag</span>
                {/if}
              </div>
              <span class="text-xs text-gray-500">{formatDate(day.date)}</span>
            </div>

            <!-- Weather -->
            <div class="flex items-center gap-1">
              <img
                src="https://openweathermap.org/img/wn/{day.icon}.png"
                alt={day.description}
                class="w-8 h-8"
              />
              <span class="text-sm font-medium text-gray-600">{day.temp}°</span>
            </div>

            <!-- Current recipe (will be replaced) -->
            {#if day.recipe}
              <div class="text-right text-xs text-gray-400 max-w-24 truncate" title="Wordt vervangen: {day.recipe.name}">
                {getCategoryEmoji(day.recipe.category)} {day.recipe.name}
              </div>
            {:else}
              <div class="text-xs text-gray-300">Geen recept</div>
            {/if}

            <!-- Loading indicator -->
            {#if saving === day.date}
              <div class="animate-spin w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full"></div>
            {:else}
              <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
</div>
