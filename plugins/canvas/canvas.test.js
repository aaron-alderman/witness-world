import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { renderCanvasAssetRuntimePrelude } from "./canvas-asset-runtime.js";
import { renderCanvasClientRuntimePrelude } from "./canvas-client-runtime.js";
import { renderCanvasGestureRuntimePrelude } from "./canvas-gesture-runtime.js";
import { renderCanvasHistoryRuntimePrelude } from "./canvas-history-runtime.js";
import { renderCanvasInspectorRuntimePrelude } from "./canvas-inspector-runtime.js";
import { renderCanvasInteractionRuntimePrelude } from "./canvas-interaction-runtime.js";
import { renderCanvasIoRuntimePrelude } from "./canvas-io-runtime.js";
import { renderCanvasPageDocument } from "./canvas-page-document.js";
import { renderCanvasPageScript } from "./canvas-page-script.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { CANVAS_PAGE_CSS } from "./canvas-page-styles.js";
import { renderCanvasRenderRuntimePrelude } from "./canvas-render-runtime.js";
import { renderCanvasSessionRuntimePrelude } from "./canvas-session-runtime.js";
import { renderCanvasSyncRuntimePrelude } from "./canvas-sync-runtime.js";
import { renderCanvasToolbarRuntimePrelude } from "./canvas-toolbar-runtime.js";
import { compensationClaims, undoState } from "./canvas-undo.js";
import { renderCanvasCorePrelude } from "./canvas-core.js";
import { providers } from "./runtime.js";

test("canvas plugin exposes canvas bundle handlers", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-canvas"'), true);
  assert.equal(source.includes('"canvas.read"'), true);
  assert.equal(source.includes("export function createHandlers"), true);
});

test("canvas plugin owns process, projection, page, undo, and core helpers", () => {
  assert.equal(typeof canvasProcessHandlers["canvas.createThing"], "function");
  assert.equal(typeof canvasProcessHandlers["canvas.move"], "function");
  assert.equal(typeof canvasProjection, "function");
  assert.equal(typeof perspectivesProjection, "function");
  assert.equal(typeof renderCanvasAssetRuntimePrelude, "function");
  assert.equal(typeof renderCanvasClientRuntimePrelude, "function");
  assert.equal(typeof renderCanvasGestureRuntimePrelude, "function");
  assert.equal(typeof renderCanvasHistoryRuntimePrelude, "function");
  assert.equal(typeof renderCanvasInspectorRuntimePrelude, "function");
  assert.equal(typeof renderCanvasInteractionRuntimePrelude, "function");
  assert.equal(typeof renderCanvasIoRuntimePrelude, "function");
  assert.equal(typeof renderCanvasPageDocument, "function");
  assert.equal(typeof renderCanvasPageScript, "function");
  assert.equal(typeof renderCanvasPage, "function");
  assert.equal(typeof CANVAS_PAGE_CSS, "string");
  assert.equal(typeof renderCanvasRenderRuntimePrelude, "function");
  assert.equal(typeof renderCanvasSessionRuntimePrelude, "function");
  assert.equal(typeof renderCanvasSyncRuntimePrelude, "function");
  assert.equal(typeof renderCanvasToolbarRuntimePrelude, "function");
  assert.equal(typeof compensationClaims, "function");
  assert.equal(typeof undoState, "function");
  assert.equal(renderCanvasCorePrelude().includes("const __canvasCore = (() => {"), true);
});

test("canvas page delegates page-local CSS, document shell, and browser script assembly to extracted helpers", async () => {
  const pageSource = await readFile(new URL("./canvas-page.js", import.meta.url), "utf8");
  const documentSource = await readFile(new URL("./canvas-page-document.js", import.meta.url), "utf8");
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("./canvas-page-styles.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./canvas-page-document.js"'), true);
  assert.equal(pageSource.includes('from "./canvas-page-script.js"'), true);
  assert.equal(pageSource.includes('from "./canvas-page-styles.js"'), true);
  assert.equal(pageSource.includes("return renderCanvasPageDocument({"), true);
  assert.equal(pageSource.includes("css: CANVAS_PAGE_CSS,"), true);
  assert.equal(pageSource.includes("clientJs: renderCanvasPageScript()"), true);
  assert.equal(pageSource.includes("const CANVAS_CLIENT_JS = `"), false);
  assert.equal(pageSource.includes("const CANVAS_CSS = `"), false);
  assert.equal(pageSource.includes("<header class=\"canvas-toolbar\">"), false);
  assert.equal(documentSource.includes("export function renderCanvasPageDocument"), true);
  assert.equal(documentSource.includes("<header class=\"canvas-toolbar\">"), true);
  assert.equal(documentSource.includes("<aside class=\"canvas-inspector\">"), true);
  assert.equal(stylesSource.includes("export const CANVAS_PAGE_CSS"), true);
  assert.equal(stylesSource.includes("header.canvas-toolbar"), true);
  assert.equal(stylesSource.includes(".canvas-stage"), true);
  assert.equal(CANVAS_PAGE_CSS.includes("header.canvas-toolbar"), true);
  assert.equal(CANVAS_PAGE_CSS.includes(".canvas-stage"), true);
  assert.equal(pageScriptSource.includes('from "./canvas-client-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasClientRuntimePrelude()"), true);
  assert.equal(pageScriptSource.includes("await startCanvasClientRuntime({"), true);
});

test("canvas client runtime delegates toolbar and timeline bindings to the extracted runtime helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-toolbar-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-toolbar-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasToolbarRuntimePrelude()"), true);
  assert.equal(pageSource.includes("bindCanvasToolbarRuntime({"), true);
  assert.equal(pageSource.includes("function initToolbar()"), false);
  assert.equal(pageSource.includes("el('session-open-btn').addEventListener('click', async () => {"), false);
  assert.equal(pageSource.includes("el('timeline-play-btn').addEventListener('click', () => {"), false);
  assert.equal(helperSource.includes("function runCanvasSessionTransition"), true);
  assert.equal(helperSource.includes("function bindCanvasToolbarRuntime"), true);
  assert.equal(helperSource.includes("el(\"session-open-btn\").addEventListener(\"click\", async () => {"), true);
  assert.equal(helperSource.includes("el(\"timeline-play-btn\").addEventListener(\"click\", () => {"), true);
});

test("canvas page script delegates asset request, repair, and summary helpers to the extracted runtime helper", async () => {
  const pageSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-asset-runtime.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./canvas-asset-runtime.js"'), true);
  assert.equal(pageSource.includes("renderCanvasAssetRuntimePrelude()"), true);
  assert.equal(pageSource.includes("async function attachAsset("), false);
  assert.equal(pageSource.includes("async function detachAsset("), false);
  assert.equal(pageSource.includes("async function retryAssetIngest("), false);
  assert.equal(pageSource.includes("async function refreshAssetSearch("), false);
  assert.equal(pageSource.includes("function formatBytes("), false);
  assert.equal(pageSource.includes("function assetDownloadUrl("), false);
  assert.equal(pageSource.includes("function assetCanRetryIngest("), false);
  assert.equal(pageSource.includes("function assetCanRefreshSearch("), false);
  assert.equal(pageSource.includes("function assetProcessingSummary("), false);
  assert.equal(pageSource.includes("function assetSearchSummary("), false);
  assert.equal(pageSource.includes("function assetPreviewMode("), false);
  assert.equal(pageSource.includes("function assetPreviewSource("), false);
  assert.equal(pageSource.includes("function ensureAssetPreview("), false);
  assert.equal(pageSource.includes("function ensureAssetPreview_legacy("), false);
  assert.equal(helperSource.includes("function attachAsset"), true);
  assert.equal(helperSource.includes("function detachAsset"), true);
  assert.equal(helperSource.includes("function retryAssetIngest"), true);
  assert.equal(helperSource.includes("function refreshAssetSearch"), true);
  assert.equal(helperSource.includes("function formatBytes"), true);
  assert.equal(helperSource.includes("function assetProcessingSummary"), true);
  assert.equal(helperSource.includes("function assetSearchSummary"), true);
  assert.equal(helperSource.includes("function assetPreviewMode"), true);
  assert.equal(helperSource.includes("function assetPreviewSource"), true);
  assert.equal(helperSource.includes("function ensureAssetPreview"), true);
});

test("canvas page script delegates session and io browser flows to extracted runtime helpers", async () => {
  const pageSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const ioSource = await readFile(new URL("./canvas-io-runtime.js", import.meta.url), "utf8");
  const sessionSource = await readFile(new URL("./canvas-session-runtime.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./canvas-io-runtime.js"'), true);
  assert.equal(pageSource.includes('from "./canvas-session-runtime.js"'), true);
  assert.equal(pageSource.includes("renderCanvasIoRuntimePrelude()"), true);
  assert.equal(pageSource.includes("renderCanvasSessionRuntimePrelude()"), true);
  assert.equal(pageSource.includes("async function initSession()"), false);
  assert.equal(pageSource.includes("async function openSession()"), false);
  assert.equal(pageSource.includes("async function logoutSession()"), false);
  assert.equal(pageSource.includes("async function post(process, params)"), false);
  assert.equal(pageSource.includes("async function uploadAssetFile(file)"), false);
  assert.equal(pageSource.includes("async function loadPerspectives()"), false);
  assert.equal(pageSource.includes("async function loadCanvas()"), false);
  assert.equal(ioSource.includes("async function post(process, params)"), true);
  assert.equal(ioSource.includes("async function uploadAssetFile(file)"), true);
  assert.equal(ioSource.includes("async function loadPerspectives()"), true);
  assert.equal(ioSource.includes("async function loadCanvas()"), true);
  assert.equal(sessionSource.includes("function renderSessionStatus()"), true);
  assert.equal(sessionSource.includes("function syncSession(session)"), true);
  assert.equal(sessionSource.includes("async function initSession()"), true);
  assert.equal(sessionSource.includes("async function openSession()"), true);
  assert.equal(sessionSource.includes("async function logoutSession()"), true);
});

test("canvas client runtime delegates history and timeline browser flows to the extracted runtime helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-history-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-history-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasHistoryRuntimePrelude()"), true);
  assert.equal(pageSource.includes("async function fetchWitnesses()"), false);
  assert.equal(pageSource.includes("await import('/canvas-lib/canvas-projection.js')"), false);
  assert.equal(pageSource.includes("new EventSource('/api/events')"), false);
  assert.equal(pageSource.includes("function historyProjection(n)"), false);
  assert.equal(pageSource.includes("function setHistoryBanner()"), false);
  assert.equal(pageSource.includes("function stopPlayback()"), false);
  assert.equal(pageSource.includes("function scrubTo(n)"), false);
  assert.equal(pageSource.includes("async function exitHistory()"), false);
  assert.equal(pageSource.includes("function renderTimeline()"), false);
  assert.equal(pageSource.includes("async function toggleTimeline()"), false);
  assert.equal(pageSource.includes("await loadCanvasProjectionModule();"), true);
  assert.equal(pageSource.includes("startCanvasWitnessStream();"), true);
  assert.equal(helperSource.includes("async function fetchWitnesses()"), true);
  assert.equal(helperSource.includes("async function loadCanvasProjectionModule()"), true);
  assert.equal(helperSource.includes("function historyProjection(n)"), true);
  assert.equal(helperSource.includes("function setHistoryBanner()"), true);
  assert.equal(helperSource.includes("function stopPlayback()"), true);
  assert.equal(helperSource.includes("function scrubTo(n)"), true);
  assert.equal(helperSource.includes("async function exitHistory()"), true);
  assert.equal(helperSource.includes("function renderTimeline()"), true);
  assert.equal(helperSource.includes("async function toggleTimeline()"), true);
  assert.equal(helperSource.includes("function startCanvasWitnessStream()"), true);
});

test("canvas client runtime delegates outbox batching and keepalive sync flows to the extracted runtime helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-sync-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-sync-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasSyncRuntimePrelude()"), true);
  assert.equal(pageSource.includes("function clearOutbox()"), false);
  assert.equal(pageSource.includes("function updatePendingStatus()"), false);
  assert.equal(pageSource.includes("function scheduleFlush()"), false);
  assert.equal(pageSource.includes("function queueMove(id, geometry)"), false);
  assert.equal(pageSource.includes("function queueStyle(id, style)"), false);
  assert.equal(pageSource.includes("function queueCamera()"), false);
  assert.equal(pageSource.includes("function queueGrid()"), false);
  assert.equal(pageSource.includes("function buildBatchParams()"), false);
  assert.equal(pageSource.includes("async function flushOutbox(force)"), false);
  assert.equal(pageSource.includes("function flushKeepalive()"), false);
  assert.equal(pageSource.includes("window.addEventListener('pagehide', flushKeepalive);"), false);
  assert.equal(pageSource.includes("document.addEventListener('visibilitychange'"), false);
  assert.equal(pageSource.includes("bindCanvasKeepaliveRuntime();"), true);
  assert.equal(helperSource.includes("function clearOutbox()"), true);
  assert.equal(helperSource.includes("function updatePendingStatus()"), true);
  assert.equal(helperSource.includes("function scheduleFlush()"), true);
  assert.equal(helperSource.includes("function queueMove(id, geometry)"), true);
  assert.equal(helperSource.includes("function queueStyle(id, style)"), true);
  assert.equal(helperSource.includes("function queueCamera()"), true);
  assert.equal(helperSource.includes("function queueGrid()"), true);
  assert.equal(helperSource.includes("function buildBatchParams()"), true);
  assert.equal(helperSource.includes("async function flushOutbox(force)"), true);
  assert.equal(helperSource.includes("function flushKeepalive()"), true);
  assert.equal(helperSource.includes("function bindCanvasKeepaliveRuntime()"), true);
});

test("canvas client runtime delegates draw and frame-loop mechanics to the extracted render runtime helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-render-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-render-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasRenderRuntimePrelude()"), true);
  assert.equal(pageSource.includes("function drawNode(n)"), false);
  assert.equal(pageSource.includes("function drawHandles(n)"), false);
  assert.equal(pageSource.includes("function drawGroupBounds(bounds)"), false);
  assert.equal(pageSource.includes("function drawConnector(c)"), false);
  assert.equal(pageSource.includes("function drawGrid(widthPx, heightPx)"), false);
  assert.equal(pageSource.includes("function drawMarquee()"), false);
  assert.equal(pageSource.includes("function resize()"), false);
  assert.equal(pageSource.includes("function draw()"), false);
  assert.equal(pageSource.includes("function frame()"), false);
  assert.equal(pageSource.includes("window.addEventListener('resize', resize);"), false);
  assert.equal(pageSource.includes("startCanvasRenderRuntime();"), true);
  assert.equal(helperSource.includes("function drawNode(n)"), true);
  assert.equal(helperSource.includes("function drawHandles(n)"), true);
  assert.equal(helperSource.includes("function drawGroupBounds(bounds)"), true);
  assert.equal(helperSource.includes("function drawConnector(c)"), true);
  assert.equal(helperSource.includes("function drawGrid(widthPx, heightPx)"), true);
  assert.equal(helperSource.includes("function drawMarquee()"), true);
  assert.equal(helperSource.includes("function resizeCanvasSurface()"), true);
  assert.equal(helperSource.includes("function draw()"), true);
  assert.equal(helperSource.includes("function frame()"), true);
  assert.equal(helperSource.includes("function startCanvasRenderRuntime()"), true);
});

test("canvas page script delegates inspector browser helpers and rendering to the extracted runtime helper", async () => {
  const pageSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-inspector-runtime.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./canvas-inspector-runtime.js"'), true);
  assert.equal(pageSource.includes("renderCanvasInspectorRuntimePrelude()"), true);
  assert.equal(pageSource.includes("function propRow("), false);
  assert.equal(pageSource.includes("function textInput("), false);
  assert.equal(pageSource.includes("function appendReadonlyText("), false);
  assert.equal(pageSource.includes("function appendReadonlyValue("), false);
  assert.equal(pageSource.includes("function appendLinkRow("), false);
  assert.equal(pageSource.includes("function appendPreviewRow("), false);
  assert.equal(pageSource.includes("function appendActionRow("), false);
  assert.equal(pageSource.includes("function derivedMetadataValue("), false);
  assert.equal(pageSource.includes("function appendAssetDerivedMetadata("), false);
  assert.equal(pageSource.includes("function selectInput("), false);
  assert.equal(pageSource.includes("function formatThingReference("), false);
  assert.equal(pageSource.includes("function thingCatalog("), false);
  assert.equal(pageSource.includes("function attachmentCandidatesForTarget("), false);
  assert.equal(pageSource.includes("function attachmentTargetsForAsset("), false);
  assert.equal(pageSource.includes("function renderInspector("), false);
  assert.equal(helperSource.includes("function propRow("), true);
  assert.equal(helperSource.includes("function textInput("), true);
  assert.equal(helperSource.includes("function appendReadonlyText("), true);
  assert.equal(helperSource.includes("function appendReadonlyValue("), true);
  assert.equal(helperSource.includes("function appendLinkRow("), true);
  assert.equal(helperSource.includes("function appendPreviewRow("), true);
  assert.equal(helperSource.includes("function appendActionRow("), true);
  assert.equal(helperSource.includes("function derivedMetadataValue("), true);
  assert.equal(helperSource.includes("function appendAssetDerivedMetadata("), true);
  assert.equal(helperSource.includes("function selectInput("), true);
  assert.equal(helperSource.includes("function formatThingReference("), true);
  assert.equal(helperSource.includes("function thingCatalog("), true);
  assert.equal(helperSource.includes("function attachmentCandidatesForTarget("), true);
  assert.equal(helperSource.includes("function attachmentTargetsForAsset("), true);
  assert.equal(helperSource.includes("function renderInspector("), true);
});

test("canvas client runtime delegates overlay, mode, and keyboard interaction helpers to the extracted runtime helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-interaction-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-interaction-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasInteractionRuntimePrelude()"), true);
  assert.equal(pageSource.includes("function showOverlay("), false);
  assert.equal(pageSource.includes("function hideOverlay("), false);
  assert.equal(pageSource.includes("function setMode("), false);
  assert.equal(pageSource.includes("function startPan("), false);
  assert.equal(pageSource.includes("async function duplicateSelected("), false);
  assert.equal(pageSource.includes("overlayInput.addEventListener('keydown'"), false);
  assert.equal(pageSource.includes("window.addEventListener('keydown'"), false);
  assert.equal(pageSource.includes("window.addEventListener('keyup'"), false);
  assert.equal(pageSource.includes("bindCanvasOverlayInput();"), true);
  assert.equal(pageSource.includes("bindCanvasKeyboardShortcuts();"), true);
  assert.equal(helperSource.includes("function showOverlay("), true);
  assert.equal(helperSource.includes("function hideOverlay("), true);
  assert.equal(helperSource.includes("function setMode("), true);
  assert.equal(helperSource.includes("function startPan("), true);
  assert.equal(helperSource.includes("async function duplicateSelected("), true);
  assert.equal(helperSource.includes("function bindCanvasOverlayInput()"), true);
  assert.equal(helperSource.includes("function bindCanvasKeyboardShortcuts()"), true);
});

test("canvas client runtime delegates pointer, viewport, and file-drop gesture runtime to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./canvas-page-script.js", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("./canvas-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./canvas-gesture-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./canvas-gesture-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderCanvasGestureRuntimePrelude()"), true);
  assert.equal(pageSource.includes("function pointerPosition("), false);
  assert.equal(pageSource.includes("function hitInstance("), false);
  assert.equal(pageSource.includes("function handlePositions("), false);
  assert.equal(pageSource.includes("function hitHandle("), false);
  assert.equal(pageSource.includes("function selectionBounds("), false);
  assert.equal(pageSource.includes("function groupCorners("), false);
  assert.equal(pageSource.includes("function hitGroupCorner("), false);
  assert.equal(pageSource.includes("function cursorForHandle("), false);
  assert.equal(pageSource.includes("function hitConnector("), false);
  assert.equal(pageSource.includes("canvas.addEventListener('pointerdown'"), false);
  assert.equal(pageSource.includes("canvas.addEventListener('pointermove'"), false);
  assert.equal(pageSource.includes("canvas.addEventListener('pointerup'"), false);
  assert.equal(pageSource.includes("canvas.addEventListener('wheel'"), false);
  assert.equal(pageSource.includes("canvas.addEventListener('dblclick'"), false);
  assert.equal(pageSource.includes("stage.addEventListener('dragenter'"), false);
  assert.equal(pageSource.includes("stage.addEventListener('dragover'"), false);
  assert.equal(pageSource.includes("stage.addEventListener('dragleave'"), false);
  assert.equal(pageSource.includes("stage.addEventListener('drop'"), false);
  assert.equal(pageSource.includes("bindCanvasPointerRuntime();"), true);
  assert.equal(pageSource.includes("bindCanvasViewportRuntime();"), true);
  assert.equal(pageSource.includes("bindCanvasDropRuntime();"), true);
  assert.equal(helperSource.includes("function pointerPosition("), true);
  assert.equal(helperSource.includes("function hitInstance("), true);
  assert.equal(helperSource.includes("function handlePositions("), true);
  assert.equal(helperSource.includes("function hitHandle("), true);
  assert.equal(helperSource.includes("function selectionBounds("), true);
  assert.equal(helperSource.includes("function groupCorners("), true);
  assert.equal(helperSource.includes("function hitGroupCorner("), true);
  assert.equal(helperSource.includes("function cursorForHandle("), true);
  assert.equal(helperSource.includes("function hitConnector("), true);
  assert.equal(helperSource.includes("function bindCanvasPointerRuntime()"), true);
  assert.equal(helperSource.includes("function bindCanvasViewportRuntime()"), true);
  assert.equal(helperSource.includes("function bindCanvasDropRuntime()"), true);
});

test("canvas runtime ownership is not implemented in core compatibility files", async () => {
  for (const file of [
    "../../src/canvas-core.js",
    "../../src/canvas-processes.js",
    "../../src/canvas-projection.js",
    "../../src/canvas-page.js",
    "../../src/canvas-undo.js"
  ]) {
    await assert.rejects(readFile(new URL(file, import.meta.url), "utf8"));
  }

  const routeHandlersSource = await readFile(new URL("../../src/runtime-route-handlers.js", import.meta.url), "utf8");
  const proposalExecutorSource = await readFile(new URL("../proposals/proposal-executor.js", import.meta.url), "utf8");
  const staticProvider = providers.find(provider => provider.kind === "staticAssetProvider" && provider.id === "canvas.static");

  assert.equal(staticProvider.mount, "/canvas-lib/");
  assert.equal(Object.keys(staticProvider.files).includes("canvas-core.js"), true);
  assert.equal(Object.keys(staticProvider.files).includes("canvas-projection.js"), true);
  assert.equal(String(staticProvider.files["canvas-core.js"]).replaceAll("\\", "/").includes("/plugins/canvas/canvas-core.js"), true);
  assert.equal(String(staticProvider.files["canvas-projection.js"]).replaceAll("\\", "/").includes("/plugins/canvas/canvas-projection.js"), true);
  assert.equal(routeHandlersSource.includes("../plugins/canvas/canvas-processes.js"), false);
  assert.equal(routeHandlersSource.includes("./canvas-processes.js"), false);
  assert.equal(proposalExecutorSource.includes("../canvas/canvas-processes.js"), true);
  assert.equal(proposalExecutorSource.includes("../../src/canvas-processes.js"), false);
});
