// Kick off pending TMDB enrichment whenever Couch Sloth loads.
// The background function uses a database lock, so duplicate page loads are harmless.
fetch('/api/tmdb-backfill', {
  method: 'POST',
  keepalive: true,
}).catch(() => {
  // The app remains usable if enrichment is temporarily unavailable.
});
