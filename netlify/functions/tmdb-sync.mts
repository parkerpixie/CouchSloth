import { database } from './_shared/database.mts';
import { applyTmdbMatch, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './_shared/tmdb.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

async function mark(message: string, status: 'idle' | 'running' = 'idle') {
  await database('automation_state?id=eq.tmdb_sync', {
    method: 'PATCH',
    body: JSON.stringify({
      status,
      last_message: message.slice(0, 2000),
      updated_at: new Date().toISOString(),
      ...(status === 'running' ? { started_at: new Date().toISOString() } : { finished_at: new Date().toISOString() }),
    }),
  });
}

export default async () => {
  if (!Netlify.env.get('TMDB_ACCESS_TOKEN') && !Netlify.env.get('TMDB_API_KEY')) {
    await mark('No TMDB credential is configured.');
    console.log('Couch Sloth TMDB sync skipped: no TMDB credential is configured.');
    return;
  }

  await mark('Starting TMDB enrichment run.', 'running');

  const rows = await database(
    'titles?tmdb_match_status=eq.pending&select=id&order=created_at.asc&limit=15'
  );

  const errors: string[] = [];
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
    } catch (error) {
      if (errors.length < 5) errors.push(error instanceof Error ? error.message : String(error));
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
    errorSamples: errors,
  };
  await mark(JSON.stringify(summary));
  console.log(JSON.stringify({ task: 'couch-sloth-tmdb-sync', ...summary }));
};

export const config = {
  schedule: '* * * * *',
};
