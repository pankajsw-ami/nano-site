-- Admin presence and one-per-unread-conversation email notifications.
-- Additive only: customer conversations and messages are preserved.

create table if not exists public.admin_presence (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null
    check (char_length(trim(session_id)) between 16 and 200),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (admin_user_id, session_id)
);

create index if not exists admin_presence_last_seen_idx
  on public.admin_presence(last_seen_at desc);

alter table public.admin_presence enable row level security;
revoke all on table public.admin_presence from public;
grant select, insert, update, delete on table public.admin_presence to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_presence'
      and policyname = 'Admins can manage their own presence'
  ) then
    create policy "Admins can manage their own presence"
    on public.admin_presence
    for all
    to authenticated
    using (
      (select public.chat_is_admin())
      and admin_user_id = (select auth.uid())
    )
    with check (
      (select public.chat_is_admin())
      and admin_user_id = (select auth.uid())
    );
  end if;
end;
$$;

create table if not exists public.admin_message_notification_queue (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.conversations(id) on delete cascade,
  message_id uuid not null
    references public.messages(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed')),
  attempts integer not null default 0
    check (attempts >= 0),
  processing_started_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (conversation_id)
);

create index if not exists admin_message_notification_queue_status_idx
  on public.admin_message_notification_queue(status, created_at);

-- This queue is server-side only. The Edge Function uses the service role.
alter table public.admin_message_notification_queue enable row level security;
revoke all on table public.admin_message_notification_queue from public, anon, authenticated;
grant select on table public.admin_presence to service_role;
grant select, update, delete on table public.admin_message_notification_queue to service_role;

create or replace function public.chat_queue_admin_email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_type = 'customer'
    and new.is_read = false
    and not exists (
      select 1
      from public.admin_presence p
      join public.admin_users a on a.user_id = p.admin_user_id
      where a.role = 'admin'
        and a.is_active = true
        and p.last_seen_at > now() - interval '90 seconds'
    )
  then
    insert into public.admin_message_notification_queue (
      conversation_id,
      message_id
    )
    values (
      new.conversation_id,
      new.id
    )
    on conflict (conversation_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.chat_queue_admin_email_notification() from public;
grant execute on function public.chat_queue_admin_email_notification() to authenticated;

create or replace function public.chat_clear_admin_email_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sender_type = 'customer'
    and old.is_read = false
    and new.is_read = true
  then
    delete from public.admin_message_notification_queue
    where conversation_id = new.conversation_id;
  end if;

  return new;
end;
$$;

revoke all on function public.chat_clear_admin_email_notification() from public;
grant execute on function public.chat_clear_admin_email_notification() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'messages_queue_admin_email_notification'
      and tgrelid = 'public.messages'::regclass
  ) then
    create trigger messages_queue_admin_email_notification
    after insert on public.messages
    for each row
    execute function public.chat_queue_admin_email_notification();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'messages_clear_admin_email_notification'
      and tgrelid = 'public.messages'::regclass
  ) then
    create trigger messages_clear_admin_email_notification
    after update of is_read on public.messages
    for each row
    execute function public.chat_clear_admin_email_notification();
  end if;
end;
$$;

-- Atomically claim one queued notification. Concurrent webhook deliveries
-- cannot send the same queue row twice. Failed/stale attempts can retry.
create or replace function public.chat_claim_admin_message_notification(p_queue_id uuid)
returns public.admin_message_notification_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.admin_message_notification_queue;
begin
  update public.admin_message_notification_queue
  set status = 'processing',
      attempts = attempts + 1,
      processing_started_at = now(),
      last_error = null
  where id = p_queue_id
    and (
      status = 'pending'
      or (status = 'failed' and attempts < 3)
      or (
        status = 'processing'
        and processing_started_at < now() - interval '5 minutes'
      )
    )
  returning * into claimed;

  return claimed;
end;
$$;

revoke all on function public.chat_claim_admin_message_notification(uuid) from public, anon, authenticated;
grant execute on function public.chat_claim_admin_message_notification(uuid) to service_role;

notify pgrst, 'reload schema';
