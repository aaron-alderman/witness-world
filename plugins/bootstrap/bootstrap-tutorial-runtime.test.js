import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapTutorialRuntime,
  renderBootstrapTutorialRuntimeFactory
} from "./bootstrap-tutorial-runtime.js";

test("bootstrap tutorial runtime wires tutorial state, controller, and bootstrap host adapters together", async () => {
  const calls = [];
  const tutorialState = {
    currentSuggestions: [{ id: "s1", title: "Next", action: { kind: "navigate" } }],
    tutorialStep: () => ({ id: "open-app" }),
    tutorialDisabledPages: () => [],
    tutorialDisabledScopeKeys: () => [],
    tutorialReplayStepId: () => null,
    tutorialReplayScopeKey: () => null,
    tutorialStepScope: () => ({ key: "section:bootstrap:identity-form" }),
    tutorialStepConcepts: () => [],
    tutorialRevealedConcepts: () => [],
    tutorialSurfaceState: () => ({ kind: "active" }),
    loadTutorialProgress: async () => {}
  };
  const tutorialController = {
    advanceTutorial: async () => {
      calls.push(["advance"]);
    },
    renderTutorialCard: () => {},
    renderTutorialOverlay: () => {},
    requestMaybeAdvanceTutorial: async () => {},
    bindTutorialInteractions: () => {}
  };

  const runtime = createBootstrapTutorialRuntime({
    tutorial: { steps: [] },
    state: {},
    stepIndex: new Map(),
    currentSurfacePage: "bootstrap",
    localProgressKey: "tutorial.key",
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
    createTutorialStateRuntimeFn: options => {
      calls.push(["state", options.currentSurfacePage, options.localProgressKey]);
      return tutorialState;
    },
    createTutorialControllerFn: options => {
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
    continueBootstrapTutorialOnPageFn: async options => {
      calls.push(["continue", options.page, options.currentPathname]);
      return { continued: true };
    }
  });

  assert.equal(runtime.currentSuggestions[0].id, "s1");
  await runtime.openAppHome({ advance: true });
  await runtime.continueTutorialOnPage("bootstrap");

  assert.deepEqual(calls, [
    ["state", "bootstrap", "tutorial.key"],
    ["controller", "bootstrap"],
    ["open", "bootstrap", "http://bootstrap.local/_bootstrap", true],
    ["advance"],
    ["assign", "http://bootstrap.local/"],
    ["continue", "bootstrap", "/_bootstrap"]
  ]);
});

test("bootstrap tutorial runtime factory exposes the shared browser helper", () => {
  const factory = renderBootstrapTutorialRuntimeFactory();
  assert.equal(factory.includes("const createBootstrapTutorialRuntime ="), true);
});
