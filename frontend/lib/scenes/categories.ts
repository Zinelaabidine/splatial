/**
 * Allowed scene categories — must match backend/lib/scene-taxonomy.js ALLOWED_CATEGORIES.
 */
export const SCENE_CATEGORIES = [
  "Nature",
  "Architecture",
  "Interior",
  "Objects",
  "People",
  "Vehicles",
  "Art",
  "Food",
  "Other",
] as const;

export type SceneCategory = (typeof SCENE_CATEGORIES)[number];

export function isSceneCategory(value: string): value is SceneCategory {
  return (SCENE_CATEGORIES as readonly string[]).includes(value);
}
