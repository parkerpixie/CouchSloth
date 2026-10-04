declare const Netlify: { env: { get(name: string): string | undefined } };

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = 'INVALID_INPUT') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function database(path: string, options: RequestInit = {}) {
  const url = Netlify.env.get('SUPABASE_URL');
  const key = Netlify.env.get('SUPABASE_SECRET_KEY');
  if (!url || !key) throw new ApiError('The database connection needs its Netlify environment settings. Your changes have not been saved.', 503, 'SETUP_REQUIRED');
  const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...options,
    headers: { apikey: key, 'content-type': 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    console.error('Supabase request failed', response.status);
    throw new ApiError('The database could not complete that request. Please try again.', 502, 'DATABASE_ERROR');
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}
