<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { api, type MealHistory } from '../lib/api';

  let history: MealHistory[] = $state([]);
  let loading = $state(true);
  let midnightCheckInterval: ReturnType<typeof setInterval>;

  // Get local date in YYYY-MM-DD format (not UTC)
  function getLocalDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  let currentDate = getLocalDateString();

  onMount(async () => {
    await loadHistory();

    // Check every minute if date has changed (midnight refresh)
    midnightCheckInterval = setInterval(() => {
      const newDate = getLocalDateString();
      if (newDate !== currentDate) {
        currentDate = newDate;
        loadHistory();
      }
    }, 60000);
  });

  onDestroy(() => {
    if (midnightCheckInterval) clearInterval(midnightCheckInterval);
  });

  async function loadHistory() {
    loading = true;
    try {
      history = await api.getHistory();
    } catch (e) {
      console.error('Could not load history', e);
    }
    loading = false;
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Vandaag';
    if (diffDays === 1) return 'Gisteren';
    if (diffDays < 7) return `${diffDays} dagen geleden`;

    return date.toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  function groupByWeek(items: MealHistory[]): Record<string, MealHistory[]> {
    const groups: Record<string, MealHistory[]> = {};

    for (const item of items) {
      const date = new Date(item.eatenAt);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay() + 1);
      const key = weekStart.toISOString().split('T')[0];

      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return groups;
  }

  function getWeekLabel(weekKey: string): string {
    const weekStart = new Date(weekKey);
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay() + 1);

    if (weekStart.toDateString() === thisWeekStart.toDateString()) {
      return 'Deze week';
    }

    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    if (weekStart.toDateString() === lastWeekStart.toDateString()) {
      return 'Vorige week';
    }

    return `Week van ${weekStart.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`;
  }

  let groupedHistory = $derived(groupByWeek(history));
  let sortedWeeks = $derived(Object.keys(groupedHistory).sort().reverse());

  async function deleteEntry(id: number) {
    try {
      await api.deleteHistory(id);
      history = history.filter(h => h.id !== id);
    } catch (err) {
      console.error('Could not delete', err);
    }
  }
</script>

<div>
  <h1 class="text-3xl font-bold text-gray-800 mb-2">Eetgeschiedenis</h1>
  <p class="text-gray-600 mb-8">Bekijk wat je de afgelopen tijd hebt gegeten.</p>

  {#if loading}
    <div class="space-y-4">
      {#each [1, 2, 3] as _}
        <div class="bg-white rounded-xl shadow-sm p-6 animate-pulse">
          <div class="h-5 bg-gray-200 rounded w-32 mb-4"></div>
          <div class="space-y-3">
            <div class="h-16 bg-gray-100 rounded-lg"></div>
            <div class="h-16 bg-gray-100 rounded-lg"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if history.length === 0}
    <div class="bg-white rounded-xl shadow-sm p-12 text-center">
      <div class="text-5xl mb-4">📋</div>
      <p class="text-gray-600 mb-4">Je hebt nog geen maaltijden gelogd</p>
      <a
        href="/"
        use:link
        class="inline-block bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 transition-colors"
      >
        Bekijk vandaag's suggestie
      </a>
    </div>
  {:else}
    <div class="space-y-8">
      {#each sortedWeeks as weekKey}
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-6 py-4 bg-gray-50 border-b border-gray-100">
            <h2 class="font-semibold text-gray-800">{getWeekLabel(weekKey)}</h2>
          </div>
          <div class="divide-y divide-gray-100">
            {#each groupedHistory[weekKey] as item}
              <div class="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
                <a href="/recepten/{item.recipeId}" use:link class="flex items-center gap-4 flex-1 min-w-0">
                  {#if item.recipe?.imageUrl}
                    <div class="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      <img
                        src={item.recipe.imageUrl}
                        alt={item.recipe?.name}
                        class="w-full h-full object-cover"
                      />
                    </div>
                  {:else}
                    <div class="w-16 h-16 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
                      <span class="text-2xl">🍽️</span>
                    </div>
                  {/if}

                  <div class="flex-1 min-w-0">
                    <h3 class="font-medium text-gray-800 truncate">
                      {item.recipe?.name || `Recept #${item.recipeId}`}
                    </h3>
                    <div class="flex items-center gap-4 text-sm text-gray-500">
                      <span>{formatDate(item.eatenAt)}</span>
                      <span>{item.servings} porties</span>
                      {#if item.rating}
                        <span class="flex items-center gap-1">
                          {#each Array(item.rating) as _}
                            <span class="text-yellow-400">⭐</span>
                          {/each}
                        </span>
                      {/if}
                    </div>
                    {#if item.notes}
                      <p class="text-sm text-gray-600 mt-1 truncate">{item.notes}</p>
                    {/if}
                  </div>
                </a>

                <button
                  onclick={() => deleteEntry(item.id)}
                  class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Verwijderen"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
