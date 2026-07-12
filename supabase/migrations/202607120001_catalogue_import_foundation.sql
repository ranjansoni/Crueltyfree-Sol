create extension if not exists pgcrypto;

do $$ begin
  create type public.assessment_status as enum (
    'verified',
    'certified',
    'brand_claimed',
    'conflicting',
    'unverified',
    'no',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.source_type as enum (
    'certification',
    'brand_policy',
    'retailer_page',
    'third_party_database',
    'email',
    'packaging',
    'manual_review',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.review_status as enum (
    'draft',
    'pending_review',
    'approved',
    'rejected',
    'needs_more_info',
    'duplicate'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.availability_status as enum (
    'in_stock',
    'out_of_stock',
    'online_only',
    'in_store_only',
    'limited',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

create or replace function public.kindr_normalize_name(value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(value, ''))), '[^a-z0-9]+', '-', 'g'), '');
$$;

create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  parent_company text,
  normalized_parent_company text,
  country_origin text,
  website_url text,
  notes text,
  review_status public.review_status not null default 'pending_review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(normalized_name)
);

alter table public.products
  add column if not exists brand_id uuid references public.brands(id),
  add column if not exists normalized_name text,
  add column if not exists upc text,
  add column if not exists sku text,
  add column if not exists image_url text,
  add column if not exists review_status public.review_status not null default 'approved';

alter table public.product_offers
  add column if not exists normalized_store_name text,
  add column if not exists retailer_url text,
  add column if not exists sale_price numeric(10,2) check (sale_price is null or sale_price >= 0),
  add column if not exists availability_status public.availability_status not null default 'unknown',
  add column if not exists store_region text,
  add column if not exists sku text,
  add column if not exists retailer_product_id text,
  add column if not exists source_url text,
  add column if not exists review_status public.review_status not null default 'approved';

insert into public.brands (name, normalized_name, review_status)
select distinct p.brand, public.kindr_normalize_name(p.brand), 'approved'::public.review_status
from public.products p
where p.brand is not null
on conflict (normalized_name) do update set
  name = excluded.name,
  updated_at = now();

update public.products p
set
  brand_id = b.id,
  normalized_name = public.kindr_normalize_name(p.name)
from public.brands b
where p.brand_id is null
  and b.normalized_name = public.kindr_normalize_name(p.brand);

update public.products
set normalized_name = public.kindr_normalize_name(name)
where normalized_name is null;

update public.product_offers
set normalized_store_name = public.kindr_normalize_name(store_name)
where normalized_store_name is null;

create unique index if not exists products_brand_normalized_name_idx
  on public.products(brand_id, normalized_name)
  where brand_id is not null and normalized_name is not null;

create unique index if not exists products_upc_unique_idx
  on public.products(upc)
  where upc is not null and upc <> '';

create unique index if not exists products_brand_sku_unique_idx
  on public.products(brand_id, sku)
  where brand_id is not null and sku is not null and sku <> '';

create index if not exists products_review_status_idx on public.products(review_status);
create index if not exists brands_review_status_idx on public.brands(review_status);

create table if not exists public.brand_assessments (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  assessment_type text not null default 'cruelty_free',
  status public.assessment_status not null default 'unknown',
  geographic_scope text not null default 'unknown',
  summary text not null default '',
  reviewer text,
  reviewed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  superseded_by uuid references public.brand_assessments(id),
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.product_assessments (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  assessment_type text not null default 'vegan',
  status public.assessment_status not null default 'unknown',
  geographic_scope text not null default 'unknown',
  summary text not null default '',
  reviewer text,
  reviewed_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,
  superseded_by uuid references public.product_assessments(id),
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.evidence_sources (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('brand', 'product', 'offer')),
  entity_id text not null,
  brand_assessment_id uuid references public.brand_assessments(id) on delete set null,
  product_assessment_id uuid references public.product_assessments(id) on delete set null,
  source_type public.source_type not null default 'other',
  title text not null,
  url text,
  publisher text,
  accessed_at date not null default current_date,
  evidence_date date,
  geographic_scope text not null default 'unknown',
  quote_or_summary text not null default '',
  reviewer text,
  confidence_score numeric(4,2) check (confidence_score is null or confidence_score between 0 and 1),
  import_batch_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  source_label text,
  country_default text not null default 'CA',
  status text not null check (status in ('dry_run', 'imported', 'failed', 'partially_imported')) default 'dry_run',
  dry_run_report jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  valid_count integer not null default 0,
  warning_count integer not null default 0,
  error_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists public.import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_data jsonb not null,
  normalized_data jsonb not null default '{}'::jsonb,
  validation_status text not null check (validation_status in ('valid', 'warning', 'error', 'skipped')),
  validation_messages jsonb not null default '[]'::jsonb,
  matched_brand_id uuid,
  matched_product_id text,
  imported_brand_id uuid,
  imported_product_id text,
  created_at timestamptz not null default now()
);

create index if not exists brand_assessments_current_idx
  on public.brand_assessments(brand_id, assessment_type, created_at desc);

create index if not exists product_assessments_current_idx
  on public.product_assessments(product_id, assessment_type, created_at desc);

create index if not exists evidence_sources_entity_idx
  on public.evidence_sources(entity_type, entity_id);

create index if not exists product_offers_review_idx
  on public.product_offers(review_status, country_code, last_checked_at desc);

create or replace view public.current_brand_assessments as
select distinct on (brand_id, assessment_type)
  *
from public.brand_assessments
where superseded_by is null
order by brand_id, assessment_type, created_at desc;

create or replace view public.current_product_assessments as
select distinct on (product_id, assessment_type)
  *
from public.product_assessments
where superseded_by is null
order by product_id, assessment_type, created_at desc;

create or replace view public.admin_catalogue_review as
select
  p.id as product_id,
  p.name as product_name,
  p.normalized_name as normalized_product_name,
  p.category,
  p.subcategory,
  p.upc,
  p.sku,
  p.review_status as product_review_status,
  b.id as brand_id,
  coalesce(b.name, p.brand) as brand_name,
  b.normalized_name as normalized_brand_name,
  b.parent_company,
  b.review_status as brand_review_status,
  cba.status as brand_cruelty_free_status,
  cba.geographic_scope as brand_cruelty_free_scope,
  cba.verified_at as brand_verified_at,
  cba.expires_at as brand_review_expires_at,
  cpa.status as product_vegan_status,
  cpa.geographic_scope as product_vegan_scope,
  cpa.verified_at as product_verified_at,
  cpa.expires_at as product_review_expires_at,
  count(o.id) as offer_count,
  min(o.expected_price) as lowest_expected_price,
  min(o.currency) as currency,
  array_remove(array_agg(distinct o.store_name), null) as stores
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.current_brand_assessments cba on cba.brand_id = b.id and cba.assessment_type = 'cruelty_free'
left join public.current_product_assessments cpa on cpa.product_id = p.id and cpa.assessment_type = 'vegan'
left join public.product_offers o on o.product_id = p.id
group by
  p.id,
  b.id,
  cba.status,
  cba.geographic_scope,
  cba.verified_at,
  cba.expires_at,
  cpa.status,
  cpa.geographic_scope,
  cpa.verified_at,
  cpa.expires_at;

drop view if exists public.product_catalogue;

create view public.product_catalogue as
select
  p.*,
  coalesce(b.name, p.brand) as brand_display_name,
  b.parent_company,
  cba.status as brand_cruelty_free_status,
  cba.geographic_scope as brand_cruelty_free_scope,
  cba.expires_at as brand_review_expires_at,
  cpa.status as product_vegan_status,
  cpa.geographic_scope as product_vegan_scope,
  cpa.expires_at as product_review_expires_at,
  o.country_code,
  min(o.expected_price) as expected_price,
  min(o.currency) as currency,
  (array_agg(o.store_name order by o.priority, o.expected_price))[1:3] as stores,
  coalesce(v.community_score, 0) as community_score,
  to_tsvector('english', concat_ws(' ', coalesce(b.name, p.brand), p.name, p.category, p.subcategory, array_to_string(p.tags, ' '))) as search_document
from public.products p
left join public.brands b on b.id = p.brand_id
left join public.current_brand_assessments cba on cba.brand_id = b.id and cba.assessment_type = 'cruelty_free'
left join public.current_product_assessments cpa on cpa.product_id = p.id and cpa.assessment_type = 'vegan'
join public.product_offers o on o.product_id = p.id
left join (
  select product_id, sum(value)::integer as community_score
  from public.product_votes group by product_id
) v on v.product_id = p.id
where p.is_active
group by
  p.id,
  b.id,
  cba.status,
  cba.geographic_scope,
  cba.expires_at,
  cpa.status,
  cpa.geographic_scope,
  cpa.expires_at,
  o.country_code,
  v.community_score;

alter table public.brands enable row level security;
alter table public.brand_assessments enable row level security;
alter table public.product_assessments enable row level security;
alter table public.evidence_sources enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;

create policy "Brands are publicly readable" on public.brands for select using (true);
create policy "Current brand assessments are publicly readable" on public.brand_assessments for select using (true);
create policy "Current product assessments are publicly readable" on public.product_assessments for select using (true);
create policy "Evidence is publicly readable" on public.evidence_sources for select using (true);

grant select on public.brands to anon, authenticated;
grant select on public.brand_assessments to anon, authenticated;
grant select on public.product_assessments to anon, authenticated;
grant select on public.evidence_sources to anon, authenticated;
grant select on public.current_brand_assessments to anon, authenticated;
grant select on public.current_product_assessments to anon, authenticated;
grant select on public.admin_catalogue_review to service_role;

insert into public.brand_assessments (brand_id, status, geographic_scope, summary, reviewer, reviewed_at, verified_at, expires_at)
select b.id, 'unverified'::public.assessment_status, 'CA,US', 'Legacy seed record imported before source-level verification workflow.', 'system', now(), null, now() + interval '180 days'
from public.brands b
where not exists (
  select 1 from public.brand_assessments ba where ba.brand_id = b.id and ba.assessment_type = 'cruelty_free'
);

insert into public.product_assessments (product_id, status, geographic_scope, summary, reviewer, reviewed_at, verified_at, expires_at)
select p.id, 'unknown'::public.assessment_status, 'CA,US', 'Legacy seed record imported before product-level vegan verification workflow.', 'system', now(), null, now() + interval '180 days'
from public.products p
where not exists (
  select 1 from public.product_assessments pa where pa.product_id = p.id and pa.assessment_type = 'vegan'
);
