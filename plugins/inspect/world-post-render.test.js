import test from "node:test";
import assert from "node:assert/strict";
import {
  queuePendingWorldSourceLoad,
  renderWorldPostRenderFactory,
  runWorldPostRender,
  syncWorldGraphViewport,
  syncWorldTutorialRenderState
} from "./world-post-render.js";

test("world post-render pending source helper queues the initial source load once", async () => {
  const calls = [];
  const state = {
    worldGraphInitialSourcePending: true,
    worldGraphSource: null,
    worldGraphSourceLoading: false
  };

  const queued = queuePendingWorldSourceLoad({
    state,
    currentMode: () => "source",
    openSourceForSelected: async () => calls.push("open-source"),
    byWidget: () => true,
    widget: "root",
    redraw: () => calls.push("redraw")
  });
  assert.equal(queued, true);

  await Promise.resolve();
  await Promise.resolve();

  assert.equal(state.worldGraphInitialSourcePending, false);
  assert.equal(state.worldGraphSourceLoading, false);
  assert.deepEqual(calls, ["open-source", "redraw"]);
});

test("world post-render viewport helper recenters the selected node in graph mode", () => {
  const canvas = {
    clientWidth: 200,
    clientHeight: 100,
    scrollLeft: 0,
    scrollTop: 0
  };
  const focused = syncWorldGraphViewport({
    root: {
      querySelector(selector) {
        return selector === ".world-graph-canvas" ? canvas : null;
      }
    },
    selected: { x: 250, y: 110 },
    currentMode: () => "graph"
  });

  assert.equal(focused, true);
  assert.equal(canvas.scrollLeft, 245);
  assert.equal(canvas.scrollTop, 88);
});

test("world post-render tutorial sync focuses active steps and clears stale markers otherwise", () => {
  const calls = [];
  const currentNodes = [{ removeAttribute(name) { calls.push(["remove-current", name]); } }];
  const scopeNodes = [{ removeAttribute(name) { calls.push(["remove-scope", name]); } }];

  const focused = syncWorldTutorialRenderState({
    state: { worldTutorialProgress: { step: "a" } },
    updateWorldTutorialApi: () => calls.push("update-api"),
    worldTutorialSurfaceState: () => ({ kind: "active" }),
    commandTutorialStep: () => ({ target: "world-command-toggle" }),
    focusWorldTutorialTarget: target => calls.push(["focus", target]),
    tutorialDomRoot: () => ({
      querySelectorAll() {
        return [];
      }
    })
  });
  assert.equal(focused, "focused");

  const cleared = syncWorldTutorialRenderState({
    state: { worldTutorialProgress: { step: "b" } },
    updateWorldTutorialApi: () => calls.push("update-api"),
    worldTutorialSurfaceState: () => ({ kind: "idle" }),
    commandTutorialStep: () => null,
    focusWorldTutorialTarget: target => calls.push(["focus", target]),
    tutorialDomRoot: () => ({
      querySelectorAll(selector) {
        if (selector === "[data-tutorial-current]") return currentNodes;
        if (selector === "[data-tutorial-focus-scope]") return scopeNodes;
        return [];
      }
    })
  });
  assert.equal(cleared, "cleared");

  assert.deepEqual(calls, [
    "update-api",
    ["focus", "world-command-toggle"],
    "update-api",
    ["remove-current", "data-tutorial-current"],
    ["remove-scope", "data-tutorial-focus-scope"]
  ]);
});

test("world post-render runner composes viewport, tutorial sync, and command focus", () => {
  const calls = [];
  runWorldPostRender({
    root: {},
    state: { worldTutorialProgress: { step: "a" } },
    byId: { todo_form: { x: 10, y: 20 } },
    getSelectedId: () => "todo_form",
    currentMode: () => "graph",
    updateWorldTutorialApi: () => calls.push("update-api"),
    worldTutorialSurfaceState: () => ({ kind: "active" }),
    commandTutorialStep: () => ({ target: "world-command-toggle" }),
    focusWorldTutorialTarget: target => calls.push(["focus", target]),
    tutorialDomRoot: () => ({ querySelectorAll() { return []; } }),
    syncWorldCommandFocus: ({ root, state }) => calls.push(["focus-command", Boolean(root), Boolean(state)])
  });

  assert.deepEqual(calls, [
    "update-api",
    ["focus", "world-command-toggle"],
    ["focus-command", true, true]
  ]);
});

test("world post-render factory exposes the shared browser helpers", () => {
  const factory = renderWorldPostRenderFactory();
  assert.equal(factory.includes("const queuePendingWorldSourceLoad ="), true);
  assert.equal(factory.includes("const runWorldPostRender ="), true);
});
