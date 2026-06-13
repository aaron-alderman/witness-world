import test from "node:test";
import assert from "node:assert/strict";
import {
  createBootstrapRenderRuntime,
  renderBootstrapShellRenderRuntimeFactory
} from "./bootstrap-shell-render-runtime.js";

test("bootstrap shell render runtime sequences extracted render helpers and publishes tutorial state", () => {
  const calls = [];
  const publishedSnapshots = [];
  const state = {
    model: { appReady: true },
    bootstrapState: {
      contexts: [{ id: "ctx.main" }],
      operator: {
        inventory: { backups: [] }
      }
    },
    session: { authenticated: true, actor: "tester", label: "Tester" },
    desktopShell: { shellId: "desktop-shell" },
    runtimePluginReview: { serverRunner: "runner.main", selectedPluginId: "plugin.canvas" },
    tutorialProgress: { stepId: "step.open", chapterId: "chapter.bootstrap" }
  };

  const render = createBootstrapRenderRuntime({
    state,
    currentSurfacePage: "bootstrap",
    byId: () => null,
    document: { createElement() {} },
    fillSelect: () => {},
    setSelectedValue: () => {},
    capabilityControls: {
      render() {
        calls.push("capability-render");
      }
    },
    buildProposalControlsSyncDeps: () => "proposal-deps",
    runBootstrapProposalControlsSyncFn: deps => {
      calls.push(["proposal-sync", deps]);
    },
    buildBackendControlsSyncDeps: () => "backend-deps",
    runBootstrapBackendControlsRenderFn: deps => {
      calls.push(["backend-render", deps]);
    },
    buildRuntimeIntegrationDirectControlsSyncDeps: () => "runtime-integration-deps",
    runBootstrapRuntimeIntegrationDirectControlsSyncFn: deps => {
      calls.push(["runtime-integration-sync", deps]);
    },
    buildProposalAdjacentSyncDeps: () => "proposal-adjacent-deps",
    runBootstrapProposalAdjacentSyncFn: deps => {
      calls.push(["proposal-adjacent-sync", deps]);
    },
    buildScopedControlsSyncDeps: () => "scoped-deps",
    runBootstrapScopedControlsSyncFn: deps => {
      calls.push(["scoped-sync", deps]);
    },
    buildRouteAuthoringSyncDeps: () => "route-deps",
    runBootstrapRouteAuthoringSyncFn: deps => {
      calls.push(["route-sync", deps]);
    },
    renderBootstrapStateInventoryFn: ({ authored, operator }) => {
      calls.push(["state-inventory", authored.contexts.length, Array.isArray(operator.inventory?.backups)]);
    },
    renderRuntimePluginReviewDetail: () => {
      calls.push("review-detail");
    },
    syncBootstrapShellViewStateFn: ({ state: renderState }) => {
      calls.push(["shell-view-sync", renderState.session.actor]);
    },
    applyBootstrapShellViewStateFn: () => {
      calls.push("shell-view-apply");
    },
    renderTutorialCard: () => {
      calls.push("tutorial-card");
    },
    renderTutorialOverlay: () => {
      calls.push("tutorial-overlay");
    },
    buildBootstrapTutorialRuntimeViewFn: ({ tutorialProgress, currentSurfacePage }) => ({
      stepId: tutorialProgress.stepId,
      surfacePage: currentSurfacePage
    }),
    publishTutorialRuntimeView: snapshot => {
      publishedSnapshots.push(snapshot);
      calls.push("tutorial-publish");
    },
    buildBootstrapShellStatusViewFn: ({ model, session, desktopShell }) => ({
      bootstrapSummary: model.appReady ? "ready" : "not-ready",
      sessionSummary: session.actor,
      desktopSummary: desktopShell.shellId
    }),
    applyBootstrapShellStatusViewFn: ({ view }) => {
      calls.push(["status-view", view.bootstrapSummary, view.sessionSummary, view.desktopSummary]);
    },
    applyBootstrapShellSelectFillFn: ({ runtimePluginReview }) => {
      calls.push(["select-fill", runtimePluginReview.selectedPluginId]);
    }
  });

  render();

  assert.deepEqual(calls, [
    ["status-view", "ready", "tester", "desktop-shell"],
    ["select-fill", "plugin.canvas"],
    "capability-render",
    ["proposal-sync", "proposal-deps"],
    ["backend-render", "backend-deps"],
    ["runtime-integration-sync", "runtime-integration-deps"],
    ["proposal-adjacent-sync", "proposal-adjacent-deps"],
    ["scoped-sync", "scoped-deps"],
    ["route-sync", "route-deps"],
    ["state-inventory", 1, true],
    "review-detail",
    ["shell-view-sync", "tester"],
    "shell-view-apply",
    "tutorial-card",
    "tutorial-overlay",
    "tutorial-publish"
  ]);
  assert.deepEqual(publishedSnapshots, [{
    stepId: "step.open",
    surfacePage: "bootstrap"
  }]);
});

test("bootstrap shell render runtime factory exposes the shared browser helper", () => {
  const factory = renderBootstrapShellRenderRuntimeFactory();
  assert.equal(factory.includes("const createBootstrapRenderRuntime ="), true);
});
