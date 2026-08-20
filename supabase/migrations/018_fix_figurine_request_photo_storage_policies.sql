-- Fix only the private figurine-request photo Storage policies.
-- The bucket remains private and all access stays tied to the authenticated
-- customer's user folder or an authorized admin.

drop policy if exists "Customers can upload figurine request photos" on storage.objects;
drop policy if exists "Customers and admins can read figurine request photos" on storage.objects;

create policy "Customers can upload figurine request photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'figurine-request-photos'
    and not (select public.chat_is_admin())
    and split_part(name, '/', 1) = (select auth.uid())::text
    and (
      (lower(name) ~ '\.(jpg|jpeg)$' and metadata->>'mimetype' = 'image/jpeg')
      or (lower(name) ~ '\.png$' and metadata->>'mimetype' = 'image/png')
      or (lower(name) ~ '\.webp$' and metadata->>'mimetype' = 'image/webp')
    )
  );

create policy "Customers and admins can read figurine request photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'figurine-request-photos'
    and (
      (select public.chat_is_admin())
      or split_part(name, '/', 1) = (select auth.uid())::text
    )
  );

