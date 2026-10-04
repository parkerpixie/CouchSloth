-- Recording a season also saves its title for that profile, atomically.
create function public.record_season_progress(p_profile_id text,p_season_id uuid,p_watched boolean)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_title_id text;
begin
  select title_id into strict v_title_id from public.seasons where id=p_season_id;
  insert into public.season_progress(profile_id,season_id,watched)
  values(p_profile_id,p_season_id,p_watched)
  on conflict(profile_id,season_id) do update set watched=excluded.watched,updated_at=now();
  insert into public.watch_progress(profile_id,title_id,status,tracking_intent)
  values(p_profile_id,v_title_id,case when p_watched then 'watching' else 'watchlist' end,'partial')
  on conflict(profile_id,title_id) do nothing;
end;
$$;
revoke all on function public.record_season_progress(text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.record_season_progress(text,uuid,boolean) to service_role;
