<script lang="ts">
  import { onMount } from 'svelte';
  import { link } from 'svelte-spa-router';
  import { api, type Recipe } from '../lib/api';

  let { params }: { params: { id: string } } = $props();

  let recipe: Recipe | null = $state(null);
  let loading = $state(true);
  let servings = $state(2);
  let copied = $state(false);
  let logging = $state(false);
  let logSuccess = $state(false);
  let editingImage = $state(false);
  let newImageUrl = $state('');

  let scaleFactor = $derived(recipe ? servings / recipe.defaultServings : 1);

  onMount(async () => {
    await loadRecipe();
  });

  async function loadRecipe() {
    loading = true;
    try {
      recipe = await api.getRecipe(parseInt(params.id));
      servings = recipe.defaultServings;
    } catch (e) {
      console.error('Could not load recipe', e);
    }
    loading = false;
  }

  function formatAmount(amount: number | undefined, scalable: boolean | undefined): string {
    if (!amount) return '';
    const scaled = scalable !== false ? amount * scaleFactor : amount;
    if (scaled === Math.floor(scaled)) return scaled.toString();
    if (Math.abs(scaled - Math.round(scaled * 2) / 2) < 0.01) {
      const whole = Math.floor(scaled);
      const frac = scaled - whole;
      if (frac > 0.4 && frac < 0.6) return whole ? `${whole} 1/2` : '1/2';
    }
    if (Math.abs(scaled - Math.round(scaled * 4) / 4) < 0.01) {
      const whole = Math.floor(scaled);
      const frac = scaled - whole;
      if (frac > 0.2 && frac < 0.3) return whole ? `${whole} 1/4` : '1/4';
      if (frac > 0.7 && frac < 0.8) return whole ? `${whole} 3/4` : '3/4';
    }
    return scaled.toFixed(1).replace('.0', '');
  }

  function getIngredientText(): string {
    if (!recipe) return '';
    return recipe.ingredients.map(ing => {
      const amount = formatAmount(ing.amount, ing.scalable);
      const unit = ing.unit || '';
      return `${amount} ${unit} ${ing.name}`.trim();
    }).join('\n');
  }

  async function copyIngredients() {
    await navigator.clipboard.writeText(getIngredientText());
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  async function logMeal() {
    if (!recipe) return;
    logging = true;
    try {
      await api.logMeal(recipe.id, servings);
      logSuccess = true;
      setTimeout(() => logSuccess = false, 3000);
    } catch (e) {
      console.error('Could not log meal', e);
    }
    logging = false;
  }

  function decreaseServings() {
    servings = Math.max(1, servings - 1);
  }

  function increaseServings() {
    servings = servings + 1;
  }

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

  function startEditImage() {
    newImageUrl = recipe?.imageUrl || '';
    editingImage = true;
  }

  async function saveImageUrl() {
    if (!recipe) return;
    try {
      await api.updateRecipe(recipe.id, { imageUrl: newImageUrl || undefined });
      recipe.imageUrl = newImageUrl || undefined;
      editingImage = false;
    } catch (e) {
      console.error('Could not update image', e);
    }
  }

  function cancelEditImage() {
    editingImage = false;
    newImageUrl = '';
  }
</script>

<div>
  <a href="/recepten" use:link class="inline-flex items-center text-gray-600 hover:text-orange-600 mb-6 transition-colors">
    <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
    </svg>
    Terug naar recepten
  </a>

  {#if loading}
    <div class="bg-white rounded-2xl shadow-lg overflow-hidden animate-pulse">
      <div class="aspect-video bg-gray-200"></div>
      <div class="p-8">
        <div class="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div class="h-4 bg-gray-200 rounded w-full mb-2"></div>
        <div class="h-4 bg-gray-200 rounded w-3/4"></div>
      </div>
    </div>
  {:else if recipe}
    <div class="grid lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2">
        <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div class="aspect-video bg-gray-100 relative group">
            {#if editingImage}
              <div class="absolute inset-0 bg-white p-4 flex flex-col gap-3">
                <label class="text-sm font-medium text-gray-700">Afbeelding URL</label>
                <input
                  type="text"
                  bind:value={newImageUrl}
                  placeholder="https://..."
                  class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
                <div class="flex gap-2">
                  <button
                    onclick={saveImageUrl}
                    class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
                  >
                    Opslaan
                  </button>
                  <button
                    onclick={cancelEditImage}
                    class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                  >
                    Annuleren
                  </button>
                </div>
                {#if newImageUrl}
                  <div class="flex-1 mt-2">
                    <p class="text-xs text-gray-500 mb-1">Voorbeeld:</p>
                    <img src={newImageUrl} alt="Preview" class="max-h-32 rounded object-cover" />
                  </div>
                {/if}
              </div>
            {:else if recipe.imageUrl}
              <img
                src={recipe.imageUrl}
                alt={recipe.name}
                class="w-full h-full object-cover"
              />
              <button
                onclick={startEditImage}
                class="absolute top-2 left-2 bg-white/90 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                title="Afbeelding wijzigen"
              >
                <svg class="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            {:else}
              <div class="w-full h-full flex items-center justify-center">
                <button
                  onclick={startEditImage}
                  class="flex flex-col items-center gap-2 text-gray-400 hover:text-orange-500 transition-colors"
                >
                  <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span class="text-sm">Afbeelding toevoegen</span>
                </button>
              </div>
            {/if}
          </div>

          <div class="p-8">
            <div class="flex items-start gap-4 mb-4">
              <h1 class="text-3xl font-bold text-gray-800 flex-1">{recipe.name}</h1>
              <span class="px-3 py-1 rounded-full text-sm font-medium {getCategoryColor(recipe.category)}">
                {recipe.category}
              </span>
            </div>

            {#if recipe.description}
              <p class="text-gray-600 mb-6">{recipe.description}</p>
            {/if}

            <div class="flex flex-wrap gap-2 mb-6">
              {#each recipe.seasons as season}
                <span class="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">{season}</span>
              {/each}
              {#each recipe.weatherTags as tag}
                <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm">{tag}</span>
              {/each}
            </div>

            <div class="flex gap-4 text-sm text-gray-500 mb-6">
              {#if recipe.prepTimeMinutes}
                <span>Voorbereiden: {recipe.prepTimeMinutes} min</span>
              {/if}
              {#if recipe.cookTimeMinutes}
                <span>Bereiden: {recipe.cookTimeMinutes} min</span>
              {/if}
            </div>

            {#if recipe.instructions && recipe.instructions.length > 0}
              <div>
                <h2 class="text-xl font-semibold text-gray-800 mb-4">Bereiding</h2>
                <ol class="space-y-4">
                  {#each recipe.instructions as step, i}
                    <li class="flex gap-4">
                      <span class="shrink-0 w-8 h-8 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-semibold text-sm">
                        {i + 1}
                      </span>
                      <p class="text-gray-700 pt-1">{step}</p>
                    </li>
                  {/each}
                </ol>
              </div>
            {/if}

            {#if recipe.sourceUrl}
              <div class="mt-8 pt-6 border-t border-gray-100">
                <a
                  href={recipe.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-orange-600 hover:text-orange-700 text-sm"
                >
                  Bekijk origineel recept
                </a>
              </div>
            {/if}
          </div>
        </div>
      </div>

      <div class="lg:col-span-1">
        <div class="bg-white rounded-2xl shadow-lg p-6 sticky top-6">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-semibold text-gray-800">Ingredienten</h2>
            <div class="flex items-center gap-2">
              <button
                onclick={decreaseServings}
                class="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                -
              </button>
              <span class="w-12 text-center font-medium">{servings}</span>
              <button
                onclick={increaseServings}
                class="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          <ul class="space-y-3 mb-6">
            {#each recipe.ingredients as ing}
              <li class="flex gap-3 text-gray-700">
                <span class="font-medium text-gray-900 shrink-0 w-20 text-right">
                  {formatAmount(ing.amount, ing.scalable)} {ing.unit || ''}
                </span>
                <span>{ing.name}</span>
              </li>
            {/each}
          </ul>

          <div class="space-y-3">
            <button
              onclick={copyIngredients}
              class="w-full py-3 px-4 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
            >
              {#if copied}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Gekopieerd!
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Kopieer ingredienten
              {/if}
            </button>

            <button
              onclick={logMeal}
              disabled={logging}
              class="w-full py-3 px-4 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {#if logSuccess}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                Toegevoegd!
              {:else if logging}
                <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              {:else}
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Dit heb ik gegeten
              {/if}
            </button>
          </div>

          {#if recipe.lastEaten}
            <p class="text-sm text-gray-500 mt-4 text-center">
              Laatst gegeten: {new Date(recipe.lastEaten).toLocaleDateString('nl-NL')}
            </p>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <div class="bg-white rounded-2xl shadow-lg p-12 text-center">
      <p class="text-gray-600">Recept niet gevonden</p>
    </div>
  {/if}
</div>
