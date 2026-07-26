/**
 * True when `target` is (or is inside) a text-editable element — an
 * `<input>`, `<textarea>`, `<select>`, or a `contenteditable="true"` node.
 *
 * Used to suppress viewer keyboard shortcuts while the user is typing
 * somewhere else in the page (e.g. the comment editor), so keys like WASD,
 * arrows, digits, +/-, space, v, p, and ijkl don't also move the camera.
 * Kept dependency-free (no React, no other project modules) so it can be
 * unit tested without a DOM/browser test harness.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select, [contenteditable="true"]') ||
      Boolean(target.closest('[contenteditable="true"]')))
  );
}
