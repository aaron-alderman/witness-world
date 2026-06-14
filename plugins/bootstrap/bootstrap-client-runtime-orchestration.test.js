import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapClientRuntimeOrchestration,
  renderBootstrapClientRuntimeOrchestrationFactory
} from "./bootstrap-client-runtime-orchestration.js";

test("bootstrap client runtime orchestration owns refresh/render construction order", async () => {
  const calls = [];
  const orchestration = createBootstrapClientRuntimeOrchestration({
    guidance: { id: "tutorial.todo" },
    state: { model: {}, runtimePluginReview: null },
    currentSurfacePage: "bootstrap",
    documentTarget: {},
    windowTarget: {
      location: { reload() {} },
      witnessDesktop: { kind: "desktop-shell", async getDesktopShellState() { return {}; } }
    },
    request: async () => ({}),
    postJson: async () => ({}),
    byId() {
      return { reset() {} };
    },
    setStatus() {},
    formField() { return null; },
    fillSelect() {},
    setSelectedValue() {},
    desktopApi: () => ({ kind: "desktop-shell", async getDesktopShellState() { return {}; } }),
    stateSnapshots: new Map(),
    rowKey: row => row?.id || "",
    renderRuntimePluginReviewDetail: () => {},
    publishRuntimeView: () => {},
    runtimePluginReviewRequestState: { current: 0 },
    bootstrapControlsRuntime: {
      buildProposalControlsSyncDeps() { return {}; },
      capabilityControls: { bind() { calls.push(["capability-bind"]); }, render() {} },
      buildBackendControlsSyncDeps() { return {}; },
      buildProposalAdjacentSyncDeps() { return {}; },
      buildScopedControlsSyncDeps() { return {}; },
      buildRouteAuthoringSyncDeps() { return {}; },
      buildRuntimeIntegrationDirectControlsSyncDeps() { return {}; },
      liveState: {
        runtimeIntegrationState() {
          return { resolveServerRunner(server) { return { id: server || "runner-1" }; } };
        }
      }
    },
    support: {
      escapeHtml: value => String(value),
      byTarget: () => null,
      sleep: () => Promise.resolve()
    },
    createBootstrapClientRuntimeGuidanceFn: ({ guidance, renderPage, refresh }) => {
      calls.push(["guidance", guidance.id, typeof renderPage, typeof refresh]);
      return {
        guidance,
        guidanceRuntime: { kind: "guidance-runtime", bindGuidanceInteractions() { calls.push(["bind-guidance"]); } },
        currentSuggestions: () => [],
        guidanceState: { current: "guidance" },
        tutorialState: { current: "tutorial" },
        guidanceStep: () => "guidance-step",
        tutorialStep: () => "tutorial-step",
        guidanceDisabledPages: () => [],
        tutorialDisabledPages: () => [],
        guidanceDisabledScopeKeys: () => [],
        tutorialDisabledScopeKeys: () => [],
        guidanceDisabledContextIds: () => [],
        guidanceReplayStepId: () => null,
        tutorialReplayStepId: () => null,
        guidanceReplayScopeKey: () => null,
        tutorialReplayScopeKey: () => null,
        guidanceStepScope: () => null,
        tutorialStepScope: () => null,
        guidanceStepConcepts: () => [],
        tutorialStepConcepts: () => [],
        guidanceRevealedConcepts: () => [],
        tutorialRevealedConcepts: () => [],
        guidanceSurfaceState: () => ({ kind: "idle" }),
        tutorialSurfaceState: () => ({ kind: "idle" }),
        loadGuidanceProgress: async () => ({ id: "guidance-progress" }),
        loadTutorialProgress: async () => ({ id: "tutorial-progress" }),
        openAppHome: async () => "open-app-home",
        continueGuidanceOnPage: async () => "continue-guidance",
        continueTutorialOnPage: async () => "continue-tutorial",
        renderGuidanceCard: () => "guidance-card",
        renderTutorialCard: () => "tutorial-card",
        renderGuidanceOverlay: () => "guidance-overlay",
        renderTutorialOverlay: () => "tutorial-overlay",
        requestMaybeAdvanceGuidance: async () => "advance-guidance",
        requestMaybeAdvanceTutorial: async () => "advance-tutorial",
        bindGuidanceInteractions() {
          calls.push(["bind-guidance"]);
        },
        bindTutorialInteractions() {}
      };
    },
    runBootstrapRefreshFn: async ({
      request,
      render,
      setRuntimePluginReview,
      loadGuidanceProgress,
      loadTutorialProgress,
      requestMaybeAdvanceGuidance,
      requestMaybeAdvanceTutorial
    }) => {
      calls.push(["refresh", typeof request, typeof render, typeof setRuntimePluginReview]);
      calls.push(["load-guidance-progress", (await loadGuidanceProgress())?.id || null]);
      calls.push(["load-tutorial-progress", (await loadTutorialProgress())?.id || null]);
      calls.push(["advance-guidance", await requestMaybeAdvanceGuidance()]);
      calls.push(["advance-tutorial", await requestMaybeAdvanceTutorial()]);
      return null;
    },
    bindBootstrapClientRuntimeAdaptersFn: ({ refresh, renderPage, desktopApi }) => {
      calls.push(["binders", typeof refresh, typeof renderPage, desktopApi()?.kind]);
    },
    createBootstrapRenderRuntimeFn: ({ currentSurfacePage, publishGuidanceRuntimeView }) => {
      calls.push(["render-runtime", currentSurfacePage, typeof publishGuidanceRuntimeView]);
      return () => calls.push(["render"]);
    },
    runBootstrapProposalControlsSyncFn: () => {},
    runBootstrapBackendControlsRenderFn: () => {},
    runBootstrapRuntimeIntegrationDirectControlsSyncFn: () => {},
    runBootstrapProposalAdjacentSyncFn: () => {},
    runBootstrapScopedControlsSyncFn: () => {},
    runBootstrapRouteAuthoringSyncFn: () => {},
    loadBootstrapRuntimePluginReviewFn: async () => null,
    runtimePluginProposalBodyFn: value => value,
    mcpServerProposalBodyFn: value => value,
    mcpToolProposalBodyFn: value => value
  });

  await orchestration.startupPromise;
  assert.equal(orchestration.guidance.id, "tutorial.todo");
  assert.equal(orchestration.tutorialRuntime.kind, "guidance-runtime");
  assert.equal(typeof orchestration.render, "function");
  assert.equal(typeof orchestration.refresh, "function");
  assert.deepEqual(calls, [
    ["guidance", "tutorial.todo", "function", "function"],
    ["binders", "function", "function", "desktop-shell"],
    ["render-runtime", "bootstrap", "function"],
    ["bind-guidance"],
    ["refresh", "function", "function", "function"],
    ["load-guidance-progress", "guidance-progress"],
    ["load-tutorial-progress", "tutorial-progress"],
    ["advance-guidance", "advance-guidance"],
    ["advance-tutorial", "advance-tutorial"]
  ]);
});

test("bootstrap client runtime orchestration factory exposes the extracted helper", () => {
  const factory = renderBootstrapClientRuntimeOrchestrationFactory();
  assert.equal(factory.includes("const createBootstrapClientRuntimeOrchestration ="), true);
});
