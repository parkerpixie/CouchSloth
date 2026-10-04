# Couch Sloth 2.0

A shared family watching library for Parker, Blake, and Porter. Voting has been retired. Each profile has its own saved titles, viewing status, and season progress; family members can browse one another’s lists.

## Current release

- Home: Available Now, Continue Watching, Just Released, Coming This Week, and the shared library.
- Coming Soon: dated season/provider releases, type/service filters, and undated upcoming titles.
- Sloth Pick: mood, commitment, and viewer selection; random Full Chaos; completed-title exclusions.
- My Stuff: Watchlist, Watching, Caught Up, Finished, and family profile browsing.
- Persistent + Add: existing-library search, manual additions, tracking intention, optional mood/runtime metadata.
- Title details: save progress, record watched seasons, and manually record streaming availability/dates.

The Fall 2026 master-list import, TMDB title/provider search, and AI enrichment are later planned steps. Legacy service labels are unconfirmed, not verified availability. Release metadata currently entered by a person is labeled as manually recorded. No votes were imported.

## Architecture and access

Vite and plain JavaScript render the frontend. A Netlify Function at `/api/library` calls Supabase using a server-only secret key. Supabase is the source of truth for profiles, titles, seasons, watch progress, season progress, and streaming availability. No database key is included in the browser build.

This is a shared household prototype. Selecting a profile chooses whose list to edit; it is not authentication. Anyone with access to the app can use its shared household API. Direct Supabase access by `anon` and `authenticated` has no table grants or public policies. RLS is enabled. The Netlify backend uses restricted actions and validates profile IDs; secret-key access bypasses RLS as intended. Private accounts/invitations are not implemented.

## Connection setup

On the existing Netlify project, create these environment variables scoped to Functions (or all scopes) and all deploy contexts:

- `SUPABASE_URL`: the CouchSloth Supabase project URL.
- `SUPABASE_SECRET_KEY`: a Supabase secret key beginning `sb_secret_`.

Never use a `VITE_` prefix for the secret key. Save changes and redeploy to activate them. Missing configuration produces an explicit error and cannot result in a successful-save message.

Schema migrations are in `supabase/migrations/`. `supabase/seed.sql` is an idempotent import of the original catalog, not the future Fall master list. Existing custom additions are saved for their original adding profile. No watched status is inferred from legacy votes. The old Blobs stores were not deleted.

## Development and validation

Use Node.js 22 to match Netlify.

```sh
npm ci
npm test
npm run build
```

Use Netlify Dev for integrated frontend/function testing:

```sh
npx netlify dev
```

Plain `npm run dev` starts only Vite; it does not provide `/api/library`. Frontend output is `dist/`; functions are in `netlify/functions/`. Dependency versions are captured in `package-lock.json`.

The [original Step 1 audit](docs/couch-sloth-2-step-1-audit.md) describes the retired voting implementation and the initial rebuild plan. The user’s later direction supersedes its voting-preservation proposal.
