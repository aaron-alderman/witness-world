import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialClientProgressAdapter,
  createTutorialClientViewAdapter,
  publishTutorialClientRuntimeSnapshot,
  renderTutorialClientAdapterFactory,
  renderTutorialClientDisabledScopes,
  renderTutorialClientOverlay,
  saveTutorialClientProgress,
  tutorialClientApiRequest
} from "./tutorial-client-adapter.js";

globalThis.renderTutorialDisabledScopesPanel ??= payload => payload.disabledScopesOpen;
globalThis.renderTutorialOverlayView ??= payload => ({
  lastRenderedStepId: payload.lastRenderedStepId,
  activeHighlightTarget: null,
  activeFocusScope: null,
  disabledScopesOpen: payload.disabledScopesOpen
});
globalThis.publishTutorialRuntimeState ??= payload => payload;

test("tutorial client api request helper preserves the request contract", async () => {
  const calls = [];
  const result = await tutorialClientApiRequest({
    tutorialId: "todo",
    method: "PUT",
    body: { stepId: "a" },
    fetchFn: async (url, options) => {
      calls.push([url, options.method, options.headers["content-type"], options.body]);
      return {
        ok: true,
        json: async () => ({ ok: true })
      };
    }
  });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [[
    "/api/tutorial-progress/todo",
    "PUT",
    "application/json",
    JSON.stringify({ stepId: "a" })
  ]]);
});

test("tutorial client save helper normalizes, persists, and clears progress through the shared seam", async () => {
  const calls = [];
  let saved = null;

  const normalized = await saveTutorialClientProgress({
    next: { stepId: "a" },
    normalizeProgressFn: next => ({ ...next, normalized: true }),
    setProgress: value => {
      saved = value;
      calls.push(["set", value]);
    },
    apiRequest: async payload => calls.push(["api", payload.method, payload.body ?? null])
  });
  assert.deepEqual(normalized, { stepId: "a", normalized: true });
  assert.deepEqual(saved, { stepId: "a", normalized: true });

  const cleared = await saveTutorialClientProgress({
    next: null,
    normalizeProgressFn: next => next,
    setProgress: value => {
      saved = value;
      calls.push(["set", value]);
    },
    apiRequest: async payload => calls.push(["api", payload.method, payload.body ?? null])
  });
  assert.equal(cleared, null);
  assert.equal(saved, null);

  assert.deepEqual(calls, [
    ["set", { stepId: "a", normalized: true }],
    ["api", "PUT", { stepId: "a", normalized: true }],
    ["set", null],
    ["api", "DELETE", null]
  ]);
});

test("tutorial client progress adapter exposes api and save wrappers through the shared seam", async () => {
  const calls = [];
  let progress = null;
  const { api, saveProgress } = createTutorialClientProgressAdapter({
    tutorialId: "todo",
    fetchFn: async (url, options) => {
      calls.push([url, options.method]);
      return { ok: true, json: async () => ({ ok: true }) };
    },
    normalizeProgressFn: next => ({ ...next, normalized: true }),
    setProgress: value => {
      progress = value;
    }
  });

  await api("GET");
  await saveProgress({ stepId: "a" });

  assert.deepEqual(progress, { stepId: "a", normalized: true });
  assert.deepEqual(calls, [
    ["/api/tutorial-progress/todo", "GET"],
    ["/api/tutorial-progress/todo", "PUT"]
  ]);
});

test("tutorial client view helpers route disabled-scope and overlay rendering through the shared seam", () => {
  const disabledScopesOpen = renderTutorialClientDisabledScopes({
    progress: { stepId: "a" },
    disabledScopesToggle: { id: "toggle" },
    disabledScopesPanel: { id: "panel" },
    disabledScopesOpen: true,
    tutorialDisabledGuidanceRowsFn: () => [],
    currentSurfacePage: "app",
    tutorialPageLabel: () => "App",
    renderTutorialDisabledScopeRowsFn: () => "<div></div>",
    documentTarget: { body: {} }
  });
  assert.equal(disabledScopesOpen, true);

  const overlayState = renderTutorialClientOverlay({
    progress: { stepId: "a" },
    currentStep: () => ({ id: "step-a" }),
    tutorialSurfaceState: () => ({ kind: "active" }),
    tutorialReplayScopeKeyFn: () => null,
    tutorialPageLabel: () => "App",
    tutorialStepConceptsFn: () => [],
    previousStep: () => null,
    firstStepInChapter: () => null,
    currentSurfaceContext: "ctx.todo",
    byTarget: () => null,
    focusScopeFor: () => null,
    clearHighlightFn: () => {},
    positionFn: () => {},
    lastRenderedStepId: "step-a",
    overlay: {},
    dimmer: {},
    resumeButton: {},
    disabledScopesToggle: {},
    disabledScopesPanel: {},
    disabledScopesOpen: false,
    tutorialDisabledGuidanceRowsFn: () => [],
    currentSurfacePage: "app",
    renderTutorialDisabledScopeRowsFn: () => "",
    documentTarget: { body: {} }
  });
  assert.equal(overlayState.lastRenderedStepId, "step-a");
  assert.equal(overlayState.disabledScopesOpen, false);
});

test("tutorial client runtime snapshot helper routes publish state through the shared seam", () => {
  const snapshot = publishTutorialClientRuntimeSnapshot({
    windowTarget: { id: "window" },
    getProgress: () => ({ stepId: "a" }),
    currentStep: () => ({ id: "step-a" }),
    tutorialStepScopeFn: () => "scope.a",
    tutorialStepConceptsFn: () => [],
    tutorialRevealedConceptsFn: () => [],
    tutorialReplayScopeKeyFn: () => null,
    tutorialReplayStepIdFn: () => null,
    tutorialDisabledScopeKeysFn: () => [],
    tutorialDisabledContextIdsFn: () => [],
    tutorialDisabledPagesFn: () => [],
    getDisabledScopesOpen: () => false,
    currentSurfacePage: "app",
    currentSurfaceContext: "ctx.todo",
    currentSurfaceRouteId: "route.todo",
    currentSurfaceRootWidgetId: "todo_form",
    currentSurfaceProgramId: "todo_program",
    tutorialSurfaceStateFn: () => ({ kind: "active" })
  });

  assert.equal(snapshot.currentSurfacePage, "app");
  assert.equal(typeof snapshot.getProgress, "function");
  assert.equal(snapshot.getProgress().stepId, "a");
});

test("tutorial client view adapter exposes render and publish wrappers through the shared seam", () => {
  let disabledScopesOpen = true;
  let lastRenderedStepId = "step-a";
  let activeHighlightTarget = null;
  let activeFocusScope = null;

  const { renderDisabledScopes, render, publishRuntimeState } = createTutorialClientViewAdapter({
    getProgress: () => ({ stepId: "a" }),
    currentStep: () => ({ id: "step-a" }),
    tutorialSurfaceState: () => ({ kind: "active" }),
    tutorialReplayScopeKeyFn: () => null,
    tutorialPageLabel: () => "App",
    tutorialStepConceptsFn: () => [],
    previousStep: () => null,
    firstStepInChapter: () => null,
    currentSurfaceContext: "ctx.todo",
    byTarget: () => null,
    focusScopeFor: () => null,
    clearHighlightFn: () => {},
    positionFn: () => {},
    getLastRenderedStepId: () => lastRenderedStepId,
    setLastRenderedStepId: value => {
      lastRenderedStepId = value;
    },
    overlay: {},
    dimmer: {},
    resumeButton: {},
    disabledScopesToggle: {},
    disabledScopesPanel: {},
    getDisabledScopesOpen: () => disabledScopesOpen,
    setDisabledScopesOpen: value => {
      disabledScopesOpen = value;
    },
    tutorialDisabledGuidanceRowsFn: () => [],
    currentSurfacePage: "app",
    renderTutorialDisabledScopeRowsFn: () => "",
    documentTarget: { body: {} },
    setActiveHighlightTarget: value => {
      activeHighlightTarget = value;
    },
    setActiveFocusScope: value => {
      activeFocusScope = value;
    },
    windowTarget: { id: "window" },
    tutorialStepScopeFn: () => "scope.a",
    tutorialRevealedConceptsFn: () => [],
    tutorialReplayStepIdFn: () => null,
    tutorialDisabledScopeKeysFn: () => [],
    tutorialDisabledContextIdsFn: () => [],
    tutorialDisabledPagesFn: () => [],
    currentSurfaceRouteId: "route.todo",
    currentSurfaceRootWidgetId: "todo_form",
    currentSurfaceProgramId: "todo_program"
  });

  renderDisabledScopes();
  render();
  const snapshot = publishRuntimeState();

  assert.equal(disabledScopesOpen, true);
  assert.equal(lastRenderedStepId, "step-a");
  assert.equal(activeHighlightTarget, null);
  assert.equal(activeFocusScope, null);
  assert.equal(snapshot.currentSurfaceProgramId, "todo_program");
});

test("tutorial client adapter factory exposes the shared browser helpers", () => {
  const factory = renderTutorialClientAdapterFactory();
  assert.equal(factory.includes("const tutorialClientApiRequest ="), true);
  assert.equal(factory.includes("const saveTutorialClientProgress ="), true);
  assert.equal(factory.includes("const createTutorialClientProgressAdapter ="), true);
  assert.equal(factory.includes("const renderTutorialClientOverlay ="), true);
  assert.equal(factory.includes("const publishTutorialClientRuntimeSnapshot ="), true);
  assert.equal(factory.includes("const createTutorialClientViewAdapter ="), true);
});
