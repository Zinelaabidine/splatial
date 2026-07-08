/** One-shot in-memory handoff of a loaded splat buffer (viewer → edit page). */
const cache = new Map<string, ArrayBuffer>();

export function setSplatBuffer(sceneId: string, buffer: ArrayBuffer): void {
  if (!sceneId) return;
  cache.set(sceneId, buffer);
}

/** Returns the cached buffer for sceneId and removes it from the cache. */
export function takeSplatBuffer(sceneId: string): ArrayBuffer | null {
  if (!sceneId) return null;
  const buffer = cache.get(sceneId) ?? null;
  if (buffer) cache.delete(sceneId);
  return buffer;
}
