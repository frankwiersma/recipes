import { Resend } from 'resend';
import type { WeatherSnapshot } from '../db/schema';

const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailSuggestion {
  recipe: {
    id: number;
    name: string;
    description: string | null;
    imageUrl: string | null;
    category: string;
    prepTimeMinutes: number | null;
  };
  weather: WeatherSnapshot;
  breakdown: {
    seasonScore: number;
    weatherScore: number;
    recencyScore: number;
  };
}

function generateReasonText(breakdown: EmailSuggestion['breakdown'], weather: WeatherSnapshot): string {
  const reasons: string[] = [];

  if (weather.temp < 10) {
    reasons.push(`Het is ${weather.temp}°C buiten - perfect voor iets warms!`);
  } else if (weather.temp > 20) {
    reasons.push(`Het is ${weather.temp}°C - lekker weer voor iets fris!`);
  } else {
    reasons.push(`Het is ${weather.temp}°C in Utrecht.`);
  }

  if (breakdown.recencyScore >= 30) {
    reasons.push('Je hebt dit al een tijdje niet gegeten.');
  }

  if (breakdown.seasonScore >= 25) {
    reasons.push('Perfect voor dit seizoen!');
  }

  return reasons.join(' ');
}

export async function sendDailySuggestionEmail(suggestion: EmailSuggestion): Promise<void> {
  const { recipe, weather, breakdown } = suggestion;
  const reasonText = generateReasonText(breakdown, weather);

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 0 auto;
      padding: 0;
      background-color: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: white;
      padding: 24px;
      text-align: center;
      border-radius: 0 0 16px 16px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 600;
    }
    .content {
      padding: 24px;
      background: white;
      margin: 16px;
      border-radius: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .recipe-image {
      width: 100%;
      border-radius: 12px;
      margin-bottom: 16px;
    }
    .recipe-name {
      font-size: 22px;
      font-weight: 700;
      color: #1f2937;
      margin: 0 0 8px 0;
    }
    .recipe-category {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 16px;
    }
    .reason-box {
      background: #f8fafc;
      padding: 16px;
      border-radius: 12px;
      margin: 16px 0;
      border-left: 4px solid #f97316;
    }
    .reason-box p {
      margin: 0;
      color: #475569;
      line-height: 1.6;
    }
    .weather-info {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #64748b;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .btn {
      display: inline-block;
      padding: 14px 28px;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      margin-right: 8px;
      margin-bottom: 8px;
    }
    .btn-primary {
      background: linear-gradient(135deg, #f97316, #ea580c);
      color: white;
    }
    .btn-secondary {
      background: white;
      border: 2px solid #f97316;
      color: #f97316;
    }
    .footer {
      text-align: center;
      padding: 24px;
      color: #9ca3af;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🍽️ Vandaag's Recept</h1>
  </div>

  <div class="content">
    ${recipe.imageUrl ? `<img src="${recipe.imageUrl}" alt="${recipe.name}" class="recipe-image">` : ''}

    <h2 class="recipe-name">${recipe.name}</h2>
    <span class="recipe-category">${recipe.category}</span>

    <div class="weather-info">
      ☀️ ${weather.temp}°C in Utrecht - ${weather.description}
    </div>

    <div class="reason-box">
      <p><strong>Waarom dit recept?</strong><br>${reasonText}</p>
    </div>

    ${recipe.description ? `<p style="color: #475569; line-height: 1.6;">${recipe.description}</p>` : ''}

    ${recipe.prepTimeMinutes ? `<p style="color: #64748b; font-size: 14px;">⏱️ ${recipe.prepTimeMinutes} minuten bereiden</p>` : ''}

    <div style="margin-top: 24px;">
      <a href="${appUrl}/recepten/${recipe.id}" class="btn btn-primary">Bekijk Recept</a>
      <a href="${appUrl}" class="btn btn-secondary">Ander Recept</a>
    </div>
  </div>

  <div class="footer">
    <p>Recepten App - Dagelijkse suggestie<br>
    Afmelden? Neem contact op.</p>
  </div>
</body>
</html>
`;

  await resend.emails.send({
    from: 'Recepten <recepten@co-evolve.nl>',
    to: process.env.NOTIFICATION_EMAIL!,
    subject: `Vandaag: ${recipe.name}`,
    html,
  });
}
