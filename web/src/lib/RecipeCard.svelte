<script lang="ts">
  import { link } from 'svelte-spa-router';
  import type { Recipe } from './api';
  import { getSourceDisplayName } from './api';

  let { recipe }: { recipe: Recipe } = $props();

  function getCategoryColor(category: string): string {
    const colors: Record<string, string> = {
      'curry': 'bg-amber-100 text-amber-700',
      'soep': 'bg-red-100 text-red-700',
      'pasta': 'bg-yellow-100 text-yellow-700',
      'salade': 'bg-green-100 text-green-700',
      'pokebowl': 'bg-teal-100 text-teal-700',
      'wraps': 'bg-orange-100 text-orange-700',
      'plaattaart': 'bg-purple-100 text-purple-700',
      'shakshuka': 'bg-rose-100 text-rose-700',
    };
    return colors[category] || 'bg-gray-100 text-gray-700';
  }

  let sourceName = $derived(getSourceDisplayName(recipe.sourceType));
</script>

<a
  href="/recepten/{recipe.id}"
  use:link
  class="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group"
>
  {#if recipe.imageUrl}
    <div class="aspect-video bg-gray-100 overflow-hidden">
      <img
        src={recipe.imageUrl}
        alt={recipe.name}
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
      />
    </div>
  {:else}
    <div class="aspect-video bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center">
      <span class="text-5xl opacity-50">🍽️</span>
    </div>
  {/if}

  <div class="p-4">
    <div class="flex items-start justify-between gap-2 mb-2">
      <h3 class="font-semibold text-gray-800 group-hover:text-orange-600 transition-colors line-clamp-2">
        {recipe.name}
      </h3>
      <span class="shrink-0 text-xs px-2 py-1 rounded-full {getCategoryColor(recipe.category)}">
        {recipe.category}
      </span>
    </div>

    {#if recipe.description}
      <p class="text-sm text-gray-600 line-clamp-2 mb-3">{recipe.description}</p>
    {/if}

    <div class="flex flex-wrap gap-1">
      {#each recipe.seasons.slice(0, 2) as season}
        <span class="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded">{season}</span>
      {/each}
      {#if recipe.prepTimeMinutes || recipe.cookTimeMinutes}
        <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          {(recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)} min
        </span>
      {/if}
      {#if sourceName}
        <span class="text-xs text-gray-400 px-1 py-0.5">via {sourceName}</span>
      {/if}
    </div>
  </div>
</a>
