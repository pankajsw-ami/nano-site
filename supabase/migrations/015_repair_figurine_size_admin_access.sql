-- Repair the figurine size settings access contract.
-- Create the required table only when it is missing; never replace an existing
-- table or modify existing rows.

create extension if not exists pgcrypto;

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

revoke all on table public.figurine_sizes from anon, authenticated;
grant select on table public.figurine_sizes to anon, authenticated;
grant insert, update, delete on table public.figurine_sizes to authenticated;

drop policy if exists "Customers can view active figurine sizes" on public.figurine_sizes;
drop policy if exists "Admins can view all figurine sizes" on public.figurine_sizes;
drop policy if exists "Admins can create figurine sizes" on public.figurine_sizes;
drop policy if exists "Admins can update figurine sizes" on public.figurine_sizes;
drop policy if exists "Admins can delete figurine sizes" on public.figurine_sizes;

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

notify pgrst, 'reload schema';
