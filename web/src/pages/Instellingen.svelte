<script lang="ts">
  import { onMount } from 'svelte';

  let emailEnabled = $state(false);
  let emailAddress = $state('');
  let emailTime = $state('07:00');
  let location = $state('Utrecht');
  let saving = $state(false);
  let saved = $state(false);

  onMount(() => {
    // Load settings from localStorage
    const settings = localStorage.getItem('recepten-settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      emailEnabled = parsed.emailEnabled ?? false;
      emailAddress = parsed.emailAddress ?? '';
      emailTime = parsed.emailTime ?? '07:00';
      location = parsed.location ?? 'Utrecht';
    }
  });

  async function saveSettings() {
    saving = true;

    // Save to localStorage
    localStorage.setItem('recepten-settings', JSON.stringify({
      emailEnabled,
      emailAddress,
      emailTime,
      location,
    }));

    // TODO: Save to backend when email functionality is implemented

    await new Promise(r => setTimeout(r, 500));
    saving = false;
    saved = true;
    setTimeout(() => saved = false, 2000);
  }

  async function clearWeekPlan() {
    if (confirm('Weet je zeker dat je de weekplanning wilt resetten?')) {
      try {
        // TODO: Add backend endpoint to clear week plan
        alert('Weekplanning gereset! Refresh de pagina.');
      } catch (e) {
        console.error('Kon weekplan niet resetten:', e);
      }
    }
  }

  async function clearHistory() {
    if (confirm('Weet je zeker dat je alle eetgeschiedenis wilt verwijderen?')) {
      alert('Deze functie is nog niet beschikbaar.');
    }
  }
</script>

<div class="max-w-2xl mx-auto">
  <h1 class="text-2xl font-bold text-gray-800 mb-6">Instellingen</h1>

  <div class="space-y-6">
    <!-- Email notifications -->
    <div class="bg-white rounded-xl shadow p-6">
      <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Email notificaties
      </h2>

      <div class="space-y-4">
        <label class="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            bind:checked={emailEnabled}
            class="w-5 h-5 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          <span class="text-gray-700">Dagelijkse suggestie per email</span>
        </label>

        {#if emailEnabled}
          <div class="pl-8 space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Email adres</label>
              <input
                type="email"
                bind:value={emailAddress}
                placeholder="jouw@email.nl"
                class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-600 mb-1">Verzendtijd</label>
              <input
                type="time"
                bind:value={emailTime}
                class="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
          </div>
        {/if}
      </div>
    </div>

    <!-- Location -->
    <div class="bg-white rounded-xl shadow p-6">
      <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Locatie
      </h2>

      <div>
        <label class="block text-sm font-medium text-gray-600 mb-1">Stad voor weersvoorspelling</label>
        <input
          type="text"
          bind:value={location}
          placeholder="Utrecht"
          class="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
        />
        <p class="text-xs text-gray-500 mt-1">Wordt gebruikt voor weer-gebaseerde suggesties</p>
      </div>
    </div>

    <!-- Data management -->
    <div class="bg-white rounded-xl shadow p-6">
      <h2 class="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
        </svg>
        Data beheer
      </h2>

      <div class="space-y-3">
        <button
          onclick={clearWeekPlan}
          class="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-between"
        >
          <div>
            <span class="font-medium text-gray-700">Reset weekplanning</span>
            <p class="text-xs text-gray-500">Genereer nieuwe suggesties voor alle dagen</p>
          </div>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onclick={clearHistory}
          class="w-full text-left px-4 py-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-between"
        >
          <div>
            <span class="font-medium text-red-600">Wis eetgeschiedenis</span>
            <p class="text-xs text-gray-500">Verwijder alle opgeslagen maaltijden</p>
          </div>
          <svg class="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Save button -->
    <div class="flex justify-end gap-3">
      {#if saved}
        <span class="text-green-600 text-sm flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          Opgeslagen
        </span>
      {/if}
      <button
        onclick={saveSettings}
        disabled={saving}
        class="bg-orange-500 text-white px-6 py-2 rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
      >
        {saving ? 'Opslaan...' : 'Opslaan'}
      </button>
    </div>
  </div>
</div>
