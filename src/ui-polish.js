import './ui-polish.css';

const app = document.querySelector('#app');
let titlesById = new Map();
let refreshPromise = null;

function profileId() {
  try {
    return localStorage.getItem('couchsloth-profile') || localStorage.getItem('couchsloth-user')?.toLowerCase() || 'parker';
  } catch {
    return 'parker';
  }
}

function progressFor(title) {
  return title?.watch_progress?.find(progress => progress.profile_id === profileId()) || null;
}

function overviewFor(title) {
  return String(title?.official_overview || title?.description || '').trim();
}

function yearFor(title) {
  return title?.release_date ? String(title.release_date).slice(0, 4) : '';
}

function runtimeFor(title) {
  return title?.runtime_minutes ? `${title.runtime_minutes} min` : '';
}

function statusWeight(status) {
  return { watching: 0, watchlist: 1, none: 2, caught_up: 3, finished: 4 }[status || 'none'] ?? 2;
}

async function refreshLibrary() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch('/api/library', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(result => {
      if (result?.titles) titlesById = new Map(result.titles.map(title => [title.id, title]));
      return result;
    })
    .catch(() => null)
    .finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function decorateCards() {
  document.querySelectorAll('.title-card[data-title]:not([data-ui-polished])').forEach(card => {
    const title = titlesById.get(card.dataset.title);
    if (!title) return;
    const progress = progressFor(title);
    const status = progress?.status || 'none';
    card.dataset.uiPolished = 'true';
    card.dataset.watchStatus = status;
    card.classList.add(`watch-status-${status}`);

    const copy = card.querySelector('.card-copy');
    const overview = overviewFor(title);
    if (copy && overview) {
      const description = document.createElement('p');
      description.className = 'card-overview';
      description.textContent = overview;
      copy.append(description);
    }
  });

  document.querySelectorAll('.title-grid:not([data-ui-sorted])').forEach(grid => {
    const cards = [...grid.querySelectorAll(':scope > .title-card[data-title]')];
    if (!cards.length || cards.some(card => !titlesById.has(card.dataset.title))) return;
    grid.dataset.uiSorted = 'true';
    cards
      .sort((left, right) => {
        const a = progressFor(titlesById.get(left.dataset.title))?.status || 'none';
        const b = progressFor(titlesById.get(right.dataset.title))?.status || 'none';
        return statusWeight(a) - statusWeight(b);
      })
      .forEach(card => grid.append(card));
  });
}

function chip(text, className = '') {
  const span = document.createElement('span');
  span.className = `detail-chip ${className}`.trim();
  span.textContent = text;
  return span;
}

function decorateModal() {
  const modal = document.querySelector('.modal');
  if (!modal || modal.dataset.uiPolished) return;
  const titleInput = modal.querySelector('input[name="titleId"]');
  const title = titleInput ? titlesById.get(titleInput.value) : null;
  if (!title) return;
  modal.dataset.uiPolished = 'true';
  modal.classList.add('title-detail-modal');

  const heading = modal.querySelector('h2');
  const eyebrow = modal.querySelector(':scope > .eyebrow');
  const topParagraphs = [...modal.querySelectorAll(':scope > p:not(.eyebrow):not(.form-message)')];
  const summary = topParagraphs[0];
  const service = topParagraphs[1];
  const progressForm = modal.querySelector('form[data-form="progress"]');

  if (summary) summary.textContent = overviewFor(title) || 'No synopsis is available yet.';

  const hero = document.createElement('div');
  hero.className = 'detail-hero';
  const poster = title.poster_url ? document.createElement('img') : document.createElement('div');
  if (title.poster_url) {
    poster.src = title.poster_url;
    poster.alt = `Poster for ${title.title}`;
    poster.className = 'detail-hero-poster';
  } else {
    poster.className = 'detail-hero-placeholder';
    poster.textContent = title.type === 'Movie' ? '🎬' : title.type === 'Documentary' ? '🔎' : '📺';
  }
  const copy = document.createElement('div');
  copy.className = 'detail-hero-copy';
  if (eyebrow) copy.append(eyebrow);
  if (heading) copy.append(heading);

  const facts = document.createElement('div');
  facts.className = 'detail-facts';
  const year = yearFor(title);
  const runtime = runtimeFor(title);
  if (year) facts.append(chip(year));
  if (runtime) facts.append(chip(runtime));
  (title.genres || []).slice(0, 3).forEach(genre => facts.append(chip(genre)));
  (title.moods || []).slice(0, 3).forEach(mood => facts.append(chip(mood, 'mood-chip')));
  if (facts.childElementCount) copy.append(facts);
  if (summary) copy.append(summary);
  if (service) copy.append(service);

  if (title.imdb_id) {
    const imdb = document.createElement('a');
    imdb.className = 'imdb-link';
    imdb.href = `https://www.imdb.com/title/${encodeURIComponent(title.imdb_id)}/`;
    imdb.target = '_blank';
    imdb.rel = 'noopener noreferrer';
    imdb.textContent = 'View on IMDb ↗';
    copy.append(imdb);
  }

  hero.append(poster, copy);
  modal.insertBefore(hero, progressForm || modal.firstChild);

  if (progressForm) {
    progressForm.classList.add('progress-card');
    const formHeading = progressForm.querySelector('h3');
    if (formHeading) formHeading.textContent = 'Your watching status';
  }

  const sections = [...modal.querySelectorAll(':scope > .detail-section')];
  sections.forEach(section => {
    const titleText = section.querySelector(':scope > h3')?.textContent?.trim() || '';
    if (titleText === 'Artwork & metadata') {
      section.classList.add('detail-technical');
      const matched = Boolean(title.tmdb_id);
      if (matched) section.classList.add('is-collapsed-technical');
    }
    if (titleText === 'Where to watch') {
      section.classList.add('streaming-section');
      const providers = (title.streaming_availability || [])
        .filter(item => item.region === 'US' && item.status === 'available')
        .map(item => item.provider);
      const uniqueProviders = [...new Set(providers)];
      if (uniqueProviders.length) {
        section.querySelectorAll(':scope > .availability-row').forEach(row => row.classList.add('legacy-availability-row'));
        const providerChips = document.createElement('div');
        providerChips.className = 'provider-chips';
        uniqueProviders.forEach(provider => providerChips.append(chip(provider, 'provider-chip')));
        const headingNode = section.querySelector(':scope > h3');
        headingNode?.after(providerChips);
        const attribution = document.createElement('p');
        attribution.className = 'streaming-attribution';
        attribution.textContent = 'Streaming availability data provided by JustWatch via TMDB.';
        providerChips.after(attribution);
      }
    }
  });
}

function decorate() {
  decorateCards();
  decorateModal();
}

const observer = new MutationObserver(() => {
  queueMicrotask(decorate);
});
observer.observe(app, { childList: true, subtree: true });

refreshLibrary().then(decorate);
window.addEventListener('focus', () => refreshLibrary().then(decorate));
window.addEventListener('online', () => refreshLibrary().then(decorate));

document.addEventListener('click', event => {
  const target = event.target.closest?.('[data-tmdb-apply],[data-tmdb-auto]');
  if (!target) return;
  window.setTimeout(() => refreshLibrary().then(decorate), 1800);
  window.setTimeout(() => refreshLibrary().then(decorate), 4200);
});
