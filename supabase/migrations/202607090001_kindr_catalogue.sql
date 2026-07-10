create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  brand text not null,
  name text not null,
  category text not null,
  subcategory text not null,
  description text not null default '',
  badges text[] not null default '{}',
  certifications text[] not null default '{}',
  tags text[] not null default '{}',
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  colour text not null default '#dcead7',
  accent text not null default '#416547',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_offers (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  country_code text not null check (country_code in ('CA', 'US')),
  currency text not null check (currency in ('CAD', 'USD')),
  expected_price numeric(10,2) not null check (expected_price >= 0),
  store_name text not null,
  store_url text,
  priority smallint not null default 1,
  last_checked_at timestamptz not null default now(),
  unique(product_id, country_code, store_name)
);

create table if not exists public.product_votes (
  product_id text not null references public.products(id) on delete cascade,
  voter_hash text not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, voter_hash)
);

create index if not exists product_offers_lookup_idx on public.product_offers(country_code, expected_price);
create index if not exists products_category_idx on public.products(category) where is_active;
create index if not exists products_tags_idx on public.products using gin(tags);

create or replace function public.cast_product_vote(p_product_id text, p_voter_hash text, p_value smallint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare result integer;
begin
  if p_value = 0 then
    delete from public.product_votes where product_id = p_product_id and voter_hash = p_voter_hash;
  else
    insert into public.product_votes(product_id, voter_hash, value)
    values (p_product_id, p_voter_hash, p_value)
    on conflict (product_id, voter_hash) do update set value = excluded.value, updated_at = now();
  end if;
  select coalesce(sum(value), 0)::integer into result from public.product_votes where product_id = p_product_id;
  return result;
end;
$$;

create or replace view public.product_catalogue as
select
  p.*,
  o.country_code,
  min(o.expected_price) as expected_price,
  min(o.currency) as currency,
  (array_agg(o.store_name order by o.priority, o.expected_price))[1:3] as stores,
  coalesce(v.community_score, 0) as community_score,
  to_tsvector('english', concat_ws(' ', p.brand, p.name, p.category, p.subcategory, array_to_string(p.tags, ' '))) as search_document
from public.products p
join public.product_offers o on o.product_id = p.id
left join (
  select product_id, sum(value)::integer as community_score
  from public.product_votes group by product_id
) v on v.product_id = p.id
group by p.id, o.country_code, v.community_score;

alter table public.products enable row level security;
alter table public.product_offers enable row level security;
alter table public.product_votes enable row level security;
create policy "Catalogue is publicly readable" on public.products for select using (is_active);
create policy "Offers are publicly readable" on public.product_offers for select using (true);
revoke all on public.product_votes from anon, authenticated;
grant select on public.product_catalogue to anon, authenticated;
grant execute on function public.cast_product_vote(text, text, smallint) to service_role;

insert into public.products (id, brand, name, category, subcategory, description, badges, certifications, tags, rating, review_count, colour, accent)
values
  ('attitude-shampoo', 'ATTITUDE', 'Super Leaves Volume Shampoo', 'Hair care', 'Shampoo', 'A gentle, vegan volumizing shampoo made in Canada with a light citrus finish.', array['Best value','Made in Canada'], array['PETA','EWG Verified'], array['shampoo','hair','volume','vegan','canadian','drugstore'], 4.7, 184, '#dcead7', '#416547'),
  ('elf-mascara', 'e.l.f.', 'Lash ''N Roll Mascara', 'Makeup', 'Mascara', 'An affordable vegan mascara with a curved brush for lifted, separated lashes.', array['Lowest price','Community pick'], array['Leaping Bunny','PETA'], array['mascara','makeup','eyes','budget','vegan'], 4.6, 392, '#f1d8cf', '#873e39'),
  ('the-ordinary-cleanser', 'The Ordinary', 'Squalane Cleanser', 'Skin care', 'Cleanser', 'A non-comedogenic balm-to-oil cleanser that removes makeup without stripping skin.', array['Editor''s pick'], array['PETA'], array['cleanser','face wash','skincare','dry skin','makeup remover'], 4.8, 618, '#e8e3dc', '#4b4a47'),
  ('live-clean-body-wash', 'Live Clean', 'Fresh Water Body Wash', 'Body care', 'Body wash', 'A plant-derived daily body wash with a fresh scent and widely available refill sizes.', array['Made in Canada'], array['PETA'], array['body wash','soap','shower','canadian','budget'], 4.5, 207, '#d8e9e6', '#206461'),
  ('method-cleaner', 'method', 'All-Purpose Cleaner', 'Home', 'Surface cleaner', 'A biodegradable surface spray in a recycled-plastic bottle with broad retail availability.', array['Household favourite'], array['Leaping Bunny'], array['cleaner','cleaning','home','kitchen','surface spray'], 4.7, 446, '#e7dcc8', '#765b2f'),
  ('tom-green-deodorant', 'Tom''s of Maine', 'Natural Deodorant', 'Personal care', 'Deodorant', 'An aluminum-free everyday deodorant available in unscented and naturally scented options.', array['Easy to find'], array['PETA'], array['deodorant','personal care','aluminum free','natural'], 4.3, 151, '#dce4d2', '#3d6430'),
  ('pacifica-perfume', 'Pacifica', 'Island Vanilla Hair & Body Mist', 'Fragrance', 'Body mist', 'A warm vanilla mist with a vegan formula in a travel-friendly bottle.', array['Vegan'], array['PETA'], array['perfume','fragrance','body mist','vanilla','vegan'], 4.6, 281, '#eee0ef', '#754f78'),
  ('burts-lip-balm', 'Hurraw!', 'Moon Lip Balm', 'Skin care', 'Lip care', 'A rich overnight lip balm made with organic, raw and vegan ingredients.', array['Fully vegan'], array['Leaping Bunny'], array['lip balm','lips','skincare','vegan','organic'], 4.8, 165, '#d8d7e9', '#4f507f')
on conflict (id) do update set
  brand = excluded.brand, name = excluded.name, category = excluded.category,
  subcategory = excluded.subcategory, description = excluded.description,
  badges = excluded.badges, certifications = excluded.certifications, tags = excluded.tags,
  rating = excluded.rating, review_count = excluded.review_count,
  colour = excluded.colour, accent = excluded.accent, updated_at = now();

insert into public.product_offers (product_id, country_code, currency, expected_price, store_name, priority)
values
  ('attitude-shampoo','CA','CAD',11.97,'Walmart',1), ('attitude-shampoo','CA','CAD',12.99,'Well.ca',2),
  ('attitude-shampoo','US','USD',12.95,'Amazon',1), ('attitude-shampoo','US','USD',13.95,'ATTITUDE',2),
  ('elf-mascara','CA','CAD',8.00,'Shoppers Drug Mart',1), ('elf-mascara','CA','CAD',8.00,'Walmart',2),
  ('elf-mascara','US','USD',6.00,'Target',1), ('elf-mascara','US','USD',6.00,'Ulta',2),
  ('the-ordinary-cleanser','CA','CAD',11.90,'Sephora',1), ('the-ordinary-cleanser','CA','CAD',11.90,'The Ordinary',2),
  ('the-ordinary-cleanser','US','USD',9.90,'Sephora',1), ('the-ordinary-cleanser','US','USD',9.90,'Ulta',2),
  ('live-clean-body-wash','CA','CAD',7.49,'Shoppers Drug Mart',1), ('live-clean-body-wash','CA','CAD',7.97,'Walmart',2),
  ('live-clean-body-wash','US','USD',9.99,'Amazon',1), ('live-clean-body-wash','US','USD',10.49,'iHerb',2),
  ('method-cleaner','CA','CAD',5.97,'Walmart',1), ('method-cleaner','CA','CAD',6.49,'Canadian Tire',2),
  ('method-cleaner','US','USD',4.49,'Target',1), ('method-cleaner','US','USD',4.68,'Walmart',2),
  ('tom-green-deodorant','CA','CAD',7.99,'Well.ca',1), ('tom-green-deodorant','CA','CAD',8.47,'Walmart',2),
  ('tom-green-deodorant','US','USD',5.99,'Target',1), ('tom-green-deodorant','US','USD',6.29,'CVS',2),
  ('pacifica-perfume','CA','CAD',18.99,'Shoppers Drug Mart',1), ('pacifica-perfume','CA','CAD',19.49,'Well.ca',2),
  ('pacifica-perfume','US','USD',12.00,'Target',1), ('pacifica-perfume','US','USD',12.00,'Ulta',2),
  ('burts-lip-balm','CA','CAD',6.99,'Well.ca',1), ('burts-lip-balm','CA','CAD',7.49,'Healthy Planet',2),
  ('burts-lip-balm','US','USD',4.49,'Whole Foods',1), ('burts-lip-balm','US','USD',4.99,'Amazon',2)
on conflict (product_id, country_code, store_name) do update set
  currency = excluded.currency, expected_price = excluded.expected_price,
  priority = excluded.priority, last_checked_at = now();
