-- Customer figurine requests and private reference-photo storage.
-- Additive only: this does not modify products, chat, or figurine_sizes rows.

create extension if not exists pgcrypto;

create table if not exists public.figurine_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  photo_path text not null,
  size_id uuid references public.figurine_sizes(id) on delete set null,
  size_name text not null,
  price numeric(10, 2) not null,
  status text not null default 'New',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint figurine_requests_photo_path_length check (char_length(trim(photo_path)) between 1 and 500),
  constraint figurine_requests_size_name_length check (char_length(trim(size_name)) between 1 and 40),
  constraint figurine_requests_price_nonnegative check (price >= 0),
  constraint figurine_requests_status_check check (status in ('New', 'In Progress', 'Completed', 'Cancelled'))
);

create index if not exists figurine_requests_customer_created_idx
  on public.figurine_requests(customer_user_id, created_at desc);

create index if not exists figurine_requests_status_created_idx
  on public.figurine_requests(status, created_at desc);

create or replace function public.figurine_request_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists figurine_requests_set_updated_at on public.figurine_requests;
create trigger figurine_requests_set_updated_at
before update on public.figurine_requests
for each row
execute function public.figurine_request_touch_updated_at();

alter table public.figurine_requests enable row level security;

revoke all on table public.figurine_requests from public, anon, authenticated;
grant select on table public.figurine_requests to authenticated;
grant insert on table public.figurine_requests to authenticated;
grant update (status) on table public.figurine_requests to authenticated;

drop policy if exists "Customers can view their own figurine requests" on public.figurine_requests;
drop policy if exists "Customers can create their own figurine requests" on public.figurine_requests;
drop policy if exists "Admins can view all figurine requests" on public.figurine_requests;
drop policy if exists "Admins can update figurine request status" on public.figurine_requests;

create policy "Customers can view their own figurine requests"
  on public.figurine_requests
  for select
  to authenticated
  using (
    not (select public.chat_is_admin())
    and customer_user_id = (select auth.uid())
  );

create policy "Customers can create their own figurine requests"
  on public.figurine_requests
  for insert
  to authenticated
  with check (
    not (select public.chat_is_admin())
    and customer_user_id = (select auth.uid())
    and status = 'New'
    and split_part(photo_path, '/', 1) = (select auth.uid())::text
    and exists (
      select 1
      from public.figurine_sizes s
      where s.id = size_id
        and s.is_active = true
        and s.name = size_name
        and s.price = price
    )
  );

create policy "Admins can view all figurine requests"
  on public.figurine_requests
  for select
  to authenticated
  using ((select public.chat_is_admin()));

create policy "Admins can update figurine request status"
  on public.figurine_requests
  for update
  to authenticated
  using ((select public.chat_is_admin()))
  with check ((select public.chat_is_admin()));

-- Private bucket for customer reference photos. Product images and chat
-- attachments use separate buckets and policies.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'figurine-request-photos',
  'figurine-request-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Customers can upload figurine request photos" on storage.objects;
drop policy if exists "Customers and admins can read figurine request photos" on storage.objects;

create policy "Customers can upload figurine request photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'figurine-request-photos'
    and not (select public.chat_is_admin())
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
      (lower(name) ~ '\\.(jpg|jpeg)$' and metadata->>'mimetype' = 'image/jpeg')
      or (lower(name) ~ '\\.png$' and metadata->>'mimetype' = 'image/png')
      or (lower(name) ~ '\\.webp$' and metadata->>'mimetype' = 'image/webp')
    )
  );

create policy "Customers and admins can read figurine request photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'figurine-request-photos'
    and (
      (select public.chat_is_admin())
      or split_part(name, '/', 1) = (select auth.uid())::text
    )
  );

revoke all on function public.figurine_request_touch_updated_at() from public;
grant execute on function public.figurine_request_touch_updated_at() to authenticated;

notify pgrst, 'reload schema';
