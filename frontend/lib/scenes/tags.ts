/** Mirrors backend/lib/scene-taxonomy.js tag limits and slugify rules. */
export const MAX_SCENE_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

export function slugifyTag(raw: string): string {
  let slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > MAX_TAG_LENGTH) {
    slug = slug.slice(0, MAX_TAG_LENGTH).replace(/-+$/g, "");
  }
  return slug;
}

export function validateTagInput(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = slugifyTag(raw);
  if (slug === "") {
    return { ok: false, error: "Each tag must contain at least one letter or number" };
  }
  return { ok: true, slug };
}
