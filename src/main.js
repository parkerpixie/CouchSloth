import "./styles.css";
import "./add-show.css";

import slothBlanket from "../Assets/Sloth on Couch with Blanket.png";
import slothPopcorn from "../Assets/Sloth on Beanbag with popcorn.png";
import slothPeek from "../Assets/Sloth behind the couch.png";

import posterMonsters from "../Assets/Monsters of God.jpg";
import posterBreath from "../Assets/Breath of Fire.jpeg";
import posterArea51 from "../Assets/Area 51-Aliens, UFOs, Bob Lazar, etc..jpeg";
import posterFarley from "../Assets/I am Chris Farley.jpeg";
import posterCurve from "../Assets/Beyond the Curve.jpeg";
import posterCruella from "../Assets/Cruella.jpeg";
import posterFuturama from "../Assets/Futurama.jpeg";
import posterSunny from "../Assets/It's Always Sunny in Philadelphia.jpeg";
import posterAbbott from "../Assets/Abbott Elementary.jpeg";

const FAMILY = ["Parker", "Blake", "Porter"];

const BASE_SHOWS = [
  {
    id: "monsters-of-god",
    title: "Monsters of God",
    platform: "HBO Max",
    type: "Documentary",
    format: "5-part documentary series",
    note: "Eric Goode follows the obsessive, high-stakes world of exotic reptile collecting and the illegal wildlife trade, where rare animals, huge money, smugglers, and law enforcement collide.",
    icon: "🐍",
    theme: "snake",
    image: posterMonsters,
  },
  {
    id: "breath-of-fire",
    title: "Breath of Fire",
    platform: "HBO Max",
    type: "Documentary",
    format: "Docuseries",
    note: "A revealing look at the rise of Kundalini yoga in the United States, the movement around Yogi Bhajan, and the complicated legacy surrounding one of its most prominent leaders.",
    icon: "🔥",
    theme: "fire",
    image: posterBreath,
  },
  {
    id: "ufo-documentary",
    title: "Area 51: Aliens, UFOs, Bob Lazar & Advanced Technology",
    platform: "Prime Video",
    type: "Documentary",
    format: "Documentary film",
    note: "A short dive into Bob Lazar's Area 51 claims, UFO sightings, alleged recovered craft, Element 115, government secrecy, and the advanced technology rumored to be hidden in the Nevada desert.",
    icon: "🛸",
    theme: "ufo",
    image: posterArea51,
  },
  {
    id: "i-am-chris-farley",
    title: "I Am Chris Farley",
    platform: "Prime Video",
    type: "Documentary",
    format: "Documentary film",
    note: "Friends, family, and fellow comedians remember Chris Farley's life, enormous comic talent, unforgettable characters, and the person behind all that glorious physical comedy.",
    icon: "🎙️",
    theme: "farley",
    image: posterFarley,
  },
  {
    id: "behind-the-curve",
    title: "Behind the Curve",
    platform: "Prime Video",
    type: "Documentary",
    format: "Documentary film",
    note: "A funny, fascinating look inside the modern flat-Earth community, including the believers trying to prove their case and the experiments that do not always cooperate with the theory.",
    icon: "🌎",
    theme: "curve",
    image: posterCurve,
  },
  {
    id: "cruella",
    title: "Cruella",
    platform: "Disney+",
    type: "Movie",
    format: "Feature film",
    note: "In 1970s punk-rock London, ambitious young designer Estella clashes with fashion legend Baroness von Hellman and begins transforming into the spectacularly rebellious Cruella de Vil.",
    icon: "🖤",
    theme: "cruella",
    image: posterCruella,
  },
  {
    id: "futurama",
    title: "Futurama",
    platform: "Disney+",
    type: "Series",
    format: "Animated comedy series",
    note: "Pizza delivery guy Philip J. Fry wakes up a thousand years in the future and joins the Planet Express crew for intergalactic deliveries, robot nonsense, aliens, romance, and beautifully nerdy science jokes.",
    icon: "🚀",
    theme: "futurama",
    image: posterFuturama,
  },
  {
    id: "always-sunny",
    title: "It's Always Sunny in Philadelphia",
    platform: "Disney+",
    type: "Series",
    format: "Comedy series",
    note: "Five wildly selfish owners of a struggling Philadelphia bar repeatedly hatch terrible plans, betray one another, and somehow make every possible situation much, much worse.",
    icon: "☀️",
    theme: "sunny",
    image: posterSunny,
  },
  {
    id: "abbott-elementary",
    title: "Abbott Elementary",
    platform: "Disney+",
    type: "Series",
    format: "Workplace comedy series",
    note: "A group of dedicated teachers and one spectacularly self-confident principal navigate an underfunded Philadelphia public school while doing their best for the kids who keep them coming back.",
    icon: "✏️",
    theme: "abbott",
    image: posterAbbott,
  },
];

let SHOWS = [...BASE_SHOWS];
const app = document.querySelector("#app");
const savedUser = localStorage.getItem("couchsloth-user");
const savedPending = JSON.parse(localStorage.getItem("couchsloth-pending") || "[]");

const state = {
  user: FAMILY.includes(savedUser) ? savedUser : null,
  tab: "vote",
  votes: Object.fromEntries(FAMILY.map((name) => [name, {}])),
  pending: Array.isArray(savedPending) ? savedPending : [],
  syncing: true,
  syncError: false,
  pickedShow: null,
  picking: false,
  addOpen: false,
  addSaving: false,
};

const voteLabels = { yes: "YES", maybe: "MAYBE", no: "NO" };

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function persistPending() {
  localStorage.setItem("couchsloth-pending", JSON.stringify(state.pending));
}

function overlayPendingVotes() {
  state.pending.forEach(({ user, showId, vote }) => {
    if (state.votes[user]) state.votes[user][showId] = vote;
  });
}

async function loadCatalog() {
  try {
    const response = await fetch("/.netlify/functions/catalog", { cache: "no-store" });
    if (!response.ok) throw new Error(`Catalog failed: ${response.status}`);
    const data = await response.json();
    const custom = Array.isArray(data.shows) ? data.shows : [];
    SHOWS = [...BASE_SHOWS, ...custom.map((show) => ({
      ...show,
      icon: show.type === "Movie" ? "🎬" : show.type === "Documentary" ? "🔎" : "📺",
      theme: "custom",
      format: `Family-added ${String(show.type || "pick").toLowerCase()}`,
    }))];
  } catch (error) {
    console.warn(error);
    SHOWS = [...BASE_SHOWS];
  }
  render();
}

async function loadVotes({ quiet = false } = {}) {
  if (!quiet) state.syncing = true;
  try {
    const ids = encodeURIComponent(SHOWS.map((show) => show.id).join(","));
    const response = await fetch(`/.netlify/functions/votes?showIds=${ids}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);
    const data = await response.json();
    FAMILY.forEach((name) => {
      state.votes[name] = data.votes?.[name] || {};
    });
    overlayPendingVotes();
    state.syncError = false;
  } catch (error) {
    console.warn(error);
    state.syncError = true;
    overlayPendingVotes();
  } finally {
    state.syncing = false;
    render();
  }
}

async function flushPending() {
  if (!state.pending.length) return;
  const queue = [...state.pending];
  for (const item of queue) {
    try {
      const response = await fetch("/.netlify/functions/votes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!response.ok) throw new Error(`Vote save failed: ${response.status}`);
      state.pending = state.pending.filter(
        (pending) => !(pending.user === item.user && pending.showId === item.showId),
      );
      persistPending();
      state.syncError = false;
    } catch (error) {
      console.warn(error);
      state.syncError = true;
      break;
    }
  }
  render();
}

function queueVote(user, showId, vote) {
  state.pending = state.pending.filter((item) => !(item.user === user && item.showId === showId));
  state.pending.push({ user, showId, vote });
  persistPending();
  flushPending();
}

function getStats(show) {
  const choices = FAMILY.map((name) => state.votes[name]?.[show.id]).filter(Boolean);
  const yes = choices.filter((vote) => vote === "yes").length;
  const maybe = choices.filter((vote) => vote === "maybe").length;
  const no = choices.filter((vote) => vote === "no").length;
  const score = yes * 3 + maybe - no * 3;
  return { yes, maybe, no, total: choices.length, score };
}

function getRankedShows() {
  return SHOWS.map((show, originalIndex) => ({ show, stats: getStats(show), originalIndex }))
    .sort((a, b) => {
      if (b.stats.score !== a.stats.score) return b.stats.score - a.stats.score;
      if (b.stats.yes !== a.stats.yes) return b.stats.yes - a.stats.yes;
      if (a.stats.no !== b.stats.no) return a.stats.no - b.stats.no;
      return a.originalIndex - b.originalIndex;
    });
}

function syncBadge() {
  if (state.syncing) return '<span class="sync-badge syncing">↻ Syncing</span>';
  if (state.syncError) return '<span class="sync-badge error">● Needs sync</span>';
  if (state.pending.length) return '<span class="sync-badge syncing">↻ Saving</span>';
  return '<span class="sync-badge good">● Shared</span>';
}

function profilePicker() {
  return `
    <main class="welcome-screen">
      <section class="welcome-card">
        <img src="${slothPopcorn}" class="welcome-sloth" alt="CouchSloth eating popcorn" />
        <p class="eyebrow">FAMILY WATCH NIGHT</p>
        <h1>CouchSloth</h1>
        <p class="welcome-copy">Three humans. One couch. Far too many things everyone says they might watch someday.</p>
        <h2>Who's voting?</h2>
        <div class="profile-grid">
          ${FAMILY.map((name) => `
            <button class="profile-button" data-user="${name}">
              <span class="profile-initial">${name[0]}</span>
              <span>${name}</span>
            </button>
          `).join("")}
        </div>
        <p class="tiny-note">Your name stays on this phone, but everyone's votes and family-added picks are shared.</p>
      </section>
    </main>
  `;
}

function appHeader() {
  return `
    <header class="topbar">
      <div class="brand-lockup">
        <img src="${slothPeek}" class="brand-sloth" alt="CouchSloth mascot" />
        <div>
          <div class="brand-name">CouchSloth</div>
          <div class="brand-sub">${escapeHtml(state.user)} is voting ${syncBadge()}</div>
        </div>
      </div>
      <div style="display:flex; gap:7px; align-items:center;">
        <button class="add-title-button" data-action="open-add">+ Add</button>
        <button class="switch-user" data-action="switch-user" aria-label="Switch family member">Switch</button>
      </div>
    </header>
  `;
}

function artMarkup(show, extraClass = "") {
  const image = show.image ? `<img src="${show.image}" class="show-poster" alt="${escapeHtml(show.title)} poster" />` : "";
  return `
    <div class="show-art ${show.image ? "has-poster" : ""} ${extraClass}">
      ${image}
      <div class="show-glow"></div>
      <span class="show-icon">${show.icon}</span>
      <span class="platform-pill">${escapeHtml(show.platform || "Family pick")}</span>
    </div>
  `;
}

function addBanner() {
  return `
    <div class="add-title-banner">
      <div><strong>Something missing?</strong><small>Add a movie, series, or documentary for everyone to vote on.</small></div>
      <button class="add-title-button" data-action="open-add">+ Add it</button>
    </div>
  `;
}

function voteCard(show, progress) {
  return `
    <section class="vote-stage">
      ${addBanner()}
      <div class="progress-row">
        <span>${progress.done} voted</span>
        <div class="progress-track"><span style="width:${progress.percent}%"></span></div>
        <span>${progress.left} left</span>
      </div>
      <article class="show-card theme-${show.theme}" data-card-show="${show.id}">
        ${artMarkup(show)}
        <div class="show-info">
          <p class="show-type">${escapeHtml(show.type)}${show.format ? ` · ${escapeHtml(show.format)}` : ""}</p>
          <h2>${escapeHtml(show.title)}</h2>
          <p>${escapeHtml(show.note)}</p>
          ${show.addedBy ? `<p class="added-by">Added by ${escapeHtml(show.addedBy)}</p>` : ""}
        </div>
      </article>
      <div class="vote-actions" aria-label="Vote on ${escapeHtml(show.title)}">
        <button class="vote-button no" data-vote="no"><span>✕</span> No</button>
        <button class="vote-button maybe" data-vote="maybe"><span>~</span> Maybe</button>
        <button class="vote-button yes" data-vote="yes"><span>♥</span> Yes</button>
      </div>
      <p class="gesture-hint">Tap a vote and the card gets politely launched off the couch.</p>
    </section>
  `;
}

function reviewVotes() {
  const userVotes = state.votes[state.user] || {};
  return `
    ${addBanner()}
    <section class="done-panel">
      <img src="${slothBlanket}" class="done-sloth" alt="CouchSloth relaxing under a blanket" />
      <p class="eyebrow">BALLOT COMPLETE</p>
      <h2>${escapeHtml(state.user)} has judged the television.</h2>
      <p>Unless somebody adds another contender. Then democracy resumes.</p>
      <button class="primary-button" data-tab-jump="picks">See the Top 5</button>
    </section>
    <section class="section-block">
      <div class="section-heading"><div><p class="eyebrow">YOUR BALLOT</p><h3>Change your mind anytime</h3></div></div>
      <div class="review-list">
        ${SHOWS.map((show) => {
          const current = userVotes[show.id];
          return `
            <div class="review-row">
              <div class="review-title"><span>${show.icon}</span><div><strong>${escapeHtml(show.title)}</strong><small>${escapeHtml(show.type)} · ${escapeHtml(show.platform || "Family pick")}${show.addedBy ? ` · added by ${escapeHtml(show.addedBy)}` : ""}</small></div></div>
              <div class="mini-votes">
                ${["no", "maybe", "yes"].map((vote) => `<button class="mini-vote ${vote} ${current === vote ? "selected" : ""}" data-edit-show="${show.id}" data-edit-vote="${vote}">${voteLabels[vote]}</button>`).join("")}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function voteTab() {
  const userVotes = state.votes[state.user] || {};
  const remaining = SHOWS.filter((show) => !userVotes[show.id]);
  if (!remaining.length) return reviewVotes();
  const done = SHOWS.length - remaining.length;
  return voteCard(remaining[0], {
    done,
    left: remaining.length,
    percent: Math.round((done / SHOWS.length) * 100),
  });
}

function rankArt(show) {
  if (show.image) return `<div class="rank-icon has-poster"><img class="rank-poster" src="${show.image}" alt="" /></div>`;
  return `<div class="rank-icon theme-${show.theme}">${show.icon}</div>`;
}

function picksTab() {
  const ranked = getRankedShows();
  const topFive = ranked.slice(0, 5);
  const totalVotes = FAMILY.reduce((sum, name) => sum + Object.keys(state.votes[name] || {}).length, 0);
  return `
    ${addBanner()}
    <section class="hero-panel picks-hero">
      <div><p class="eyebrow">THE COUCH HAS SPOKEN</p><h2>Tonight's Top 5</h2><p>${totalVotes} of ${FAMILY.length * SHOWS.length} family votes are in. Rankings update automatically.</p></div>
      <img src="${slothPopcorn}" alt="CouchSloth with popcorn" />
    </section>
    <section class="top-five-list">
      ${topFive.map(({ show, stats }, index) => {
        const consensus = stats.yes === FAMILY.length;
        return `
          <article class="rank-card ${index === 0 ? "winner" : ""}">
            <div class="rank-number">${index + 1}</div>
            ${rankArt(show)}
            <div class="rank-copy">
              <div class="rank-platform">${escapeHtml(show.platform || "Family pick")} · ${escapeHtml(show.type)}${show.addedBy ? ` · ${escapeHtml(show.addedBy)}` : ""}</div>
              <h3>${escapeHtml(show.title)}</h3>
              <div class="tally"><span class="yes-dot">♥ ${stats.yes}</span><span class="maybe-dot">~ ${stats.maybe}</span><span class="no-dot">✕ ${stats.no}</span></div>
            </div>
            ${consensus ? '<span class="consensus-badge">ALL YES</span>' : ""}
          </article>
        `;
      }).join("")}
    </section>
    <section class="picker-panel">
      <p class="eyebrow">DECISION FATIGUE: DEFEATED</p>
      <h3>Let the sloth pick one.</h3>
      <p>We'll randomly choose from the current Top 5, because we've already done enough thinking.</p>
      <button class="primary-button huge" data-action="pick-show">🎲 Pick Tonight's Watch</button>
    </section>
  `;
}

function familyVoteChip(vote) {
  if (!vote) return '<span class="family-chip empty">—</span>';
  const symbol = vote === "yes" ? "♥" : vote === "maybe" ? "~" : "✕";
  return `<span class="family-chip ${vote}">${symbol} ${voteLabels[vote]}</span>`;
}

function familyTab() {
  return `
    ${addBanner()}
    <section class="hero-panel family-hero">
      <div><p class="eyebrow">THE HOUSEHOLD SCORECARD</p><h2>Who voted for what?</h2><p>No need to ask “wait, did you say maybe or no?” seventeen minutes later.</p></div>
      <img src="${slothPeek}" alt="CouchSloth peeking over the couch" />
    </section>
    <section class="family-list">
      ${SHOWS.map((show) => `
        <article class="family-row">
          <div class="family-show"><span>${show.icon}</span><div><strong>${escapeHtml(show.title)}</strong><small>${escapeHtml(show.type)} · ${escapeHtml(show.platform || "Family pick")}${show.addedBy ? ` · added by ${escapeHtml(show.addedBy)}` : ""}</small></div></div>
          <div class="family-votes-grid">
            ${FAMILY.map((name) => `<div class="family-person"><label>${name}</label>${familyVoteChip(state.votes[name]?.[show.id])}</div>`).join("")}
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function navBar() {
  const tabs = [["vote", "♥", "Vote"], ["picks", "🎲", "Top 5"], ["family", "👀", "Family"]];
  return `
    <nav class="bottom-nav" aria-label="CouchSloth navigation">
      ${tabs.map(([id, icon, label]) => `<button class="nav-button ${state.tab === id ? "active" : ""}" data-tab="${id}"><span>${icon}</span>${label}</button>`).join("")}
    </nav>
  `;
}

function pickOverlay() {
  if (!state.picking && !state.pickedShow) return "";
  if (state.picking) {
    return `
      <div class="overlay" data-action="close-pick">
        <div class="pick-modal shuffling" onclick="event.stopPropagation()">
          <img src="${slothPopcorn}" alt="CouchSloth choosing" />
          <p class="eyebrow">SHUFFLING THE TOP 5</p>
          <h2 id="shuffle-title">Consulting the sloth...</h2>
          <div class="shuffle-dots"><i></i><i></i><i></i></div>
        </div>
      </div>
    `;
  }
  return `
    <div class="overlay" data-action="close-pick">
      <div class="pick-modal" onclick="event.stopPropagation()">
        <div class="pick-confetti">✦ 🎬 ✦</div>
        <img src="${slothPopcorn}" alt="CouchSloth with popcorn" />
        <p class="eyebrow">THE SLOTH HAS DECIDED</p>
        <h2>${escapeHtml(state.pickedShow.title)}</h2>
        <p>${escapeHtml(state.pickedShow.platform || "Family pick")} · ${escapeHtml(state.pickedShow.type)}</p>
        ${state.pickedShow.addedBy ? `<p class="added-by">Added by ${escapeHtml(state.pickedShow.addedBy)}</p>` : ""}
        <div class="picked-icon theme-${state.pickedShow.theme}">${state.pickedShow.icon}</div>
        <button class="primary-button" data-action="close-pick">Couch time 🍿</button>
        <button class="text-button" data-action="pick-show">Nope, reroll it</button>
      </div>
    </div>
  `;
}

function addOverlay() {
  if (!state.addOpen || !state.user) return "";
  return `
    <div class="add-overlay" data-action="close-add">
      <section class="add-modal" onclick="event.stopPropagation()">
        <div class="add-modal-head">
          <div><p class="eyebrow">ADD TO THE COUCH</p><h2>What should we watch?</h2><p>${escapeHtml(state.user)} is adding this one. Everyone will see it and vote on it.</p></div>
          <button class="close-x" data-action="close-add" aria-label="Close">×</button>
        </div>
        <form class="add-form" id="add-show-form">
          <label>Movie or show name
            <input type="text" name="title" maxlength="120" autocomplete="off" placeholder="e.g. The Wild Robot" required />
          </label>
          <div>
            <label style="margin-bottom:7px;">Category</label>
            <div class="type-grid">
              <label class="type-choice"><input type="radio" name="type" value="Series" required><span>📺 Series</span></label>
              <label class="type-choice"><input type="radio" name="type" value="Movie" required><span>🎬 Movie</span></label>
              <label class="type-choice"><input type="radio" name="type" value="Documentary" required><span>🔎 Documentary</span></label>
            </div>
          </div>
          <label class="photo-pick">Have a poster or image? <small style="font-weight:500;color:var(--muted);">Optional. Choose one right from your phone's photos.</small>
            <input type="file" name="image" id="show-image-input" accept="image/*" />
            <img id="show-image-preview" class="photo-preview" alt="Selected poster preview" />
          </label>
          <p class="add-error" id="add-show-error"></p>
          <button class="primary-button" type="submit" ${state.addSaving ? "disabled" : ""}>${state.addSaving ? "Adding to the couch…" : `Add it as ${escapeHtml(state.user)} 🍿`}</button>
        </form>
      </section>
    </div>
  `;
}

function render() {
  if (!state.user) {
    app.innerHTML = profilePicker();
    bindEvents();
    return;
  }
  const content = state.tab === "vote" ? voteTab() : state.tab === "picks" ? picksTab() : familyTab();
  app.innerHTML = `
    <div class="app-shell">
      ${appHeader()}
      <main class="main-content">${content}</main>
      ${navBar()}
      ${pickOverlay()}
      ${addOverlay()}
    </div>
  `;
  bindEvents();
}

function bindEvents() {
  document.querySelectorAll("[data-user]").forEach((button) => {
    button.addEventListener("click", () => {
      state.user = button.dataset.user;
      localStorage.setItem("couchsloth-user", state.user);
      state.tab = "vote";
      render();
    });
  });

  document.querySelector('[data-action="switch-user"]')?.addEventListener("click", () => {
    state.user = null;
    state.addOpen = false;
    localStorage.removeItem("couchsloth-user");
    render();
  });

  document.querySelectorAll('[data-action="open-add"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.addOpen = true;
      render();
    });
  });

  document.querySelectorAll('[data-action="close-add"]').forEach((element) => {
    element.addEventListener("click", () => {
      if (state.addSaving) return;
      state.addOpen = false;
      render();
    });
  });

  document.querySelector("#show-image-input")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    const preview = document.querySelector("#show-image-preview");
    if (!file || !preview) return;
    const reader = new FileReader();
    reader.onload = () => {
      preview.src = reader.result;
      preview.classList.add("visible");
    };
    reader.readAsDataURL(file);
  });

  document.querySelector("#add-show-form")?.addEventListener("submit", submitAddedShow);

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      state.pickedShow = null;
      render();
    });
  });

  document.querySelector("[data-tab-jump]")?.addEventListener("click", (event) => {
    state.tab = event.currentTarget.dataset.tabJump;
    render();
  });

  document.querySelectorAll("[data-vote]").forEach((button) => {
    button.addEventListener("click", () => castCurrentVote(button.dataset.vote));
  });

  document.querySelectorAll("[data-edit-show]").forEach((button) => {
    button.addEventListener("click", () => {
      const showId = button.dataset.editShow;
      const vote = button.dataset.editVote;
      state.votes[state.user][showId] = vote;
      queueVote(state.user, showId, vote);
      render();
    });
  });

  document.querySelectorAll('[data-action="pick-show"]').forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      runPicker();
    });
  });

  document.querySelectorAll('[data-action="close-pick"]').forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target.closest('[data-action="pick-show"]')) return;
      state.picking = false;
      state.pickedShow = null;
      render();
    });
  });
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!file.type.startsWith("image/")) return reject(new Error("Please choose an image file."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("I couldn't read that photo."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("I couldn't open that photo."));
      img.onload = () => {
        const maxW = 900;
        const maxH = 1300;
        const scale = Math.min(1, maxW / img.width, maxH / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let data = canvas.toDataURL("image/jpeg", quality);
        while (data.length > 1_500_000 && quality > 0.46) {
          quality -= 0.1;
          data = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(data);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function submitAddedShow(event) {
  event.preventDefault();
  if (state.addSaving) return;
  const form = event.currentTarget;
  const error = document.querySelector("#add-show-error");
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const type = String(data.get("type") || "").trim();
  const file = data.get("image");

  if (!title || !["Series", "Movie", "Documentary"].includes(type)) {
    if (error) error.textContent = "Give it a name and choose Series, Movie, or Documentary.";
    return;
  }

  state.addSaving = true;
  if (error) error.textContent = "";
  const submit = form.querySelector('button[type="submit"]');
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Adding to the couch…";
  }

  try {
    const image = file instanceof File && file.size ? await compressImage(file) : "";
    const response = await fetch("/.netlify/functions/catalog", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, type, addedBy: state.user, image }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "That one didn't save.");

    state.addOpen = false;
    state.addSaving = false;
    await loadCatalog();
    await loadVotes({ quiet: true });
    state.tab = "vote";
    render();
  } catch (err) {
    state.addSaving = false;
    if (error) error.textContent = err.message || "That one didn't save. Try again.";
    if (submit) {
      submit.disabled = false;
      submit.textContent = `Add it as ${state.user} 🍿`;
    }
  }
}

function castCurrentVote(vote) {
  const userVotes = state.votes[state.user] || {};
  const currentShow = SHOWS.find((show) => !userVotes[show.id]);
  if (!currentShow) return;
  const card = document.querySelector(".show-card");
  document.querySelectorAll(".vote-button").forEach((button) => (button.disabled = true));
  card?.classList.add(`launch-${vote}`);
  window.setTimeout(() => {
    state.votes[state.user][currentShow.id] = vote;
    queueVote(state.user, currentShow.id, vote);
    render();
  }, 360);
}

function runPicker() {
  const topFive = getRankedShows().slice(0, 5).map((item) => item.show);
  if (!topFive.length) return;
  state.pickedShow = null;
  state.picking = true;
  render();
  let step = 0;
  const shuffleTimer = window.setInterval(() => {
    const title = document.querySelector("#shuffle-title");
    if (!title) return;
    title.textContent = topFive[step % topFive.length].title;
    step += 1;
  }, 130);
  window.setTimeout(() => {
    window.clearInterval(shuffleTimer);
    state.picking = false;
    state.pickedShow = topFive[Math.floor(Math.random() * topFive.length)];
    render();
  }, 1450);
}

window.addEventListener("focus", async () => {
  await loadCatalog();
  if (!state.pending.length) loadVotes({ quiet: true });
  else flushPending();
});

render();
(async () => {
  await loadCatalog();
  await loadVotes();
})();

window.setInterval(() => {
  if (!state.pending.length && document.visibilityState === "visible") loadVotes({ quiet: true });
}, 15000);
