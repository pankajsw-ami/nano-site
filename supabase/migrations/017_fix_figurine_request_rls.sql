-- Fix customer figurine-request RLS without changing request data, storage,
-- figurine_sizes, or any unrelated tables.
-- The original insert policy performed additional RLS-dependent checks against
-- figurine_sizes and the storage path. Ownership is enforced here at the
-- request table, while the private storage bucket independently enforces
-- photo ownership.

alter table public.figurine_requests enable row level security;

revoke all on table public.figurine_requests from public, anon, authenticated;
grant select on table public.figurine_requests to authenticated;
grant insert on table public.figurine_requests to authenticated;
grant update (status) on table public.figurine_requests to authenticated;

drop policy if exists "Customers can view their own figurine requests" on public.figurine_requests;
drop policy if exists "Customers can create their own figurine requests" on public.figurine_requests;
drop policy if exists "Admins can view all figurine requests" on public.figurine_requests;
drop policy if exists "Admins can update figurine request status" on public.figurine_requests;

create policy "Customers can view their own figurine requests"
  on public.figurine_requests
  for select
  to authenticated
  using (
    (select auth.uid()) is not null
    and not (select public.chat_is_admin())
    and customer_user_id = (select auth.uid())
  );

create policy "Customers can create their own figurine requests"
  on public.figurine_requests
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and not (select public.chat_is_admin())
    and customer_user_id = (select auth.uid())
    and status = 'New'
  );

create policy "Admins can view all figurine requests"
  on public.figurine_requests
  for select
  to authenticated
  using ((select public.chat_is_admin()));

create policy "Admins can update figurine request status"
  on public.figurine_requests
  for update
  to authenticated
  using ((select public.chat_is_admin()))
  with check ((select public.chat_is_admin()));

notify pgrst, 'reload schema';
