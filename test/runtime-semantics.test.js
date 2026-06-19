import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMutableSurfaceSemanticsLedger,
  RUNTIME_MUTABLE_SHARING_CLASSES,
  RUNTIME_MUTABLE_STATE_CLASSES
} from "../src/runtime-semantics.js";

test("mutable surface semantics ledger exposes personal, shared, and mixed runtime state nouns", () => {
  const rows = buildMutableSurfaceSemanticsLedger();
  const byId = new Map(rows.map(row => [row.id, row]));

  assert.deepEqual(RUNTIME_MUTABLE_SHARING_CLASSES, ["personal", "shared", "mixed"]);
  assert.deepEqual(RUNTIME_MUTABLE_STATE_CLASSES, ["actor-scoped", "perspective-scoped", "context-shared"]);
  assert.equal(byId.get("mutableSurface:runtime.session")?.sharingClass, "personal");
  assert.equal(byId.get("mutableSurface:runtime.session")?.stateClass, "actor-scoped");
  assert.equal(byId.get("mutableSurface:demo.privateNotes")?.visibilityRule, "actor-private");
  assert.equal(byId.get("mutableSurface:eden.pageTheme")?.authorityRule, "request-actor");
  assert.equal(byId.get("mutableSurface:demo.todos")?.sharingClass, "shared");
  assert.equal(byId.get("mutableSurface:demo.todos")?.stateClass, "context-shared");
  assert.equal(byId.get("mutableSurface:demo.todos")?.mutationMode, "proposal-fallback");
  assert.equal(byId.get("mutableSurface:canvas.perspective")?.sharingClass, "mixed");
  assert.deepEqual(byId.get("mutableSurface:canvas.perspective")?.variants, [
    "mutableSurface:canvas.perspective.personal",
    "mutableSurface:canvas.perspective.shared"
  ]);
  assert.equal(byId.get("mutableSurface:canvas.perspective.personal")?.authorityRule, "perspective-owner-or-steward");
  assert.equal(byId.get("mutableSurface:canvas.perspective.shared")?.authorityRule, "context-authority-or-proposal");
});

test("mutable surface semantics ledger returns defensive clones", () => {
  const first = buildMutableSurfaceSemanticsLedger();
  first[0].readSurfaces.push("/tmp/mutated");
  const second = buildMutableSurfaceSemanticsLedger();

  assert.equal(second[0].readSurfaces.includes("/tmp/mutated"), false);
});
