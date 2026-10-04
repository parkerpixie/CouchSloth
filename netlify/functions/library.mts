import { ApiError, database, reply } from './_shared/database.mts';

function text(value: unknown, max: number, required = false): string {
  if (value != null && typeof value !== 'string') throw new ApiError('Please enter text in that field.');
  const result = String(value ?? '').trim();
  if (result.length > max || (required && !result)) throw new ApiError('A required field is missing or too long.');
  return result;
}

function choice(value: unknown, allowed: string[]): string {
  if (typeof value !== 'string' || !allowed.includes(value)) throw new ApiError('Please choose a valid option.');
  return value;
}

function titleId(value: unknown): string {
  const id = text(value, 120, true);
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) throw new ApiError('Invalid title.');
  return id;
}

function date(value: unknown): string | null {
  if (!value) return null;
  const result = text(value, 10);
  const parsed = new Date(`${result}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) throw new ApiError('Please use a valid date.');
  return result;
}

function link(value: unknown): string | null {
  const result = text(value, 2000);
  if (!result) return null;
  try { if (new URL(result).protocol === 'https:') return result; } catch { /* invalid URL */ }
  throw new ApiError('Links must be complete HTTPS URLs.');
}

function number(value: unknown, max: number): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 1 || result > max) throw new ApiError('Please enter a valid number.');
  return result;
}

async function requireTitle(id: string) {
  const rows = await database(`titles?id=eq.${encodeURIComponent(id)}&select=id`);
  if (!rows.length) throw new ApiError('That title could not be found.', 404);
}

export default async (req: Request) => {
  try {
    if (req.method === 'GET') {
      const profiles = await database('profiles?select=id,name&order=created_at.asc');
      const titles = [];
      let offset = 0;
      while (true) {
        const page = await database(`titles?select=*,seasons(*,season_progress(*)),watch_progress(*),streaming_availability(*)&order=created_at.desc,id.asc&offset=${offset}&limit=500`);
        titles.push(...page);
        if (page.length < 500) break;
        offset += 500;
      }
      return reply({ profiles, titles, dataSource: 'supabase' });
    }
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin) throw new ApiError('Please save from the Couch Sloth app.', 403);
    const raw = await req.text();
    if (raw.length > 20000) throw new ApiError('That entry is too large.', 413);
    let body;
    try { body = JSON.parse(raw); } catch { throw new ApiError('Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('Invalid request.');
    const profileId = choice(body.profileId, ['parker', 'blake', 'porter']);
    const id = titleId(body.titleId);
    if (body.action === 'add') {
      if (!/^custom-[0-9a-f-]{36}$/.test(id)) throw new ApiError('Invalid addition ID.');
      const moods = Array.isArray(body.moods) ? body.moods.map((m: unknown) => choice(m, ['cozy','funny','dark','curious','mind-bending'])) : [];
      await database('rpc/add_title_to_watchlist', { method: 'POST', body: JSON.stringify({
        p_id: id, p_title: text(body.title, 120, true), p_type: choice(body.type, ['Series','Movie','Documentary']),
        p_profile_id: profileId, p_tracking_intent: choice(body.trackingIntent, ['all','latest','partial']),
        p_description: text(body.description, 4000), p_moods: [...new Set(moods)],
        p_runtime_minutes: number(body.runtimeMinutes, 600), p_poster_url: link(body.posterUrl) || '',
      }) });
    } else {
      await requireTitle(id);
      if (body.action === 'progress') {
        await database('watch_progress?on_conflict=profile_id,title_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({
          profile_id: profileId, title_id: id, status: choice(body.status, ['watchlist','watching','caught_up','finished']),
          tracking_intent: choice(body.trackingIntent ?? 'all', ['all','latest','partial']), updated_at: new Date().toISOString(),
        }) });
      } else if (body.action === 'season') {
        const seasonNumber = number(body.seasonNumber, 200);
        if (seasonNumber == null) throw new ApiError('Please enter a season number.');
        await database('seasons?on_conflict=title_id,season_number', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({
          title_id: id, season_number: seasonNumber, name: text(body.name, 120),
          release_date: date(body.releaseDate), episode_count: number(body.episodeCount, 1000), source_url: link(body.sourceUrl),
        }) });
      } else if (body.action === 'seasonProgress') {
        const seasonId = text(body.seasonId, 36, true);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(seasonId) || typeof body.watched !== 'boolean') throw new ApiError('Invalid season update.');
        const rows = await database(`seasons?id=eq.${seasonId}&title_id=eq.${encodeURIComponent(id)}&select=id`);
        if (!rows.length) throw new ApiError('That season could not be found.', 404);
        await database('rpc/record_season_progress', { method: 'POST', body: JSON.stringify({
          p_profile_id: profileId, p_season_id: seasonId, p_watched: body.watched,
        }) });
      } else if (body.action === 'metadata') {
        const moods = Array.isArray(body.moods) ? body.moods.map((m: unknown) => choice(m, ['cozy','funny','dark','curious','mind-bending'])) : [];
        await database(`titles?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({
          moods: [...new Set(moods)], runtime_minutes: number(body.runtimeMinutes, 600),
        }) });
      } else if (body.action === 'availability') {
        const status = choice(body.status, ['available','upcoming','unknown']);
        await database('streaming_availability?on_conflict=title_id,provider,region', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({
          title_id: id, provider: text(body.provider, 120, true), region: 'US', status,
          release_date: date(body.releaseDate), source_url: link(body.sourceUrl), watch_url: link(body.watchUrl),
          metadata_source: 'manual', checked_at: new Date().toISOString(),
        }) });
      } else throw new ApiError('Unknown action.');
    }
    return reply({ ok: true, titleId: id });
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.message, code: error.code }, error.status);
    console.error('Couch Sloth database request failed');
    return reply({ error: 'The connection was interrupted. Your changes have not been confirmed; please retry.', code: 'CONNECTION_ERROR' }, 503);
  }
};

export const config = { path: '/api/library' };
