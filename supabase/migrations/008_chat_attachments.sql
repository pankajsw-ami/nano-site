-- Nano Aakriti private chat attachments.
-- Additive and non-destructive: existing messages and files are preserved.

alter table public.messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

-- Allow attachment-only messages while retaining the existing text limit.
alter table public.messages
  alter column message drop not null;

alter table public.messages
  drop constraint if exists messages_message_check;

alter table public.messages
  drop constraint if exists messages_content_or_attachment_check;

alter table public.messages
  add constraint messages_content_or_attachment_check
  check (
    (message is not null and char_length(trim(message)) between 1 and 4000)
    or attachment_path is not null
  );

alter table public.messages
  drop constraint if exists messages_attachment_metadata_check;

alter table public.messages
  add constraint messages_attachment_metadata_check
  check (
    (
      attachment_path is null
      and attachment_name is null
      and attachment_type is null
      and attachment_size is null
    )
    or (
      char_length(trim(attachment_path)) between 1 and 500
      and attachment_name is not null
      and char_length(trim(attachment_name)) between 1 and 255
      and attachment_type is not null
      and char_length(trim(attachment_type)) between 1 and 120
      and attachment_size between 1 and 26214400
    )
  );

-- Attachment metadata is immutable after the message is created. Read-status
-- updates remain allowed through the existing read-receipt policies.
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
    or new.attachment_path is distinct from old.attachment_path
    or new.attachment_name is distinct from old.attachment_name
    or new.attachment_type is distinct from old.attachment_type
    or new.attachment_size is distinct from old.attachment_size
    or new.created_at is distinct from old.created_at
  then
    raise exception 'Only is_read may be updated on a message';
  end if;

  return new;
end;
$$;

revoke all on function public.chat_protect_message_fields() from public;
grant execute on function public.chat_protect_message_fields() to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'model/stl',
    'model/obj',
    'application/sla',
    'application/octet-stream',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- A valid object path is always:
-- <customer_user_id>/<conversation_id>/<generated-name>.
-- This helper keeps both customer and admin Storage policies tied to the
-- existing conversation authorization model.
create or replace function public.chat_storage_conversation_access(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id::text = split_part(object_name, '/', 2)
      and c.customer_user_id::text = split_part(object_name, '/', 1)
      and (
        (select public.chat_is_admin())
        or (
          not (select public.chat_is_admin())
          and c.customer_user_id = (select auth.uid())
        )
      )
  );
$$;

revoke all on function public.chat_storage_conversation_access(text) from public;
grant execute on function public.chat_storage_conversation_access(text) to authenticated;

create policy "Chat participants can read attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and public.chat_storage_conversation_access(name)
);

create policy "Chat participants can upload attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and public.chat_storage_conversation_access(name)
  and (
    (lower(name) ~ '\.(jpg|jpeg)$' and metadata->>'mimetype' = 'image/jpeg')
    or (lower(name) ~ '\.png$' and metadata->>'mimetype' = 'image/png')
    or (lower(name) ~ '\.webp$' and metadata->>'mimetype' = 'image/webp')
    or (lower(name) ~ '\.pdf$' and metadata->>'mimetype' = 'application/pdf')
    or (
      lower(name) ~ '\.stl$'
      and metadata->>'mimetype' in ('model/stl', 'application/sla', 'application/octet-stream')
    )
    or (
      lower(name) ~ '\.obj$'
      and metadata->>'mimetype' in ('model/obj', 'text/plain', 'application/octet-stream')
    )
  )
);
