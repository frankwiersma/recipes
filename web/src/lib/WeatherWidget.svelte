<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './api';

  let weather: { temp: number; description: string; icon?: string } | null = $state(null);
  let loading = $state(true);

  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
  const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  const now = new Date();
  const dayName = dayNames[now.getDay()];
  const dateStr = `${now.getDate()} ${monthNames[now.getMonth()]}`;

  function getSeason(): string {
    const month = now.getMonth() + 1;
    if (month >= 3 && month <= 5) return 'lente';
    if (month >= 6 && month <= 8) return 'zomer';
    if (month >= 9 && month <= 11) return 'herfst';
    return 'winter';
  }

  const season = getSeason();
  const seasonEmoji: Record<string, string> = {
    'lente': '🌷', 'zomer': '☀️', 'herfst': '🍂', 'winter': '❄️'
  };

  onMount(async () => {
    try {
      weather = await api.getWeather();
    } catch (e) {
      console.error('Could not load weather', e);
    }
    loading = false;
  });

  function getWeatherEmoji(icon?: string): string {
    if (!icon) return '🌤️';
    if (icon.includes('01')) return '☀️';
    if (icon.includes('02') || icon.includes('03') || icon.includes('04')) return '☁️';
    if (icon.includes('09') || icon.includes('10')) return '🌧️';
    if (icon.includes('11')) return '⛈️';
    if (icon.includes('13')) return '❄️';
    if (icon.includes('50')) return '🌫️';
    return '🌤️';
  }
</script>

{#if loading}
  <div class="bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl p-3 text-white animate-pulse">
    <div class="h-6 bg-white/20 rounded w-32"></div>
  </div>
{:else if weather}
  <div class="bg-gradient-to-r from-blue-400 to-blue-500 rounded-xl p-3 text-white flex items-center gap-4">
    <div class="flex items-center gap-2">
      <span class="text-2xl">{getWeatherEmoji(weather.icon)}</span>
      <div class="text-2xl font-bold">{Math.round(weather.temp)}°</div>
    </div>
    <div class="text-sm">
      <p class="capitalize">{weather.description}</p>
      <p class="text-blue-100">Utrecht</p>
    </div>
    <div class="border-l border-white/30 pl-4 text-sm">
      <p class="font-semibold capitalize">{dayName} {dateStr}</p>
      <p class="text-blue-100">{seasonEmoji[season]} {season}</p>
    </div>
  </div>
{/if}
