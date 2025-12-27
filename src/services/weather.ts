import type { WeatherSnapshot, WeatherTag, Season } from '../db/schema';

const API_KEY = process.env.OPENWEATHERMAP_API_KEY;
const UTRECHT_LAT = 52.0907;
const UTRECHT_LON = 5.1214;

// Cache to avoid hitting API limits (60 calls/min on free plan)
// Cache is date-aware - automatically clears at midnight
let weatherCache: { data: WeatherSnapshot; timestamp: number; date: string } | null = null;
let forecastCache: { data: ForecastDay[]; timestamp: number; date: string } | null = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Get local date in YYYY-MM-DD format (not UTC)
function getTodayString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface OpenWeatherResponse {
  main: {
    temp: number;
    feels_like: number;
    humidity: number;
  };
  weather: Array<{
    main: string;
    description: string;
    icon: string;
  }>;
  wind: {
    speed: number;
  };
}

export async function getCurrentWeather(): Promise<WeatherSnapshot> {
  const todayStr = getTodayString();

  // Return cached data if still valid and same day
  if (weatherCache &&
      weatherCache.date === todayStr &&
      Date.now() - weatherCache.timestamp < CACHE_DURATION) {
    return weatherCache.data;
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${UTRECHT_LAT}&lon=${UTRECHT_LON}&appid=${API_KEY}&units=metric&lang=nl`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data: OpenWeatherResponse = await response.json();

  const weather: WeatherSnapshot = {
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    condition: data.weather[0]?.main || 'Unknown',
    description: data.weather[0]?.description || '',
    humidity: data.main.humidity,
    windSpeed: Math.round(data.wind.speed * 3.6), // m/s to km/h
    icon: data.weather[0]?.icon || '01d',
  };

  // Update cache
  weatherCache = { data: weather, timestamp: Date.now(), date: todayStr };

  return weather;
}

export function getWeatherTags(weather: WeatherSnapshot): WeatherTag[] {
  const tags: WeatherTag[] = [];

  // Temperature based
  if (weather.temp < 10) tags.push('koud');
  if (weather.temp > 20) tags.push('warm');

  // Condition based
  const condition = weather.condition.toLowerCase();
  if (condition.includes('rain') || condition.includes('drizzle') || condition.includes('thunder')) {
    tags.push('regenachtig');
  }
  if (condition.includes('clear') || condition.includes('sun') || condition === 'clouds') {
    tags.push('zonnig');
  }

  return tags;
}

export function getCurrentSeason(): Season {
  const month = new Date().getMonth() + 1; // 1-12
  if (month >= 3 && month <= 5) return 'lente';
  if (month >= 6 && month <= 8) return 'zomer';
  if (month >= 9 && month <= 11) return 'herfst';
  return 'winter';
}

export function getWeatherDescription(weather: WeatherSnapshot): string {
  const tempDesc = weather.temp < 10 ? 'koud' : weather.temp > 20 ? 'warm' : 'aangenaam';
  return `${weather.temp}°C in Utrecht - ${weather.description} (${tempDesc})`;
}

interface ForecastDay {
  date: string;
  dayName: string;
  temp: number;
  icon: string;
  description: string;
  weatherTags: WeatherTag[];
}

export async function getWeekForecast(): Promise<ForecastDay[]> {
  const todayStr = getTodayString();

  // Return cached data if still valid and same day
  if (forecastCache &&
      forecastCache.date === todayStr &&
      Date.now() - forecastCache.timestamp < CACHE_DURATION) {
    return forecastCache.data;
  }

  const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${UTRECHT_LAT}&lon=${UTRECHT_LON}&appid=${API_KEY}&units=metric&lang=nl`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Weather API error: ${response.status}`);
  }

  const data = await response.json();
  const days: Map<string, ForecastDay> = new Map();
  const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

  // Group by date and take noon forecast for each day
  for (const item of data.list) {
    const date = item.dt_txt.split(' ')[0];
    const hour = parseInt(item.dt_txt.split(' ')[1].split(':')[0]);

    // Prefer 12:00 or 15:00 forecast for each day
    if (!days.has(date) || hour === 12 || hour === 15) {
      const d = new Date(date);
      const temp = Math.round(item.main.temp);
      const weatherTags: WeatherTag[] = [];

      if (temp < 10) weatherTags.push('koud');
      if (temp > 20) weatherTags.push('warm');

      const condition = item.weather[0]?.main?.toLowerCase() || '';
      if (condition.includes('rain') || condition.includes('drizzle')) {
        weatherTags.push('regenachtig');
      }
      if (condition.includes('clear') || condition.includes('sun')) {
        weatherTags.push('zonnig');
      }

      days.set(date, {
        date,
        dayName: dayNames[d.getDay()],
        temp,
        icon: item.weather[0]?.icon || '01d',
        description: item.weather[0]?.description || '',
        weatherTags,
      });
    }
  }

  const result = Array.from(days.values()).slice(0, 7);

  // Update cache with date for midnight auto-clear
  forecastCache = { data: result, timestamp: Date.now(), date: todayStr };

  return result;
}
