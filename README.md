# CouchSloth

The Talbot family's watch-night app, built with Vite, plain JavaScript, and Netlify Functions. The current version supports Parker, Blake, and Porter voting Yes / Maybe / No, viewing a shared Top 5, choosing a random title, and manually adding titles with optional posters.

## Couch Sloth 2.0

Start with the [Step 1 repository audit and implementation plan](docs/couch-sloth-2-step-1-audit.md). The agreed interface is Home, Coming Soon, Sloth Pick, My Stuff, and a persistent + Add action.

Step 1 documents the current foundation and next changes. The 2.0 screens and database migration have not been implemented yet.

## Development

Use Node.js 22 to match `netlify.toml`.

```sh
npm install
npm run dev
```

Vite serves the frontend. The two `/.netlify/functions/` endpoints need a Netlify development environment; plain Vite does not emulate the functions or their Blobs stores. Use Netlify Dev for integrated development, with its separate local data store.

```sh
netlify dev
```

## Build

```sh
npm run build
```

The frontend output is `dist/`. Netlify deploys functions from `netlify/functions/`.

## Current data

- Nine initial titles and their poster imports live in `src/main.js`.
- Family-added titles live in Netlify Blobs store `couchsloth-catalog`, key `custom-shows`.
- Votes live in store `couchsloth-family-votes`, keys `votes/{lowercase-name}/{show-id}`.
- The selected profile and pending votes are stored on each device in localStorage.

Back up the production stores and preserve title IDs before migrating. Selecting a family name is a profile preference, not authentication.
