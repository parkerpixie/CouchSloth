# Couch Sloth 2.0 — Step 1 repository audit

Audited October 4, 2026. Repository: [parkerpixie/CouchSloth](https://github.com/parkerpixie/CouchSloth). Baseline: `2dfd98492b580932548c9fb1aa5fb4e9bca61c0d`.

The user confirmed Step 1 means a repository audit. The numbered plan was not available from conversation retrieval; the future build sequence below is a proposed sequence based on the recovered, approved interface. It is not a quotation of the earlier numbered plan.

## Outcome

Keep the existing sloth artwork, palette, mobile layout, family profiles, and family voting idea. Keep Netlify hosting and the server-side functions. Introduce structured title, release, and progress data, then replace the three voting-focused tabs with the agreed four-tab interface.

The current frontend builds successfully. Its main limitation is the data model: a title can receive votes, but cannot have watched progress, seasons, verified release dates, mood tags, or multiple streaming providers. Step 1 changes documentation and repository ignore rules only; application behavior and production data remain at the audited baseline.

## What is here today

| Area | Observed implementation | 2.0 treatment |
| --- | --- | --- |
| Frontend | Vite; plain JavaScript; one 771-line `src/main.js` handles state, data calls, rendering, and events | Retain Vite; split these responsibilities into small modules as screens are built |
| Visuals | Plum, cream, teal, coral; rounded cards; sloth illustrations; responsive CSS | Reuse the visual identity and optimize large image exports |
| Profiles | Parker, Blake, Porter; selected name saved on the device | Keep profile switching; distinguish selection from authorized data access |
| Navigation | Vote, Top 5, Family; + Add in the header | Home, Coming Soon, Sloth Pick, My Stuff; persistent + Add |
| Catalog | Nine bundled titles plus one shared JSON array of custom titles | Unified relational catalog; preserve legacy IDs and posters |
| Votes | Yes / Maybe / No; score = Yes × 3 + Maybe − No × 3 | Preserve preferences as one signal for household picks |
| Random selection | Uniform random choice from the ranked Top 5 | Filter by audience, mood, commitment, progress, and availability first |
| Manual additions | Title, category, optional compressed image | Keep a manual path; add an editable AI-assisted draft later |
| Persistence | Two site-scoped Netlify Blobs stores; device localStorage for profile and pending votes | Supabase is the previously proposed relational backend; migrate only after account capacity and production access are verified |
| Tooling | `dev`, `build`, `preview`; no tests, lockfile, or CI workflow tracked at baseline | Add focused checks and a dependency lockfile during implementation |

No React rewrite is necessary to deliver the agreed flows. The current frontend is small enough to evolve in place.

## Agreed user-facing interface

| Surface | Question it answers | Expected behavior | Missing foundation |
| --- | --- | --- | --- |
| Home | What can I watch now? | Available titles, Continue Watching, and recent releases; title details lead to watchlist/progress actions | Availability and release data; profile progress |
| Coming Soon | What is coming, and when? | Chronological release timeline; type and streaming-service filters; save upcoming titles | Dated, sourced title/season release records |
| Sloth Pick | What am I in the mood for? | Short prompts for mood, time/commitment, and who is watching; suggest a match; reroll; Full Chaos random mode | Tags, runtime/format, audience selection, progress and availability filters |
| My Stuff | What have I saved or seen? | Watchlist / Watching / Caught Up / Finished; season-level tracking | Persistent profile-title and profile-season progress |
| + Add | How do I capture something I heard about? | Text entry becomes an editable draft; user approves before saving; manual entry remains usable | A draft/review state, duplicate detection, sourced metadata, optional server-side AI enrichment |

Voting and the household scorecard can be secondary actions within title details and Sloth Pick. They should not occupy all the primary navigation in 2.0.

Proposed default: My Stuff reflects the active profile. Choosing a household audience in Sloth Pick changes recommendation inputs, not another person's watched history.

## Findings to address during implementation

### Data preservation and save correctness

1. **Concurrent additions can lose a title.** `catalog.mjs` reads `custom-shows`, appends, and replaces the whole array. Two requests can read the same starting array; the last write discards the other addition. An in-memory harness running the existing handler returned two HTTP 200 responses but retained only one title. Use independent relational rows and stable IDs rather than an array replacement.
2. **Custom title 101 discards the oldest title.** The handler applies `.slice(-100)` before saving. Reproduced against the existing handler with a 100-record fixture. Remove silent pruning in the new catalog; retained votes for dropped title IDs are not rendered in the current UI.
3. **An older vote save can discard a newer pending vote.** `flushPending()` removes queue entries by person/title only after an awaited save. A replacement vote entered during that save has the same person/title and is also removed. Reproduced using the extracted existing function. Serialize queue processing and acknowledge a specific operation/version; retain a newer edit until its own save succeeds.
4. **Pending votes are not retried during startup.** Startup loads the catalog and votes. The periodic timer skips while votes are pending; retries currently occur through new voting or a focus event. Add an explicit startup/online retry path, preserving pending changes until acknowledged.

### User experience and reliability

- **Background refresh can erase an Add draft.** `loadVotes()` finishes with `render()`, and `render()` replaces the entire app HTML. Polling runs every 15 seconds while visible and the queue is empty. Add fields and image preview are held in DOM nodes rather than draft state. Source-inspected risk; not reproduced in a browser. Preserve drafts independently of rendering and avoid replacing an active form during background refresh.
- **Catalog failure is hidden.** `loadCatalog()` falls back to the nine bundled titles and logs a warning; it has no catalog-specific user-facing error state. Retain the last good catalog and show retry/stale-data feedback instead of making family-added titles appear to disappear.
- **Malformed pending localStorage can prevent startup.** `JSON.parse()` runs outside a try/catch. Only the array shape is checked; queue entries are not validated. Guard parsing and validate recoverable records.
- **Random picks do not establish eligibility.** Ranking does not exclude watched items or enforce a family veto; with no votes, it selects from the first five seeded titles. Define eligible candidates before ranking/randomization. Proposed MVP: exclude completed items and explicit No votes from selected viewers, then rank by their preferences. Full Chaos bypasses mood/commitment matching; proposed default is to retain availability and viewer exclusions, with an explicit rewatch option. These defaults are implementation proposals, not recovered user decisions.
- **Availability is unverified static text.** Bundled platform labels are hard-coded; custom titles use "Family pick". Neither represents a checked regional streaming listing. Existing provider labels should migrate as legacy/unverified metadata.
- **Large images dominate transfer.** Three imported mascot PNGs are about 1.83–1.92 MB each; the icon is about 2.23 MB in the generated build. Create smaller exports while preserving the original artwork. The JavaScript bundle is about 22.75 kB before gzip.
- **Add/pick overlays lack dialog keyboard management.** No dialog role, focus trap/return, or Escape handler is implemented. Treat keyboard and screen-reader support as part of the new shared detail/Add surface.

### Access and development

- Both function handlers accept family names supplied by the caller without checking a session. Validating a name is not authentication. Before introducing private watch history, define household membership and authorize reads/writes; changing storage alone does not fix access control.
- Plain `npm run dev` starts Vite; it does not emulate the two Netlify function endpoints or configure their Blobs environment. Use Netlify Dev for integrated local work. Its local store is separate from production.
- The repository has no tracked dependency lockfile. The fresh baseline install resolved Vite `7.3.6` from `^7.1.2`; historical deployment dependency versions were not verified. Generate and commit a lockfile in the first implementation change, then use `npm ci`.
- No `AGENTS.md`, automated test suite, or CI workflow was found in tracked files. `.gitignore` is added by this audit so local dependencies, build output, and environment files do not get committed.

## Proposed data model

This is a conceptual design, not a deployed schema or migration.

| Entity | Core fields / relationship | Purpose |
| --- | --- | --- |
| Household and profiles | Household ID; profile ID/name; authorized membership | Preserve the three profiles and scope data access |
| Titles | Stable ID; legacy ID; title; film/series format; description; poster reference; runtime; source identifiers | One canonical entry per title |
| Title tags | Title ID; genres and mood tags; metadata provenance | Documentary browsing plus mood matching; separate genre from film/series format |
| Seasons | Title ID; season number/name; known episode count; concluded/ongoing/unknown | Season-level tracking without assuming every series is complete |
| Providers and availability | Title ID; provider; region; availability state; URL; source; checked timestamp | Support multiple services and distinguish known availability from unknown |
| Releases | Title ID; optional season ID; provider/region; nullable date; date precision; release scope; source; checked timestamp | Coming Soon and recent releases; distinguish a film, season premiere, or whole-season drop |
| Profile-title progress | Profile + title uniqueness; watchlist/watching/caught_up/finished; updated timestamp | My Stuff and Continue Watching; keep separate from preference votes |
| Profile-season progress | Profile + season uniqueness; watched/not watched; updated timestamp | Mark seasons seen without marking future seasons complete |
| Preferences | Profile + title uniqueness; Yes/Maybe/No | Preserve family votes for household suggestions |

Implementation rules:

- An upcoming or undated title stays on the Watchlist; it is not eligible for "watch now" without known availability. Undated entries get a "Date not announced" section instead of an invented timeline date.
- Caught Up means all currently tracked released seasons are seen and future content may arrive. Finished is appropriate for a film or a concluded series. Unknown season information requires an honest manual state; do not auto-complete a series from incomplete metadata.
- A new released season can move a previously Caught Up title into a "new season available" state without resetting watched seasons.
- A household recommendation does not mark every viewer as having watched something. Update progress only for explicitly selected profiles.
- Dates and services require sources and region context. AI proposes fields; it does not establish release/availability truth or silently save a draft.
- Before Supabase tables are exposed, implement grants and row-level policies for authorized household membership. Keep privileged keys server-side. A Netlify server endpoint using a privileged key must authorize callers itself.

## Migration approach

1. Verify the existing Netlify site and production store access, Supabase project capacity, and the household access model. The paused Manage the Squirrels project is not evidence that a slot is available; account state was not inspected during this audit. Do not repurpose or delete another project's data.
2. Export both production Blobs stores, including all vote keys, before any cutover. Existing votes for dropped custom titles may be orphaned; preserve them for reconciliation. Backups may contain personal data and should not be committed to the public repository.
3. Convert the nine bundled records and exported custom records into canonical titles. Keep legacy IDs exactly, or maintain a permanent ID map. Preserve custom poster data and added-by/created-at fields. Do not infer film/series format from "Documentary" alone when the existing record is ambiguous.
4. Import profile preferences against the preserved IDs. Do not interpret a Yes vote as Watched or a No vote as Finished. New watched history starts empty unless the user supplies it.
5. Compare title/vote counts and representative records, test permissions, and verify persistence across reloads/devices. Make the import idempotent so a retry cannot create duplicates.
6. Quiesce legacy writes or capture a final delta before switching; a one-time export alone misses votes/additions made during migration. Drain or reconcile device-local pending votes using the same ID map.
7. Switch the data adapter only after verification. Keep the legacy stores and deployment available for rollback. Any rollback after new 2.0 writes needs reconciliation; an old deployment alone cannot read new database progress.

Production data was not exported or modified in Step 1.

## Proposed build order for the first usable 2.0

| Build slice | Concrete result | Done when |
| --- | --- | --- |
| 1. Safe foundation | Lockfile, state/data/render separation, stable IDs, draft preservation, corrected save queue, household access, relational persistence | No dropped concurrent additions/edits; failed writes retry; unauthorized access is rejected; migration reconciliation passes |
| 2. My Stuff + Home | New tab shell, persistent + Add, title details, manual add/edit metadata, watchlist/status and season tracking | Progress persists across reloads/devices; profiles have separate history; Home can continue a saved title |
| 3. Sloth Pick | Mood/commitment/audience prompts, eligible pool, preference ranking, random Full Chaos, reroll and empty-state recovery | Watched/unavailable/vetoed items follow the chosen exclusion rules; no-match state suggests changing filters |
| 4. Coming Soon | Sourced release entries, chronological timeline, service/type filters, upcoming watchlist saves | Missing dates stay clearly undated; profile progress remains unchanged when a release is added |
| 5. Assisted Add | Server-side metadata/AI enrichment followed by editable review | No save before user approval; duplicate match offered; manual entry works when enrichment fails |

For the same-day goal, prioritize slices 1–3 and a small, manually verified release list for slice 4. Automated discovery and AI enrichment can follow the usable tracker. This sequencing is a proposal; completion today depends on backend access and the final access model, and is not guaranteed by the audit.

### Tools needed

- Existing GitHub repository, Node.js/npm, Vite, and Netlify Functions/Dev.
- The existing Netlify site's configuration and environment access for migration and deployment.
- A dedicated Supabase project if available, with a versioned schema and restricted household access.
- No AI dependency is required for watch tracking or random selection. Choose an enrichment provider/model only when implementing Assisted Add and follow the relevant Netlify AI Gateway guidance then.

## Validation performed

| Check | Result / limitation |
| --- | --- |
| Baseline checkout | Clean `main` at the commit identified above before documentation changes |
| Dependency install | Passed with `npm install --package-lock=false --ignore-scripts --no-audit --no-fund`; no dependency changes committed |
| Frontend production build | Passed with Vite `7.3.6`; 18 modules transformed |
| JavaScript syntax | `node --check` passed for `src/main.js` and both function handlers |
| Catalog concurrency | Existing handler under mocked in-memory storage: two successful additions, one retained title |
| Catalog retention | Existing handler with 100 custom titles: title 101 removed the oldest |
| Vote queue race | Existing extracted `flushPending`: completion of an older save cleared a newer pending edit |
| Environment | Checks used Node `24.19.0`; Netlify config specifies Node 22. Exact production runtime parity not tested |
| Live integration | Not tested: Netlify production stores/endpoints, deployed UI, or Supabase account/project state |

The reproductions used synthetic data and existing source in memory; they did not write to any production service. A successful Vite build validates frontend compilation, not Netlify function deployment or live sync. No application fixes have been claimed from this documentation-only step.

## Official implementation references

- [Netlify Blobs: store access, consistency, local development, and concurrency](https://docs.netlify.com/build/data-and-storage/netlify-blobs/)
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

These references support the storage/access recommendations. Repository findings and reproductions are independently grounded in the audited source. The Supabase changelog index fetch failed during this audit; check it and relevant current documentation before any implementation or schema change.
