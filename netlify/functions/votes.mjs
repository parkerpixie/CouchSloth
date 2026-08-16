import { getStore } from "@netlify/blobs";

const FAMILY = ["Parker", "Blake", "Porter"];
const ALLOWED_VOTES = new Set(["yes", "maybe", "no"]);
const SAFE_SHOW_ID = /^[a-z0-9][a-z0-9-]{1,119}$/;

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store, no-cache, must-revalidate",
    },
  });

function requestedShowIds(req) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("showIds") || "";
  return [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => SAFE_SHOW_ID.test(id)))].slice(0, 150);
}

export default async (req) => {
  const store = getStore("couchsloth-family-votes");

  if (req.method === "GET") {
    const showIds = requestedShowIds(req);
    const familyEntries = await Promise.all(
      FAMILY.map(async (user) => {
        const voteEntries = await Promise.all(
          showIds.map(async (showId) => {
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
    if (!SAFE_SHOW_ID.test(String(showId || ""))) {
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
