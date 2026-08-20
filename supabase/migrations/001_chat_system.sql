-- Nano Aakriti customer-admin chat system
-- Non-destructive migration: no DROP, DELETE, or TRUNCATE statements.
-- Customers must first sign in with Supabase Anonymous Auth.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin'
    check (role = 'admin'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  customer_name text not null
    check (char_length(trim(customer_name)) between 1 and 120),
  customer_phone text not null
    check (char_length(trim(customer_phone)) between 7 and 32),
  product_id text,
  product_name text
    check (
      product_name is null
      or char_length(trim(product_name)) between 1 and 200
    ),
  product_price numeric(12, 2)
    check (product_price is null or product_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  sender_type text not null
    check (sender_type in ('customer', 'admin')),
  message text not null
    check (char_length(trim(message)) between 1 and 4000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists conversations_customer_user_id_idx
  on public.conversations(customer_user_id);

create index if not exists conversations_updated_at_idx
  on public.conversations(updated_at desc);

create index if not exists messages_conversation_created_at_idx
  on public.messages(conversation_id, created_at);

create index if not exists messages_unread_idx
  on public.messages(conversation_id, is_read)
  where is_read = false;

create or replace function public.chat_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = (select auth.uid())
      and role = 'admin'
      and is_active = true
  );
$$;

revoke all on function public.chat_is_admin() from public;
grant execute on function public.chat_is_admin() to authenticated;

create or replace function public.chat_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

revoke all on function public.chat_touch_conversation() from public;
grant execute on function public.chat_touch_conversation() to authenticated;

create or replace function public.chat_protect_message_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id
    or new.conversation_id is distinct from old.conversation_id
    or new.sender_type is distinct from old.sender_type
    or new.message is distinct from old.message
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only is_read may be updated on a message';
  end if;

  return new;
end;
$$;

revoke all on function public.chat_protect_message_fields() from public;
grant execute on function public.chat_protect_message_fields() to authenticated;

create trigger messages_update_conversation_timestamp
after insert on public.messages
for each row
execute function public.chat_touch_conversation();

create trigger messages_protect_immutable_fields
before update on public.messages
for each row
execute function public.chat_protect_message_fields();

alter table public.admin_users enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on table public.admin_users from public;
revoke all on table public.conversations from public;
revoke all on table public.messages from public;

grant select on public.admin_users to authenticated;
grant select, insert on public.conversations to authenticated;
grant select, insert, update on public.messages to authenticated;

create policy "Admins can view their own admin membership"
on public.admin_users
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select public.chat_is_admin())
);

create policy "Admins can view all conversations"
on public.conversations
for select
to authenticated
using (
  (select public.chat_is_admin())
);

create policy "Customers can view their own conversations"
on public.conversations
for select
to authenticated
using (
  not (select public.chat_is_admin())
  and customer_user_id = (select auth.uid())
);

create policy "Customers can create their own conversations"
on public.conversations
for insert
to authenticated
with check (
  not (select public.chat_is_admin())
  and customer_user_id = (select auth.uid())
);

create policy "Admins can view all messages"
on public.messages
for select
to authenticated
using (
  (select public.chat_is_admin())
);

create policy "Customers can view messages in their own conversations"
on public.messages
for select
to authenticated
using (
  not (select public.chat_is_admin())
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.customer_user_id = (select auth.uid())
  )
);

create policy "Customers can send messages in their own conversations"
on public.messages
for insert
to authenticated
with check (
  not (select public.chat_is_admin())
  and sender_type = 'customer'
  and is_read = false
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.customer_user_id = (select auth.uid())
  )
);

create policy "Admins can send admin messages"
on public.messages
for insert
to authenticated
with check (
  (select public.chat_is_admin())
  and sender_type = 'admin'
  and is_read = false
);

create policy "Customers can mark admin messages as read"
on public.messages
for update
to authenticated
using (
  not (select public.chat_is_admin())
  and sender_type = 'admin'
  and exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.customer_user_id = (select auth.uid())
  )
)
with check (
  not (select public.chat_is_admin())
  and sender_type = 'admin'
);

create policy "Admins can mark customer messages as read"
on public.messages
for update
to authenticated
using (
  (select public.chat_is_admin())
  and sender_type = 'customer'
)
with check (
  (select public.chat_is_admin())
  and sender_type = 'customer'
);

do $$
begin
  if not exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    execute 'create publication supabase_realtime';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end;
$$;
