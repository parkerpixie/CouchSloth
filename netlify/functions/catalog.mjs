import { getStore } from "@netlify/blobs";

const FAMILY = ["Parker", "Blake", "Porter"];
const ALLOWED_TYPES = new Set(["Series", "Movie", "Documentary"]);
const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { "cache-control": "no-store, no-cache, must-revalidate" },
});

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "watch";
}

export default async (req) => {
  const store = getStore("couchsloth-catalog");

  if (req.method === "GET") {
    const shows = await store.get("custom-shows", { type: "json", consistency: "strong" }) || [];
    return json({ shows: Array.isArray(shows) ? shows : [] });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const title = String(body?.title || "").trim();
    const type = String(body?.type || "").trim();
    const addedBy = String(body?.addedBy || "").trim();
    const image = typeof body?.image === "string" ? body.image : "";

    if (!title || title.length > 120) return json({ error: "Please enter a title." }, 400);
    if (!ALLOWED_TYPES.has(type)) return json({ error: "Choose Series, Movie, or Documentary." }, 400);
    if (!FAMILY.includes(addedBy)) return json({ error: "Unknown family member." }, 400);
    if (image && !image.startsWith("data:image/")) return json({ error: "Image must be a photo." }, 400);
    if (image.length > 1_800_000) return json({ error: "That image is still too large. Try a smaller photo." }, 413);

    const current = await store.get("custom-shows", { type: "json", consistency: "strong" }) || [];
    const shows = Array.isArray(current) ? current : [];
    const createdAt = new Date().toISOString();
    const show = {
      id: `custom-${slugify(title)}-${Date.now().toString(36)}`,
      title,
      type,
      platform: "Family pick",
      note: `Added by ${addedBy}. Family-added ${type.toLowerCase()} ready for the CouchSloth vote.`,
      addedBy,
      createdAt,
      image,
      custom: true,
    };

    const next = [...shows, show].slice(-100);
    await store.setJSON("custom-shows", next);
    return json({ ok: true, show });
  }

  return json({ error: "Method not allowed" }, 405);
};
