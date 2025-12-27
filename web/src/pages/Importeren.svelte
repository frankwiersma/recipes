<script lang="ts">
  import { link, push } from 'svelte-spa-router';
  import { api, type Recipe } from '../lib/api';

  let url = $state('');
  let category = $state('pasta');
  let loading = $state(false);
  let error = $state('');
  let importedRecipe: Recipe | null = $state(null);

  const categories = [
    { value: 'curry', label: 'Curry / Aziatisch' },
    { value: 'soep', label: 'Soep' },
    { value: 'pasta', label: 'Pasta' },
    { value: 'salade', label: 'Salade' },
    { value: 'pokebowl', label: 'Pokebowl' },
    { value: 'wraps', label: 'Wraps' },
    { value: 'plaattaart', label: 'Plaattaart' },
    { value: 'shakshuka', label: 'Shakshuka' },
  ];

  async function importRecipe() {
    if (!url.trim()) {
      error = 'Voer een URL in';
      return;
    }

    loading = true;
    error = '';
    importedRecipe = null;

    try {
      importedRecipe = await api.importFromUrl(url, category);
      url = '';
    } catch (e) {
      error = 'Kon recept niet importeren. Controleer de URL en probeer opnieuw.';
    }

    loading = false;
  }

  function viewRecipe() {
    if (importedRecipe) {
      push(`/recepten/${importedRecipe.id}`);
    }
  }

  function importAnother() {
    importedRecipe = null;
    url = '';
    error = '';
  }

  function onCategoryChange(e: Event) {
    category = (e.target as HTMLSelectElement).value;
  }
</script>

<div class="max-w-2xl mx-auto">
  <h1 class="text-3xl font-bold text-gray-800 mb-2">Recept Importeren</h1>
  <p class="text-gray-600 mb-8">
    Importeer recepten van je favoriete websites. We ondersteunen Picnic, AH, HelloFresh,
    leukerecepten.nl en andere sites met structured data.
  </p>

  {#if importedRecipe}
    <div class="bg-green-50 border border-green-200 rounded-2xl p-8 text-center">
      <div class="text-5xl mb-4">✅</div>
      <h2 class="text-xl font-semibold text-green-800 mb-2">Recept geimporteerd!</h2>
      <p class="text-green-700 mb-6">{importedRecipe.name}</p>
      <div class="flex gap-4 justify-center">
        <button
          onclick={viewRecipe}
          class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Bekijk recept
        </button>
        <button
          onclick={importAnother}
          class="bg-white text-green-700 px-6 py-2 rounded-lg border border-green-300 hover:bg-green-50 transition-colors"
        >
          Nog een importeren
        </button>
      </div>
    </div>
  {:else}
    <div class="bg-white rounded-2xl shadow-lg p-8">
      <div class="space-y-6">
        <div>
          <label for="url" class="block text-sm font-medium text-gray-700 mb-2">
            Recept URL
          </label>
          <input
            id="url"
            type="url"
            bind:value={url}
            placeholder="https://www.picnic.app/nl/recepten/..."
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        <div>
          <label for="category" class="block text-sm font-medium text-gray-700 mb-2">
            Categorie
          </label>
          <select
            id="category"
            value={category}
            onchange={onCategoryChange}
            class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
            disabled={loading}
          >
            {#each categories as cat}
              <option value={cat.value}>{cat.label}</option>
            {/each}
          </select>
        </div>

        {#if error}
          <div class="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        {/if}

        <button
          onclick={importRecipe}
          disabled={loading || !url.trim()}
          class="w-full py-3 px-6 bg-orange-500 text-white rounded-xl font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {#if loading}
            <div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Importeren...
          {:else}
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importeer recept
          {/if}
        </button>
      </div>
    </div>

    <div class="mt-8 bg-gray-50 rounded-xl p-6">
      <h3 class="font-semibold text-gray-800 mb-4">Ondersteunde websites</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          Picnic
        </div>
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          Albert Heijn
        </div>
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          HelloFresh
        </div>
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          Leuke Recepten
        </div>
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          Oh My Foodness
        </div>
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-green-500 rounded-full"></span>
          Uit Pauline's Keuken
        </div>
      </div>
      <p class="text-xs text-gray-500 mt-4">
        En alle andere websites met Recipe schema.org structured data
      </p>
    </div>
  {/if}
</div>
