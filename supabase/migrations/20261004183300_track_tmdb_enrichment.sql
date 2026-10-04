alter table public.titles
  add column if not exists backdrop_url text not null default '',
  add column if not exists tmdb_match_status text not null default 'pending'
    check (tmdb_match_status in ('pending','matched','review','not_found')),
  add column if not exists tmdb_checked_at timestamptz;

update public.titles
set tmdb_match_status = 'matched',
    tmdb_checked_at = coalesce(tmdb_checked_at, now())
where tmdb_id is not null;
