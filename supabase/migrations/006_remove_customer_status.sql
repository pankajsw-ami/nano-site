-- Roll back only the internal customer-status feature.
-- Non-destructive for chat data: conversations and messages are not deleted.

drop function if exists public.chat_update_customer_status(uuid, text);
drop function if exists public.chat_search_conversations_with_status(text, boolean);

alter table public.conversations
  drop constraint if exists conversations_customer_status_check;

alter table public.conversations
  drop column if exists customer_status;

-- Restore the original conversations table grant used by the chat/search RPCs.
-- RLS policies continue to control which rows each role can access.
grant select on table public.conversations to authenticated;
