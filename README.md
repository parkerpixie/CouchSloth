# Couch Sloth 2.0

A shared family watching library for Parker, Blake, and Porter. Voting has been retired. Each profile has its own saved titles, viewing status, and season progress; family members can browse one another’s lists.

## Current release

- Home: Available Now, Continue Watching, Just Released, Coming This Week, and the shared library.
- Coming Soon: dated season/provider releases, type/service filters, and undated upcoming titles.
- Sloth Pick: mood, commitment, and viewer selection; random Full Chaos; completed-title exclusions.
- My Stuff: Watchlist, Watching, Caught Up, Finished, and family profile browsing.
- Persistent + Add: existing-library search, manual additions, tracking intention, optional mood/runtime metadata.
- Title details: save progress, record watched seasons, and manually record streaming availability/dates.

The Fall 2026 master list is loaded in Supabase. TMDB artwork/metadata enrichment is implemented through `/api/tmdb`: exact/high-confidence matches save automatically, ambiguous matches are held for human review, and pending titles are also enriched from normal library loads plus a scheduled maintenance sweep. Netlify AI Gateway is used as an optional judgment layer when a deterministic match is not clear. Legacy service labels remain unconfirmed unless explicitly recorded as availability. No votes were imported.

## Architecture and access

Vite and plain JavaScript render the frontend. A Netlify Function at `/api/library` calls Supabase using a server-only secret key. Supabase is the source of truth for profiles, titles, seasons, watch progress, season progress, and streaming availability. No database key is included in the browser build.

This is a shared household prototype. Selecting a profile chooses whose list to edit; it is not authentication. Anyone with access to the app can use its shared household API. Direct Supabase access by `anon` and `authenticated` has no table grants or public policies. RLS is enabled. The Netlify backend uses restricted actions and validates profile IDs; secret-key access bypasses RLS as intended. Private accounts/invitations are not implemented.

## Connection setup

On the existing Netlify project, create these environment variables scoped to Functions (or all scopes) and all deploy contexts:

- `SUPABASE_URL`: the CouchSloth Supabase project URL.
- `SUPABASE_SECRET_KEY`: a Supabase secret key beginning `sb_secret_`.
- `TMDB_ACCESS_TOKEN`: the TMDB API Read Access Token, or `TMDB_API_KEY`: the v3 API key. Couch Sloth accepts either credential. Keep either one server-side and secret.

Never use a `VITE_` prefix for the secret key. Save changes and redeploy to activate them. Environment-variable changes require a new production deploy before Functions can read the new values. Missing configuration produces an explicit error and cannot result in a successful-save message.

Schema migrations are in `supabase/migrations/`. The legacy seed and Fall 2026 master-list import are both preserved there. TMDB enrichment stores the matched TMDB ID/media type, poster, backdrop, runtime, match status, and last-check timestamp. Existing custom additions are saved for their original adding profile. No watched status is inferred from legacy votes. The old Blobs stores were not deleted.

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


## TMDB artwork automation

Couch Sloth uses TMDB as the authoritative media-art and title-metadata source. New titles attempt an immediate match after they are saved. Existing pending titles are queued from normal library loads, with a scheduled Netlify Function as a maintenance fallback.

- Strong deterministic matches are applied automatically.
- Ambiguous matches can be evaluated by Netlify AI Gateway when its runtime variables are available.
- Low-confidence results are marked `review` and require a human selection in the title detail panel.
- No-result searches are marked `not_found` instead of repeatedly calling TMDB.
- Poster and backdrop URLs are stored in Supabase; the browser never receives the TMDB access token.

TMDB attribution must remain present in the app and should use an approved TMDB logo in the final Credits/About experience.
