-- Nano Aakriti chat archive and one-conversation-per-customer safeguards.
-- Additive and non-destructive: no rows or tables are deleted.

alter table public.conversations
  add column if not exists admin_hidden boolean not null default false;

create index if not exists conversations_admin_hidden_updated_at_idx
  on public.conversations(admin_hidden, updated_at desc);

-- The existing data check found no duplicate customer conversations.
-- This constraint prevents future races from creating a second conversation.
create unique index if not exists conversations_one_per_customer_idx
  on public.conversations(customer_user_id);

-- Only admins may update the archive flag. Column-level grants prevent
-- authenticated customers from changing any conversation column.
grant update (admin_hidden) on public.conversations to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'conversations'
      and policyname = 'Admins can hide and restore conversations'
  ) then
    create policy "Admins can hide and restore conversations"
      on public.conversations
      for update
      to authenticated
      using ((select public.chat_is_admin()))
      with check ((select public.chat_is_admin()));
  end if;
end;
$$;
