import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorld } from "../../src/kernel.js";
import {
  activateBackendProgramVersion,
  defineBackendProgram,
  defineBackendProgramVersion,
  defineBackendStep
} from "../../src/backend-programs.js";
import { activateWidgetVersion, defineWidgetVersion, defineWidgetVersionTransition } from "../../src/widgets.js";
import { worldGraphProjection, astNodesProjection } from "./world-graph.js";
import { processRunProjection, processViewProjection, renderProcessPage } from "./process-view.js";
import { inspectWorldSystemReadModel } from "./world-system.js";
import { renderWidgetPage } from "./widget-page.js";
import {
  createHandlers,
  inspectProcessRunReadModel,
  inspectProcessViewReadModel,
  inspectWitnessesReadModel,
  inspectWorldGraphReadModel,
  inspectWorldSystemReadModelForRuntime,
  recordInspectProcessEventRequest,
  providers
} from "./runtime.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "./widget-versions.js";

test("inspect plugin owns inspect bundle catalog, routes, and surfaces", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-inspect"'), true);
  assert.equal(source.includes('"worldGraph.read"'), true);
  assert.equal(source.includes('"worldSystem.read"'), true);
  assert.equal(source.includes('id: "surface:world"'), false);
  assert.equal(source.includes("page.world"), false);
  assert.equal(source.includes("page.process"), false);
  assert.equal(source.includes('from "../../src/inspect-runtime-shared.js"'), true);
});

test("inspect handlers tolerate a missing logger for world graph reads", async () => {
  const events = [];
  const world = createWorld();
  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    logger: null,
    send() {},
    sendJson(_res, status, body) {
      events.push({ status, body });
    },
    readJson: async () => ({}),
    sendGateFailure() {},
    authorityServices: {
      ensureTargetAuthority() {
        return { ok: true };
      }
    },
    requestActors: () => [],
    requestVisibleWitnesses: () => [],
    processSelection: () => ({}),
    processViewInputs: () => ({ witnesses: [], observations: [] }),
    frontendTraceProcesses: new Set()
  });

  await assert.doesNotReject(() => handlers["worldGraph.read"]({
    res: {},
    requestActor: "adam",
    requestId: "req-1",
    appContext: {}
  }));
  assert.equal(events[0]?.status, 200);
  assert.equal(Array.isArray(events[0]?.body?.graph?.nodes), true);
});

test("inspect plugin owns world graph projections without a src compatibility facade", async () => {
  const pluginWorldGraph = await readFile(new URL("./world-graph.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const graph = worldGraphProjection([]);

  assert.equal(typeof worldGraphProjection, "function");
  assert.equal(typeof astNodesProjection, "function");
  assert.deepEqual(graph.nodes.some(node => node.id === "genesis"), true);
  assert.equal(pluginWorldGraph.includes("export function worldGraphProjection"), true);
  assert.equal(pluginWorldGraph.includes("export function astNodesProjection"), true);
  assert.equal(runtimeSource.includes('from "./world-graph.js"'), false);
  assert.equal(runtimeSource.includes('from "../../src/inspect-runtime-shared.js"'), true);
  await assert.rejects(readFile(new URL("../../src/world-graph.js", import.meta.url), "utf8"));
});

test("inspect plugin owns process view projections and page rendering without a src compatibility facade", async () => {
  const pluginProcessView = await readFile(new URL("./process-view.js", import.meta.url), "utf8");
  const processViewPageSource = await readFile(new URL("./process-view-page.wtoml", import.meta.url), "utf8");
  const runtimePageStateSource = await readFile(new URL("../../src/runtime-page-state.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const model = processViewProjection({ witnesses: [], observations: [] }, {});

  assert.equal(typeof processViewProjection, "function");
  assert.equal(typeof processRunProjection, "function");
  assert.equal(typeof renderProcessPage, "function");
  assert.deepEqual(model.catalog, []);
  assert.match(renderProcessPage(model), /Process View/);
  assert.equal(processViewPageSource.includes('class = "surface-header-bar surface-toolbar"'), true);
  assert.equal(processViewPageSource.includes('surface-empty surface-empty-state'), true);
  assert.equal(processViewPageSource.includes('class = "surface-status"'), true);
  assert.equal(processViewPageSource.includes('class = "status"'), false);
  assert.equal(pluginProcessView.includes("export function processViewProjection"), true);
  assert.equal(pluginProcessView.includes("export function processRunProjection"), true);
  assert.equal(pluginProcessView.includes("export function renderProcessPage"), true);
  assert.equal(pluginProcessView.includes('from "../../src/runtime-page-state.js"'), true);
  assert.equal(pluginProcessView.includes("renderRuntimePageInitialStateScript("), true);
  assert.equal(pluginProcessView.includes("injectRuntimePageMarkupBeforeProgram("), true);
  assert.equal(pluginProcessView.includes("function serializeJsonScript"), false);
  assert.equal(pluginProcessView.includes("function injectBeforeFrontendProgram"), false);
  assert.equal(runtimePageStateSource.includes("export function renderRuntimePageInitialStateScript"), true);
  assert.equal(runtimePageStateSource.includes("export function injectRuntimePageMarkupBeforeProgram"), true);
  assert.equal(runtimeSource.includes('from "./process-view.js"'), false);
  assert.equal(runtimeSource.includes('from "../../src/inspect-runtime-shared.js"'), true);
  await assert.rejects(readFile(new URL("../../src/process-view.js", import.meta.url), "utf8"));
});

test("inspect plugin owns widget page rendering while src widgets stays model-focused", async () => {
  const pluginWidgetPage = await readFile(new URL("./widget-page.js", import.meta.url), "utf8");
  const surfaceCommandActionsSource = await readFile(new URL("./surface-command-actions.js", import.meta.url), "utf8");
  const surfaceCommandIdentityActionsSource = await readFile(new URL("./surface-command-identity-actions.js", import.meta.url), "utf8");
  const surfaceCommandViewSource = await readFile(new URL("./surface-command-view.js", import.meta.url), "utf8");
  const surfaceInspectorActionsSource = await readFile(new URL("./surface-inspector-actions.js", import.meta.url), "utf8");
  const surfaceInspectorFormActionsSource = await readFile(new URL("./surface-inspector-form-actions.js", import.meta.url), "utf8");
  const surfaceInspectorOverlayViewSource = await readFile(new URL("./surface-inspector-overlay-view.js", import.meta.url), "utf8");
  const surfaceInspectorPanelViewSource = await readFile(new URL("./surface-inspector-panel-view.js", import.meta.url), "utf8");
  const surfaceInspectorVersionActionsSource = await readFile(new URL("./surface-inspector-version-actions.js", import.meta.url), "utf8");
  const worldCommandActionsSource = await readFile(new URL("./world-command-actions.js", import.meta.url), "utf8");
  const worldBrowserViewSource = await readFile(new URL("./world-browser-view.js", import.meta.url), "utf8");
  const worldGraphActionsSource = await readFile(new URL("./world-graph-actions.js", import.meta.url), "utf8");
  const worldGraphViewSource = await readFile(new URL("./world-graph-view.js", import.meta.url), "utf8");
  const widgetPageHeadSource = await readFile(new URL("./widget-page-head.js", import.meta.url), "utf8");
  const widgetPageStylesSource = await readFile(new URL("./widget-page-styles.js", import.meta.url), "utf8");
  const worldPostRenderSource = await readFile(new URL("./world-post-render.js", import.meta.url), "utf8");
  const worldShellViewSource = await readFile(new URL("./world-shell-view.js", import.meta.url), "utf8");
  const worldSurfaceViewSource = await readFile(new URL("./world-surface-view.js", import.meta.url), "utf8");
  const worldTutorialActionsSource = await readFile(new URL("./world-tutorial-actions.js", import.meta.url), "utf8");
  const worldTutorialCompanionSource = await readFile(new URL("./world-tutorial-companion.js", import.meta.url), "utf8");
  const surfaceKitSource = await readFile(new URL("./surface-kit-styles.js", import.meta.url), "utf8");
  const runtimeSurfaceKitSource = await readFile(new URL("../../src/runtime-surface-kit.js", import.meta.url), "utf8");
  const runtimeSurfaceCommandSource = await readFile(new URL("../../src/runtime-surface-command-primitives.js", import.meta.url), "utf8");
  const runtimeSurfaceContentSource = await readFile(new URL("../../src/runtime-surface-content-primitives.js", import.meta.url), "utf8");
  const runtimeSurfaceFormSource = await readFile(new URL("../../src/runtime-surface-form-controls.js", import.meta.url), "utf8");
  const runtimeSurfaceInspectorSource = await readFile(new URL("../../src/runtime-surface-inspector-primitives.js", import.meta.url), "utf8");
  const runtimeSurfaceTutorialSource = await readFile(new URL("../../src/runtime-surface-tutorial-primitives.js", import.meta.url), "utf8");
  const themeSource = await readFile(new URL("../eden/eden-page-theme.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const srcWidgets = await readFile(new URL("../../src/widgets.js", import.meta.url), "utf8");

  assert.equal(typeof renderWidgetPage, "function");
  assert.equal(pluginWidgetPage.includes("export function renderWidgetPage"), true);
  assert.equal(pluginWidgetPage.includes("renderGuidanceClient"), true);
  assert.equal(pluginWidgetPage.includes("tutorialDefinition"), false);
  assert.equal(pluginWidgetPage.includes("resolvePagePresentationTheme"), true);
  assert.equal(pluginWidgetPage.includes("resolveEdenPageTheme"), false);
  assert.equal(pluginWidgetPage.includes('from "./surface-command-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-command-identity-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-command-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-inspector-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-inspector-form-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-inspector-overlay-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-inspector-panel-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./surface-inspector-version-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-command-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-browser-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-graph-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-graph-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-post-render.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-shell-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-surface-view.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-tutorial-actions.js"'), true);
  assert.equal(pluginWidgetPage.includes('from "./world-tutorial-companion.js"'), true);
  assert.equal(pluginWidgetPage.includes("renderWorldTutorialCompanionFactory()"), true);
  assert.equal(pluginWidgetPage.includes("syncWorldTutorialCompanion()"), true);
  assert.equal(pluginWidgetPage.includes('from "./widget-page-head.js"'), true);
  assert.equal(pluginWidgetPage.includes("const processTraceEnabled = config.traceProcessEvents !== false;"), true);
  assert.equal(pluginWidgetPage.includes("if (checkboxes === 'boolean')"), true);
  assert.equal(pluginWidgetPage.includes("setQueryParam"), true);
  assert.equal(pluginWidgetPage.includes("dispatchDomEvent has been retired"), true);
  assert.equal(pluginWidgetPage.includes("const syncInitialState ="), true);
  assert.equal(pluginWidgetPage.includes("const setHidden ="), true);
  assert.equal(pluginWidgetPage.includes("const setDisabled ="), true);
  assert.equal(pluginWidgetPage.includes("if (step.op === 'setHidden')"), true);
  assert.equal(pluginWidgetPage.includes("if (step.op === 'setDisabled')"), true);
  assert.equal(pluginWidgetPage.includes("bindSurfaceCommandActions({"), true);
  assert.equal(pluginWidgetPage.includes("bindSurfaceCommandIdentityActions({"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceCommandPaletteView({"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceWhoamiResultView({"), true);
  assert.equal(pluginWidgetPage.includes("bindSurfaceInspectorActions({"), true);
  assert.equal(pluginWidgetPage.includes("bindSurfaceInspectorFormActions({"), true);
  assert.equal(pluginWidgetPage.includes("ensureSurfaceInspectorOverlayRoot({ documentTarget: document });"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceInspectorPanelView({"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceInspectorMenuView({"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceInspectorEditorView({"), true);
  assert.equal(pluginWidgetPage.includes("renderSurfaceInspectorOverlayView({"), true);
  assert.equal(pluginWidgetPage.includes("bindSurfaceInspectorVersionActions({"), true);
  assert.equal(pluginWidgetPage.includes("'/api/proposals'"), false);
  assert.equal(pluginWidgetPage.includes("'/api/widgets/' + encodeURIComponent(id)"), true);
  assert.equal(pluginWidgetPage.includes("'/api/widget-versions/' + encodeURIComponent(soul) + '/activate'"), true);
  assert.equal(pluginWidgetPage.includes("'/api/widget-versions/' + encodeURIComponent(soul) + '/rollback'"), true);
  assert.equal(pluginWidgetPage.includes("bindWorldCommandActions({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldSourceDocumentView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldThingListView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldWitnessBrowserView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldProcessExplorerView()"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldPrimitiveBrowserView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldSystemOverviewView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldInspectorView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldGraphCanvasView({"), true);
  assert.equal(pluginWidgetPage.includes("bindWorldGraphActions({"), true);
  assert.equal(pluginWidgetPage.includes("queuePendingWorldSourceLoad({"), true);
  assert.equal(pluginWidgetPage.includes("runWorldPostRender({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldGraphShell({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldModeMenuView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldCommandPaletteView({"), true);
  assert.equal(pluginWidgetPage.includes("renderWorldTutorialPanelView({"), true);
  assert.equal(pluginWidgetPage.includes("bindWorldTutorialActions({"), true);
  assert.equal(pluginWidgetPage.includes("syncWorldCommandFocus({ root, state });"), false);
  assert.equal(pluginWidgetPage.includes("bindWorldCommandShortcuts({"), true);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-toggle]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-close]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-input]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-run]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-result-world]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-result-source]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-result-bootstrap]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-command-identity-form]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-toggle]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-close]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-clear]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-refresh]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-select]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-world]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-world-mode]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-open-process]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-activate]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-rollback]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-edit-form]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-proposal-form]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("overlay.querySelectorAll('[data-surface-inspector-version-proposal-form]').forEach(node => {"), false);
  assert.equal(pluginWidgetPage.includes("document.createElement('div');"), false);
  assert.equal(pluginWidgetPage.includes("overlay.innerHTML ="), true);
  assert.equal(pluginWidgetPage.includes("Live Page Inspector"), false);
  assert.equal(pluginWidgetPage.includes("No matching pages, widgets, capabilities, or commands."), false);
  assert.equal(pluginWidgetPage.includes("Save Identity Here"), false);
  assert.equal(pluginWidgetPage.includes("Propose Save-Back"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-command-toggle]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-command-close]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-command-input]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-command-run]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-mode]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-node-id], [data-world-select]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-kind]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-clear-kind]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-source-file]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-widget-activate]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-widget-rollback]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-open-process-program]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-jump-to-graph]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-close-source]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-primitive], [data-world-primitive-kind-only]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-close-primitive]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-focus-target]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-focus-scope-target]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-show-disabled]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-resume]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-next]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-back]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-restart-chapter]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-restart-step]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-enable-scope]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-enable-context]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-open-scope]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-disable]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-disable-context]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-exit]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("root.querySelectorAll('[data-world-tutorial-reset]').forEach(el => {"), false);
  assert.equal(pluginWidgetPage.includes("const canvas = root.querySelector('.world-graph-canvas');"), false);
  assert.equal(pluginWidgetPage.includes("updateWorldTutorialApi();"), false);
  assert.equal(pluginWidgetPage.includes("syncWorldCommandFocus({ root, state });"), false);
  assert.equal(pluginWidgetPage.includes("No matching surfaces, objects, or commands."), false);
  assert.equal(pluginWidgetPage.includes("Show Disabled Sourcery Scopes"), false);
  assert.equal(pluginWidgetPage.includes("Search / Command"), false);
  assert.equal(pluginWidgetPage.includes("No witnessed source files."), false);
  assert.equal(pluginWidgetPage.includes("Select a source file. Definitions linked to the selected object will be highlighted."), false);
  assert.equal(pluginWidgetPage.includes("No recent witnessed history for this object."), false);
  assert.equal(pluginWidgetPage.includes("Primitive browser"), false);
  assert.equal(pluginWidgetPage.includes("<h2>Selected Object</h2>"), false);
  assert.equal(pluginWidgetPage.includes("<strong>Activation history</strong>"), false);
  assert.equal(pluginWidgetPage.includes("world-graph-svg"), false);
  assert.equal(pluginWidgetPage.includes("world-context-box"), false);
  assert.equal(pluginWidgetPage.includes("await safeRun('load');"), true);
  assert.equal(pluginWidgetPage.includes(".surface-card-grid"), false);
  assert.equal(pluginWidgetPage.includes(".world-graph-shell"), false);
  assert.equal(pluginWidgetPage.includes("--page-bg:"), false);
  assert.equal(pluginWidgetPage.includes("function renderHead("), false);
  assert.equal(surfaceCommandActionsSource.includes("export function bindSurfaceCommandActions"), true);
  assert.equal(surfaceCommandActionsSource.includes("export function renderSurfaceCommandActionsFactory"), true);
  assert.equal(surfaceCommandIdentityActionsSource.includes("export function bindSurfaceCommandIdentityActions"), true);
  assert.equal(surfaceCommandIdentityActionsSource.includes("export async function submitSurfaceCommandIdentityForm"), true);
  assert.equal(surfaceCommandIdentityActionsSource.includes("export function renderSurfaceCommandIdentityActionsFactory"), true);
  assert.equal(surfaceCommandViewSource.includes("export function renderSurfaceWhoamiResultView"), true);
  assert.equal(surfaceCommandViewSource.includes("export function renderSurfaceCommandPaletteView"), true);
  assert.equal(surfaceCommandViewSource.includes("export function renderSurfaceCommandViewFactory"), true);
  assert.equal(surfaceInspectorActionsSource.includes("export function bindSurfaceInspectorActions"), true);
  assert.equal(surfaceInspectorActionsSource.includes("export function renderSurfaceInspectorActionsFactory"), true);
  assert.equal(surfaceInspectorFormActionsSource.includes("export function bindSurfaceInspectorFormActions"), true);
  assert.equal(surfaceInspectorFormActionsSource.includes("export async function submitSurfaceInspectorEditForm"), true);
  assert.equal(surfaceInspectorFormActionsSource.includes("export async function submitSurfaceInspectorProposalForm"), true);
  assert.equal(surfaceInspectorFormActionsSource.includes("export async function submitSurfaceInspectorVersionProposalForm"), true);
  assert.equal(surfaceInspectorFormActionsSource.includes("export function renderSurfaceInspectorFormActionsFactory"), true);
  assert.equal(surfaceInspectorOverlayViewSource.includes("export function ensureSurfaceInspectorOverlayRoot"), true);
  assert.equal(surfaceInspectorOverlayViewSource.includes("export function renderSurfaceInspectorOverlayView"), true);
  assert.equal(surfaceInspectorOverlayViewSource.includes("export function renderSurfaceInspectorOverlayViewFactory"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("export function renderSurfaceInspectorEditorView"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("function renderSurfaceInspectorVersionsView"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("export function renderSurfaceInspectorPanelView"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("export function renderSurfaceInspectorMenuView"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("export function renderSurfaceInspectorPanelViewFactory"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("Live Page Inspector"), true);
  assert.equal(surfaceInspectorPanelViewSource.includes("Propose Save-Back"), true);
  assert.equal(surfaceCommandViewSource.includes("No matching pages, widgets, capabilities, or commands."), true);
  assert.equal(surfaceCommandViewSource.includes("Save Identity Here"), true);
  assert.equal(surfaceInspectorVersionActionsSource.includes("export function bindSurfaceInspectorVersionActions"), true);
  assert.equal(surfaceInspectorVersionActionsSource.includes("export async function runSurfaceInspectorActivateAction"), true);
  assert.equal(surfaceInspectorVersionActionsSource.includes("export async function runSurfaceInspectorRollbackAction"), true);
  assert.equal(surfaceInspectorVersionActionsSource.includes("export function renderSurfaceInspectorVersionActionsFactory"), true);
  assert.equal(worldCommandActionsSource.includes("export function bindWorldCommandActions"), true);
  assert.equal(worldCommandActionsSource.includes("export function syncWorldCommandFocus"), true);
  assert.equal(worldCommandActionsSource.includes("export function bindWorldCommandShortcuts"), true);
  assert.equal(worldCommandActionsSource.includes("export function renderWorldCommandActionsFactory"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldSourceDocumentView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldThingListView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldWitnessBrowserView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldProcessExplorerView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldPrimitiveBrowserView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldSystemOverviewView"), true);
  assert.equal(worldBrowserViewSource.includes("export function renderWorldBrowserViewFactory"), true);
  assert.equal(worldBrowserViewSource.includes("No witnessed source files."), true);
  assert.equal(worldBrowserViewSource.includes("surface-empty-state"), true);
  assert.equal(worldBrowserViewSource.includes("Select a source file. Definitions linked to the selected object will be highlighted."), true);
  assert.equal(worldBrowserViewSource.includes("No recent witnessed history for this object."), true);
  assert.equal(worldBrowserViewSource.includes("Primitive browser"), true);
  assert.equal(worldGraphActionsSource.includes("export function bindWorldGraphActions"), true);
  assert.equal(worldGraphActionsSource.includes("export function renderWorldGraphActionsFactory"), true);
  assert.equal(worldGraphViewSource.includes("export function renderWorldInspectorView"), true);
  assert.equal(worldGraphViewSource.includes("export function renderWorldGraphCanvasView"), true);
  assert.equal(worldGraphViewSource.includes("export function renderWorldGraphViewFactory"), true);
  assert.equal(worldGraphViewSource.includes("<h2>Selected Object</h2>"), true);
  assert.equal(worldGraphViewSource.includes("<strong>Activation history</strong>"), true);
  assert.equal(worldGraphViewSource.includes("world-graph-svg"), true);
  assert.equal(worldGraphViewSource.includes("world-context-box"), true);
  assert.equal(worldPostRenderSource.includes("export function queuePendingWorldSourceLoad"), true);
  assert.equal(worldPostRenderSource.includes("export function syncWorldGraphViewport"), true);
  assert.equal(worldPostRenderSource.includes("export function syncWorldTutorialRenderState"), true);
  assert.equal(worldPostRenderSource.includes("export function runWorldPostRender"), true);
  assert.equal(worldPostRenderSource.includes("export function renderWorldPostRenderFactory"), true);
  assert.equal(worldShellViewSource.includes("export function renderWorldGraphShell"), true);
  assert.equal(worldShellViewSource.includes("export function renderWorldShellViewFactory"), true);
  assert.equal(worldSurfaceViewSource.includes("export function renderWorldModeMenuView"), true);
  assert.equal(worldSurfaceViewSource.includes("export function renderWorldCommandPaletteView"), true);
  assert.equal(worldSurfaceViewSource.includes("export function renderWorldTutorialConceptListView"), true);
  assert.equal(worldSurfaceViewSource.includes("export function renderWorldTutorialPanelView"), true);
  assert.equal(worldSurfaceViewSource.includes("export function renderWorldSurfaceViewFactory"), true);
  assert.equal(worldSurfaceViewSource.includes("No matching surfaces, objects, or commands."), true);
  assert.equal(worldSurfaceViewSource.includes("Show Sourcery Scope Inventory"), true);
  assert.equal(worldSurfaceViewSource.includes("Search / Command"), true);
  assert.equal(worldTutorialActionsSource.includes("export function bindWorldTutorialActions"), true);
  assert.equal(worldTutorialActionsSource.includes("export function renderWorldTutorialActionsFactory"), true);
  assert.equal(worldTutorialCompanionSource.includes("export function renderWorldTutorialCompanionFactory"), true);
  assert.equal(worldTutorialCompanionSource.includes("export function syncWorldTutorialCompanionShell"), true);
  assert.equal(widgetPageHeadSource.includes("export function renderWidgetPageHead"), true);
  assert.equal(widgetPageHeadSource.includes("renderPagePresentationHead"), true);
  assert.equal(widgetPageHeadSource.includes("renderEdenPageThemeCssVars"), false);
  assert.equal(widgetPageHeadSource.includes("SHARED_SURFACE_KIT_CSS"), false);
  assert.equal(widgetPageHeadSource.includes("INSPECT_WIDGET_PAGE_CSS"), true);
  assert.equal(widgetPageStylesSource.includes("export const INSPECT_WIDGET_PAGE_CSS"), true);
  assert.equal(widgetPageStylesSource.includes(".world-graph-shell"), true);
  assert.equal(widgetPageStylesSource.includes(".world-mode-menu"), true);
  assert.equal(widgetPageStylesSource.includes(".session-panel, .private-notes"), false);
  assert.equal(widgetPageStylesSource.includes(".value-editor-field {"), false);
  assert.equal(widgetPageStylesSource.includes(".widget-editor input"), false);
  assert.equal(widgetPageStylesSource.includes(".world-tutorial-actions"), false);
  assert.equal(widgetPageStylesSource.includes(".world-inspector-item {"), false);
  assert.equal(widgetPageStylesSource.includes(".world-primitive-item {"), false);
  assert.equal(widgetPageStylesSource.includes(".world-version-status"), false);
  assert.equal(widgetPageStylesSource.includes(".world-version-actions"), false);
  assert.equal(widgetPageStylesSource.includes(".world-command-palette"), false);
  assert.equal(widgetPageStylesSource.includes(".surface-command-palette"), false);
  assert.equal(widgetPageStylesSource.includes(".surface-inspector-panel"), false);
  assert.equal(widgetPageStylesSource.includes(".tutorial-overlay"), false);
  assert.equal(widgetPageStylesSource.includes('[data-tutorial-current]'), false);
  assert.equal(surfaceKitSource.includes("export { SHARED_SURFACE_KIT_CSS }"), true);
  assert.equal(surfaceKitSource.includes('../../src/runtime-surface-kit.js'), true);
  assert.equal(runtimeSurfaceKitSource.includes('from "./runtime-surface-command-primitives.js"'), true);
  assert.equal(runtimeSurfaceKitSource.includes('from "./runtime-surface-content-primitives.js"'), true);
  assert.equal(runtimeSurfaceKitSource.includes('from "./runtime-surface-form-controls.js"'), true);
  assert.equal(runtimeSurfaceKitSource.includes('from "./runtime-surface-inspector-primitives.js"'), true);
  assert.equal(runtimeSurfaceKitSource.includes('from "./runtime-surface-tutorial-primitives.js"'), true);
  assert.equal(runtimeSurfaceKitSource.includes("SHARED_SURFACE_COMMAND_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceKitSource.includes("SHARED_SURFACE_FORM_CONTROLS_CSS"), true);
  assert.equal(runtimeSurfaceKitSource.includes("SHARED_SURFACE_CONTENT_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceKitSource.includes("SHARED_SURFACE_INSPECTOR_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceKitSource.includes("SHARED_SURFACE_TUTORIAL_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceCommandSource.includes("export const SHARED_SURFACE_COMMAND_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceCommandSource.includes(".world-command-palette"), true);
  assert.equal(runtimeSurfaceCommandSource.includes(".surface-command-palette"), true);
  assert.equal(runtimeSurfaceCommandSource.includes(".world-command-result"), true);
  assert.equal(runtimeSurfaceContentSource.includes("export const SHARED_SURFACE_CONTENT_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-card-grid"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-shell-2"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-pane"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-split-pane"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-empty-state"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-toolbar"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-toolbar-spacer"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-status"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-status-box"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-item-list"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-item-button"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".surface-actions-compact"), true);
  assert.equal(runtimeSurfaceContentSource.includes(".status"), true);
  assert.equal(runtimeSurfaceFormSource.includes("export const SHARED_SURFACE_FORM_CONTROLS_CSS"), true);
  assert.equal(runtimeSurfaceFormSource.includes("button:hover"), true);
  assert.equal(runtimeSurfaceFormSource.includes("select {"), true);
  assert.equal(runtimeSurfaceFormSource.includes(".surface-form"), true);
  assert.equal(runtimeSurfaceFormSource.includes(".surface-field"), true);
  assert.equal(runtimeSurfaceFormSource.includes(".value-editor-field"), true);
  assert.equal(runtimeSurfaceInspectorSource.includes("export const SHARED_SURFACE_INSPECTOR_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceInspectorSource.includes(".surface-inspector-panel"), true);
  assert.equal(runtimeSurfaceInspectorSource.includes(".surface-inspector-menu"), true);
  assert.equal(runtimeSurfaceInspectorSource.includes(".surface-inspector-form"), false);
  assert.equal(runtimeSurfaceInspectorSource.includes(".surface-inspector-status"), false);
  assert.equal(runtimeSurfaceInspectorSource.includes('[data-surface-inspector-selected="true"]'), true);
  assert.equal(runtimeSurfaceTutorialSource.includes("export const SHARED_SURFACE_TUTORIAL_PRIMITIVES_CSS"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes(".tutorial-overlay"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes(".tutorial-suggestion-list"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes(".tutorial-disabled-item"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes(".tutorial-hidden"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes(".tutorial-resume"), true);
  assert.equal(runtimeSurfaceTutorialSource.includes('[data-tutorial-current]'), true);
  assert.equal(runtimeSurfaceTutorialSource.includes("@keyframes tutorial-focus-pulse"), true);
  assert.equal(themeSource.includes("renderEdenPageThemeCssVars"), true);
  assert.equal(themeSource.includes('../../src/runtime-presentation.js'), true);
  assert.equal(runtimeSource.includes('from "./widget-page.js"'), false);
  assert.equal(srcWidgets.includes("function renderDocument"), false);
  assert.equal(srcWidgets.includes("renderGuidanceClient"), false);
  assert.equal(srcWidgets.includes("tutorialDefinition"), false);
  assert.equal(srcWidgets.includes("resolveEdenPageTheme"), false);
  assert.equal(srcWidgets.includes("resolvePagePresentationTheme"), false);
  assert.equal(srcWidgets.includes("../plugins/inspect/widget-page.js"), false);
});

test("inspect plugin owns widget-version request and rollback workflows", async () => {
  const pluginWidgetVersions = await readFile(new URL("./widget-versions.js", import.meta.url), "utf8");
  const runtimeSource = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  const proposalsSource = await readFile(new URL("../proposals/proposal-executor.js", import.meta.url), "utf8");
  const srcWidgets = await readFile(new URL("../../src/widgets.js", import.meta.url), "utf8");
  const world = createWorld();

  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1", kind: "Banner", props: { text: "One" } });
  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v2", kind: "Banner", props: { text: "Two" } });
  defineWidgetVersionTransition(world, { actor: "adam", soul: "banner", from: "banner_v1", to: "banner_v2", strategy: "migrate" });
  activateWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1" });

  const activated = requestWidgetVersionActivation(world, { actor: "adam", soul: "banner", version: "banner_v2" });
  const rolledBack = rollbackWidgetVersion(world, { actor: "adam", soul: "banner" });

  assert.equal(typeof requestWidgetVersionActivation, "function");
  assert.equal(typeof rollbackWidgetVersion, "function");
  assert.equal(activated.status, "migrated");
  assert.equal(rolledBack.status, "rolledBack");
  assert.equal(pluginWidgetVersions.includes("export function requestWidgetVersionActivation"), true);
  assert.equal(pluginWidgetVersions.includes("export function rollbackWidgetVersion"), true);
  assert.equal(runtimeSource.includes('from "./widget-versions.js"'), true);
  assert.equal(proposalsSource.includes('from "../inspect/widget-versions.js"'), true);
  assert.equal(srcWidgets.includes("export function requestWidgetVersionActivation"), false);
  assert.equal(srcWidgets.includes("export function rollbackWidgetVersion"), false);
  assert.equal(srcWidgets.includes("../plugins/inspect/widget-versions.js"), false);
});

test("inspect handlers route unauthorized widget-version actions through shared routes with caller-supplied proposal reasons", async () => {
  const world = createWorld();
  const sent = [];

  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1", kind: "Banner", props: { text: "One" } });
  defineWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v2", kind: "Banner", props: { text: "Two" } });
  activateWidgetVersion(world, { actor: "adam", soul: "banner", version: "banner_v1" });

  const handlers = createHandlers({
    world,
    backendHost: "backendHost",
    frontendHost: "frontendHost",
    logger: null,
    send() {},
    sendJson(_res, status, body) {
      sent.push({ status, body });
    },
    readJson: async req => req.body ?? {},
    sendGateFailure() {},
    authorityServices: {
      ensureTargetAuthority() {
        return { ok: false, status: 403, reason: "forbidden" };
      }
    },
    requestActors: () => [],
    requestVisibleWitnesses: () => [],
    processSelection: () => ({}),
    processViewInputs: () => ({ witnesses: [], observations: [] }),
    frontendTraceProcesses: new Set()
  });

  await handlers["widgetVersions.activate"]({
    req: { body: { version: "banner_v2", reason: "Promote the shared banner draft" } },
    res: {},
    params: { soul: "banner" },
    requestActor: "callan"
  });
  await handlers["widgetVersions.rollback"]({
    req: { body: { reason: "Restore the previous shared banner" } },
    res: {},
    params: { soul: "banner" },
    requestActor: "callan"
  });

  assert.deepEqual(sent.map(entry => entry.status), [202, 202]);
  assert.deepEqual(
    sent.map(entry => ({
      status: entry.body.status,
      targetProcess: entry.body.proposal?.targetProcess,
      targetId: entry.body.proposal?.targetId,
      reason: entry.body.proposal?.reason,
      proposalBody: entry.body.proposal?.body
    })),
    [
      {
        status: "proposed",
        targetProcess: "widgetVersion.activate",
        targetId: "banner",
        reason: "Promote the shared banner draft",
        proposalBody: { soul: "banner", version: "banner_v2" }
      },
      {
        status: "proposed",
        targetProcess: "widgetVersion.rollback",
        targetId: "banner",
        reason: "Restore the previous shared banner",
        proposalBody: { soul: "banner" }
      }
    ]
  );
});

test("inspect runtime exports module projectors for shared read models", () => {
  const projectorProvider = providers.find(provider => provider.id === "inspect.projections");
  const processProvider = providers.find(provider => provider.id === "inspect.processes");
  assert.equal(projectorProvider?.kind, "moduleProjectors");
  assert.equal(processProvider?.kind, "backendProcessRequestHandlers");
  assert.deepEqual(
    Object.keys(projectorProvider?.projectors ?? {}).sort(),
    [
      "inspect.processRunReadModel",
      "inspect.processViewReadModel",
      "inspect.witnessesReadModel",
      "inspect.worldGraphReadModel",
      "inspect.worldSystemReadModel"
    ]
  );
  assert.equal(projectorProvider.projectors["inspect.witnessesReadModel"], inspectWitnessesReadModel);
  assert.equal(projectorProvider.projectors["inspect.worldGraphReadModel"], inspectWorldGraphReadModel);
  assert.equal(projectorProvider.projectors["inspect.worldSystemReadModel"], inspectWorldSystemReadModelForRuntime);
  assert.equal(projectorProvider.projectors["inspect.processViewReadModel"], inspectProcessViewReadModel);
  assert.equal(projectorProvider.projectors["inspect.processRunReadModel"], inspectProcessRunReadModel);
  assert.equal(typeof processProvider.handlers["inspect.processEventRecord"], "function");
});

test("inspect witness, world-graph, and world-system read models honor visible witness projection", () => {
  const world = createWorld();
  const visibleWitness = world.emit({
    process: "todo.created",
    actor: "alice",
    claims: [],
    body: { id: "visible", title: "Visible todo" }
  });
  world.emit({
    process: "todo.created",
    actor: "bob",
    claims: [],
    body: { id: "hidden", title: "Hidden todo" }
  });
  const appContext = {
    visibleWitnesses(requestActor) {
      return world.allWitnesses().filter(witness => witness.actor === requestActor);
    }
  };

  const witnessesModel = inspectWitnessesReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext,
    query: { offset: "0" }
  });
  assert.equal(witnessesModel.total, 1);
  assert.equal(witnessesModel.witnesses[0].id, visibleWitness.id);
  assert.equal(witnessesModel.witnesses[0].bodyJson, JSON.stringify(visibleWitness.body));

  const graphModel = inspectWorldGraphReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext
  });
  assert.equal(Array.isArray(graphModel.graph.nodes), true);
  assert.equal(graphModel.graph.nodes.some(node => node.id === "genesis"), true);
  assert.equal(typeof graphModel.astNodes.byFile, "object");
  assert.equal(Array.isArray(graphModel.astNodes.byTarget[visibleWitness.body.id] ?? []), true);

  const systemModel = inspectWorldSystemReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext,
    observations: [{ id: "o1", process: "backend.request.finish", actor: "backendHost", body: { statusCode: 200 } }]
  });
  assert.equal(systemModel.summary.witnesses, 1);
  assert.equal(systemModel.summary.observations, 1);
  assert.equal(Array.isArray(systemModel.boundaries), true);
  assert.equal(systemModel.recentEvidence.some(row => row.id === visibleWitness.id), true);
});

test("inspect process read models use observations, filter hidden witness ids, and preserve missing-run status", () => {
  const world = createWorld();
  defineBackendProgram(world, { actor: "backendHost", soul: "backend.echo", owner: "backendHost" });
  defineBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1",
    owner: "backendHost"
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "project.read",
    order: 0,
    params: { projector: "demo.todosReadModel", into: "todos" }
  });
  defineBackendStep(world, {
    actor: "backendHost",
    version: "backend.echo.v1",
    event: "request",
    op: "response.json",
    order: 1,
    params: { body: { ok: true } }
  });
  activateBackendProgramVersion(world, {
    actor: "backendHost",
    soul: "backend.echo",
    version: "backend.echo.v1"
  });

  const program = world.project(witnesses => processViewProjection({ witnesses, observations: [] }, {
    program: "backend.echo.v1",
    event: "request"
  }).graph);
  const projectStep = program.nodes.find(node => node.op === "project.read");
  assert.ok(projectStep);

  const visibleWitness = world.emit({
    process: "todo.created",
    actor: "alice",
    claims: [],
    body: { id: "visible", title: "Visible todo" }
  });
  const hiddenWitness = world.emit({
    process: "todo.created",
    actor: "bob",
    claims: [],
    body: { id: "hidden", title: "Hidden todo" }
  });
  const runId = "backend-project-run";
  world.observe({
    process: "backend.process.start",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", timestamp: 1 }
  });
  world.observe({
    process: "backend.step.start",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: projectStep.id, op: projectStep.op, timestamp: 2 }
  });
  world.observe({
    process: "backend.request.finish",
    actor: "backendHost",
    claims: [],
    body: {
      requestId: `${runId}:${projectStep.id}:demo.todosReadModel`,
      stepId: projectStep.id,
      method: "PROJECT",
      url: "project:demo.todosReadModel",
      statusCode: 200,
      route: null,
      handler: null,
      projector: "demo.todosReadModel",
      runId,
      emittedWitnessIds: [visibleWitness.id, hiddenWitness.id],
      failureWitnessIds: [hiddenWitness.id]
    }
  });
  world.observe({
    process: "backend.step.done",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", nodeId: projectStep.id, op: projectStep.op, timestamp: 3 }
  });
  world.observe({
    process: "backend.process.done",
    actor: "backendHost",
    claims: [],
    body: { runId, program: "backend.echo.v1", event: "request", timestamp: 4 }
  });

  const appContext = {
    visibleWitnesses(requestActor) {
      return world.allWitnesses().filter(witness => witness.actor === requestActor || witness.process.startsWith("define"));
    }
  };
  const processView = inspectProcessViewReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext,
    query: { program: "backend.echo.v1", event: "request", runId },
    observations: world.allObservations()
  });
  assert.equal(processView.selection.runId, runId);
  assert.equal(processView.run.requests.length, 1);
  assert.equal(processView.run.requests[0].projector, "demo.todosReadModel");
  assert.deepEqual(
    processView.run.requests[0].emittedWitnesses.map(witness => witness.id),
    [visibleWitness.id]
  );
  assert.deepEqual(processView.run.requests[0].failureWitnesses, []);

  const processRun = inspectProcessRunReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext,
    runId,
    observations: world.allObservations()
  });
  assert.equal(processRun.ok, true);
  assert.equal(processRun.status, 200);
  assert.equal(processRun.body.run.runId, runId);
  assert.equal(processRun.body.run.requests[0].projector, "demo.todosReadModel");

  const missingRun = inspectProcessRunReadModel(world.allWitnesses(), {
    requestActor: "alice",
    appContext,
    runId: "missing-run",
    observations: world.allObservations()
  });
  assert.deepEqual(missingRun, {
    ok: false,
    status: 404,
    error: "process run not found",
    body: {
      error: "process run not found",
      runId: "missing-run"
    }
  });
});

test("inspect process-event recorder validates trace processes and returns backend-process payloads", async () => {
  const world = createWorld();

  const recorded = await recordInspectProcessEventRequest({
    world,
    frontendHost: "frontendHost",
    requestActor: "alice",
    body: {
      process: "frontend.process.start",
      runId: "trace-run",
      program: "todo_frontend_program",
      event: "load",
      timestamp: 123
    }
  });
  assert.equal(recorded.ok, true);
  assert.equal(recorded.status, 200);
  assert.equal(recorded.payload.ok, true);
  assert.equal(typeof recorded.payload.id, "string");
  assert.equal(world.allWitnesses().at(-1)?.process, "frontend.process.start");
  assert.equal(world.allWitnesses().at(-1)?.actor, "alice");

  const rejected = await recordInspectProcessEventRequest({
    world,
    frontendHost: "frontendHost",
    body: {
      process: "backend.process.start",
      runId: "trace-run"
    }
  });
  assert.deepEqual(rejected, {
    ok: false,
    status: 400,
    error: "unknown process trace",
    payload: {
      error: "unknown process trace",
      process: "backend.process.start"
    }
  });
});
