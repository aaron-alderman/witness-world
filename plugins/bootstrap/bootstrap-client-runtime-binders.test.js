import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapClientRuntimeAdapters,
  renderBootstrapClientRuntimeBindersFactory
} from "./bootstrap-client-runtime-binders.js";

test("bootstrap client runtime binders attach the extracted bridge family in order", () => {
  const originalGlobals = {
    bindBootstrapHostRefresh: globalThis.bindBootstrapHostRefresh,
    bindBootstrapTopCardsSubmit: globalThis.bindBootstrapTopCardsSubmit,
    bindBootstrapBackendAuthoringControlsSync: globalThis.bindBootstrapBackendAuthoringControlsSync,
    bindBootstrapBackendAuthoringSubmit: globalThis.bindBootstrapBackendAuthoringSubmit,
    bindBootstrapBackendVersionSubmit: globalThis.bindBootstrapBackendVersionSubmit,
    bindBootstrapProposalAdjacentSubmit: globalThis.bindBootstrapProposalAdjacentSubmit,
    bindBootstrapProposalAdjacentSync: globalThis.bindBootstrapProposalAdjacentSync,
    bindBootstrapRuntimeIntegrationDirectControlsSync: globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync,
    bindBootstrapRuntimeIntegrationDirectSubmit: globalThis.bindBootstrapRuntimeIntegrationDirectSubmit,
    bindBootstrapAppAuthoringSubmit: globalThis.bindBootstrapAppAuthoringSubmit,
    bindBootstrapProposalSubmit: globalThis.bindBootstrapProposalSubmit,
    bindBootstrapCapabilitySubmit: globalThis.bindBootstrapCapabilitySubmit,
    bindBootstrapRouteAuthoringSync: globalThis.bindBootstrapRouteAuthoringSync,
    bindBootstrapRuntimePluginReviewSync: globalThis.bindBootstrapRuntimePluginReviewSync,
    bindBootstrapProposalControlsSync: globalThis.bindBootstrapProposalControlsSync,
    bindBootstrapBackendVersionControlsSync: globalThis.bindBootstrapBackendVersionControlsSync,
    bindBootstrapScopedSubmit: globalThis.bindBootstrapScopedSubmit,
    bindBootstrapScopedControlsSync: globalThis.bindBootstrapScopedControlsSync,
    bindBootstrapHostActions: globalThis.bindBootstrapHostActions
  };
  const calls = [];
  try {
    globalThis.bindBootstrapHostRefresh = ({ target, refresh }) => calls.push(["host-refresh", typeof target, typeof refresh]);
    globalThis.bindBootstrapTopCardsSubmit = ({ reload }) => calls.push(["top-cards-submit", typeof reload]);
    globalThis.bindBootstrapBackendAuthoringControlsSync = ({ buildDeps }) => calls.push(["backend-authoring-sync", typeof buildDeps]);
    globalThis.bindBootstrapBackendAuthoringSubmit = ({ postJson }) => calls.push(["backend-authoring-submit", typeof postJson]);
    globalThis.bindBootstrapBackendVersionSubmit = ({ refresh }) => calls.push(["backend-version-submit", typeof refresh]);
    globalThis.bindBootstrapProposalAdjacentSubmit = ({ postJson, resolveServerRunner, runtimePluginProposalBodyFn, mcpServerProposalBodyFn, mcpToolProposalBodyFn }) => {
      calls.push([
        "proposal-adjacent-submit",
        typeof postJson,
        resolveServerRunner("runner-2").id,
        runtimePluginProposalBodyFn({ source: "x" }),
        mcpServerProposalBodyFn({ source: "y" }),
        mcpToolProposalBodyFn({ source: "z" })
      ]);
    };
    globalThis.bindBootstrapProposalAdjacentSync = ({ buildDeps }) => calls.push(["proposal-adjacent-sync", buildDeps().family]);
    globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync = ({ buildDeps }) => calls.push(["runtime-integration-sync", buildDeps().family]);
    globalThis.bindBootstrapRuntimeIntegrationDirectSubmit = ({ resetForm }) => calls.push(["runtime-integration-submit", typeof resetForm]);
    globalThis.bindBootstrapAppAuthoringSubmit = ({ setStatus }) => calls.push(["app-authoring-submit", typeof setStatus]);
    globalThis.bindBootstrapProposalSubmit = ({ postJson }) => calls.push(["proposal-submit", typeof postJson]);
    globalThis.bindBootstrapCapabilitySubmit = ({ refresh }) => calls.push(["capability-submit", typeof refresh]);
    globalThis.bindBootstrapRouteAuthoringSync = ({ buildDeps }) => calls.push(["route-authoring-sync", buildDeps().family]);
    globalThis.bindBootstrapRuntimePluginReviewSync = ({ getReview, getRuntimeProfile, renderPage, renderDetail }) => calls.push([
      "runtime-plugin-review-sync",
      getReview()?.selectedPluginId,
      getRuntimeProfile(),
      typeof renderPage,
      typeof renderDetail
    ]);
    globalThis.bindBootstrapProposalControlsSync = ({ buildDeps }) => calls.push(["proposal-controls-sync", buildDeps().family]);
    globalThis.bindBootstrapBackendVersionControlsSync = ({ buildDeps }) => calls.push(["backend-version-sync", buildDeps().family]);
    globalThis.bindBootstrapScopedSubmit = ({ postJson }) => calls.push(["scoped-submit", typeof postJson]);
    globalThis.bindBootstrapScopedControlsSync = ({ buildDeps }) => calls.push(["scoped-controls-sync", buildDeps().family]);
    globalThis.bindBootstrapHostActions = ({ guidanceStep, tutorialStep, desktopApi }) => calls.push([
      "host-actions",
      guidanceStep()?.id,
      tutorialStep()?.id,
      desktopApi()?.kind
    ]);

    bindBootstrapClientRuntimeAdapters({
      target: { addEventListener() {} },
      byId: () => null,
      request: async () => ({}),
      postJson: async () => ({}),
      refresh: async () => {},
      setStatus: () => {},
      resetForm: () => {},
      reload: () => {},
      state: {
        model: { runtimeProfile: "minimal" },
        runtimePluginReview: { selectedPluginId: "plugin.todo" }
      },
      renderPage: () => {},
      renderRuntimePluginReviewDetail: () => {},
      runtimePluginReviewRequestState: { current: 1 },
      buildProposalControlsSyncDeps: () => ({ family: "proposal" }),
      buildBackendControlsSyncDeps: () => ({ family: "backend" }),
      buildProposalAdjacentSyncDeps: () => ({ family: "proposal-adjacent" }),
      buildScopedControlsSyncDeps: () => ({ family: "scoped" }),
      buildRouteAuthoringSyncDeps: () => ({ family: "route" }),
      buildRuntimeIntegrationDirectControlsSyncDeps: () => ({ family: "runtime-integration" }),
      capabilityControls: {
        bind() {
          calls.push(["capability-bind"]);
        }
      },
      resolveServerRunner: server => ({ id: server || "runner-1" }),
      runtimePluginProposalBodyFn: detail => detail.source + ":runtime-plugin",
      mcpServerProposalBodyFn: detail => detail.source + ":mcp-server",
      mcpToolProposalBodyFn: detail => detail.source + ":mcp-tool",
      getReview: () => ({ selectedPluginId: "plugin.todo" }),
      setReview: () => {},
      getRuntimeProfile: () => "minimal",
      guidanceStep: () => ({ id: "guidance-step" }),
      tutorialStep: () => ({ id: "tutorial-step" }),
      openAppHome: async () => {},
      desktopApi: () => ({ kind: "desktop-shell" })
    });

    assert.deepEqual(calls, [
      ["host-refresh", "object", "function"],
      ["top-cards-submit", "function"],
      ["backend-authoring-sync", "function"],
      ["backend-authoring-submit", "function"],
      ["backend-version-submit", "function"],
      ["proposal-adjacent-submit", "function", "runner-2", "x:runtime-plugin", "y:mcp-server", "z:mcp-tool"],
      ["proposal-adjacent-sync", "proposal-adjacent"],
      ["runtime-integration-sync", "runtime-integration"],
      ["runtime-integration-submit", "function"],
      ["app-authoring-submit", "function"],
      ["proposal-submit", "function"],
      ["capability-submit", "function"],
      ["route-authoring-sync", "route"],
      ["runtime-plugin-review-sync", "plugin.todo", "minimal", "function", "function"],
      ["proposal-controls-sync", "proposal"],
      ["backend-version-sync", "backend"],
      ["scoped-submit", "function"],
      ["scoped-controls-sync", "scoped"],
      ["capability-bind"],
      ["host-actions", "guidance-step", "tutorial-step", "desktop-shell"]
    ]);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      globalThis[key] = value;
    }
  }
});

test("bootstrap client runtime binders factory exposes the extracted binder helper", () => {
  const factory = renderBootstrapClientRuntimeBindersFactory();
  assert.equal(factory.includes("const bindBootstrapClientRuntimeAdapters ="), true);
});
