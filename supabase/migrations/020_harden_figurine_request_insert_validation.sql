-- Restore server-side integrity checks for customer figurine requests.
-- This changes only the customer INSERT policy and its validation helper.
-- Product, chat, size-management UI, and private storage policies are unchanged.

create or replace function public.figurine_request_insert_is_valid(
  p_customer_user_id uuid,
  p_photo_path text,
  p_size_id uuid,
  p_size_name text,
  p_price numeric,
  p_status text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    (select auth.uid()) is not null
    and p_customer_user_id = (select auth.uid())
    and p_status = 'New'
    and pg_catalog.lower(p_photo_path) ~ (
      '^' || (select auth.uid())::text || '/[^/]+\.(jpg|jpeg|png|webp)$'
    )
    and exists (
      select 1
      from public.figurine_sizes s
      where s.id = p_size_id
        and s.is_active = true
        and s.name = p_size_name
        and s.price = p_price
    );
$$;

revoke all on function public.figurine_request_insert_is_valid(uuid, text, uuid, text, numeric, text) from public;
grant execute on function public.figurine_request_insert_is_valid(uuid, text, uuid, text, numeric, text) to authenticated;

drop policy if exists "Customers can create their own figurine requests" on public.figurine_requests;

create policy "Customers can create their own figurine requests"
  on public.figurine_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and not (select public.chat_is_admin())
    and customer_user_id = (select auth.uid())
    and status = 'New'
    and public.figurine_request_insert_is_valid(
      customer_user_id,
      photo_path,
      size_id,
      size_name,
      price,
      status
    )
  );

notify pgrst, 'reload schema';
