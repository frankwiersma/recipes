<script lang="ts">
  import { link, push } from 'svelte-spa-router';
  import { api, type Recipe } from '../lib/api';

  let url = $state('');
  let caption = $state('');
  let category = $state('');
  let loading = $state(false);
  let error = $state('');
  let importedRecipe: Recipe | null = $state(null);
  let mode: 'url' | 'instagram' = $state('url');

  const categories = [
    { value: '', label: 'Automatisch detecteren' },
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
    loading = true;
    error = '';
    importedRecipe = null;

    try {
      if (mode === 'instagram') {
        if (!caption.trim()) {
          error = 'Plak de Instagram caption tekst';
          loading = false;
          return;
        }
        // Import from Instagram caption
        const response = await fetch(`${api.baseUrl}/recipes/import/instagram`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caption: caption.trim(),
            url: url.trim() || undefined,
            category: category || undefined
          }),
        });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Import failed');
        }
        importedRecipe = await response.json();
        caption = '';
        url = '';
      } else {
        if (!url.trim()) {
          error = 'Voer een URL in';
          loading = false;
          return;
        }
        importedRecipe = await api.importFromUrl(url, category || undefined);
        url = '';
      }
    } catch (e: any) {
      error = e.message || 'Kon recept niet importeren. Controleer de invoer en probeer opnieuw.';
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
    caption = '';
    error = '';
  }

  function onCategoryChange(e: Event) {
    category = (e.target as HTMLSelectElement).value;
  }

  function setMode(newMode: 'url' | 'instagram') {
    mode = newMode;
    error = '';
  }
</script>

<div class="max-w-2xl mx-auto">
  <h1 class="text-3xl font-bold text-gray-800 mb-2">Recept Importeren</h1>
  <p class="text-gray-600 mb-8">
    Importeer recepten van je favoriete websites en Instagram. De categorie wordt automatisch gedetecteerd.
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
      <!-- Mode tabs -->
      <div class="flex gap-2 mb-6">
        <button
          onclick={() => setMode('url')}
          class="flex-1 py-2 px-4 rounded-lg font-medium transition-colors {mode === 'url' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        >
          Website URL
        </button>
        <button
          onclick={() => setMode('instagram')}
          class="flex-1 py-2 px-4 rounded-lg font-medium transition-colors {mode === 'instagram' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
        >
          Instagram
        </button>
      </div>

      <div class="space-y-6">
        {#if mode === 'url'}
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
        {:else}
          <div>
            <label for="caption" class="block text-sm font-medium text-gray-700 mb-2">
              Instagram Caption
            </label>
            <textarea
              id="caption"
              bind:value={caption}
              placeholder="Plak hier de tekst van de Instagram post...

Bijvoorbeeld:
Easy creamy prawn pasta
Ingrediënten 2 personen
1 uitje
2 tenen knoflook
..."
              rows="8"
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none"
              disabled={loading}
            ></textarea>
            <p class="text-xs text-gray-500 mt-2">
              Tip: Open de Instagram post, selecteer de hele caption tekst en kopieer deze hier.
            </p>
          </div>
          <div>
            <label for="instagram-url" class="block text-sm font-medium text-gray-700 mb-2">
              Instagram URL <span class="text-gray-400">(optioneel)</span>
            </label>
            <input
              id="instagram-url"
              type="url"
              bind:value={url}
              placeholder="https://www.instagram.com/p/..."
              class="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
        {/if}

        <div>
          <label for="category" class="block text-sm font-medium text-gray-700 mb-2">
            Categorie <span class="text-gray-400">(optioneel)</span>
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
          disabled={loading || (mode === 'url' ? !url.trim() : !caption.trim())}
          class="w-full py-3 px-6 {mode === 'instagram' ? 'bg-pink-500 hover:bg-pink-600' : 'bg-orange-500 hover:bg-orange-600'} text-white rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
      <h3 class="font-semibold text-gray-800 mb-4">Ondersteunde bronnen</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
        <div class="flex items-center gap-2 text-gray-600">
          <span class="w-2 h-2 bg-pink-500 rounded-full"></span>
          Instagram
        </div>
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
      </div>
      <p class="text-xs text-gray-500 mt-4">
        Instagram recepten worden automatisch geanalyseerd met AI. Andere websites met Recipe schema.org structured data worden ook ondersteund.
      </p>
    </div>
  {/if}
</div>
