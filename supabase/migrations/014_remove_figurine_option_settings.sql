-- Remove the superseded style, pose, and base configurator settings.
-- This intentionally does not touch figurine_sizes or any unrelated data.

drop table if exists public.figurine_styles;
drop table if exists public.figurine_poses;
drop table if exists public.figurine_bases;

drop function if exists public.figurine_option_touch_updated_at();

notify pgrst, 'reload schema';
