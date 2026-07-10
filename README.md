# Kindr

Kindr is a Canada-first catalogue for finding affordable cruelty-free alternatives, with regional pricing, likely retailers, community voting, filters, and native social sharing. The interface also supports a United States geography switch.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

The app works without environment variables using the curated demo catalogue. Votes become durable when Supabase is connected.

## Connect Supabase

1. Create a free Supabase project.
2. Run `supabase/migrations/202607090001_kindr_catalogue.sql` in the SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL, anon key, service-role key, and a long random vote salt.
4. Add the same variables to the Vercel project settings.

The service-role key is used only in server routes. Never expose it with a `NEXT_PUBLIC_` prefix.

## Deploy to Vercel

Import the repository into Vercel. The framework is detected as Next.js; the standard `npm run build` command and `.next` output are used automatically. Set `NEXT_PUBLIC_SITE_URL` to the production URL, such as `https://your-project.vercel.app`.

## Data model

- `products`: catalogue details, certifications, tags, rating and visual tokens
- `product_offers`: expected regional price, currency, likely retailer and freshness timestamp
- `product_votes`: one current vote per anonymous device hash
- `product_catalogue`: read-optimized view for regional search and filters
- `cast_product_vote`: service-role-only RPC used by `/api/votes`

Prices are presented as estimates because retailer inventory and pricing can change quickly.
