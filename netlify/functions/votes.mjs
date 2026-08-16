import { getStore } from "@netlify/blobs";

const FAMILY = ["Parker", "Blake", "Porter"];
const ALLOWED_VOTES = new Set(["yes", "maybe", "no"]);

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
    const entries = await Promise.all(
      FAMILY.map(async (user) => {
        const userVotes =
          (await store.get(`votes/${user.toLowerCase()}`, {
            type: "json",
            consistency: "strong",
          })) || {};
        return [user, userVotes];
      }),
    );

    return json({ votes: Object.fromEntries(entries) });
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
    if (typeof showId !== "string" || !showId.trim()) {
      return json({ error: "Missing show ID" }, 400);
    }
    if (!ALLOWED_VOTES.has(vote)) {
      return json({ error: "Vote must be yes, maybe, or no" }, 400);
    }

    const key = `votes/${user.toLowerCase()}`;
    const userVotes =
      (await store.get(key, { type: "json", consistency: "strong" })) || {};

    userVotes[showId] = vote;
    await store.setJSON(key, userVotes);

    return json({ ok: true, user, userVotes });
  }

  return json({ error: "Method not allowed" }, 405);
};
