# Recepten App

A Dutch recipe web application with smart meal suggestions based on weather and season.

## Features

- Recipe management with categories (curry, soep, pasta, salade, pokebowl, wraps, plaattaart, shakshuka)
- Weather-based meal suggestions using OpenWeatherMap API
- Season-aware recipe recommendations
- Weekly meal planning with weather forecast
- Recipe import from various Dutch recipe sites (Albert Heijn, HelloFresh, Picnic, Leuke Recepten, etc.)
- Ingredient scaling for different serving sizes
- Meal history tracking
- Mobile-friendly responsive design

## Tech Stack

**Backend:**
- [Bun](https://bun.sh/) - Fast JavaScript runtime
- [Hono](https://hono.dev/) - Lightweight web framework
- [Drizzle ORM](https://orm.drizzle.team/) - TypeScript ORM
- SQLite - Database

**Frontend:**
- [Svelte 5](https://svelte.dev/) - Reactive UI framework
- [Tailwind CSS v4](https://tailwindcss.com/) - Utility-first CSS

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later
- [OpenWeatherMap API key](https://openweathermap.org/api) (free tier works)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/recipes.git
cd recipes
```

2. Install dependencies:
```bash
bun install
cd web && bun install && cd ..
```

3. Copy the environment file and add your API keys:
```bash
cp .env.example .env
```

4. Edit `.env` with your OpenWeatherMap API key.

5. Start the development server:
```bash
bun run src/index.ts
```

6. In a separate terminal, start the frontend:
```bash
cd web
bun run dev
```

7. Open http://localhost:5173 in your browser.

## Project Structure

```
recipes/
├── src/
│   ├── index.ts           # Main server entry point
│   ├── api/               # API routes
│   │   ├── recipes.ts     # Recipe CRUD
│   │   ├── suggestions.ts # Meal suggestions
│   │   ├── history.ts     # Meal history
│   │   └── tags.ts        # Tag management
│   ├── db/                # Database
│   │   ├── index.ts       # Database connection
│   │   ├── schema.ts      # Drizzle schema
│   │   └── seed.ts        # Initial data
│   └── services/          # Business logic
│       ├── scraper.ts     # Recipe scraping
│       ├── parser.ts      # Ingredient parsing
│       ├── weather.ts     # Weather API
│       └── suggestion.ts  # Suggestion algorithm
├── web/                   # Svelte frontend
│   └── src/
│       ├── pages/         # Page components
│       └── lib/           # Shared components
├── data/                  # SQLite database (gitignored)
└── raw-note.md           # Initial recipe data
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recipes` | List all recipes |
| GET | `/api/recipes/:id` | Get single recipe |
| POST | `/api/recipes` | Create recipe |
| PUT | `/api/recipes/:id` | Update recipe |
| DELETE | `/api/recipes/:id` | Delete recipe |
| POST | `/api/recipes/import/url` | Import from URL |
| POST | `/api/recipes/:id/rescrape` | Re-scrape from source |
| GET | `/api/suggestions/today` | Today's suggestion |
| POST | `/api/suggestions/generate` | Generate new suggestion |
| GET | `/api/weekplan` | Week meal plan |
| GET | `/api/history` | Meal history |
| POST | `/api/history` | Log a meal |
| GET | `/api/weather` | Current weather |

## Recipe Sources

The scraper supports:
- **JSON-LD Recipe schema** - Most Dutch recipe sites (AH, HelloFresh, Leuke Recepten, etc.)
- **Picnic** - Custom scraper for embedded Next.js data

## Suggestion Algorithm

Recipes are scored based on:
- **Season match** (0-30 points) - Current season alignment
- **Weather match** (0-30 points) - Weather condition matching
- **Recency** (0-40 points) - Days since last eaten

## License

MIT
