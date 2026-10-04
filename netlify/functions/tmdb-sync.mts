import { runTmdbBatch } from './_shared/tmdb-batch.mts';

export default async () => {
  const result = await runTmdbBatch(15);
  console.log(JSON.stringify({ task: 'couch-sloth-tmdb-sync', ...result }));
};

export const config = {
  schedule: '* * * * *',
};
