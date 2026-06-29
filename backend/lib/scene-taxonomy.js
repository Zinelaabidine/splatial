"use strict";

const ALLOWED_CATEGORIES = new Set([
  "Nature",
  "Architecture",
  "Interior",
  "Objects",
  "People",
  "Vehicles",
  "Art",
  "Food",
  "Other",
]);

const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

function slugifyTag(raw) {
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

function normalizeTags(input) {
  if (!Array.isArray(input)) {
    return { ok: false, error: "tags must be an array of strings" };
  }

  if (input.length > MAX_TAGS) {
    return { ok: false, error: `At most ${MAX_TAGS} tags allowed` };
  }

  const seen = new Set();
  const tags = [];

  for (const entry of input) {
    if (typeof entry !== "string") {
      return { ok: false, error: "Each tag must be a string" };
    }

    const slug = slugifyTag(entry);
    if (slug === "") {
      return { ok: false, error: "Each tag must contain at least one letter or number" };
    }

    if (!seen.has(slug)) {
      seen.add(slug);
      tags.push(slug);
    }
  }

  return { ok: true, tags };
}

function validateCategory(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "category must be a non-empty string" };
  }
  if (!ALLOWED_CATEGORIES.has(value)) {
    return { ok: false, error: "category is not allowed" };
  }
  return { ok: true, category: value };
}

module.exports = {
  ALLOWED_CATEGORIES,
  normalizeTags,
  validateCategory,
};
