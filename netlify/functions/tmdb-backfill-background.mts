import { database } from './_shared/database.mts';
import { applyTmdbMatch, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './_shared/tmdb.mts';

async function setBackfillIdle() {
  await database('automation_state?id=eq.tmdb_backfill', {
    method: 'PATCH',
    body: JSON.stringify({
      status: 'idle',
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
}

export default async (req: Request) => {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) {
    console.log('TMDB backfill ignored: request was not same-origin.');
    return;
  }

  const claimed = await database('rpc/claim_tmdb_backfill', {
    method: 'POST',
    body: '{}',
  });

  if (claimed !== true) {
    console.log('TMDB backfill already running.');
    return;
  }

  try {
    const rows = await database(
      'titles?tmdb_match_status=eq.pending&select=id&order=created_at.asc&limit=60'
    );

    let matched = 0;
    let review = 0;
    let notFound = 0;
    let errors = 0;

    for (const row of rows) {
      try {
        const title = await getTitle(row.id);
        const candidates = await searchTmdb(title);
        const recommendation = await recommendTmdb(title, candidates);

        if (recommendation.candidate && recommendation.confidence >= 0.88) {
          await applyTmdbMatch(row.id, recommendation.candidate);
          matched += 1;
        } else if (candidates.length) {
          await recordTmdbReview(row.id, 'review');
          review += 1;
        } else {
          await recordTmdbReview(row.id, 'not_found');
          notFound += 1;
        }
      } catch {
        errors += 1;
      }
    }

    console.log(JSON.stringify({
      task: 'couch-sloth-tmdb-initial-backfill',
      processed: rows.length,
      matched,
      review,
      notFound,
      errors,
    }));
  } finally {
    await setBackfillIdle();
  }
};

export const config = {
  path: '/api/tmdb-backfill',
};
