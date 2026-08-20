-- Optional product color variants for the existing product catalog.
-- Existing products keep using products.image_path when they have no variants.

create table if not exists public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id text not null
    references public.products(id) on delete cascade,
  color text not null,
  image_path text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_color_length check (char_length(trim(color)) between 1 and 50),
  constraint product_variants_image_path_length check (char_length(trim(image_path)) between 1 and 500),
  constraint product_variants_sort_order_nonnegative check (sort_order >= 0)
);

create index if not exists product_variants_product_active_sort_idx
  on public.product_variants(product_id, active, sort_order, created_at);

create unique index if not exists product_variants_product_color_unique_idx
  on public.product_variants(product_id, lower(trim(color)));

create or replace function public.product_variants_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.product_variants_set_updated_at() from public;

create trigger product_variants_set_updated_at
before update on public.product_variants
for each row
execute function public.product_variants_set_updated_at();

alter table public.product_variants enable row level security;

revoke all on table public.product_variants from public;
grant select on table public.product_variants to anon, authenticated;
grant insert, update, delete on table public.product_variants to authenticated;

create policy "Customers can read active product variants"
on public.product_variants
for select
to anon, authenticated
using (active = true);

create policy "Admins can read all product variants"
on public.product_variants
for select
to authenticated
using ((select public.chat_is_admin()));

create policy "Admins can create product variants"
on public.product_variants
for insert
to authenticated
with check ((select public.chat_is_admin()));

create policy "Admins can update product variants"
on public.product_variants
for update
to authenticated
using ((select public.chat_is_admin()))
with check ((select public.chat_is_admin()));

create policy "Admins can delete product variants"
on public.product_variants
for delete
to authenticated
using ((select public.chat_is_admin()));

-- Make the new table visible to PostgREST immediately after the migration.
notify pgrst, 'reload schema';

-- Variant images use the existing public product-images bucket. The frontend
-- stores them under products/<product-id>/variants/<unique-file-name>.
