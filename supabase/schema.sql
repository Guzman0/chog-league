-- Chog League database. Paste all of this into Supabase → SQL Editor → New query → Run.
-- Safe to run more than once.

-- Every trade (league, practice and duel trades).
create table if not exists public.trades (
  id uuid primary key,
  token_id text not null,
  wallet text not null default '',
  practice_id text,
  duel_id uuid,
  market text not null,
  direction text not null check (direction in ('up', 'down')),
  amount numeric not null,
  multiplier numeric not null,
  entry_price double precision not null,
  target_price double precision not null,
  opened_at bigint not null,
  expires_at bigint not null,
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'push')),
  settle_price double precision,
  payout numeric,
  pnl numeric,
  created_at timestamptz not null default now()
);
-- Added for Chog powers (Shield / Double Up / Parachute). Safe to run again.
alter table public.trades add column if not exists power text;

create index if not exists trades_token_idx on public.trades (token_id);
create index if not exists trades_opened_idx on public.trades (opened_at);
create index if not exists trades_open_idx on public.trades (expires_at) where status = 'open';
create index if not exists trades_duel_idx on public.trades (duel_id);

-- Chog vs Chog duels.
create table if not exists public.duels (
  id uuid primary key,
  mode text not null check (mode in ('league', 'practice')),
  format text not null,
  market text not null,
  stake numeric not null,
  challenger_token text not null,
  challenger_wallet text not null default '',
  challenger_practice text,
  opponent_token text not null,
  opponent_wallet text not null default '',
  opponent_practice text,
  is_bot boolean not null default false,
  status text not null default 'pending',
  created_at bigint not null,
  accepted_at bigint,
  ends_at bigint,
  winner_token text,
  rounds jsonb not null default '[]'::jsonb,
  result jsonb
);
create index if not exists duels_status_idx on public.duels (status);
create index if not exists duels_challenger_idx on public.duels (challenger_token);
create index if not exists duels_opponent_idx on public.duels (opponent_token);

-- Who is online right now (for the duel lobby).
create table if not exists public.presence (
  player_key text primary key,
  token_id text not null,
  wallet text not null default '',
  practice_id text,
  mode text not null,
  name text,
  image text,
  last_seen bigint not null
);

-- Lock the tables: only the app's server (using the secret key) can read or write.
alter table public.trades enable row level security;
alter table public.duels enable row level security;
alter table public.presence enable row level security;

-- Version number so two players' screens can't overwrite each other's duel updates.
alter table public.duels add column if not exists version integer not null default 0;
