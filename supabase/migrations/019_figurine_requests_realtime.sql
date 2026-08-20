-- Publish figurine request changes so authorized customers can receive their
-- own status updates in realtime. RLS remains responsible for access control.

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
      and tablename = 'figurine_requests'
  ) then
    execute 'alter publication supabase_realtime add table public.figurine_requests';
  end if;
end;
$$;

notify pgrst, 'reload schema';
