import { database } from './database.mts';
import { applyTmdbMatch, checkTmdbConnection, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './tmdb.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

async function setState(message: string, running = false) {
  try {
    await database('automation_state?id=eq.tmdb_sync', {
      method: 'PATCH',
      body: JSON.stringify({
        status: running ? 'running' : 'idle',
        last_message: message.slice(0, 500),
        ...(running ? { started_at: new Date().toISOString() } : { finished_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Diagnostics must never prevent enrichment.
  }
}

async function setBackfillIdle() {
  try {
    await database('automation_state?id=eq.tmdb_backfill', {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'idle',
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Lock cleanup is best effort.
  }
}

export async function runTmdbBatch(limit = 8) {
  if (!Netlify.env.get('TMDB_ACCESS_TOKEN') && !Netlify.env.get('TMDB_API_KEY')) {
    await setState('TMDB enrichment skipped: no TMDB credential is configured.');
    return { processed: 0, matched: 0, review: 0, notFound: 0, errors: 0, skipped: 'missing_credential' };
  }

  let claimed = false;
  try {
    claimed = await database('rpc/claim_tmdb_backfill', { method: 'POST', body: '{}' }) === true;
  } catch (error) {
    await setState(`TMDB enrichment lock failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    return { processed: 0, matched: 0, review: 0, notFound: 0, errors: 1, skipped: 'lock_error' };
  }

  if (!claimed) return { processed: 0, matched: 0, review: 0, notFound: 0, errors: 0, skipped: 'already_running' };

  await setState('TMDB enrichment started.', true);

  try {
    try {
      const connected = await checkTmdbConnection();
      if (!connected) {
        await setState('TMDB health check returned an unexpected response.');
        return { processed: 0, matched: 0, review: 0, notFound: 0, errors: 1, skipped: 'health_check_failed' };
      }
    } catch (error) {
      await setState(`TMDB connection failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { processed: 0, matched: 0, review: 0, notFound: 0, errors: 1, skipped: 'tmdb_connection_failed' };
    }

    const safeLimit = Math.max(1, Math.min(60, Math.trunc(limit) || 8));
    const rows = await database(
      `titles?tmdb_match_status=eq.pending&select=id&order=created_at.asc&limit=${safeLimit}`
    );

    const results = await Promise.all(rows.map(async (row: { id: string }) => {
      try {
        const title = await getTitle(row.id);
        const candidates = await searchTmdb(title);
        const recommendation = await recommendTmdb(title, candidates);

        if (recommendation.candidate && recommendation.confidence >= 0.88) {
          await applyTmdbMatch(row.id, recommendation.candidate);
          return 'matched';
        }
        if (candidates.length) {
          await recordTmdbReview(row.id, 'review');
          return 'review';
        }
        await recordTmdbReview(row.id, 'not_found');
        return 'not_found';
      } catch {
        return 'error';
      }
    }));

    const count = (status: string) => results.filter(result => result === status).length;
    const summary = {
      processed: rows.length,
      matched: count('matched'),
      review: count('review'),
      notFound: count('not_found'),
      errors: count('error'),
    };

    await setState(`Processed ${summary.processed}: ${summary.matched} matched, ${summary.review} review, ${summary.notFound} not found, ${summary.errors} errors.`);
    return summary;
  } finally {
    await setBackfillIdle();
  }
}
