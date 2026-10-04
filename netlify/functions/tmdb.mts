import { ApiError, database, reply } from './_shared/database.mts';
import { applyTmdbMatch, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './_shared/tmdb.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

function text(value: unknown, max = 120) {
  if (typeof value !== 'string') throw new ApiError('Invalid request.');
  const result = value.trim();
  if (!result || result.length > max) throw new ApiError('Invalid request.');
  return result;
}

function titleId(value: unknown) {
  const id = text(value, 120);
  if (!/^[a-z0-9][a-z0-9-]{1,119}$/.test(id)) throw new ApiError('Invalid title.');
  return id;
}

function requireSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin) throw new ApiError('Please use TMDB from the Couch Sloth app.', 403);
}

function requireAdmin(req: Request) {
  const expected = Netlify.env.get('COUCHSLOTH_ADMIN_KEY');
  const provided = req.headers.get('x-couchsloth-admin');
  if (!expected || !provided || provided !== expected) throw new ApiError('Not authorized.', 403);
}

function parseCandidate(body: any) {
  const id = Number(body.tmdbId);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError('Invalid TMDB selection.');
  if (body.mediaType !== 'movie' && body.mediaType !== 'tv') throw new ApiError('Invalid TMDB media type.');
  return { id, mediaType: body.mediaType as 'movie' | 'tv' };
}

async function autoMatch(id: string) {
  const title = await getTitle(id);
  const candidates = await searchTmdb(title);
  const recommendation = await recommendTmdb(title, candidates);

  if (recommendation.candidate && recommendation.confidence >= 0.88) {
    const applied = await applyTmdbMatch(id, recommendation.candidate);
    return {
      status: 'applied',
      recommendation: {
        tmdbId: recommendation.candidate.id,
        mediaType: recommendation.candidate.mediaType,
        confidence: recommendation.confidence,
        reason: recommendation.reason,
        mode: recommendation.mode,
      },
      applied,
      candidates,
    };
  }

  const status = candidates.length ? 'review' : 'not_found';
  await recordTmdbReview(id, status);
  return {
    status,
    recommendation: {
      tmdbId: null,
      mediaType: null,
      confidence: recommendation.confidence,
      reason: recommendation.reason,
      mode: recommendation.mode,
    },
    candidates,
  };
}

export default async (req: Request) => {
  try {
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

    const raw = await req.text();
    if (raw.length > 12000) throw new ApiError('That request is too large.', 413);
    let body: any;
    try { body = JSON.parse(raw); } catch { throw new ApiError('Invalid request.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError('Invalid request.');

    if (body.action === 'backfill') {
      requireAdmin(req);
      const requested = Number(body.limit ?? 6);
      const limit = Number.isInteger(requested) ? Math.max(1, Math.min(10, requested)) : 6;
      const rows = await database(
        `titles?tmdb_match_status=eq.pending&select=id,title,type,description,legacy_platform,tmdb_id,tmdb_media_type&order=created_at.asc&limit=${limit}`
      );
      const results = [];
      for (const row of rows) {
        try {
          results.push({ titleId: row.id, title: row.title, ...(await autoMatch(row.id)) });
        } catch (error) {
          results.push({ titleId: row.id, title: row.title, status: 'error' });
        }
      }
      return reply({ ok: true, processed: results.length, results });
    }

    requireSameOrigin(req);
    const id = titleId(body.titleId);

    if (body.action === 'search') {
      const title = await getTitle(id);
      const candidates = await searchTmdb(title);
      const recommendation = await recommendTmdb(title, candidates);
      return reply({
        ok: true,
        title: { id: title.id, title: title.title, type: title.type },
        candidates,
        recommendation: {
          tmdbId: recommendation.candidate?.id ?? null,
          mediaType: recommendation.candidate?.mediaType ?? null,
          confidence: recommendation.confidence,
          reason: recommendation.reason,
          mode: recommendation.mode,
        },
      });
    }

    if (body.action === 'auto') {
      return reply({ ok: true, ...(await autoMatch(id)) });
    }

    if (body.action === 'apply') {
      const candidate = parseCandidate(body);
      return reply({ ok: true, status: 'applied', applied: await applyTmdbMatch(id, candidate) });
    }

    throw new ApiError('Unknown TMDB action.');
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.message, code: error.code }, error.status);
    console.error('Couch Sloth TMDB request failed');
    return reply({ error: 'The artwork lookup was interrupted. Please try again.', code: 'TMDB_CONNECTION_ERROR' }, 503);
  }
};

export const config = { path: '/api/tmdb' };
