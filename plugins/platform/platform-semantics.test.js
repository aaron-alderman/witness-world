import assert from "node:assert/strict";
import test from "node:test";
import { buildPlatformModel, filterPlatformModel } from "./platform-model.js";

test("platform model publishes mutable surface semantics as first-class rows", async () => {
  const model = await buildPlatformModel({
    diagnostics: {},
    project: () => []
  });

  assert.equal(model.nodes.some(node => node.id === "mutableSurface:runtime.session" && node.kind === "mutableSurface"), true);
  assert.equal(model.mutableSurfaceSemantics.some(row => row.id === "mutableSurface:demo.privateNotes" && row.sharingClass === "personal"), true);
  assert.equal(model.mutableSurfaceSemantics.some(row => row.id === "mutableSurface:demo.todos" && row.sharingClass === "shared" && row.stateClass === "context-shared"), true);
  assert.equal(model.mutableSurfaceSemantics.some(row => row.id === "mutableSurface:canvas.perspective" && row.sharingClass === "mixed"), true);
});

test("platform semantics view filters mutable surfaces by contract fields", () => {
  const model = {
    mutableSurfaceSemantics: [{
      id: "mutableSurface:canvas.perspective.shared",
      surface: "canvas.perspective.shared",
      title: "Shared Canvas Perspective",
      sharingClass: "shared",
      stateClass: "perspective-scoped",
      visibilityRule: "context-visible",
      authorityRule: "context-authority-or-proposal",
      mutationMode: "proposal-fallback",
      variantOf: "mutableSurface:canvas.perspective",
      readSurfaces: ["/api/canvas"],
      mutationSurfaces: ["canvas.move"],
      witnessProcesses: ["canvas.move"],
      sourceFiles: ["plugins/canvas/canvas-processes.js"],
      variants: [],
      notes: ""
    }],
    summaries: { byKind: { plugin: 1 } }
  };

  const filteredBySharing = filterPlatformModel(model, "semantics", "shared");
  const filteredByAuthority = filterPlatformModel(model, "semantics", "context-authority-or-proposal");
  const filteredByVariant = filterPlatformModel(model, "semantics", "mutableSurface:canvas.perspective");

  assert.equal(filteredBySharing.mutableSurfaceSemantics.length, 1);
  assert.equal(filteredByAuthority.mutableSurfaceSemantics[0].surface, "canvas.perspective.shared");
  assert.equal(filteredByVariant.mutableSurfaceSemantics[0].id, "mutableSurface:canvas.perspective.shared");
});
