/**
 * Lightweight assertion-based test for lib/viewer/isEditableTarget.ts — no
 * test framework (or jsdom) is configured for frontend/, so this stubs just
 * enough of the DOM surface (`HTMLElement`, `matches`, `closest`) to exercise
 * the guard's branches, and runs directly under Node's native TypeScript
 * support:
 *
 *   node --experimental-strip-types frontend/test/isEditableTarget.test.ts
 */
import assert from "node:assert/strict";
import { isEditableTarget } from "../lib/viewer/isEditableTarget.ts";

class FakeElement {
  private _matches: boolean;
  private _closestResult: FakeElement | null;

  constructor(matchesResult: boolean, closestResult: FakeElement | null = null) {
    this._matches = matchesResult;
    this._closestResult = closestResult;
  }

  matches(_selector: string) {
    return this._matches;
  }

  closest(_selector: string) {
    return this._closestResult;
  }
}

// Stub the DOM global that isEditableTarget's `instanceof HTMLElement` check
// relies on — there is no browser/jsdom in this plain-Node test run.
(globalThis as unknown as { HTMLElement: unknown }).HTMLElement = FakeElement;

const asTarget = (el: FakeElement | null) => el as unknown as EventTarget;

// A comment <textarea>/<input>/<select> matches the selector directly.
assert.equal(isEditableTarget(asTarget(new FakeElement(true))), true);

// A child node inside a contenteditable region — doesn't match the selector
// itself, but `.closest('[contenteditable="true"]')` finds the ancestor.
const editableAncestor = new FakeElement(true);
assert.equal(
  isEditableTarget(asTarget(new FakeElement(false, editableAncestor))),
  true,
);

// The viewer canvas, document body, or any other ordinary element.
assert.equal(isEditableTarget(asTarget(new FakeElement(false, null))), false);

// No target at all (defensive — some synthetic events may omit it).
assert.equal(isEditableTarget(null), false);

// A target that isn't an HTMLElement at all (e.g. Window).
assert.equal(isEditableTarget({} as unknown as EventTarget), false);

console.log("isEditableTarget.test.ts: all assertions passed");
