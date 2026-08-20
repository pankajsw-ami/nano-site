-- Admin-controlled figurine styles, poses, and bases.
-- Additive only: existing products, chats, and figurine size settings remain unchanged.

create table if not exists public.figurine_styles (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(trim(name)) between 1 and 80),
  detail text not null default ''
    check (char_length(detail) <= 160),
  price numeric(10, 2) not null default 0
    check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.figurine_poses (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(trim(name)) between 1 and 80),
  detail text not null default ''
    check (char_length(detail) <= 160),
  price numeric(10, 2) not null default 0
    check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.figurine_bases (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(trim(name)) between 1 and 80),
  detail text not null default ''
    check (char_length(detail) <= 160),
  price numeric(10, 2) not null default 0
    check (price >= 0),
  active boolean not null default true,
  sort_order integer not null default 0
    check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists figurine_styles_name_unique_idx
  on public.figurine_styles(lower(trim(name)));
create unique index if not exists figurine_poses_name_unique_idx
  on public.figurine_poses(lower(trim(name)));
create unique index if not exists figurine_bases_name_unique_idx
  on public.figurine_bases(lower(trim(name)));

create index if not exists figurine_styles_active_order_idx
  on public.figurine_styles(active, sort_order, created_at);
create index if not exists figurine_poses_active_order_idx
  on public.figurine_poses(active, sort_order, created_at);
create index if not exists figurine_bases_active_order_idx
  on public.figurine_bases(active, sort_order, created_at);

create or replace function public.figurine_option_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.figurine_option_touch_updated_at() from public;
grant execute on function public.figurine_option_touch_updated_at() to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'figurine_styles_set_updated_at' and tgrelid = 'public.figurine_styles'::regclass) then
    create trigger figurine_styles_set_updated_at
    before update on public.figurine_styles
    for each row execute function public.figurine_option_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'figurine_poses_set_updated_at' and tgrelid = 'public.figurine_poses'::regclass) then
    create trigger figurine_poses_set_updated_at
    before update on public.figurine_poses
    for each row execute function public.figurine_option_touch_updated_at();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'figurine_bases_set_updated_at' and tgrelid = 'public.figurine_bases'::regclass) then
    create trigger figurine_bases_set_updated_at
    before update on public.figurine_bases
    for each row execute function public.figurine_option_touch_updated_at();
  end if;
end;
$$;

alter table public.figurine_styles enable row level security;
alter table public.figurine_poses enable row level security;
alter table public.figurine_bases enable row level security;

revoke all on table public.figurine_styles, public.figurine_poses, public.figurine_bases from public;
grant select on table public.figurine_styles, public.figurine_poses, public.figurine_bases to anon, authenticated;
grant insert, update, delete on table public.figurine_styles, public.figurine_poses, public.figurine_bases to authenticated;

create policy "Customers can view active figurine styles"
on public.figurine_styles for select to anon, authenticated
using (active = true);
create policy "Admins can view all figurine styles"
on public.figurine_styles for select to authenticated
using ((select public.chat_is_admin()));
create policy "Admins can insert figurine styles"
on public.figurine_styles for insert to authenticated
with check ((select public.chat_is_admin()));
create policy "Admins can update figurine styles"
on public.figurine_styles for update to authenticated
using ((select public.chat_is_admin()))
with check ((select public.chat_is_admin()));
create policy "Admins can delete figurine styles"
on public.figurine_styles for delete to authenticated
using ((select public.chat_is_admin()));

create policy "Customers can view active figurine poses"
on public.figurine_poses for select to anon, authenticated
using (active = true);
create policy "Admins can view all figurine poses"
on public.figurine_poses for select to authenticated
using ((select public.chat_is_admin()));
create policy "Admins can insert figurine poses"
on public.figurine_poses for insert to authenticated
with check ((select public.chat_is_admin()));
create policy "Admins can update figurine poses"
on public.figurine_poses for update to authenticated
using ((select public.chat_is_admin()))
with check ((select public.chat_is_admin()));
create policy "Admins can delete figurine poses"
on public.figurine_poses for delete to authenticated
using ((select public.chat_is_admin()));

create policy "Customers can view active figurine bases"
on public.figurine_bases for select to anon, authenticated
using (active = true);
create policy "Admins can view all figurine bases"
on public.figurine_bases for select to authenticated
using ((select public.chat_is_admin()));
create policy "Admins can insert figurine bases"
on public.figurine_bases for insert to authenticated
with check ((select public.chat_is_admin()));
create policy "Admins can update figurine bases"
on public.figurine_bases for update to authenticated
using ((select public.chat_is_admin()))
with check ((select public.chat_is_admin()));
create policy "Admins can delete figurine bases"
on public.figurine_bases for delete to authenticated
using ((select public.chat_is_admin()));

-- Preserve the existing customer configurator defaults on first application.
insert into public.figurine_styles (name, detail, price, sort_order, active)
values
  ('Classic', 'Clean sculpted finish', 0, 0, true),
  ('Cartoon', 'Playful character finish', 200, 1, true),
  ('Realistic', 'Detailed likeness', 400, 2, true),
  ('Chibi', 'Compact stylized look', 250, 3, true)
on conflict do nothing;

insert into public.figurine_poses (name, detail, price, sort_order, active)
values
  ('Standing', '', 0, 0, true),
  ('Waving', '', 0, 1, true),
  ('Seated', '', 0, 2, true),
  ('Action pose', '', 0, 3, true)
on conflict do nothing;

insert into public.figurine_bases (name, detail, price, sort_order, active)
values
  ('Simple base', 'Minimal display base', 0, 0, true),
  ('Display base', 'Raised presentation base', 150, 1, true),
  ('Scene base', 'Layered themed base', 300, 2, true)
on conflict do nothing;

notify pgrst, 'reload schema';
