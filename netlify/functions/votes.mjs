import { getStore } from "@netlify/blobs";

const FAMILY = ["Parker", "Blake", "Porter"];
const ALLOWED_VOTES = new Set(["yes", "maybe", "no"]);
const SHOW_IDS = [
  "monsters-of-god",
  "breath-of-fire",
  "ufo-documentary",
  "i-am-chris-farley",
  "behind-the-curve",
  "cruella",
  "futurama",
  "always-sunny",
  "abbott-elementary",
];

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });

export default async (req) => {
  const store = getStore("couchsloth-family-votes");

  if (req.method === "GET") {
    const familyEntries = await Promise.all(
      FAMILY.map(async (user) => {
        const voteEntries = await Promise.all(
          SHOW_IDS.map(async (showId) => {
            const vote = await store.get(
              `votes/${user.toLowerCase()}/${showId}`,
              { type: "text", consistency: "strong" },
            );
            return vote ? [showId, vote] : null;
          }),
        );

        return [user, Object.fromEntries(voteEntries.filter(Boolean))];
      }),
    );

    return json({ votes: Object.fromEntries(familyEntries) });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { user, showId, vote } = body || {};
    if (!FAMILY.includes(user)) {
      return json({ error: "Unknown family member" }, 400);
    }
    if (!SHOW_IDS.includes(showId)) {
      return json({ error: "Unknown show" }, 400);
    }
    if (!ALLOWED_VOTES.has(vote)) {
      return json({ error: "Vote must be yes, maybe, or no" }, 400);
    }

    await store.set(`votes/${user.toLowerCase()}/${showId}`, vote);
    return json({ ok: true, user, showId, vote });
  }

  return json({ error: "Method not allowed" }, 405);
};
