-- Manual stock quantity for the existing products table.
-- Existing products that were available remain available with a safe default
-- of 10; existing manually out-of-stock products default to 0. New rows
-- default to 0 until the admin explicitly sets an available quantity.

alter table public.products
  add column if not exists stock_quantity integer;

update public.products
set stock_quantity = case
  when coalesce(out_of_stock, false) then 0
  else 10
end
where stock_quantity is null;

alter table public.products
  alter column stock_quantity set default 0,
  alter column stock_quantity set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_stock_quantity_nonnegative'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_stock_quantity_nonnegative check (stock_quantity >= 0);
  end if;
end;
$$;

-- Refresh PostgREST so the new column is available without waiting for a
-- manual schema-cache reload.
notify pgrst, 'reload schema';
