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
3. Copy `.env.example` to `.env.local` and add the project URL, anon key, service-role key, a long random vote salt, and an `ADMIN_ACCESS_TOKEN`.
4. Add the same variables to the Vercel project settings.

The service-role key is used only in server routes. Never expose it with a `NEXT_PUBLIC_` prefix.

## Deploy to Vercel

Import the repository into Vercel. The framework is detected as Next.js; the standard `npm run build` command and `.next` output are used automatically. Set `NEXT_PUBLIC_SITE_URL` to the production URL, such as `https://your-project.vercel.app`.

## Data model

- `brands`: brand-level identity, parent-company context and duplicate matching
- `brand_assessments`: append-only cruelty-free assessment history
- `product_assessments`: append-only product-level vegan assessment history
- `evidence_sources`: source type, URL, access date, reviewer, scope and assessment linkage
- `products`: catalogue details, UPC/SKU, tags, rating and visual tokens
- `product_offers`: expected regional price, currency, country, availability and freshness timestamp
- `import_batches` and `import_rows`: dry-run reports, row validation, duplicate matching and import audit trail
- `product_votes`: one current vote per anonymous device hash
- `product_catalogue`: read-optimized view for regional search and filters
- `cast_product_vote`: service-role-only RPC used by `/api/votes`

Prices are presented as estimates because retailer inventory and pricing can change quickly.

## Catalogue imports

Use `/admin/imports` for CSV dry runs and confirmed imports. The admin API requires the `ADMIN_ACCESS_TOKEN` value when it is configured. Imported rows start as `pending_review`; approval happens in `/admin/products`.

Starter files live in `data/imports`:

- `kindr-import-template.csv`: blank canonical import template
- `kindr-canada-seed.csv`: Canada-first starter seed batch with conservative assessment states

Importer behavior:

- validates required columns, assessment states, source types, country/currency and price fields
- reports new and matched brands/products before import
- upserts brands, products and retailer offers idempotently
- appends brand cruelty-free and product vegan assessments instead of overwriting history
