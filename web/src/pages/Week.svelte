<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { api, type WeekDay } from '../lib/api';

  let weekPlan: WeekDay[] = $state([]);
  let loading = $state(true);
  let regenerating: string | null = $state(null);
  let midnightCheckInterval: ReturnType<typeof setInterval>;

  // Get local date in YYYY-MM-DD format (not UTC)
  function getLocalDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  let currentDate = getLocalDateString();

  function isToday(date: string): boolean {
    return date === currentDate;
  }

  async function loadWeekPlan() {
    loading = true;
    try {
      weekPlan = await api.getWeekPlan();
    } catch (e) {
      console.error('Kon weekplan niet laden:', e);
    }
    loading = false;
  }

  onMount(async () => {
    await loadWeekPlan();

    // Check every minute if date has changed (midnight refresh)
    midnightCheckInterval = setInterval(() => {
      const newDate = getLocalDateString();
      if (newDate !== currentDate) {
        currentDate = newDate;
        loadWeekPlan();
      }
    }, 60000);
  });

  onDestroy(() => {
    if (midnightCheckInterval) clearInterval(midnightCheckInterval);
  });

  async function regenerateDay(date: string) {
    regenerating = date;
    try {
      const result = await api.regenerateDay(date);
      weekPlan = weekPlan.map(day =>
        day.date === date ? { ...day, recipe: result.recipe } : day
      );
    } catch (e) {
      console.error('Kon niet regenereren:', e);
    }
    regenerating = null;
  }

  function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'curry': '🍛', 'soep': '🍲', 'pasta': '🍝', 'salade': '🥗',
      'pokebowl': '🥙', 'wraps': '🌯', 'plaattaart': '🥧', 'shakshuka': '🍳',
    };
    return emojis[category] || '🍽️';
  }
</script>

<div class="max-w-5xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-800 mb-4">Weekplanning</h1>

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <div class="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
    </div>
  {:else if weekPlan.length === 0}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <p class="text-gray-600">Kon weekplan niet laden</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each weekPlan as day, i}
        <div class="bg-white rounded-xl shadow overflow-hidden {isToday(day.date) ? 'ring-2 ring-orange-400' : ''}">
          <!-- Day header -->
          <div class="{isToday(day.date) ? 'bg-orange-50' : 'bg-gray-50'} px-4 py-2 flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="font-semibold {isToday(day.date) ? 'text-orange-600' : 'text-gray-700'} capitalize">{day.dayName}</span>
              {#if isToday(day.date)}
                <span class="text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded">vandaag</span>
              {/if}
              {#if day.status === 'accepted'}
                <span class="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  gekozen
                </span>
              {/if}
            </div>
            <div class="flex items-center gap-1">
              <img
                src="https://openweathermap.org/img/wn/{day.icon}.png"
                alt={day.description}
                class="w-8 h-8"
              />
              <span class="text-lg font-bold text-gray-700">{day.temp}°</span>
            </div>
          </div>

          <!-- Recipe -->
          {#if day.recipe}
            <a href="/recepten/{day.recipe.id}" use:link class="block hover:bg-gray-50">
              {#if day.recipe.imageUrl}
                <img
                  src={day.recipe.imageUrl}
                  alt={day.recipe.name}
                  class="w-full h-32 object-cover"
                />
              {:else}
                <div class="w-full h-32 bg-gray-100 flex items-center justify-center text-4xl">
                  {getCategoryEmoji(day.recipe.category)}
                </div>
              {/if}
              <div class="p-3">
                <h3 class="font-medium text-gray-800 text-sm line-clamp-2">{day.recipe.name}</h3>
                <span class="text-xs text-gray-500">{getCategoryEmoji(day.recipe.category)} {day.recipe.category}</span>
              </div>
            </a>
          {:else}
            <div class="p-4 text-center text-gray-400 h-32 flex items-center justify-center">
              Geen suggestie
            </div>
          {/if}

          <!-- Refresh button -->
          <div class="border-t border-gray-100 px-3 py-2">
            <button
              onclick={() => regenerateDay(day.date)}
              disabled={regenerating === day.date}
              class="w-full flex items-center justify-center gap-1.5 text-xs text-gray-500 hover:text-orange-600 transition-colors disabled:opacity-50"
            >
              <svg class="w-3.5 h-3.5 {regenerating === day.date ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Andere suggestie
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
