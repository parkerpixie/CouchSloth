import { database } from './_shared/database.mts';
import { applyTmdbMatch, getTitle, recommendTmdb, recordTmdbReview, searchTmdb } from './_shared/tmdb.mts';

declare const Netlify: { env: { get(name: string): string | undefined } };

export default async () => {
  if (!Netlify.env.get('TMDB_ACCESS_TOKEN') && !Netlify.env.get('TMDB_API_KEY')) {
    console.log('Couch Sloth TMDB sync skipped: no TMDB credential is configured.');
    return;
  }

  const rows = await database(
    'titles?tmdb_match_status=eq.pending&select=id&order=created_at.asc&limit=15'
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
  console.log(JSON.stringify({
    task: 'couch-sloth-tmdb-sync',
    processed: rows.length,
    matched: count('matched'),
    review: count('review'),
    notFound: count('not_found'),
    errors: count('error'),
  }));
};

export const config = {
  schedule: '* * * * *',
};
