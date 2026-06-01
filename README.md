# Trade Trieu DK

Trading command center prototype for pre-market scanning, direct ticker lookup, a persistent Trading Focus watchlist, real Polygon market data, and cached OpenAI ticker analysis.

Live production deployment:

https://trade-trieu-dk.vercel.app

## Local Development

```bash
npm install
npm run api
npm run dev
```

Frontend: `http://127.0.0.1:5173`

API: `http://127.0.0.1:8787`

## Environment

Copy `.env.example` to `.env.local` and fill in:

- `POLYGON_API_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The Vercel production project has the server-side environment variables configured in Vercel.
