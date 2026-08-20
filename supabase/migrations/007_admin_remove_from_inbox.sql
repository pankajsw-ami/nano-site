-- Admin-only inbox removal without deleting customer data.
-- Conversations, messages, and Auth users remain intact.

alter table public.conversations
  add column if not exists admin_removed_from_inbox boolean not null default false;

create index if not exists conversations_admin_visibility_updated_at_idx
  on public.conversations(admin_removed_from_inbox, admin_hidden, updated_at desc);

-- The existing search function is security-invoker and needs to evaluate this
-- visibility column. Customer-facing code still uses an explicit safe column
-- projection and never requests it.
grant select (admin_removed_from_inbox) on public.conversations to authenticated;

-- Preserve the existing archive update grant and allow only the admin RLS
-- policy to control the new inbox-visibility flag.
revoke update on table public.conversations from anon, authenticated;
grant update (admin_hidden, admin_removed_from_inbox) on public.conversations to authenticated;

-- A customer message makes the existing conversation visible in the admin
-- inbox again. This runs server-side and does not create a new conversation.
create or replace function public.chat_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now(),
      admin_removed_from_inbox = case
        when new.sender_type = 'customer' then false
        else admin_removed_from_inbox
      end
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.chat_touch_conversation() from public;
grant execute on function public.chat_touch_conversation() to authenticated;

-- Keep the existing search signature and archive behavior. Removed chats
-- are excluded from both normal and archived inbox views until a customer
-- sends a new message.
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
    and c.admin_removed_from_inbox = false
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
