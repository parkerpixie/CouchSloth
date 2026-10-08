import { ApiError, database } from './database.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_POSTER = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w780';
const MOODS = ['cozy','funny','dark','curious','mind-bending'] as const;
type Mood = typeof MOODS[number];
type MediaType = 'movie' | 'tv';

function tmdbAuth() {
  const token = Netlify.env.get('TMDB_ACCESS_TOKEN');
  const apiKey = Netlify.env.get('TMDB_API_KEY');
  if (!token && !apiKey) throw new ApiError('TMDB is not connected yet.', 503, 'TMDB_SETUP_REQUIRED');
  return { token, apiKey };
}

async function tmdb(path: string, params: Record<string,string> = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  const { token, apiKey } = tmdbAuth();
  Object.entries(params).forEach(([key,value]) => url.searchParams.set(key,value));
  if (apiKey) url.searchParams.set('api_key', apiKey);
  const headers: Record<string,string> = { accept: 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    console.error('TMDB enrichment request failed', response.status, path);
    throw new ApiError('TMDB could not finish enriching that title.', 502, 'TMDB_ERROR');
  }
  return response.json();
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function heuristicMoods(type: MediaType, details: any, keywords: any): Mood[] {
  const genreNames = (details.genres ?? []).map((genre: any) => String(genre.name ?? '').toLowerCase());
  const keywordRows = keywords?.keywords ?? keywords?.results ?? [];
  const keywordNames = keywordRows.map((keyword: any) => String(keyword.name ?? '').toLowerCase());
  const haystack = `${genreNames.join(' ')} ${keywordNames.join(' ')} ${String(details.overview ?? '').toLowerCase()}`;
  const moods = new Set<Mood>();

  if (/comedy|sitcom|parody|humor|stand-up/.test(haystack)) moods.add('funny');
  if (/family|romance|holiday|friendship|feel-good|slice of life|food|cooking|home/.test(haystack)) moods.add('cozy');
  if (/horror|thriller|crime|murder|serial killer|war|dystopia|dark|psychological/.test(haystack)) moods.add('dark');
  if (/documentary|history|science|nature|biography|investigation|true crime|politic|culture|technology/.test(haystack)) moods.add('curious');
  if (/science fiction|sci-fi|mystery|fantasy|surreal|time travel|alternate reality|mind|conspiracy/.test(haystack)) moods.add('mind-bending');

  if (!moods.size && type === 'movie' && genreNames.includes('documentary')) moods.add('curious');
  return [...moods];
}

async function aiMoods(type: MediaType, details: any, keywords: any): Promise<Mood[] | null> {
  const base = Netlify.env.get('OPENAI_BASE_URL');
  const key = Netlify.env.get('OPENAI_API_KEY');
  if (!base || !key) return null;

  const keywordRows = keywords?.keywords ?? keywords?.results ?? [];
  const payload = {
    mediaType: type,
    title: type === 'movie' ? details.title : details.name,
    overview: String(details.overview ?? '').slice(0, 1200),
    genres: (details.genres ?? []).map((genre: any) => genre.name),
    keywords: keywordRows.slice(0, 30).map((keyword: any) => keyword.name),
  };

  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Classify a movie or TV title into zero or more Couch Sloth mood tags. Use only: cozy, funny, dark, curious, mind-bending. Return JSON only as {"moods":[]}. Be conservative.' },
          { role: 'user', content: JSON.stringify(payload) },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    if (!Array.isArray(parsed.moods)) return null;
    return unique(parsed.moods.map(String)).filter((mood): mood is Mood => MOODS.includes(mood as Mood));
  } catch {
    return null;
  }
}

function seriesStatus(details: any) {
  const status = String(details.status ?? '').toLowerCase();
  if (['ended','canceled','cancelled'].includes(status)) return 'concluded';
  if (['returning series','in production','planned','pilot'].includes(status)) return 'ongoing';
  return 'unknown';
}

function releaseDate(mediaType: MediaType, details: any) {
  const value = String(mediaType === 'movie' ? details.release_date ?? '' : details.first_air_date ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function runtimeMinutes(mediaType: MediaType, details: any) {
  const runtime = mediaType === 'movie'
    ? Number(details.runtime ?? 0)
    : Number((details.episode_run_time ?? [])[0] ?? details.last_episode_to_air?.runtime ?? 0);
  return runtime > 0 && runtime <= 600 ? runtime : null;
}

async function saveSeasons(titleId: string, details: any) {
  const rows = (details.seasons ?? [])
    .filter((season: any) => Number(season.season_number) > 0)
    .map((season: any) => ({
      title_id: titleId,
      season_number: Number(season.season_number),
      name: String(season.name ?? '').slice(0, 120),
      episode_count: Number(season.episode_count ?? 0) || null,
      release_date: /^\d{4}-\d{2}-\d{2}$/.test(String(season.air_date ?? '')) ? season.air_date : null,
      metadata_source: 'tmdb',
    }));
  if (!rows.length) return 0;
  await database('seasons?on_conflict=title_id,season_number', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(rows),
  });
  return rows.length;
}

async function saveStreaming(titleId: string, providers: any) {
  const us = providers?.results?.US;
  if (!us) return [] as string[];
  const providerRows = [...(us.flatrate ?? []), ...(us.free ?? []), ...(us.ads ?? [])];
  const names = unique(providerRows.map((provider: any) => String(provider.provider_name ?? '').trim()));
  if (!names.length) return [] as string[];
  const now = new Date().toISOString();
  await database('streaming_availability?on_conflict=title_id,provider,region', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify(names.map(provider => ({
      title_id: titleId,
      provider,
      region: 'US',
      status: 'available',
      release_date: null,
      watch_url: us.link || null,
      source_url: us.link || null,
      metadata_source: 'tmdb',
      checked_at: now,
    }))),
  });
  return names;
}

export async function enrichTmdbMatch(titleId: string, tmdbId: number, mediaType: MediaType) {
  const [details, providers, keywords, externalIds, currentRows] = await Promise.all([
    tmdb(`/${mediaType}/${tmdbId}`, { language: 'en-US' }),
    tmdb(`/${mediaType}/${tmdbId}/watch/providers`),
    tmdb(`/${mediaType}/${tmdbId}/keywords`),
    tmdb(`/${mediaType}/${tmdbId}/external_ids`),
    database(`titles?id=eq.${encodeURIComponent(titleId)}&select=id,description,metadata_source`),
  ]);

  if (!currentRows?.length) throw new ApiError('That title could not be found.', 404, 'NOT_FOUND');
  const current = currentRows[0];
  const genres = unique((details.genres ?? []).map((genre: any) => String(genre.name ?? '').trim()));
  const fallbackMoods = heuristicMoods(mediaType, details, keywords);
  const moods = (await aiMoods(mediaType, details, keywords)) ?? fallbackMoods;
  const overview = String(details.overview ?? '').trim().slice(0, 4000);
  const release = releaseDate(mediaType, details);
  const runtime = runtimeMinutes(mediaType, details);
  const imdbId = String(externalIds?.imdb_id ?? details.imdb_id ?? '').trim() || null;
  const posterUrl = details.poster_path ? `${TMDB_POSTER}${details.poster_path}` : '';
  const backdropUrl = details.backdrop_path ? `${TMDB_BACKDROP}${details.backdrop_path}` : '';

  const patch: Record<string, unknown> = {
    tmdb_id: tmdbId,
    tmdb_media_type: mediaType,
    metadata_source: 'tmdb',
    tmdb_match_status: 'matched',
    tmdb_checked_at: new Date().toISOString(),
    format: mediaType === 'movie' ? 'film' : 'series',
    genres,
    moods,
    release_date: release,
    imdb_id: imdbId,
    official_overview: overview || null,
  };
  if (posterUrl) patch.poster_url = posterUrl;
  if (backdropUrl) patch.backdrop_url = backdropUrl;
  if (runtime) patch.runtime_minutes = runtime;
  if (mediaType === 'tv') patch.series_status = seriesStatus(details);
  if ((!current.description || current.description.trim().length < 12) && overview) patch.description = overview;

  await database(`titles?id=eq.${encodeURIComponent(titleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  const [seasonCount, streamingProviders] = await Promise.all([
    mediaType === 'tv' ? saveSeasons(titleId, details) : Promise.resolve(0),
    saveStreaming(titleId, providers),
  ]);

  return {
    titleId,
    tmdbId,
    mediaType,
    overview: overview || null,
    releaseDate: release,
    genres,
    moods,
    runtimeMinutes: runtime,
    imdbId,
    seasonCount,
    streamingProviders,
  };
}
