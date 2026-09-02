create table if not exists public.queue_snapshots (
  id bigint generated always as identity primary key,
  checkpoint_id uuid not null,
  captured_at timestamptz not null default now(),
  waiting_cars integer not null default 0,
  called_cars integer not null default 0,
  monitoring_count integer not null default 0,
  source_statistics jsonb
);

create index if not exists queue_snapshots_checkpoint_time_idx
  on public.queue_snapshots (checkpoint_id, captured_at desc);

create table if not exists public.processing_stats (
  id bigint generated always as identity primary key,
  checkpoint_id uuid not null,
  captured_at timestamptz not null default now(),
  car_last_hour integer not null default 0,
  car_last_day integer not null default 0,
  raw jsonb
);

create index if not exists processing_stats_checkpoint_time_idx
  on public.processing_stats (checkpoint_id, captured_at desc);

create table if not exists public.vehicle_events (
  id bigint generated always as identity primary key,
  checkpoint_id uuid not null,
  vehicle_hash text not null,
  status integer not null,
  queue_type integer,
  registration_at timestamptz,
  changed_at timestamptz,
  observed_at timestamptz not null default now(),
  wait_seconds bigint,
  unique (checkpoint_id, vehicle_hash, status, changed_at)
);

create index if not exists vehicle_events_checkpoint_changed_idx
  on public.vehicle_events (checkpoint_id, changed_at desc);

alter table public.queue_snapshots enable row level security;
alter table public.processing_stats enable row level security;
alter table public.vehicle_events enable row level security;

create policy "public read queue snapshots"
on public.queue_snapshots for select to anon, authenticated using (true);

create policy "public read processing stats"
on public.processing_stats for select to anon, authenticated using (true);
