-- Ejecutar en Supabase > SQL Editor
create table if not exists public.nutribook_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.nutribook_data enable row level security;
revoke all on public.nutribook_data from anon;
grant select, insert, update, delete on public.nutribook_data to authenticated;
drop policy if exists "Leer solamente mis datos" on public.nutribook_data;
create policy "Leer solamente mis datos" on public.nutribook_data
 for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Insertar solamente mis datos" on public.nutribook_data;
create policy "Insertar solamente mis datos" on public.nutribook_data
 for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Actualizar solamente mis datos" on public.nutribook_data;
create policy "Actualizar solamente mis datos" on public.nutribook_data
 for update to authenticated using ((select auth.uid()) = user_id)
 with check ((select auth.uid()) = user_id);
drop policy if exists "Eliminar solamente mis datos" on public.nutribook_data;
create policy "Eliminar solamente mis datos" on public.nutribook_data
 for delete to authenticated using ((select auth.uid()) = user_id);
