<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { api, type Suggestion } from '../lib/api';
  import WeatherWidget from '../lib/WeatherWidget.svelte';

  let suggestion: Suggestion | null = $state(null);
  let loading = $state(true);
  let error = $state('');
  let midnightCheckInterval: ReturnType<typeof setInterval>;

  // Get local date in YYYY-MM-DD format (not UTC)
  function getLocalDateString(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  let currentDate = getLocalDateString();

  onMount(async () => {
    await loadSuggestion();

    // Check every minute if date has changed (midnight refresh)
    midnightCheckInterval = setInterval(() => {
      const newDate = getLocalDateString();
      if (newDate !== currentDate) {
        currentDate = newDate;
        loadSuggestion();
      }
    }, 60000);
  });

  onDestroy(() => {
    if (midnightCheckInterval) clearInterval(midnightCheckInterval);
  });

  async function loadSuggestion() {
    loading = true;
    error = '';
    try {
      suggestion = await api.getTodaySuggestion();
    } catch (e) {
      try {
        suggestion = await api.generateSuggestion();
      } catch (e2) {
        error = 'Kon geen suggestie laden';
      }
    }
    loading = false;
  }

  async function acceptSuggestion() {
    if (!suggestion) return;
    try {
      await api.acceptSuggestion(suggestion.id);
      // Note: acceptSuggestion already logs the meal in backend
      suggestion.status = 'accepted';
    } catch (e) {
      error = 'Kon suggestie niet accepteren';
    }
  }

  async function rejectSuggestion() {
    if (!suggestion) return;
    loading = true;
    try {
      suggestion = await api.rejectSuggestion(suggestion.id);
    } catch (e) {
      error = 'Kon geen nieuwe suggestie maken';
    }
    loading = false;
  }

  function getCategoryEmoji(category: string): string {
    const emojis: Record<string, string> = {
      'curry': '🍛', 'soep': '🍲', 'pasta': '🍝', 'salade': '🥗',
      'pokebowl': '🥙', 'wraps': '🌯', 'plaattaart': '🥧', 'shakshuka': '🍳',
    };
    return emojis[category] || '🍽️';
  }
</script>

<div class="max-w-6xl mx-auto">
  <!-- Header row with weather -->
  <div class="flex items-center justify-between gap-6 mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-800">Wat eten we vandaag?</h1>
      <p class="text-sm text-gray-500">Suggestie op basis van weer en eetgeschiedenis</p>
    </div>
    <div class="flex-1 max-w-md">
      <WeatherWidget />
    </div>
  </div>

  {#if loading}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <div class="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto mb-3"></div>
      <p class="text-gray-600">Laden...</p>
    </div>
  {:else if error}
    <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <p class="text-red-600 mb-3">{error}</p>
      <button onclick={loadSuggestion} class="bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
        Opnieuw
      </button>
    </div>
  {:else if suggestion}
    <div class="bg-white rounded-xl shadow overflow-hidden">
      <div class="flex flex-col md:flex-row">
        <!-- Image -->
        {#if suggestion.recipe.imageUrl}
          <div class="md:w-2/5 h-48 md:h-auto bg-gray-100 relative">
            <img
              src={suggestion.recipe.imageUrl}
              alt={suggestion.recipe.name}
              class="w-full h-full object-cover"
            />
            <span class="absolute top-2 right-2 bg-white/90 px-2 py-1 rounded-full text-xs font-medium">
              {getCategoryEmoji(suggestion.recipe.category)} {suggestion.recipe.category}
            </span>
          </div>
        {/if}

        <!-- Content -->
        <div class="flex-1 p-5">
          <h2 class="text-xl font-bold text-gray-800 mb-1">{suggestion.recipe.name}</h2>

          {#if suggestion.recipe.description}
            <p class="text-gray-600 text-sm mb-3 line-clamp-2">{suggestion.recipe.description}</p>
          {/if}

          <!-- Tags -->
          <div class="flex flex-wrap gap-1.5 mb-3">
            {#each suggestion.recipe.seasons as season}
              <span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">{season}</span>
            {/each}
            {#each suggestion.recipe.weatherTags as tag}
              <span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">{tag}</span>
            {/each}
          </div>

          <!-- Score -->
          {#if suggestion.reason}
            <div class="flex gap-3 text-xs text-gray-500 mb-4">
              <span>Seizoen: <strong class="text-gray-700">{suggestion.reason.seasonScore}/30</strong></span>
              <span>Weer: <strong class="text-gray-700">{suggestion.reason.weatherScore}/30</strong></span>
              <span>Recent: <strong class="text-gray-700">{suggestion.reason.recencyScore}/40</strong></span>
            </div>
          {/if}

          <!-- Actions -->
          <div class="flex flex-wrap gap-2">
            {#if suggestion.status === 'pending'}
              <button
                onclick={acceptSuggestion}
                class="bg-orange-500 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-orange-600 transition-colors"
              >
                Dit maken we!
              </button>
            {:else if suggestion.status === 'accepted'}
              <span class="bg-green-100 text-green-700 px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-1">
                ✓ Gekozen
              </span>
            {/if}
            <button
              onclick={rejectSuggestion}
              class="bg-gray-100 text-gray-700 px-5 py-2 rounded-lg font-medium text-sm hover:bg-gray-200 transition-colors"
            >
              Iets anders
            </button>
            <a
              href="/recepten/{suggestion.recipe.id}"
              use:link
              class="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg font-medium text-sm hover:border-orange-400 hover:text-orange-600 transition-colors"
            >
              Bekijk recept →
            </a>
          </div>
        </div>
      </div>
    </div>
  {:else}
    <div class="bg-white rounded-xl shadow p-8 text-center">
      <p class="text-gray-600 mb-3">Nog geen recepten</p>
      <a href="/importeren" use:link class="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm">
        Voeg recepten toe
      </a>
    </div>
  {/if}
</div>
