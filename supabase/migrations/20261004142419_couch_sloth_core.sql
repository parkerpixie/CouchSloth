-- Couch Sloth is a shared household app. Only the Netlify backend accesses
-- these tables. Profile selection is not a private user login.
create table public.profiles (
  id text primary key check (id in ('parker','blake','porter')),
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.profiles (id,name) values
  ('parker','Parker'),('blake','Blake'),('porter','Porter');

create table public.titles (
  id text primary key check (length(id) between 2 and 120),
  title text not null check (length(btrim(title)) between 1 and 120),
  type text not null check (type in ('Series','Movie','Documentary')),
  format text check (format in ('film','series')),
  description text not null default '' check (length(description) <= 4000),
  poster_url text not null default '',
  legacy_platform text,
  moods text[] not null default '{}',
  runtime_minutes integer check (runtime_minutes between 1 and 600),
  tmdb_id bigint,
  tmdb_media_type text check (tmdb_media_type in ('movie','tv')),
  series_status text not null default 'unknown' check (series_status in ('ongoing','concluded','unknown')),
  metadata_source text not null default 'manual' check (metadata_source in ('manual','legacy','tmdb')),
  added_by text references public.profiles(id),
  created_at timestamptz not null default now()
);
create index titles_added_by_idx on public.titles (added_by);
create unique index titles_tmdb_identity_idx on public.titles (tmdb_media_type,tmdb_id) where tmdb_id is not null;
create index titles_name_idx on public.titles (lower(title));

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.titles(id) on delete cascade,
  season_number integer not null check (season_number between 0 and 200),
  name text not null default '',
  episode_count integer check (episode_count between 0 and 1000),
  release_date date,
  source_url text,
  metadata_source text not null default 'manual' check (metadata_source in ('manual','tmdb')),
  created_at timestamptz not null default now(),
  unique (title_id,season_number)
);

create table public.watch_progress (
  profile_id text not null references public.profiles(id),
  title_id text not null references public.titles(id) on delete cascade,
  status text not null default 'watchlist' check (status in ('watchlist','watching','caught_up','finished')),
  tracking_intent text not null default 'all' check (tracking_intent in ('all','latest','partial')),
  updated_at timestamptz not null default now(),
  primary key (profile_id,title_id)
);
create index watch_progress_title_id_idx on public.watch_progress (title_id);

create table public.season_progress (
  profile_id text not null references public.profiles(id),
  season_id uuid not null references public.seasons(id) on delete cascade,
  watched boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (profile_id,season_id)
);
create index season_progress_season_id_idx on public.season_progress (season_id);

create table public.streaming_availability (
  id uuid primary key default gen_random_uuid(),
  title_id text not null references public.titles(id) on delete cascade,
  provider text not null check (length(btrim(provider)) between 1 and 120),
  region text not null default 'US' check (region ~ '^[A-Z]{2}$'),
  status text not null check (status in ('available','upcoming','unknown')),
  release_date date,
  watch_url text,
  source_url text,
  metadata_source text not null default 'manual' check (metadata_source in ('manual','tmdb','legacy')),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (title_id,provider,region)
);
create index streaming_availability_release_idx on public.streaming_availability (release_date) where release_date is not null;

alter table public.profiles enable row level security;
alter table public.titles enable row level security;
alter table public.seasons enable row level security;
alter table public.watch_progress enable row level security;
alter table public.season_progress enable row level security;
alter table public.streaming_availability enable row level security;

-- Direct client API roles get no table access. No permissive public policies.
revoke all on table public.profiles,public.titles,public.seasons,
  public.watch_progress,public.season_progress,public.streaming_availability from anon,authenticated;
grant select,insert,update,delete on table public.profiles,public.titles,public.seasons,
  public.watch_progress,public.season_progress,public.streaming_availability to service_role;

-- Create + save is one transaction. A retried operation uses the same title ID.
create function public.add_title_to_watchlist(
  p_id text,p_title text,p_type text,p_profile_id text,p_tracking_intent text,
  p_description text default '',p_moods text[] default '{}',
  p_runtime_minutes integer default null,p_poster_url text default ''
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.titles (id,title,type,format,description,added_by,moods,runtime_minutes,poster_url)
  values (p_id,btrim(p_title),p_type,case p_type when 'Movie' then 'film' when 'Series' then 'series' else null end,
    p_description,p_profile_id,p_moods,p_runtime_minutes,p_poster_url)
  on conflict (id) do nothing;

  insert into public.watch_progress (profile_id,title_id,tracking_intent)
  values (p_profile_id,p_id,p_tracking_intent)
  on conflict (profile_id,title_id) do nothing;
  return pg_catalog.jsonb_build_object('id',p_id);
end;
$$;
revoke all on function public.add_title_to_watchlist(text,text,text,text,text,text,text[],integer,text) from public,anon,authenticated;
grant execute on function public.add_title_to_watchlist(text,text,text,text,text,text,text[],integer,text) to service_role;
