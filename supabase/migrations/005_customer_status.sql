-- Nano Aakriti internal customer status.
-- Additive and non-destructive: no rows, messages, or conversations are deleted.

alter table public.conversations
  add column if not exists customer_status text not null default 'New';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'conversations_customer_status_check'
      and conrelid = 'public.conversations'::regclass
  ) then
    alter table public.conversations
      add constraint conversations_customer_status_check
      check (customer_status in (
        'New',
        'Contacted',
        'Interested',
        'Order Pending',
        'Printing',
        'Completed',
        'Closed'
      ));
  end if;
end;
$$;

-- Customers and admins share the authenticated database role. Rebuild the
-- table's select grant without the internal status column, then expose status
-- only through the admin-checked RPC below.
revoke select on table public.conversations from anon, authenticated;
grant select (
  id,
  customer_user_id,
  customer_name,
  customer_phone,
  product_id,
  product_name,
  product_price,
  created_at,
  updated_at,
  admin_hidden
) on public.conversations to authenticated;

create or replace function public.chat_search_conversations_with_status(
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
  customer_status text,
  latest_message text,
  latest_message_created_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
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
    c.customer_status,
    latest.message as latest_message,
    latest.created_at as latest_message_created_at,
    coalesce(unread.message_count, 0)::bigint as unread_count
  from public.conversations c
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
  where public.chat_is_admin()
    and c.admin_hidden = p_archived
    and (
      trim(coalesce(p_search, '')) = ''
      or lower(c.customer_name) like '%' || lower(left(trim(p_search), 120)) || '%'
      or c.customer_phone ilike '%' || left(trim(p_search), 120) || '%'
      or c.customer_user_id::text ilike '%' || left(trim(p_search), 120) || '%'
    )
  order by c.updated_at desc;
$$;

revoke all on function public.chat_search_conversations_with_status(text, boolean) from public, anon, authenticated;
grant execute on function public.chat_search_conversations_with_status(text, boolean) to authenticated;

create or replace function public.chat_update_customer_status(
  p_conversation_id uuid,
  p_status text
)
returns table (
  id uuid,
  customer_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.chat_is_admin() then
    raise exception 'Only authorized admins can update customer status';
  end if;

  if p_status not in (
    'New',
    'Contacted',
    'Interested',
    'Order Pending',
    'Printing',
    'Completed',
    'Closed'
  ) then
    raise exception 'Invalid customer status';
  end if;

  return query
    update public.conversations
    set customer_status = p_status
    where conversations.id = p_conversation_id
    returning conversations.id, conversations.customer_status;
end;
$$;

revoke all on function public.chat_update_customer_status(uuid, text) from public, anon, authenticated;
grant execute on function public.chat_update_customer_status(uuid, text) to authenticated;
