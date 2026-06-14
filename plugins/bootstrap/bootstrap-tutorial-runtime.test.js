import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapGuidanceRuntime,
  renderBootstrapGuidanceRuntimeFactory,
  createBootstrapTutorialRuntime,
  renderBootstrapTutorialRuntimeFactory
} from "./bootstrap-tutorial-runtime.js";

test("bootstrap guidance runtime wires guidance state, controller, and bootstrap host adapters together", async () => {
  const calls = [];
  const tutorialState = {
    currentSuggestions: [{ id: "s1", title: "Next", action: { kind: "navigate" } }],
    guidanceStep: () => ({ id: "open-app" }),
    guidanceDisabledPages: () => [],
    guidanceDisabledScopeKeys: () => [],
    guidanceDisabledContextIds: () => [],
    guidanceReplayStepId: () => null,
    guidanceReplayScopeKey: () => null,
    guidanceStepScope: () => ({ key: "section:bootstrap:identity-form" }),
    guidanceStepConcepts: () => [],
    guidanceRevealedConcepts: () => [],
    guidanceSurfaceState: () => ({ kind: "active" }),
    loadGuidanceProgress: async () => {}
  };
  const tutorialController = {
    advanceTutorial: async () => {
      calls.push(["advance"]);
    },
    renderGuidanceCard: () => {},
    renderGuidanceOverlay: () => {},
    requestMaybeAdvanceGuidance: async () => {},
    bindGuidanceInteractions: () => {}
  };

  const runtime = createBootstrapGuidanceRuntime({
    guidance: { steps: [] },
    state: {},
    stepIndex: new Map(),
    currentSurfacePage: "bootstrap",
    localProgressKey: "guidance.key",
    request: async () => ({}),
    byId: id => id === "open-app-link" ? { href: "/" } : null,
    renderPage: () => {},
    getAppReady: () => true,
    refresh: async () => {
      calls.push(["refresh"]);
    },
    setBootstrapStatus: message => {
      calls.push(["status", message]);
    },
    currentHref: () => "http://bootstrap.local/_bootstrap",
    currentPathname: () => "/_bootstrap",
    assign: href => {
      calls.push(["assign", href]);
    },
    reload: () => {
      calls.push(["reload"]);
    },
    autoCompletableChapters: new Set(["widgets"]),
    escapeHtml: value => String(value),
    byTarget: () => null,
    setStatus: () => {},
    formField: () => null,
    sleep: () => Promise.resolve(),
    createGuidanceStateRuntimeFn: options => {
      calls.push(["state", options.currentSurfacePage, options.localProgressKey]);
      return tutorialState;
    },
    createGuidanceControllerFn: options => {
      calls.push(["controller", options.currentSurfacePage]);
      assert.equal(typeof options.openAppHome, "function");
      assert.equal(typeof options.continueTutorialOnPage, "function");
      return tutorialController;
    },
    openBootstrapAppHomeFn: async options => {
      calls.push(["open", options.currentSurfacePage, options.currentHref, options.advance]);
      if (options.advance) await options.advanceTutorial();
      options.assign("http://bootstrap.local/");
      return { opened: true };
    },
    continueBootstrapGuidanceOnPageFn: async options => {
      calls.push(["continue", options.page, options.currentPathname]);
      return { continued: true };
    }
  });

  assert.equal(runtime.currentSuggestions[0].id, "s1");
  assert.equal(runtime.guidanceState, tutorialState);
  assert.equal(runtime.tutorialState, tutorialState);
  assert.equal(runtime.guidanceController, tutorialController);
  assert.equal(runtime.tutorialController, tutorialController);
  await runtime.openAppHome({ advance: true });
  await runtime.continueTutorialOnPage("bootstrap");

  assert.deepEqual(calls, [
    ["state", "bootstrap", "guidance.key"],
    ["controller", "bootstrap"],
    ["open", "bootstrap", "http://bootstrap.local/_bootstrap", true],
    ["advance"],
    ["assign", "http://bootstrap.local/"],
    ["continue", "bootstrap", "/_bootstrap"]
  ]);
});

test("bootstrap tutorial runtime factory exposes the shared browser helper", () => {
  const factory = renderBootstrapGuidanceRuntimeFactory();
  assert.equal(factory.includes("const createBootstrapGuidanceRuntime ="), true);
  assert.equal(factory.includes("const createBootstrapTutorialRuntime = createBootstrapGuidanceRuntime;"), true);
  assert.equal(renderBootstrapTutorialRuntimeFactory(), factory);
  assert.equal(createBootstrapTutorialRuntime, createBootstrapGuidanceRuntime);
});
