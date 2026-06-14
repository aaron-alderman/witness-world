import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  renderBootstrapClientRuntimeFactory,
  startBootstrapClientRuntime
} from "./bootstrap-client-runtime.js";

test("bootstrap client runtime assembles helper-owned browser seams and starts refresh", async () => {
  const originalGlobals = {
    createBootstrapControlsRuntimeFromBootstrap: globalThis.createBootstrapControlsRuntimeFromBootstrap,
    createBootstrapGuidanceRuntime: globalThis.createBootstrapGuidanceRuntime,
    createBootstrapTutorialRuntime: globalThis.createBootstrapTutorialRuntime,
    runBootstrapRefresh: globalThis.runBootstrapRefresh,
    loadBootstrapRuntimePluginReview: globalThis.loadBootstrapRuntimePluginReview,
    bindBootstrapHostRefresh: globalThis.bindBootstrapHostRefresh,
    bindBootstrapTopCardsSubmit: globalThis.bindBootstrapTopCardsSubmit,
    bindBootstrapBackendAuthoringControlsSync: globalThis.bindBootstrapBackendAuthoringControlsSync,
    bindBootstrapBackendAuthoringSubmit: globalThis.bindBootstrapBackendAuthoringSubmit,
    bindBootstrapBackendVersionSubmit: globalThis.bindBootstrapBackendVersionSubmit,
    bindBootstrapProposalAdjacentSubmit: globalThis.bindBootstrapProposalAdjacentSubmit,
    bindBootstrapProposalAdjacentSync: globalThis.bindBootstrapProposalAdjacentSync,
    bindBootstrapProposalSubmit: globalThis.bindBootstrapProposalSubmit,
    bindBootstrapCapabilitySubmit: globalThis.bindBootstrapCapabilitySubmit,
    bindBootstrapRuntimeIntegrationDirectControlsSync: globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync,
    bindBootstrapRuntimeIntegrationDirectSubmit: globalThis.bindBootstrapRuntimeIntegrationDirectSubmit,
    bindBootstrapAppAuthoringSubmit: globalThis.bindBootstrapAppAuthoringSubmit,
    bindBootstrapRouteAuthoringSync: globalThis.bindBootstrapRouteAuthoringSync,
    bindBootstrapRuntimePluginReviewSync: globalThis.bindBootstrapRuntimePluginReviewSync,
    bindBootstrapProposalControlsSync: globalThis.bindBootstrapProposalControlsSync,
    bindBootstrapBackendVersionControlsSync: globalThis.bindBootstrapBackendVersionControlsSync,
    bindBootstrapScopedSubmit: globalThis.bindBootstrapScopedSubmit,
    bindBootstrapScopedControlsSync: globalThis.bindBootstrapScopedControlsSync,
    bindBootstrapHostActions: globalThis.bindBootstrapHostActions,
    createBootstrapRenderRuntime: globalThis.createBootstrapRenderRuntime,
    runBootstrapProposalControlsSync: globalThis.runBootstrapProposalControlsSync,
    runBootstrapBackendControlsRender: globalThis.runBootstrapBackendControlsRender,
    runBootstrapRuntimeIntegrationDirectControlsSync: globalThis.runBootstrapRuntimeIntegrationDirectControlsSync,
    runBootstrapProposalAdjacentSync: globalThis.runBootstrapProposalAdjacentSync,
    runBootstrapScopedControlsSync: globalThis.runBootstrapScopedControlsSync,
    runBootstrapRouteAuthoringSync: globalThis.runBootstrapRouteAuthoringSync,
    runtimePluginProposalBody: globalThis.runtimePluginProposalBody,
    mcpServerProposalBody: globalThis.mcpServerProposalBody,
    mcpToolProposalBody: globalThis.mcpToolProposalBody,
    buildBootstrapRuntimePluginReviewView: globalThis.buildBootstrapRuntimePluginReviewView,
    renderBootstrapStateItems: globalThis.renderBootstrapStateItems,
    tutorialState: globalThis.tutorialState,
    CSS: globalThis.CSS
  };
  const calls = [];
  try {
    globalThis.CSS = { escape: value => String(value) };
    globalThis.tutorialState = { current: "idle" };
    globalThis.createBootstrapControlsRuntimeFromBootstrap = ({ state }) => {
      calls.push(["controls-runtime", Object.keys(state).sort().join(",")]);
      return {
        dom: {
          byId(id) {
            calls.push(["by-id", id]);
            return id === "runtime-plugin-review-detail"
              ? { reset() {} }
              : { reset() {} };
          },
          setStatus(id, text) {
            calls.push(["set-status", id, text ?? ""]);
          },
          formField() {
            return null;
          },
          fillSelect() {},
          readSelectValue() {
            return "";
          },
          readFieldValue() {
            return "";
          },
          setSelectedValue() {},
          setSubmitDisabled() {}
        },
        liveState: {
          runtimeIntegrationState() {
            return {
              resolveServerRunner(server) {
                return { id: server || "runner-1" };
              }
            };
          }
        },
        buildProposalControlsSyncDeps() {
          return { family: "proposal" };
        },
        capabilityControls: {
          bind() {
            calls.push(["capability-bind"]);
          }
        },
        buildBackendControlsSyncDeps() {
          return { family: "backend" };
        },
        buildProposalAdjacentSyncDeps() {
          return { family: "proposal-adjacent" };
        },
        buildScopedControlsSyncDeps() {
          return { family: "scoped" };
        },
        buildRouteAuthoringSyncDeps() {
          return { family: "route" };
        },
        buildRuntimeIntegrationDirectControlsSyncDeps() {
          return { family: "runtime-integration" };
        }
      };
    };
    globalThis.createBootstrapGuidanceRuntime = ({ guidance, currentSurfacePage, localProgressKey }) => {
      calls.push(["guidance-runtime", guidance.id, currentSurfacePage, localProgressKey]);
      return {
        currentSuggestions: () => [],
        guidanceStep: () => null,
        guidanceDisabledPages: () => [],
        guidanceDisabledScopeKeys: () => [],
        guidanceDisabledContextIds: () => [],
        guidanceReplayStepId: () => null,
        guidanceReplayScopeKey: () => null,
        guidanceStepScope: () => null,
        guidanceStepConcepts: () => [],
        guidanceRevealedConcepts: () => [],
        guidanceSurfaceState: () => ({ kind: "idle" }),
        loadGuidanceProgress: async () => null,
        openAppHome: async () => {},
        continueGuidanceOnPage: async () => {},
        renderGuidanceCard: () => {},
        renderGuidanceOverlay: () => {},
        requestMaybeAdvanceGuidance: async () => {},
        bindGuidanceInteractions() {
          calls.push(["bind-guidance-interactions"]);
        }
      };
    };
    globalThis.runBootstrapRefresh = async ({ request, setRuntimePluginReview }) => {
      calls.push(["refresh", typeof request, typeof setRuntimePluginReview]);
      return null;
    };
    globalThis.loadBootstrapRuntimePluginReview = async () => null;
    globalThis.bindBootstrapHostRefresh = () => calls.push(["bind-host-refresh"]);
    globalThis.bindBootstrapTopCardsSubmit = () => calls.push(["bind-top-cards-submit"]);
    globalThis.bindBootstrapBackendAuthoringControlsSync = () => calls.push(["bind-backend-authoring"]);
    globalThis.bindBootstrapBackendAuthoringSubmit = () => calls.push(["bind-backend-authoring-submit"]);
    globalThis.bindBootstrapBackendVersionSubmit = () => calls.push(["bind-backend-version-submit"]);
    globalThis.bindBootstrapProposalAdjacentSubmit = () => calls.push(["bind-proposal-adjacent-submit"]);
    globalThis.bindBootstrapProposalAdjacentSync = () => calls.push(["bind-proposal-adjacent-sync"]);
    globalThis.bindBootstrapProposalSubmit = () => calls.push(["bind-proposal-submit"]);
    globalThis.bindBootstrapCapabilitySubmit = () => calls.push(["bind-capability-submit"]);
    globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync = () => calls.push(["bind-runtime-integration-sync"]);
    globalThis.bindBootstrapRuntimeIntegrationDirectSubmit = () => calls.push(["bind-runtime-integration-submit"]);
    globalThis.bindBootstrapAppAuthoringSubmit = () => calls.push(["bind-app-authoring-submit"]);
    globalThis.bindBootstrapRouteAuthoringSync = () => calls.push(["bind-route-authoring-sync"]);
    globalThis.bindBootstrapRuntimePluginReviewSync = () => calls.push(["bind-runtime-plugin-review-sync"]);
    globalThis.bindBootstrapProposalControlsSync = () => calls.push(["bind-proposal-controls-sync"]);
    globalThis.bindBootstrapBackendVersionControlsSync = () => calls.push(["bind-backend-version-sync"]);
    globalThis.bindBootstrapScopedSubmit = () => calls.push(["bind-scoped-submit"]);
    globalThis.bindBootstrapScopedControlsSync = () => calls.push(["bind-scoped-controls-sync"]);
    globalThis.bindBootstrapHostActions = () => calls.push(["bind-host-actions"]);
    globalThis.createBootstrapRenderRuntime = ({ currentSurfacePage, publishGuidanceRuntimeView }) => {
      calls.push(["render-runtime", currentSurfacePage, typeof publishGuidanceRuntimeView]);
      return () => calls.push(["render"]);
    };
    globalThis.runBootstrapProposalControlsSync = () => {};
    globalThis.runBootstrapBackendControlsRender = () => {};
    globalThis.runBootstrapRuntimeIntegrationDirectControlsSync = () => {};
    globalThis.runBootstrapProposalAdjacentSync = () => {};
    globalThis.runBootstrapScopedControlsSync = () => {};
    globalThis.runBootstrapRouteAuthoringSync = () => {};
    globalThis.runtimePluginProposalBody = value => value;
    globalThis.mcpServerProposalBody = value => value;
    globalThis.mcpToolProposalBody = value => value;
    globalThis.buildBootstrapRuntimePluginReviewView = () => ({ detailItems: [], noteText: "" });
    globalThis.renderBootstrapStateItems = () => calls.push(["render-runtime-plugin-review-items"]);

    const runtime = startBootstrapClientRuntime({
      tutorial: {
        id: "tutorial.todo",
        steps: [{ id: "step-1" }]
      },
      currentSurfacePage: "bootstrap",
      documentTarget: {
        querySelector() {
          return null;
        }
      },
      windowTarget: {
        location: {
          href: "http://bootstrap.local/_bootstrap",
          pathname: "/_bootstrap",
          assign() {},
          reload() {}
        }
      },
      fetchFn: async () => ({
        ok: true,
        async json() {
          return {};
        }
      })
    });

    await runtime.startupPromise;
    assert.deepEqual(calls, [
        ["controls-runtime", "bootstrapState,desktopShell,guidanceProgress,model,runtimePluginReview,session"],
      ["guidance-runtime", "tutorial.todo", "bootstrap", "witness.guidance.tutorial.todo"],
      ["bind-host-refresh"],
      ["bind-top-cards-submit"],
      ["bind-backend-authoring"],
      ["bind-backend-authoring-submit"],
      ["bind-backend-version-submit"],
      ["bind-proposal-adjacent-submit"],
      ["bind-proposal-adjacent-sync"],
      ["bind-runtime-integration-sync"],
      ["bind-runtime-integration-submit"],
      ["bind-app-authoring-submit"],
      ["bind-proposal-submit"],
      ["bind-capability-submit"],
      ["bind-route-authoring-sync"],
      ["bind-runtime-plugin-review-sync"],
      ["bind-proposal-controls-sync"],
      ["bind-backend-version-sync"],
      ["bind-scoped-submit"],
      ["bind-scoped-controls-sync"],
      ["capability-bind"],
      ["bind-host-actions"],
      ["render-runtime", "bootstrap", "function"],
      ["bind-guidance-interactions"],
      ["refresh", "function", "function"]
    ]);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      globalThis[key] = value;
    }
  }
});

test("bootstrap client runtime factory exposes the shared browser helper", () => {
  const factory = renderBootstrapClientRuntimeFactory();
  assert.equal(factory.includes("const createBootstrapRuntimeState ="), true);
  assert.equal(factory.includes("const syncGuidanceProgressAlias ="), true);
  assert.equal(factory.includes("const startBootstrapClientRuntime ="), true);
});

test("bootstrap client runtime can start without guidance attached", async () => {
  const originalGlobals = {
    createBootstrapControlsRuntimeFromBootstrap: globalThis.createBootstrapControlsRuntimeFromBootstrap,
    createBootstrapGuidanceRuntime: globalThis.createBootstrapGuidanceRuntime,
    createBootstrapTutorialRuntime: globalThis.createBootstrapTutorialRuntime,
    runBootstrapRefresh: globalThis.runBootstrapRefresh,
    loadBootstrapRuntimePluginReview: globalThis.loadBootstrapRuntimePluginReview,
    bindBootstrapHostRefresh: globalThis.bindBootstrapHostRefresh,
    bindBootstrapTopCardsSubmit: globalThis.bindBootstrapTopCardsSubmit,
    bindBootstrapBackendAuthoringControlsSync: globalThis.bindBootstrapBackendAuthoringControlsSync,
    bindBootstrapBackendAuthoringSubmit: globalThis.bindBootstrapBackendAuthoringSubmit,
    bindBootstrapBackendVersionSubmit: globalThis.bindBootstrapBackendVersionSubmit,
    bindBootstrapProposalAdjacentSubmit: globalThis.bindBootstrapProposalAdjacentSubmit,
    bindBootstrapProposalAdjacentSync: globalThis.bindBootstrapProposalAdjacentSync,
    bindBootstrapProposalSubmit: globalThis.bindBootstrapProposalSubmit,
    bindBootstrapCapabilitySubmit: globalThis.bindBootstrapCapabilitySubmit,
    bindBootstrapRuntimeIntegrationDirectControlsSync: globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync,
    bindBootstrapRuntimeIntegrationDirectSubmit: globalThis.bindBootstrapRuntimeIntegrationDirectSubmit,
    bindBootstrapAppAuthoringSubmit: globalThis.bindBootstrapAppAuthoringSubmit,
    bindBootstrapRouteAuthoringSync: globalThis.bindBootstrapRouteAuthoringSync,
    bindBootstrapRuntimePluginReviewSync: globalThis.bindBootstrapRuntimePluginReviewSync,
    bindBootstrapProposalControlsSync: globalThis.bindBootstrapProposalControlsSync,
    bindBootstrapBackendVersionControlsSync: globalThis.bindBootstrapBackendVersionControlsSync,
    bindBootstrapScopedSubmit: globalThis.bindBootstrapScopedSubmit,
    bindBootstrapScopedControlsSync: globalThis.bindBootstrapScopedControlsSync,
    bindBootstrapHostActions: globalThis.bindBootstrapHostActions,
    createBootstrapRenderRuntime: globalThis.createBootstrapRenderRuntime,
    runBootstrapProposalControlsSync: globalThis.runBootstrapProposalControlsSync,
    runBootstrapBackendControlsRender: globalThis.runBootstrapBackendControlsRender,
    runBootstrapRuntimeIntegrationDirectControlsSync: globalThis.runBootstrapRuntimeIntegrationDirectControlsSync,
    runBootstrapProposalAdjacentSync: globalThis.runBootstrapProposalAdjacentSync,
    runBootstrapScopedControlsSync: globalThis.runBootstrapScopedControlsSync,
    runBootstrapRouteAuthoringSync: globalThis.runBootstrapRouteAuthoringSync,
    runtimePluginProposalBody: globalThis.runtimePluginProposalBody,
    mcpServerProposalBody: globalThis.mcpServerProposalBody,
    mcpToolProposalBody: globalThis.mcpToolProposalBody,
    buildBootstrapRuntimePluginReviewView: globalThis.buildBootstrapRuntimePluginReviewView,
    renderBootstrapStateItems: globalThis.renderBootstrapStateItems,
    CSS: globalThis.CSS
  };
  const calls = [];
  try {
    globalThis.CSS = { escape: value => String(value) };
    globalThis.createBootstrapControlsRuntimeFromBootstrap = () => ({
      dom: {
        byId() { return null; },
        setStatus() {},
        formField() { return null; },
        fillSelect() {},
        readSelectValue() { return ""; },
        readFieldValue() { return ""; },
        setSelectedValue() {},
        setSubmitDisabled() {}
      },
      liveState: {
        runtimeIntegrationState() {
          return { resolveServerRunner(server) { return { id: server || "runner-1" }; } };
        }
      },
      buildProposalControlsSyncDeps() { return {}; },
      capabilityControls: { bind() {} },
      buildBackendControlsSyncDeps() { return {}; },
      buildProposalAdjacentSyncDeps() { return {}; },
      buildScopedControlsSyncDeps() { return {}; },
      buildRouteAuthoringSyncDeps() { return {}; },
      buildRuntimeIntegrationDirectControlsSyncDeps() { return {}; }
    });
    globalThis.createBootstrapGuidanceRuntime = () => {
      calls.push("guidance-runtime");
      return {};
    };
    globalThis.runBootstrapRefresh = async () => null;
    globalThis.loadBootstrapRuntimePluginReview = async () => null;
    globalThis.bindBootstrapHostRefresh = () => {};
    globalThis.bindBootstrapTopCardsSubmit = () => {};
    globalThis.bindBootstrapBackendAuthoringControlsSync = () => {};
    globalThis.bindBootstrapBackendAuthoringSubmit = () => {};
    globalThis.bindBootstrapBackendVersionSubmit = () => {};
    globalThis.bindBootstrapProposalAdjacentSubmit = () => {};
    globalThis.bindBootstrapProposalAdjacentSync = () => {};
    globalThis.bindBootstrapProposalSubmit = () => {};
    globalThis.bindBootstrapCapabilitySubmit = () => {};
    globalThis.bindBootstrapRuntimeIntegrationDirectControlsSync = () => {};
    globalThis.bindBootstrapRuntimeIntegrationDirectSubmit = () => {};
    globalThis.bindBootstrapAppAuthoringSubmit = () => {};
    globalThis.bindBootstrapRouteAuthoringSync = () => {};
    globalThis.bindBootstrapRuntimePluginReviewSync = () => {};
    globalThis.bindBootstrapProposalControlsSync = () => {};
    globalThis.bindBootstrapBackendVersionControlsSync = () => {};
    globalThis.bindBootstrapScopedSubmit = () => {};
    globalThis.bindBootstrapScopedControlsSync = () => {};
    globalThis.bindBootstrapHostActions = () => {};
    globalThis.createBootstrapRenderRuntime = () => () => {};
    globalThis.runBootstrapProposalControlsSync = () => {};
    globalThis.runBootstrapBackendControlsRender = () => {};
    globalThis.runBootstrapRuntimeIntegrationDirectControlsSync = () => {};
    globalThis.runBootstrapProposalAdjacentSync = () => {};
    globalThis.runBootstrapScopedControlsSync = () => {};
    globalThis.runBootstrapRouteAuthoringSync = () => {};
    globalThis.runtimePluginProposalBody = value => value;
    globalThis.mcpServerProposalBody = value => value;
    globalThis.mcpToolProposalBody = value => value;
    globalThis.buildBootstrapRuntimePluginReviewView = () => ({ detailItems: [], noteText: "" });
    globalThis.renderBootstrapStateItems = () => {};

    const runtime = startBootstrapClientRuntime({
      currentSurfacePage: "bootstrap",
      documentTarget: { querySelector() { return null; } },
      windowTarget: { location: { href: "http://bootstrap.local/_bootstrap", pathname: "/_bootstrap", assign() {}, reload() {} } },
      fetchFn: async () => ({ ok: true, async json() { return {}; } })
    });
    await runtime.startupPromise;

    assert.equal(runtime.guidance, null);
    assert.equal(Object.keys(runtime.state).includes("tutorialProgress"), false);
    runtime.state.tutorialProgress = { stepId: "step-1" };
    assert.deepEqual(runtime.state.guidanceProgress, { stepId: "step-1" });
    assert.equal(typeof runtime.guidanceRuntime.bindGuidanceInteractions, "function");
    assert.deepEqual(calls, []);
  } finally {
    for (const [key, value] of Object.entries(originalGlobals)) {
      globalThis[key] = value;
    }
  }
});

test("bootstrap shell consumes the shared client runtime seam instead of keeping runtime assembly inline", async () => {
  const shellSource = await readFile(new URL("./bootstrap-shell.js", import.meta.url), "utf8");
  const pageScriptSource = await readFile(new URL("./bootstrap-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./bootstrap-client-runtime.js", import.meta.url), "utf8");
  const clientRuntimeBindersSource = await readFile(new URL("./bootstrap-client-runtime-binders.js", import.meta.url), "utf8");
  const clientRuntimeGuidanceSource = await readFile(new URL("./bootstrap-client-runtime-guidance.js", import.meta.url), "utf8");
  const clientRuntimeOrchestrationSource = await readFile(new URL("./bootstrap-client-runtime-orchestration.js", import.meta.url), "utf8");
  const clientRuntimeSupportSource = await readFile(new URL("./bootstrap-client-runtime-support.js", import.meta.url), "utf8");

  assert.equal(shellSource.includes('./bootstrap-client-runtime.js'), false);
  assert.equal(shellSource.includes('./bootstrap-client-runtime-binders.js'), false);
  assert.equal(shellSource.includes('./bootstrap-client-runtime-guidance.js'), false);
  assert.equal(shellSource.includes('./bootstrap-client-runtime-orchestration.js'), false);
  assert.equal(shellSource.includes('./bootstrap-client-runtime-support.js'), false);
  assert.equal(shellSource.includes('renderBootstrapPageScript({ guidance })'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-http.js'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-runtime-binders.js'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-runtime-guidance.js'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-runtime-orchestration.js'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-runtime-support.js'), true);
  assert.equal(pageScriptSource.includes('./bootstrap-client-runtime.js'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientHttpFactory()'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientRuntimeBindersFactory()'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientRuntimeGuidanceFactory()'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientRuntimeOrchestrationFactory()'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientRuntimeSupportFactory()'), true);
  assert.equal(pageScriptSource.includes('renderBootstrapClientRuntimeFactory()'), true);
  assert.equal(pageScriptSource.includes('startBootstrapClientRuntime({'), true);
  assert.equal(shellSource.includes('const bootstrapControlsRuntime = createBootstrapControlsRuntimeFromBootstrap({ state });'), false);
  assert.equal(shellSource.includes('const { dom, liveState } = bootstrapControlsRuntime;'), false);
  assert.equal(shellSource.includes('capabilityControls.bind();'), false);
  assert.equal(shellSource.includes('bindBootstrapRuntimeIntegrationDirectControlsSync({'), false);
  assert.equal(shellSource.includes('bindBootstrapRuntimeIntegrationDirectSubmit({'), false);
  assert.equal(shellSource.includes('bindBootstrapProposalAdjacentSync({'), false);
  assert.equal(shellSource.includes('createBootstrapClientHttp({'), false);
  assert.equal(clientRuntimeSource.includes('const bootstrapControlsRuntime = createBootstrapControlsRuntimeFromBootstrap({ state });'), true);
  assert.equal(clientRuntimeSource.includes('const { dom, liveState } = bootstrapControlsRuntime;'), true);
  assert.equal(clientRuntimeSource.includes('const { request, postJson } = createBootstrapClientHttp({ fetchFn });'), true);
  assert.equal(clientRuntimeSource.includes('createBootstrapClientRuntimeOrchestration({'), true);
  assert.equal(clientRuntimeSource.includes('createBootstrapClientRuntimeSupport({'), true);
  assert.equal(clientRuntimeSource.includes('buildProposalAdjacentSyncDeps,'), false);
  assert.equal(clientRuntimeSource.includes('buildScopedControlsSyncDeps,'), false);
  assert.equal(clientRuntimeSource.includes('buildRouteAuthoringSyncDeps,'), false);
  assert.equal(clientRuntimeSource.includes('bindBootstrapClientRuntimeAdapters({'), false);
  assert.equal(clientRuntimeSource.includes('const activeGuidance = guidance ?? tutorial ?? null;'), false);
  assert.equal(clientRuntimeSource.includes('const localProgressKey = activeGuidance?.id'), false);
  assert.equal(clientRuntimeSource.includes('const legacyLocalProgressKey = activeGuidance?.id'), false);
  assert.equal(clientRuntimeSource.includes('const stepIndex = new Map((activeGuidance?.steps || []).map((step, index) => [step.id, index]));'), false);
  assert.equal(clientRuntimeSource.includes('const autoCompletableChapters = new Set(["widgets", "program", "routes"]);'), false);
  assert.equal(clientRuntimeSource.includes('const guidanceRuntime = activeGuidance'), false);
  assert.equal(clientRuntimeSource.includes('refresh = async () => runBootstrapRefresh({'), false);
  assert.equal(clientRuntimeSource.includes('render = createBootstrapRenderRuntime({'), false);
  assert.equal(clientRuntimeSource.includes('const startupPromise = refresh().catch(error => setStatus("bootstrap-status", error.message));'), false);
  assert.equal(clientRuntimeSource.includes('const stateSnapshots = new Map();'), false);
  assert.equal(clientRuntimeSource.includes('const escapeHtml = value =>'), false);
  assert.equal(clientRuntimeSource.includes('const byTarget = target =>'), false);
  assert.equal(clientRuntimeSource.includes('const desktopApi = () =>'), false);
  assert.equal(clientRuntimeSource.includes('const sleep = ms =>'), false);
  assert.equal(clientRuntimeSource.includes('const rowKey = row =>'), false);
  assert.equal(clientRuntimeSource.includes('const renderRuntimePluginReviewDetail = () => {'), false);
  assert.equal(clientRuntimeSource.includes('const buildProposalAdjacentSyncDeps = createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap({'), false);
  assert.equal(clientRuntimeSource.includes('const buildScopedControlsSyncDeps = createBootstrapScopedControlsSyncDepsBuilderFromBootstrap({'), false);
  assert.equal(clientRuntimeSource.includes('const buildRouteAuthoringSyncDeps = createBootstrapRouteAuthoringSyncDepsBuilder({'), false);
  assert.equal(clientRuntimeSource.includes('capabilityControls.bind();'), false);
  assert.equal(clientRuntimeSource.includes('bindBootstrapRuntimeIntegrationDirectControlsSync({'), false);
  assert.equal(clientRuntimeSource.includes('bindBootstrapRuntimeIntegrationDirectSubmit({'), false);
  assert.equal(clientRuntimeSource.includes('bindBootstrapProposalAdjacentSync({'), false);
  assert.equal(clientRuntimeBindersSource.includes('capabilityControls.bind();'), true);
  assert.equal(clientRuntimeBindersSource.includes('bindBootstrapRuntimeIntegrationDirectControlsSync({'), true);
  assert.equal(clientRuntimeBindersSource.includes('bindBootstrapRuntimeIntegrationDirectSubmit({'), true);
  assert.equal(clientRuntimeBindersSource.includes('bindBootstrapProposalAdjacentSync({'), true);
  assert.equal(clientRuntimeGuidanceSource.includes("export function createBootstrapNoopGuidanceRuntime"), true);
  assert.equal(clientRuntimeGuidanceSource.includes("export function createBootstrapClientRuntimeGuidance"), true);
  assert.equal(clientRuntimeGuidanceSource.includes('const activeGuidance = guidance ?? tutorial ?? null;'), true);
  assert.equal(clientRuntimeGuidanceSource.includes('const localProgressKey = activeGuidance?.id'), true);
  assert.equal(clientRuntimeGuidanceSource.includes('const legacyLocalProgressKey = activeGuidance?.id'), true);
  assert.equal(clientRuntimeGuidanceSource.includes('const stepIndex = new Map((activeGuidance?.steps || []).map((step, index) => [step.id, index]));'), true);
  assert.equal(clientRuntimeGuidanceSource.includes('const autoCompletableChapters = new Set(["widgets", "program", "routes"]);'), true);
  assert.equal(clientRuntimeGuidanceSource.includes('createBootstrapGuidanceRuntimeFn = typeof createBootstrapGuidanceRuntime === "function" ? createBootstrapGuidanceRuntime : null'), true);
  assert.equal(clientRuntimeOrchestrationSource.includes("export function createBootstrapClientRuntimeOrchestration"), true);
  assert.equal(clientRuntimeOrchestrationSource.includes('createBootstrapClientRuntimeGuidanceFn({'), true);
  assert.equal(clientRuntimeOrchestrationSource.includes('refresh = async () => runBootstrapRefreshFn({'), true);
  assert.equal(clientRuntimeOrchestrationSource.includes('bindBootstrapClientRuntimeAdaptersFn({'), true);
  assert.equal(clientRuntimeOrchestrationSource.includes('render = createBootstrapRenderRuntimeFn({'), true);
  assert.equal(clientRuntimeOrchestrationSource.includes('const startupPromise = refresh().catch(error => setStatus("bootstrap-status", error.message));'), true);
  assert.equal(clientRuntimeSupportSource.includes('const stateSnapshots = new Map();'), true);
  assert.equal(clientRuntimeSupportSource.includes('return String(value).replace(/[&<>\"\\\']/g'), false);
  assert.equal(clientRuntimeSupportSource.includes("export function escapeBootstrapHtml"), true);
  assert.equal(clientRuntimeSupportSource.includes('const byTarget = target =>'), true);
  assert.equal(clientRuntimeSupportSource.includes('const desktopApi = () =>'), true);
  assert.equal(clientRuntimeSupportSource.includes('const sleep = ms =>'), true);
  assert.equal(clientRuntimeSupportSource.includes('rowKey: bootstrapStateInventoryRowKey,'), true);
  assert.equal(clientRuntimeSupportSource.includes('const renderRuntimePluginReviewDetail = () => {'), true);
  assert.equal(clientRuntimeSupportSource.includes('const publishRuntimeView = snapshot => {'), true);
});
