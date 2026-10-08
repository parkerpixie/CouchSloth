-- Keep official catalog metadata separate from the household's existing notes.
alter table public.titles
  add column if not exists release_date date,
  add column if not exists genres text[] not null default '{}',
  add column if not exists imdb_id text,
  add column if not exists official_overview text;

alter table public.titles
  drop constraint if exists titles_official_overview_length;

alter table public.titles
  add constraint titles_official_overview_length
  check (official_overview is null or length(official_overview) <= 4000);

create index if not exists titles_release_date_idx
  on public.titles (release_date)
  where release_date is not null;

create index if not exists titles_imdb_id_idx
  on public.titles (imdb_id)
  where imdb_id is not null;
