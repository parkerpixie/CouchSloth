import { runTmdbBatch } from './_shared/tmdb-batch.mts';

export default async () => {
  const result = await runTmdbBatch(60);
  console.log(JSON.stringify({ task: 'couch-sloth-tmdb-initial-backfill', ...result }));
};

export const config = {
  path: '/api/tmdb-backfill',
};
