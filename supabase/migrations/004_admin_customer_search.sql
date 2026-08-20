-- Admin-only, database-side customer/conversation search.
-- Additive only: no rows, conversations, or messages are modified.

create extension if not exists pg_trgm;

create index if not exists conversations_customer_name_trgm_idx
  on public.conversations using gin (lower(customer_name) gin_trgm_ops);

create index if not exists conversations_customer_phone_trgm_idx
  on public.conversations using gin (customer_phone gin_trgm_ops);

create index if not exists conversations_customer_user_id_trgm_idx
  on public.conversations using gin ((customer_user_id::text) gin_trgm_ops);

create or replace function public.chat_search_conversations(
  p_search text default '',
  p_archived boolean default false
)
returns table (
  id uuid,
  customer_user_id uuid,
  customer_name text,
  customer_phone text,
  product_id text,
  product_name text,
  product_price numeric,
  created_at timestamptz,
  updated_at timestamptz,
  admin_hidden boolean,
  latest_message text,
  latest_message_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with search_input as (
    select left(trim(coalesce(p_search, '')), 120) as value
  )
  select
    c.id,
    c.customer_user_id,
    c.customer_name,
    c.customer_phone,
    c.product_id,
    c.product_name,
    c.product_price,
    c.created_at,
    c.updated_at,
    c.admin_hidden,
    latest.message as latest_message,
    latest.created_at as latest_message_created_at,
    coalesce(unread.message_count, 0)::bigint as unread_count
  from public.conversations c
  cross join search_input s
  left join lateral (
    select m.message, m.created_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as message_count
    from public.messages m
    where m.conversation_id = c.id
      and m.sender_type = 'customer'
      and m.is_read = false
  ) unread on true
  where (select public.chat_is_admin())
    and c.admin_hidden = p_archived
    and (
      s.value = ''
      or lower(c.customer_name) like '%' || lower(s.value) || '%'
      or c.customer_phone ilike '%' || s.value || '%'
      or c.customer_user_id::text ilike '%' || s.value || '%'
    )
  order by c.updated_at desc;
$$;

revoke all on function public.chat_search_conversations(text, boolean) from public, anon, authenticated;
grant execute on function public.chat_search_conversations(text, boolean) to authenticated;
