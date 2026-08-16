import "./styles.css";
import slothBlanket from "../Assets/Sloth on Couch with Blanket.png";
import slothPopcorn from "../Assets/Sloth on Beanbag with popcorn.png";
import slothPeek from "../Assets/Sloth behind the couch.png";

const FAMILY = ["Parker", "Blake", "Porter"];

const SHOWS = [
  {
    id: "monsters-of-god",
    title: "Monsters of God",
    platform: "Max",
    type: "Docuseries",
    note: "Reptiles, obsession, and the wild underworld of exotic animal trafficking.",
    icon: "🐍",
    theme: "snake",
  },
  {
    id: "breath-of-fire",
    title: "Breath of Fire",
    platform: "Max",
    type: "Docuseries",
    note: "A deep dive into the rise and fallout of the Kundalini yoga empire.",
    icon: "🔥",
    theme: "fire",
  },
  {
    id: "ufo-documentary",
    title: "UFO Documentary",
    platform: "Prime Video",
    type: "Documentary",
    note: "The UFO pick from the family list. Exact title can be swapped in later.",
    icon: "🛸",
    theme: "ufo",
  },
  {
    id: "i-am-chris-farley",
    title: "I Am Chris Farley",
    platform: "Prime Video",
    type: "Documentary",
    note: "A look back at the life, comedy, and huge-hearted chaos of Chris Farley.",
    icon: "🎙️",
    theme: "farley",
  },
  {
    id: "behind-the-curve",
    title: "Behind the Curve",
    platform: "Prime Video",
    type: "Documentary",
    note: "Flat Earth believers, experiments, and an accidental amount of science.",
    icon: "🌎",
    theme: "curve",
  },
  {
    id: "cruella",
    title: "Cruella",
    platform: "Disney+",
    type: "Movie",
    note: "Fashion, punk energy, revenge, and one extremely committed black-and-white wardrobe.",
    icon: "🖤",
    theme: "cruella",
  },
  {
    id: "futurama",
    title: "Futurama",
    platform: "Disney+",
    type: "Series",
    note: "Delivery missions, robots, aliens, and a thousand years of questionable decisions.",
    icon: "🚀",
    theme: "futurama",
  },
  {
    id: "always-sunny",
    title: "It's Always Sunny in Philadelphia",
    platform: "Disney+",
    type: "Series",
    note: "The Gang makes everything worse. Reliably. Spectacularly.",
    icon: "☀️",
    theme: "sunny",
  },
  {
    id: "abbott-elementary",
    title: "Abbott Elementary",
    platform: "Disney+",
    type: "Series",
    note: "Big-hearted teachers, tiny budgets, and perfectly calibrated workplace chaos.",
    icon: "✏️",
    theme: "abbott",
  },
];

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
};

const voteLabels = {
  yes: "YES",
  maybe: "MAYBE",
  no: "NO",
};

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

async function loadVotes({ quiet = false } = {}) {
  if (!quiet) state.syncing = true;
  try {
    const response = await fetch("/.netlify/functions/votes", { cache: "no-store" });
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
  state.pending = state.pending.filter(
    (item) => !(item.user === user && item.showId === showId),
  );
  state.pending.push({ user, showId, vote });
  persistPending();
  flushPending();
}

function getShow(showId) {
  return SHOWS.find((show) => show.id === showId);
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
  return SHOWS.map((show, originalIndex) => ({
    show,
    stats: getStats(show),
    originalIndex,
  })).sort((a, b) => {
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
          ${FAMILY.map(
            (name) => `
              <button class="profile-button" data-user="${name}">
                <span class="profile-initial">${name[0]}</span>
                <span>${name}</span>
              </button>
            `,
          ).join("")}
        </div>
        <p class="tiny-note">Your name stays on this phone, but everyone's votes are shared.</p>
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
      <button class="switch-user" data-action="switch-user" aria-label="Switch family member">Switch</button>
    </header>
  `;
}

function voteCard(show, progress) {
  return `
    <section class="vote-stage">
      <div class="progress-row">
        <span>${progress.done} voted</span>
        <div class="progress-track"><span style="width:${progress.percent}%"></span></div>
        <span>${progress.left} left</span>
      </div>

      <article class="show-card theme-${show.theme}" data-card-show="${show.id}">
        <div class="show-art">
          <div class="show-glow"></div>
          <span class="show-icon">${show.icon}</span>
          <span class="platform-pill">${show.platform}</span>
        </div>
        <div class="show-info">
          <p class="show-type">${show.type}</p>
          <h2>${escapeHtml(show.title)}</h2>
          <p>${escapeHtml(show.note)}</p>
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
    <section class="done-panel">
      <img src="${slothBlanket}" class="done-sloth" alt="CouchSloth relaxing under a blanket" />
      <p class="eyebrow">BALLOT COMPLETE</p>
      <h2>${escapeHtml(state.user)} has judged the television.</h2>
      <p>Now we wait for the rest of the household democracy.</p>
      <button class="primary-button" data-tab-jump="picks">See the Top 5</button>
    </section>
    <section class="section-block">
      <div class="section-heading">
        <div><p class="eyebrow">YOUR BALLOT</p><h3>Change your mind anytime</h3></div>
      </div>
      <div class="review-list">
        ${SHOWS.map((show) => {
          const current = userVotes[show.id];
          return `
            <div class="review-row">
              <div class="review-title"><span>${show.icon}</span><div><strong>${escapeHtml(show.title)}</strong><small>${show.platform}</small></div></div>
              <div class="mini-votes">
                ${["no", "maybe", "yes"]
                  .map(
                    (vote) => `<button class="mini-vote ${vote} ${current === vote ? "selected" : ""}" data-edit-show="${show.id}" data-edit-vote="${vote}">${voteLabels[vote]}</button>`,
                  )
                  .join("")}
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

function picksTab() {
  const ranked = getRankedShows();
  const topFive = ranked.slice(0, 5);
  const totalVotes = FAMILY.reduce(
    (sum, name) => sum + Object.keys(state.votes[name] || {}).length,
    0,
  );

  return `
    <section class="hero-panel picks-hero">
      <div>
        <p class="eyebrow">THE COUCH HAS SPOKEN</p>
        <h2>Tonight's Top 5</h2>
        <p>${totalVotes} of ${FAMILY.length * SHOWS.length} family votes are in. Rankings update automatically.</p>
      </div>
      <img src="${slothPopcorn}" alt="CouchSloth with popcorn" />
    </section>

    <section class="top-five-list">
      ${topFive
        .map(({ show, stats }, index) => {
          const consensus = stats.yes === FAMILY.length;
          return `
            <article class="rank-card ${index === 0 ? "winner" : ""}">
              <div class="rank-number">${index + 1}</div>
              <div class="rank-icon theme-${show.theme}">${show.icon}</div>
              <div class="rank-copy">
                <div class="rank-platform">${show.platform} · ${show.type}</div>
                <h3>${escapeHtml(show.title)}</h3>
                <div class="tally"><span class="yes-dot">♥ ${stats.yes}</span><span class="maybe-dot">~ ${stats.maybe}</span><span class="no-dot">✕ ${stats.no}</span></div>
              </div>
              ${consensus ? '<span class="consensus-badge">ALL YES</span>' : ""}
            </article>
          `;
        })
        .join("")}
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
    <section class="hero-panel family-hero">
      <div>
        <p class="eyebrow">THE HOUSEHOLD SCORECARD</p>
        <h2>Who voted for what?</h2>
        <p>No need to ask "wait, did you say maybe or no?" seventeen minutes later.</p>
      </div>
      <img src="${slothPeek}" alt="CouchSloth peeking over the couch" />
    </section>
    <section class="family-list">
      ${SHOWS.map(
        (show) => `
          <article class="family-row">
            <div class="family-show"><span>${show.icon}</span><div><strong>${escapeHtml(show.title)}</strong><small>${show.platform}</small></div></div>
            <div class="family-votes-grid">
              ${FAMILY.map(
                (name) => `<div class="family-person"><label>${name}</label>${familyVoteChip(state.votes[name]?.[show.id])}</div>`,
              ).join("")}
            </div>
          </article>
        `,
      ).join("")}
    </section>
  `;
}

function navBar() {
  const tabs = [
    ["vote", "♥", "Vote"],
    ["picks", "🎲", "Top 5"],
    ["family", "👀", "Family"],
  ];
  return `
    <nav class="bottom-nav" aria-label="CouchSloth navigation">
      ${tabs
        .map(
          ([id, icon, label]) => `<button class="nav-button ${state.tab === id ? "active" : ""}" data-tab="${id}"><span>${icon}</span>${label}</button>`,
        )
        .join("")}
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
        <p>${state.pickedShow.platform} · ${state.pickedShow.type}</p>
        <div class="picked-icon theme-${state.pickedShow.theme}">${state.pickedShow.icon}</div>
        <button class="primary-button" data-action="close-pick">Couch time 🍿</button>
        <button class="text-button" data-action="pick-show">Nope, reroll it</button>
      </div>
    </div>
  `;
}

function render() {
  if (!state.user) {
    app.innerHTML = profilePicker();
    bindEvents();
    return;
  }

  const content =
    state.tab === "vote" ? voteTab() : state.tab === "picks" ? picksTab() : familyTab();

  app.innerHTML = `
    <div class="app-shell">
      ${appHeader()}
      <main class="main-content">${content}</main>
      ${navBar()}
      ${pickOverlay()}
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
    localStorage.removeItem("couchsloth-user");
    render();
  });

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

function castCurrentVote(vote) {
  const userVotes = state.votes[state.user] || {};
  const currentShow = SHOWS.find((show) => !userVotes[show.id]);
  if (!currentShow) return;

  const card = document.querySelector(".show-card");
  const buttons = document.querySelectorAll(".vote-button");
  buttons.forEach((button) => (button.disabled = true));
  card?.classList.add(`launch-${vote}`);

  window.setTimeout(() => {
    state.votes[state.user][currentShow.id] = vote;
    queueVote(state.user, currentShow.id, vote);
    render();
  }, 360);
}

function runPicker() {
  const topFive = getRankedShows().slice(0, 5).map((item) => item.show);
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

window.addEventListener("focus", () => {
  if (!state.pending.length) loadVotes({ quiet: true });
  else flushPending();
});

render();
loadVotes();
window.setInterval(() => {
  if (!state.pending.length && document.visibilityState === "visible") loadVotes({ quiet: true });
}, 15000);
