import { ApiError, database } from './database.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

const TMDB_API = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';

type TitleRow = {
  id: string;
  title: string;
  type: 'Series' | 'Movie' | 'Documentary';
  description?: string | null;
  legacy_platform?: string | null;
  tmdb_id?: number | null;
  tmdb_media_type?: 'movie' | 'tv' | null;
};

export type TmdbCandidate = {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  originalTitle: string;
  year: string | null;
  overview: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  genreIds: number[];
  popularity: number;
  score: number;
};

function tmdbToken() {
  const token = Netlify.env.get('TMDB_ACCESS_TOKEN');
  if (!token) throw new ApiError('TMDB is not connected yet. Add TMDB_ACCESS_TOKEN in Netlify first.', 503, 'TMDB_SETUP_REQUIRED');
  return token;
}

async function tmdb(path: string, params: Record<string, string> = {}) {
  const url = new URL(`${TMDB_API}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${tmdbToken()}`,
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error('TMDB request failed', response.status, path);
    throw new ApiError('TMDB could not complete that lookup. Please try again.', 502, 'TMDB_ERROR');
  }
  return response.json();
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(value: string) {
  const stop = new Set(['the','a','an','and','or','of','to','in','on','for','with','from','is','are','this','that','season','series','documentary']);
  return new Set(normalize(value).split(' ').filter(word => word.length > 2 && !stop.has(word)));
}

function overlapScore(a: string, b: string) {
  const left = words(a);
  const right = words(b);
  if (!left.size || !right.size) return 0;
  let matches = 0;
  for (const word of left) if (right.has(word)) matches += 1;
  return Math.min(18, Math.round((matches / Math.min(left.size, 12)) * 18));
}

function resultTitle(mediaType: 'movie' | 'tv', item: any) {
  return String(mediaType === 'movie' ? item.title ?? '' : item.name ?? '');
}

function originalTitle(mediaType: 'movie' | 'tv', item: any) {
  return String(mediaType === 'movie' ? item.original_title ?? '' : item.original_name ?? '');
}

function resultDate(mediaType: 'movie' | 'tv', item: any) {
  return String(mediaType === 'movie' ? item.release_date ?? '' : item.first_air_date ?? '');
}

function scoreCandidate(title: TitleRow, candidate: Omit<TmdbCandidate, 'score'>) {
  const wanted = normalize(title.title);
  const display = normalize(candidate.title);
  const original = normalize(candidate.originalTitle);
  let score = 0;

  if (display === wanted) score += 58;
  else if (original === wanted) score += 52;
  else if (display.includes(wanted) || wanted.includes(display)) score += 28;

  if (title.type === 'Series' && candidate.mediaType === 'tv') score += 22;
  if (title.type === 'Movie' && candidate.mediaType === 'movie') score += 22;
  if (title.type === 'Documentary' && candidate.genreIds.includes(99)) score += 18;

  score += overlapScore(title.description ?? '', candidate.overview);

  if (candidate.posterUrl) score += 4;
  if (candidate.year && /^202[5-7]$/.test(candidate.year) && title.legacy_platform) score += 3;

  return score;
}

export async function getTitle(titleId: string): Promise<TitleRow> {
  const rows = await database(
    `titles?id=eq.${encodeURIComponent(titleId)}&select=id,title,type,description,legacy_platform,tmdb_id,tmdb_media_type`
  );
  if (!rows.length) throw new ApiError('That title could not be found.', 404, 'NOT_FOUND');
  return rows[0];
}

export async function searchTmdb(title: TitleRow): Promise<TmdbCandidate[]> {
  const mediaTypes: Array<'movie' | 'tv'> =
    title.type === 'Series' ? ['tv'] :
    title.type === 'Movie' ? ['movie'] :
    ['movie', 'tv'];

  const combined: TmdbCandidate[] = [];
  for (const mediaType of mediaTypes) {
    const data = await tmdb(`/search/${mediaType}`, {
      query: title.title,
      include_adult: 'false',
      language: 'en-US',
      page: '1',
    });

    for (const item of (data.results ?? []).slice(0, 8)) {
      const date = resultDate(mediaType, item);
      const raw = {
        id: Number(item.id),
        mediaType,
        title: resultTitle(mediaType, item),
        originalTitle: originalTitle(mediaType, item),
        year: /^\d{4}/.test(date) ? date.slice(0, 4) : null,
        overview: String(item.overview ?? ''),
        posterUrl: item.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : null,
        backdropUrl: item.backdrop_path ? `${TMDB_IMAGE}${item.backdrop_path}` : null,
        genreIds: Array.isArray(item.genre_ids) ? item.genre_ids.map(Number) : [],
        popularity: Number(item.popularity ?? 0),
      };
      combined.push({ ...raw, score: scoreCandidate(title, raw) });
    }
  }

  return combined
    .sort((a, b) => b.score - a.score || b.popularity - a.popularity)
    .slice(0, 6);
}

async function askAi(title: TitleRow, candidates: TmdbCandidate[]) {
  const base = Netlify.env.get('OPENAI_BASE_URL');
  const key = Netlify.env.get('OPENAI_API_KEY');
  if (!base || !key || !candidates.length) return null;

  const payload = candidates.map(candidate => ({
    id: candidate.id,
    mediaType: candidate.mediaType,
    title: candidate.title,
    originalTitle: candidate.originalTitle,
    year: candidate.year,
    overview: candidate.overview.slice(0, 700),
    score: candidate.score,
  }));

  const prompt = [
    'You are matching one Couch Sloth watch-list item to a TMDB candidate.',
    'Choose only when the evidence is strong. If uncertain, return null.',
    'Do not invent facts. Return JSON only with keys candidateId, mediaType, confidence, reason.',
    '',
    `Wanted title: ${title.title}`,
    `Wanted type: ${title.type}`,
    `Known description: ${title.description ?? ''}`,
    `Known platform context: ${title.legacy_platform ?? ''}`,
    '',
    `Candidates: ${JSON.stringify(payload)}`,
  ].join('\n');

  try {
    const response = await fetch(`${base.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Match media records conservatively. Low confidence should be null, not a guess.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.error('AI match request failed', response.status);
      return null;
    }
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
    const confidence = Number(parsed.confidence ?? 0);
    const candidate = candidates.find(item =>
      item.id === Number(parsed.candidateId) &&
      item.mediaType === parsed.mediaType
    );
    if (!candidate) return null;
    return {
      candidate,
      confidence: Math.max(0, Math.min(1, confidence)),
      reason: String(parsed.reason ?? '').slice(0, 300),
      mode: 'ai' as const,
    };
  } catch (error) {
    console.error('AI match failed');
    return null;
  }
}

export async function recommendTmdb(title: TitleRow, candidates: TmdbCandidate[]) {
  if (!candidates.length) return { candidate: null, confidence: 0, reason: 'No TMDB candidates found.', mode: 'none' as const };

  const top = candidates[0];
  const second = candidates[1];
  const margin = second ? top.score - second.score : top.score;

  if (top.score >= 82 && margin >= 14) {
    return {
      candidate: top,
      confidence: 0.98,
      reason: 'Exact title/type match with a clear lead over other results.',
      mode: 'rules' as const,
    };
  }

  const ai = await askAi(title, candidates);
  if (ai && ai.confidence >= 0.88) return ai;

  return {
    candidate: null,
    confidence: ai?.confidence ?? 0,
    reason: ai?.reason || 'The match is ambiguous, so Couch Sloth wants a human confirmation.',
    mode: ai ? 'ai' as const : 'review' as const,
  };
}

export async function applyTmdbMatch(titleId: string, candidate: Pick<TmdbCandidate, 'id' | 'mediaType'>) {
  const title = await getTitle(titleId);
  const details = await tmdb(`/${candidate.mediaType}/${candidate.id}`, {
    language: 'en-US',
  });

  const posterUrl = details.poster_path ? `${TMDB_IMAGE}${details.poster_path}` : '';
  const runtime =
    candidate.mediaType === 'movie'
      ? Number(details.runtime ?? 0)
      : Number((details.episode_run_time ?? [])[0] ?? 0);

  const patch: Record<string, unknown> = {
    tmdb_id: candidate.id,
    tmdb_media_type: candidate.mediaType,
    metadata_source: 'tmdb',
  };
  if (posterUrl) patch.poster_url = posterUrl;
  if (runtime > 0 && runtime <= 600) patch.runtime_minutes = runtime;
  if ((!title.description || title.description.trim().length < 12) && details.overview) {
    patch.description = String(details.overview).slice(0, 4000);
  }

  await database(`titles?id=eq.${encodeURIComponent(titleId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

  return {
    titleId,
    tmdbId: candidate.id,
    mediaType: candidate.mediaType,
    posterUrl: posterUrl || null,
    runtimeMinutes: runtime || null,
  };
}
