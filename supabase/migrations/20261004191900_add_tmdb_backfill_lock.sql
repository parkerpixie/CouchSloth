create table if not exists public.automation_state (
  id text primary key,
  status text not null default 'idle' check (status in ('idle','running')),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.automation_state enable row level security;
revoke all on table public.automation_state from anon, authenticated;

insert into public.automation_state(id,status)
values ('tmdb_backfill','idle')
on conflict(id) do nothing;

create or replace function public.claim_tmdb_backfill()
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed boolean;
begin
  update public.automation_state
  set status='running',
      started_at=now(),
      updated_at=now()
  where id='tmdb_backfill'
    and (
      status='idle'
      or started_at is null
      or started_at < now() - interval '20 minutes'
    )
  returning true into claimed;

  return coalesce(claimed,false);
end;
$$;

revoke execute on function public.claim_tmdb_backfill() from public, anon, authenticated;
grant execute on function public.claim_tmdb_backfill() to service_role;
