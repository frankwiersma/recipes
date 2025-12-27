<script lang="ts">
  import { onMount } from 'svelte';
  import { api, type Recipe } from '../lib/api';
  import RecipeCard from '../lib/RecipeCard.svelte';

  let recipes: Recipe[] = $state([]);
  let filteredRecipes: Recipe[] = $state([]);
  let loading = $state(true);
  let searchQuery = $state('');
  let selectedCategory = $state('');
  let selectedSeason = $state('');

  const categories = ['curry', 'soep', 'pasta', 'salade', 'pokebowl', 'wraps', 'plaattaart', 'shakshuka'];
  const seasons = ['lente', 'zomer', 'herfst', 'winter'];

  onMount(async () => {
    await loadRecipes();
  });

  async function loadRecipes() {
    loading = true;
    try {
      recipes = await api.getRecipes();
      filterRecipes();
    } catch (e) {
      console.error('Could not load recipes', e);
    }
    loading = false;
  }

  async function handleSearch() {
    if (searchQuery.length >= 2) {
      loading = true;
      try {
        filteredRecipes = await api.searchRecipes(searchQuery);
      } catch (e) {
        filterRecipes();
      }
      loading = false;
    } else {
      filterRecipes();
    }
  }

  function filterRecipes() {
    filteredRecipes = recipes.filter(r => {
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedSeason && !r.seasons.includes(selectedSeason)) return false;
      if (searchQuery.length >= 2) {
        const q = searchQuery.toLowerCase();
        return r.name.toLowerCase().includes(q) ||
               r.description?.toLowerCase().includes(q) ||
               r.ingredients.some(i => i.name.toLowerCase().includes(q));
      }
      return true;
    });
  }

  function clearFilters() {
    searchQuery = '';
    selectedCategory = '';
    selectedSeason = '';
    filterRecipes();
  }

  function onCategoryChange(e: Event) {
    selectedCategory = (e.target as HTMLSelectElement).value;
    filterRecipes();
  }

  function onSeasonChange(e: Event) {
    selectedSeason = (e.target as HTMLSelectElement).value;
    filterRecipes();
  }
</script>

<div>
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-3xl font-bold text-gray-800">Alle Recepten</h1>
    <span class="text-gray-500">{filteredRecipes.length} recepten</span>
  </div>

  <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
    <div class="flex flex-wrap gap-4">
      <div class="flex-1 min-w-64">
        <input
          type="text"
          placeholder="Zoek recepten..."
          bind:value={searchQuery}
          oninput={handleSearch}
          class="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
      </div>

      <select
        value={selectedCategory}
        onchange={onCategoryChange}
        class="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
      >
        <option value="">Alle categorien</option>
        {#each categories as cat}
          <option value={cat}>{cat}</option>
        {/each}
      </select>

      <select
        value={selectedSeason}
        onchange={onSeasonChange}
        class="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
      >
        <option value="">Alle seizoenen</option>
        {#each seasons as season}
          <option value={season}>{season}</option>
        {/each}
      </select>

      {#if searchQuery || selectedCategory || selectedSeason}
        <button
          onclick={clearFilters}
          class="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
        >
          Filters wissen
        </button>
      {/if}
    </div>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each [1, 2, 3, 4, 5, 6] as _}
        <div class="bg-white rounded-xl shadow-sm overflow-hidden animate-pulse">
          <div class="aspect-video bg-gray-200"></div>
          <div class="p-4">
            <div class="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div class="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if filteredRecipes.length === 0}
    <div class="bg-white rounded-xl shadow-sm p-12 text-center">
      <p class="text-gray-600 mb-4">Geen recepten gevonden</p>
      {#if searchQuery || selectedCategory || selectedSeason}
        <button
          onclick={clearFilters}
          class="text-orange-600 hover:text-orange-700 font-medium"
        >
          Filters wissen
        </button>
      {/if}
    </div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each filteredRecipes as recipe (recipe.id)}
        <RecipeCard {recipe} />
      {/each}
    </div>
  {/if}
</div>
