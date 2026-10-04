import { database } from './_shared/database.mts';
import { applyTmdbMatch, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './_shared/tmdb.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default async () => {
  if (!Netlify.env.get('TMDB_ACCESS_TOKEN')) {
    console.log('Couch Sloth TMDB sync skipped: TMDB_ACCESS_TOKEN is not configured.');
    return;
  }

  const rows = await database(
    'titles?tmdb_match_status=eq.pending&select=id&order=created_at.asc&limit=5'
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
    task: 'couch-sloth-tmdb-sync',
    processed: rows.length,
    matched,
    review,
    notFound,
    errors,
  }));
};

export const config = {
  schedule: '*/15 * * * *',
};
