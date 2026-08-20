-- Customer figurine size and starting-price configuration.
-- This table is independent from the existing product and chat tables.

create table if not exists public.figurine_sizes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price numeric(10, 2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint figurine_sizes_name_length check (char_length(trim(name)) between 1 and 40),
  constraint figurine_sizes_price_nonnegative check (price >= 0)
);

create unique index if not exists figurine_sizes_name_unique_idx
  on public.figurine_sizes (lower(trim(name)));

create index if not exists figurine_sizes_active_created_idx
  on public.figurine_sizes (is_active, created_at);

alter table public.figurine_sizes enable row level security;

revoke all on public.figurine_sizes from public;
grant select on public.figurine_sizes to anon, authenticated;
grant insert, update, delete on public.figurine_sizes to authenticated;

create policy "Customers can view active figurine sizes"
  on public.figurine_sizes
  for select
  to anon, authenticated
  using (is_active = true);

create policy "Admins can view all figurine sizes"
  on public.figurine_sizes
  for select
  to authenticated
  using ((select public.chat_is_admin()));

create policy "Admins can create figurine sizes"
  on public.figurine_sizes
  for insert
  to authenticated
  with check ((select public.chat_is_admin()));

create policy "Admins can update figurine sizes"
  on public.figurine_sizes
  for update
  to authenticated
  using ((select public.chat_is_admin()))
  with check ((select public.chat_is_admin()));

create policy "Admins can delete figurine sizes"
  on public.figurine_sizes
  for delete
  to authenticated
  using ((select public.chat_is_admin()));

-- Preserve useful defaults for the existing customer configurator while
-- allowing the admin to edit, disable, or delete them later.
insert into public.figurine_sizes (name, price, is_active)
select defaults.name, defaults.price, true
from (
  values
    ('10 cm', 999::numeric),
    ('15 cm', 1499::numeric),
    ('20 cm', 2499::numeric)
) as defaults(name, price)
where not exists (
  select 1
  from public.figurine_sizes existing
  where lower(trim(existing.name)) = lower(trim(defaults.name))
);
