-- Restrict conversation updates to the archive flag only.
-- RLS still requires chat_is_admin() for every update.

revoke update on table public.conversations from anon, authenticated;
grant update (admin_hidden) on table public.conversations to authenticated;
