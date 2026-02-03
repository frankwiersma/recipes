<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { link } from 'svelte-spa-router';

  interface ShoppingItem {
    name: string;
    displayName: string;
    amount: number | null;
    unit: string | null;
    category: string;
    sources: Array<{ recipeName: string; recipeId: number; amount: number | null; unit: string | null }>;
  }

  interface RecipeInPlan {
    id: number;
    name: string;
    date: string;
    servings: number;
  }

  interface ShoppingListData {
    items: ShoppingItem[];
    grouped: Record<string, ShoppingItem[]>;
    recipes: RecipeInPlan[];
    generatedAt: string;
  }

  let data: ShoppingListData | null = $state(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let checkedItems = $state<Set<string>>(new Set());
  let copied = $state(false);
  let showSources = $state<string | null>(null);
  let refreshInterval: ReturnType<typeof setInterval>;

  const STORAGE_KEY = 'shopping-list-checked';

  // Category emoji
  const categoryEmoji: Record<string, string> = {
    'Groente & Fruit': '🥬',
    'Zuivel & Eieren': '🥛',
    'Vlees & Vis': '🥩',
    'Pasta, Rijst & Granen': '🍝',
    'Conserven & Sauzen': '🥫',
    'Kruiden & Specerijen': '🧂',
    'Noten & Zaden': '🥜',
    'Olie & Azijn': '🫒',
    'Overig': '📦',
  };

  // Load checked items from localStorage
  function loadCheckedItems() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Check if saved data is from today
        const today = new Date().toDateString();
        if (parsed.date === today) {
          checkedItems = new Set(parsed.items);
        } else {
          // Clear old data
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Error loading checked items:', e);
    }
  }

  // Save checked items to localStorage
  function saveCheckedItems() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        date: new Date().toDateString(),
        items: Array.from(checkedItems),
      }));
    } catch (e) {
      console.error('Error saving checked items:', e);
    }
  }

  // Toggle item checked state
  function toggleItem(itemName: string) {
    if (checkedItems.has(itemName)) {
      checkedItems.delete(itemName);
    } else {
      checkedItems.add(itemName);
    }
    checkedItems = new Set(checkedItems); // Trigger reactivity
    saveCheckedItems();
  }

  // Clear all checked items
  function clearChecked() {
    checkedItems = new Set();
    saveCheckedItems();
  }

  // Load shopping list
  async function loadShoppingList() {
    try {
      const res = await fetch('/api/shopping');
      if (!res.ok) throw new Error('Kon boodschappenlijst niet laden');
      data = await res.json();
      error = null;
    } catch (e) {
      error = `${e}`;
      console.error('Error loading shopping list:', e);
    }
    loading = false;
  }

  // Copy to clipboard
  async function copyToClipboard() {
    if (!data) return;

    const lines: string[] = [];
    lines.push('🛒 Boodschappenlijst\n');

    for (const [category, items] of Object.entries(data.grouped)) {
      const emoji = categoryEmoji[category] || '📦';
      lines.push(`${emoji} ${category}`);
      for (const item of items) {
        const amount = item.amount ? `${item.amount}${item.unit ? ' ' + item.unit : ''}` : '';
        const checked = checkedItems.has(item.name) ? '✓ ' : '☐ ';
        lines.push(`${checked}${amount ? amount + ' ' : ''}${item.displayName}`);
      }
      lines.push('');
    }

    lines.push('---');
    lines.push(`Recepten: ${data.recipes.map(r => r.name).join(', ')}`);

    await navigator.clipboard.writeText(lines.join('\n'));
    copied = true;
    setTimeout(() => copied = false, 2000);
  }

  // Format date
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const days = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
    return days[date.getDay()];
  }

  // Calculate progress
  let progress = $derived(() => {
    if (!data) return { checked: 0, total: 0, percent: 0 };
    const total = data.items.length;
    const checked = data.items.filter(i => checkedItems.has(i.name)).length;
    return {
      checked,
      total,
      percent: total > 0 ? Math.round((checked / total) * 100) : 0,
    };
  });

  onMount(() => {
    loadCheckedItems();
    loadShoppingList();

    // Auto-refresh every 30 seconds to pick up week plan changes
    refreshInterval = setInterval(loadShoppingList, 30000);
  });

  onDestroy(() => {
    if (refreshInterval) clearInterval(refreshInterval);
  });
</script>

<div class="max-w-2xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h1 class="text-2xl font-bold text-gray-800">🛒 Boodschappen</h1>
      {#if data}
        <p class="text-sm text-gray-500">{data.recipes.length} recepten deze week</p>
      {/if}
    </div>
    <div class="flex gap-2">
      {#if progress().checked > 0}
        <button
          onclick={clearChecked}
          class="px-3 py-2 text-sm text-gray-600 hover:text-red-600 transition-colors"
        >
          Wis ✓
        </button>
      {/if}
      <button
        onclick={copyToClipboard}
        disabled={!data}
        class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        {#if copied}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Gekopieerd!
        {:else}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Kopieer
        {/if}
      </button>
    </div>
  </div>

  <!-- Progress bar -->
  {#if data && data.items.length > 0}
    <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-gray-600">Voortgang</span>
        <span class="text-sm font-medium text-gray-800">{progress().checked} / {progress().total}</span>
      </div>
      <div class="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          class="h-full bg-green-500 transition-all duration-300"
          style="width: {progress().percent}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Recipes in plan -->
  {#if data && data.recipes.length > 0}
    <div class="bg-white rounded-xl shadow-sm p-4 mb-6">
      <h2 class="text-sm font-medium text-gray-700 mb-3">Recepten deze week</h2>
      <div class="flex flex-wrap gap-2">
        {#each data.recipes as recipe}
          <a
            href="/recepten/{recipe.id}"
            use:link
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-full text-sm transition-colors"
          >
            <span class="text-xs text-orange-500 font-medium">{formatDate(recipe.date)}</span>
            <span>{recipe.name}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Loading -->
  {#if loading}
    <div class="bg-white rounded-xl shadow-sm p-12 text-center">
      <div class="animate-spin w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
      <p class="text-gray-500 mt-4">Boodschappenlijst laden...</p>
    </div>
  
  <!-- Error -->
  {:else if error}
    <div class="bg-white rounded-xl shadow-sm p-8 text-center">
      <p class="text-red-500 mb-4">{error}</p>
      <button
        onclick={loadShoppingList}
        class="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
      >
        Probeer opnieuw
      </button>
    </div>

  <!-- Empty state -->
  {:else if !data || data.items.length === 0}
    <div class="bg-white rounded-xl shadow-sm p-12 text-center">
      <div class="text-5xl mb-4">🛒</div>
      <h2 class="text-xl font-semibold text-gray-800 mb-2">Geen boodschappen</h2>
      <p class="text-gray-500 mb-6">Plan eerst recepten in je weekplanning</p>
      <a
        href="/week"
        use:link
        class="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        Naar weekplanning
      </a>
    </div>

  <!-- Shopping list -->
  {:else}
    <div class="space-y-6">
      {#each Object.entries(data.grouped) as [category, items]}
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <!-- Category header -->
          <div class="bg-gray-50 px-4 py-3 border-b border-gray-100">
            <h2 class="font-semibold text-gray-800 flex items-center gap-2">
              <span>{categoryEmoji[category] || '📦'}</span>
              <span>{category}</span>
              <span class="text-sm font-normal text-gray-500">({items.length})</span>
            </h2>
          </div>

          <!-- Items -->
          <ul class="divide-y divide-gray-50">
            {#each items as item}
              {@const isChecked = checkedItems.has(item.name)}
              <li class="relative">
                <button
                  onclick={() => toggleItem(item.name)}
                  class="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                >
                  <!-- Checkbox -->
                  <div class="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
                    {isChecked ? 'bg-green-500 border-green-500' : 'border-gray-300'}">
                    {#if isChecked}
                      <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                      </svg>
                    {/if}
                  </div>

                  <!-- Amount & Name -->
                  <div class="flex-1 min-w-0">
                    <span class="{isChecked ? 'line-through text-gray-400' : 'text-gray-800'}">
                      {#if item.amount}
                        <span class="font-medium">{item.amount}{item.unit ? ' ' + item.unit : ''}</span>
                      {/if}
                      {item.displayName}
                    </span>
                  </div>

                  <!-- Source indicator -->
                  {#if item.sources.length > 1}
                    <span class="shrink-0 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {item.sources.length}x
                    </span>
                  {/if}
                </button>

                <!-- Sources tooltip on hover -->
                {#if item.sources.length > 0}
                  <button
                    onclick={(e) => { e.stopPropagation(); showSources = showSources === item.name ? null : item.name; }}
                    class="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600"
                    title="Bekijk recepten"
                  >
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </button>
                {/if}

                <!-- Sources dropdown -->
                {#if showSources === item.name}
                  <div class="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-2 min-w-48">
                    <p class="text-xs text-gray-500 px-2 pb-1 border-b border-gray-100 mb-1">Gebruikt in:</p>
                    {#each item.sources as source}
                      <a
                        href="/recepten/{source.recipeId}"
                        use:link
                        onclick={() => showSources = null}
                        class="block px-2 py-1 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 rounded"
                      >
                        {source.recipeName}
                        {#if source.amount}
                          <span class="text-gray-400 text-xs">({source.amount}{source.unit ? ' ' + source.unit : ''})</span>
                        {/if}
                      </a>
                    {/each}
                  </div>
                {/if}
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Click outside to close sources dropdown -->
{#if showSources}
  <div
    class="fixed inset-0 z-0"
    onclick={() => showSources = null}
    onkeydown={(e) => e.key === 'Escape' && (showSources = null)}
    role="button"
    tabindex="-1"
  ></div>
{/if}
