-- Call session + transcript storage for call integration MVP
-- Safe to run multiple times.

create table if not exists public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  room text not null unique,
  caller_user_id uuid references auth.users(id) on delete set null,
  receiver_user_id uuid references auth.users(id) on delete set null,
  incident_id uuid references public.incidents(id) on delete set null,
  status text not null default 'initiated' check (status in ('initiated', 'ringing', 'active', 'ended', 'cancelled', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.call_transcripts (
  id bigserial primary key,
  session_id uuid references public.call_sessions(id) on delete cascade,
  room text not null,
  speaker text not null check (speaker in ('caller', 'receiver', 'dispatcher', 'system')),
  text text not null,
  is_final boolean not null default true,
  chunk_started_at timestamptz,
  chunk_ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_sessions_status_created_at
  on public.call_sessions (status, created_at desc);

create index if not exists idx_call_sessions_incident_id
  on public.call_sessions (incident_id);

create index if not exists idx_call_transcripts_session_created_at
  on public.call_transcripts (session_id, created_at);

create index if not exists idx_call_transcripts_room_created_at
  on public.call_transcripts (room, created_at);

alter table public.call_sessions enable row level security;
alter table public.call_transcripts enable row level security;

drop policy if exists "Authenticated users can read call sessions" on public.call_sessions;
drop policy if exists "Authenticated users can create call sessions" on public.call_sessions;
drop policy if exists "Authenticated users can update call sessions" on public.call_sessions;

drop policy if exists "Authenticated users can read call transcripts" on public.call_transcripts;
drop policy if exists "Authenticated users can create call transcripts" on public.call_transcripts;

create policy "Authenticated users can read call sessions"
  on public.call_sessions
  for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can create call sessions"
  on public.call_sessions
  for insert
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can update call sessions"
  on public.call_sessions
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "Authenticated users can read call transcripts"
  on public.call_transcripts
  for select
  using (auth.role() = 'authenticated');

create policy "Authenticated users can create call transcripts"
  on public.call_transcripts
  for insert
  with check (auth.role() = 'authenticated');

do $$
begin
  alter publication supabase_realtime add table public.call_sessions;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.call_transcripts;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
