-- Ejecuta este archivo en Supabase SQL Editor.
create table if not exists public.strava_connections (
 user_id uuid primary key references auth.users(id) on delete cascade,
 athlete_id bigint not null unique,
 access_token text not null,
 refresh_token text not null,
 expires_at bigint not null,
 updated_at timestamptz default now()
);
create table if not exists public.strava_oauth_states (
 nonce text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
create table if not exists public.strava_activities (
 user_id uuid not null references auth.users(id) on delete cascade,
 strava_id bigint not null,
 name text,
 sport_type text,
 start_date timestamptz,
 moving_time integer,
 elapsed_time integer,
 distance_m numeric,
 calories numeric,
 average_heartrate numeric,
 total_elevation_gain numeric,
 updated_at timestamptz default now(),
 primary key(user_id,strava_id)
);
alter table public.strava_connections enable row level security;
alter table public.strava_oauth_states enable row level security;
alter table public.strava_activities enable row level security;
revoke all on public.strava_connections from anon,authenticated;
revoke all on public.strava_oauth_states from anon,authenticated;
grant select on public.strava_activities to authenticated;
revoke all on public.strava_activities from anon;
drop policy if exists "view own Strava activities" on public.strava_activities;
create policy "view own Strava activities" on public.strava_activities for select to authenticated using ((select auth.uid())=user_id);
-- Índice para acelerar queries filtradas solo por user_id en strava_activities
create index if not exists idx_strava_activities_user_id on public.strava_activities(user_id);
-- Los tokens son accesibles SOLO a través de Edge Functions con service_role.
