import { reply } from './_shared/database.mts';
import { runTmdbBatch } from './_shared/tmdb-batch.mts';

export default async (req: Request) => {
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);

  const result = await runTmdbBatch(12);
  return reply({ ok: true, ...result });
};

export const config = {
  path: '/api/tmdb-backfill',
};
