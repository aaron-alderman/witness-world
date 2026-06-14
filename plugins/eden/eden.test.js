import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { renderEdenPersonalClientPrelude } from "./eden-personal-client.js";
import { projectEdenPersonalBoxItems } from "./eden-personal-box.js";
import { renderEdenEditClientPrelude } from "./eden-edit-client.js";
import { projectEdenPageTheme } from "./eden-page-theme.js";
import { projectEdenAcademyState } from "./eden-academy.js";
import { edenNeighborhoodProjection } from "./eden-projection.js";
import { renderEdenClientRuntimePrelude } from "./eden-client-runtime.js";
import { renderEdenPageDocument } from "./eden-page-document.js";
import { renderEdenPage } from "./eden-page.js";
import { renderEdenPageScript } from "./eden-page-script.js";
import { renderEdenActionRuntimePrelude } from "./eden-action-runtime.js";
import { renderEdenCapabilityInstallClientPrelude } from "./eden-capability-install-client.js";
import { renderEdenChapterClientPrelude } from "./eden-chapter-client.js";
import { renderEdenEmbeddedBridgePrelude } from "./eden-embedded-bridge.js";
import { renderEdenEmbeddedClientPrelude } from "./eden-embedded-client.js";
import { renderEdenEmbeddedRuntimePrelude } from "./eden-embedded-runtime.js";
import { renderEdenOrganizationClientPrelude } from "./eden-organization-client.js";
import { renderEdenProcessClientPrelude } from "./eden-process-client.js";
import { renderEdenProjectionRuntimePrelude } from "./eden-projection-runtime.js";
import { renderEdenRefreshRuntimePrelude } from "./eden-refresh-runtime.js";
import { renderEdenStageRuntimePrelude } from "./eden-stage-runtime.js";
import { renderEdenSurfaceClientPrelude } from "./eden-surface-client.js";
import { renderEdenSurfaceAdaptersPrelude } from "./eden-surface-adapters.js";
import { renderEdenSurfaceRuntimePrelude } from "./eden-surface-runtime.js";
import { renderEdenTheoryClientPrelude } from "./eden-theory-client.js";
import { renderEdenViewRuntimePrelude } from "./eden-view-runtime.js";
import { EDEN_PAGE_CSS } from "./eden-page-styles.js";
import { renderEdenVersionsClientPrelude } from "./eden-versions-client.js";
import { providers } from "./runtime.js";

test("eden plugin exposes eden bundle handlers", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-eden"'), true);
  assert.equal(source.includes('"edenAcademy.read"'), true);
  assert.equal(source.includes("export function createHandlers"), true);
});

test("eden plugin owns implementation modules beyond manifest metadata", () => {
  assert.equal(typeof renderEdenActionRuntimePrelude, "function");
  assert.equal(typeof renderEdenPersonalClientPrelude, "function");
  assert.equal(typeof projectEdenPersonalBoxItems, "function");
  assert.equal(typeof renderEdenEditClientPrelude, "function");
  assert.equal(typeof projectEdenPageTheme, "function");
  assert.equal(typeof projectEdenAcademyState, "function");
  assert.equal(typeof edenNeighborhoodProjection, "function");
  assert.equal(typeof renderEdenClientRuntimePrelude, "function");
  assert.equal(typeof renderEdenPageDocument, "function");
  assert.equal(typeof renderEdenPageScript, "function");
  assert.equal(typeof renderEdenCapabilityInstallClientPrelude, "function");
  assert.equal(typeof renderEdenChapterClientPrelude, "function");
  assert.equal(typeof renderEdenEmbeddedBridgePrelude, "function");
  assert.equal(typeof renderEdenEmbeddedClientPrelude, "function");
  assert.equal(typeof renderEdenEmbeddedRuntimePrelude, "function");
  assert.equal(typeof renderEdenOrganizationClientPrelude, "function");
  assert.equal(typeof renderEdenProcessClientPrelude, "function");
  assert.equal(typeof renderEdenProjectionRuntimePrelude, "function");
  assert.equal(typeof renderEdenRefreshRuntimePrelude, "function");
  assert.equal(typeof renderEdenStageRuntimePrelude, "function");
  assert.equal(typeof renderEdenSurfaceAdaptersPrelude, "function");
  assert.equal(typeof renderEdenSurfaceClientPrelude, "function");
  assert.equal(typeof renderEdenSurfaceRuntimePrelude, "function");
  assert.equal(typeof renderEdenTheoryClientPrelude, "function");
  assert.equal(typeof renderEdenViewRuntimePrelude, "function");
  assert.equal(typeof EDEN_PAGE_CSS, "string");
  assert.equal(typeof renderEdenVersionsClientPrelude, "function");
  assert.equal(typeof renderEdenPage, "function");
});

test("eden handlers import Eden behavior from the plugin package", async () => {
  const source = await readFile(new URL("./handlers.js", import.meta.url), "utf8");
  assert.equal(source.includes("../../src/eden-"), false);
  assert.equal(source.includes('from "./eden-projection.js"'), true);
  assert.equal(source.includes('from "./eden-page.js"'), true);
  assert.equal(source.includes('from "./eden-personal-box.js"'), true);
  assert.equal(source.includes('from "./eden-versions.js"'), true);
});

test("core Eden compatibility shims are gone", async () => {
  for (const shimPath of [
    "../../src/eden-page.js",
    "../../src/eden-personal-box.js",
    "../../src/eden-page-theme.js",
    "../../src/eden-academy.js",
    "../../src/eden-organization.js",
    "../../src/eden-theory.js",
    "../../src/eden-capability-install.js",
    "../../src/eden-capability-install-request.js",
    "../../src/eden-versions.js"
  ]) {
    await assert.rejects(readFile(new URL(shimPath, import.meta.url), "utf8"));
  }
});

test("canvas no longer owns Eden projection helpers", async () => {
  const source = await readFile(new URL("../canvas/canvas-projection.js", import.meta.url), "utf8");
  assert.equal(source.includes("export function edenNeighborhoodProjection"), false);
  assert.equal(source.includes("projectEdenPersonalBoxItems"), false);
  assert.equal(source.includes("EDEN_RELIEF_SIGNAL_HANDLERS"), false);
});

test("canvas-lib serves Eden compatibility modules from plugin.eden", async () => {
  const source = await readFile(new URL("../../src/runtime-server.js", import.meta.url), "utf8");
  const staticProvider = providers.find(provider => provider.kind === "staticAssetProvider" && provider.id === "eden.static");
  assert.equal(source.includes("edenDir"), false);
  assert.equal(staticProvider.mount, "/canvas-lib/");
  assert.equal(Object.keys(staticProvider.files).includes("eden-personal-box.js"), true);
  assert.equal(Object.keys(staticProvider.files).includes("eden-page-theme.js"), true);
  assert.equal(String(staticProvider.files["eden-personal-box.js"]).replaceAll("\\", "/").includes("/plugins/eden/eden-personal-box.js"), true);
  assert.equal(String(staticProvider.files["eden-page-theme.js"]).replaceAll("\\", "/").includes("/plugins/eden/eden-page-theme.js"), true);
});

test("eden page script and client runtime delegate commons panel client logic to the extracted organization helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-organization-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-organization-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenOrganizationClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenOrganizationSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-organization-create-context]"), false);
  assert.equal(adapterSource.includes("createOrganizationSurfaceNode: activeSurface => createEdenOrganizationSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenOrganizationPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenOrganizationPanel"), true);
  assert.equal(helperSource.includes("createEdenOrganizationSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-organization-create-context]"), true);
});

test("eden page script and client runtime delegate capability shelf client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-capability-install-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-capability-install-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenCapabilityInstallClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenCapabilityInstallSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenCapabilityInstallPanel(node, surface"), false);
  assert.equal(adapterSource.includes("createCapabilitySurfaceNode: activeSurface => createEdenCapabilityInstallSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenCapabilityInstallPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenCapabilityInstallPanel"), true);
  assert.equal(helperSource.includes("createEdenCapabilityInstallSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-capability-login-form]"), true);
});

test("eden page script and client runtime delegate generic goto/default surface shells to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-surface-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-surface-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenSurfaceClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenGotoSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("createEdenDefaultSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("node.className = 'eden-surface eden-surface-goto'"), false);
  assert.equal(clientRuntimeSource.includes("node.className = 'eden-surface' + (surface.href ? ' eden-surface-link' : '')"), false);
  assert.equal(adapterSource.includes("createGotoSurfaceNode: activeSurface => createEdenGotoSurfaceNode"), true);
  assert.equal(adapterSource.includes("createDefaultSurfaceNode: activeSurface => createEdenDefaultSurfaceNode"), true);
  assert.equal(helperSource.includes("createEdenGotoSurfaceNode"), true);
  assert.equal(helperSource.includes("createEdenDefaultSurfaceNode"), true);
  assert.equal(helperSource.includes("eden-surface eden-surface-goto"), true);
});

test("eden page script and client runtime delegate chapter checkpoint and track rendering to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-chapter-client.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-chapter-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenChapterClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return renderEdenTrackCard(track);"), true);
  assert.equal(clientRuntimeSource.includes("renderEdenCheckpointView(model, state, {"), true);
  assert.equal(clientRuntimeSource.includes("return renderEdenTrackCard(track);"), true);
  assert.equal(helperSource.includes("renderEdenQuestCard"), true);
  assert.equal(helperSource.includes("renderEdenTrackCard"), true);
  assert.equal(helperSource.includes("renderEdenCheckpoint"), true);
});

test("eden page delegates the document shell, browser script, and chrome scaffold to extracted helpers", async () => {
  const pageSource = await readFile(new URL("./eden-page.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-page-document.js", import.meta.url), "utf8");
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./eden-page-document.js"'), true);
  assert.equal(pageSource.includes('from "./eden-page-script.js"'), true);
  assert.equal(pageSource.includes("renderEdenPageDocument({"), true);
  assert.equal(pageSource.includes("clientJs: renderEdenPageScript({ model })"), true);
  assert.equal(pageSource.includes('<header class="eden-toolbar">'), false);
  assert.equal(pageSource.includes('<aside class="eden-chapter" id="eden-chapter" hidden>'), false);
  assert.equal(helperSource.includes("export function renderEdenPageDocument"), true);
  assert.equal(helperSource.includes('<header class="eden-toolbar">'), true);
  assert.equal(helperSource.includes('<aside class="eden-chapter" id="eden-chapter" hidden>'), true);
  assert.equal(pageScriptSource.includes('from "./eden-client-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenClientRuntimePrelude()"), true);
  assert.equal(pageScriptSource.includes("startEdenClientRuntime({"), true);
});

test("eden page delegates page-local CSS ownership to the extracted style helper", async () => {
  const pageSource = await readFile(new URL("./eden-page.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-page-styles.js", import.meta.url), "utf8");

  assert.equal(pageSource.includes('from "./eden-page-styles.js"'), true);
  assert.equal(pageSource.includes("css: EDEN_PAGE_CSS,"), true);
  assert.equal(pageSource.includes("const EDEN_CSS = `"), false);
  assert.equal(helperSource.includes("export const EDEN_PAGE_CSS"), true);
  assert.equal(helperSource.includes(".eden-toolbar"), true);
  assert.equal(helperSource.includes(".eden-stage"), true);
  assert.equal(EDEN_PAGE_CSS.includes(".eden-toolbar"), true);
  assert.equal(EDEN_PAGE_CSS.includes(".eden-stage"), true);
});

test("eden page script and client runtime delegate request, panel-status, action-chip, and proposal helpers to the extracted runtime", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-action-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-action-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenActionRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return requestEdenJson(url, options);"), true);
  assert.equal(clientRuntimeSource.includes('setEdenPanelStatus(state, "personalStatus", text, tone);'), true);
  assert.equal(clientRuntimeSource.includes('setEdenPanelStatus(state, "versionStatus", text, tone);'), true);
  assert.equal(clientRuntimeSource.includes("return renderEdenSurfaceActions(container, surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return createEdenVersionProposalRequest(surface, { processName, version, reason, statusText }, {"), true);
  assert.equal(clientRuntimeSource.includes("return createEdenCapabilityInstallProposalRequest(surface, row, {"), true);
  assert.equal(clientRuntimeSource.includes("function edenVersionProposalId("), false);
  assert.equal(clientRuntimeSource.includes("function edenCapabilityInstallProposalId("), false);
  assert.equal(clientRuntimeSource.includes("return fetch(url, { credentials: 'same-origin', ...options })"), false);
  assert.equal(clientRuntimeSource.includes("state.personalStatus = { text: text || '', tone: tone || '' };"), false);
  assert.equal(helperSource.includes("function requestEdenJson"), true);
  assert.equal(helperSource.includes("function setEdenPanelStatus"), true);
  assert.equal(helperSource.includes("function renderEdenSurfaceActions"), true);
  assert.equal(helperSource.includes("function createEdenVersionProposalRequest"), true);
  assert.equal(helperSource.includes("function createEdenCapabilityInstallProposalRequest"), true);
});

test("eden page no longer carries stale inline panel renderer bodies after helper extraction", async () => {
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");

  assert.equal(clientRuntimeSource.includes("function fillPersonalEditor("), false);
  assert.equal(clientRuntimeSource.includes("function renderPersonalBox("), false);
  assert.equal(clientRuntimeSource.includes("function renderEditPage("), false);
  assert.equal(clientRuntimeSource.includes("function renderVersions("), false);
  assert.equal(clientRuntimeSource.includes("function renderCapabilityInstall("), false);
  assert.equal(clientRuntimeSource.includes("function renderProcessSurface("), false);
});

test("eden page script and client runtime delegate embedded board shell and mode chrome to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-embedded-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-embedded-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenEmbeddedClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenEmbeddedSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("syncEdenEmbeddedSurfaceNode(node, { inspect: mode.inspect })"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-embedded-inspect]"), false);
  assert.equal(clientRuntimeSource.includes('<iframe class="eden-embedded-frame"'), false);
  assert.equal(adapterSource.includes("createEmbeddedSurfaceNode: activeSurface => createEdenEmbeddedSurfaceNode"), true);
  assert.equal(helperSource.includes("createEdenEmbeddedSurfaceNode"), true);
  assert.equal(helperSource.includes("syncEdenEmbeddedSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-embedded-inspect]"), true);
  assert.equal(helperSource.includes("eden-embedded-frame"), true);
});

test("eden page script and client runtime delegate embedded inspect/command bridge runtime to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-embedded-bridge.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-embedded-bridge.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenEmbeddedBridgePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return ensureEdenEmbeddedMode(surfaceId, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenEmbeddedDocument(surfaceId, state.elements);"), true);
  assert.equal(clientRuntimeSource.includes("return setEdenEmbeddedSurfaceCommand(surfaceId, open, {"), true);
  assert.equal(clientRuntimeSource.includes("return syncEdenEmbeddedModeState(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return toggleEdenEmbeddedInspect(surface, next, {"), true);
  assert.equal(clientRuntimeSource.includes("if (!state.embeddedModes[key]) state.embeddedModes[key] = { inspect: false };"), false);
  assert.equal(clientRuntimeSource.includes("return state.elements.get(surfaceId)?.querySelector?.('iframe') || null;"), false);
  assert.equal(helperSource.includes("function ensureEdenEmbeddedMode"), true);
  assert.equal(helperSource.includes("function readEdenEmbeddedDocument"), true);
  assert.equal(helperSource.includes("function setEdenEmbeddedSurfaceCommand"), true);
  assert.equal(helperSource.includes("function syncEdenEmbeddedModeState"), true);
  assert.equal(helperSource.includes("function toggleEdenEmbeddedInspect"), true);
});

test("eden page script and client runtime delegate embedded relief overlay and expert shortcut runtime to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-embedded-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-embedded-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenEmbeddedRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("renderEmbeddedReliefOverlay(node, surface)"), true);
  assert.equal(clientRuntimeSource.includes('function runExpertShortcut(surfaceId = "eden.surface.todo", query = "whoami")'), true);
  assert.equal(clientRuntimeSource.includes("function openExpertShortcut("), false);
  assert.equal(clientRuntimeSource.includes("function reliefSections("), false);
  assert.equal(clientRuntimeSource.includes("function reliefKey("), false);
  assert.equal(clientRuntimeSource.includes("function reliefActiveSignals("), false);
  assert.equal(clientRuntimeSource.includes("function reliefLevelForSection("), false);
  assert.equal(clientRuntimeSource.includes("function computeReliefBoxes("), false);
  assert.equal(clientRuntimeSource.includes("function scrollReliefSectionIntoView("), false);
  assert.equal(helperSource.includes("function renderEdenEmbeddedRelief"), true);
  assert.equal(helperSource.includes("function openEdenExpertShortcut"), true);
  assert.equal(helperSource.includes("function computeEdenReliefBoxes"), true);
});

test("eden page script and client runtime delegate stage camera and prompt runtime to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-stage-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-stage-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenStageRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("renderEdenConnections(svg, { core, isVisible, model, ns, state });"), true);
  assert.equal(clientRuntimeSource.includes("renderEdenPrompt(promptEl, { model, state });"), true);
  assert.equal(clientRuntimeSource.includes("bindEdenStageRuntime({"), true);
  assert.equal(clientRuntimeSource.includes("initEdenCamera({ focusTarget, model, render, targetById });"), true);
  assert.equal(clientRuntimeSource.includes("function renderConnections()"), false);
  assert.equal(clientRuntimeSource.includes("function renderPrompt()"), false);
  assert.equal(clientRuntimeSource.includes("function initCamera()"), false);
  assert.equal(clientRuntimeSource.includes("function pointerPosition(event)"), false);
  assert.equal(helperSource.includes("function renderEdenConnections"), true);
  assert.equal(helperSource.includes("function renderEdenPrompt"), true);
  assert.equal(helperSource.includes("function initEdenCamera"), true);
  assert.equal(helperSource.includes("function bindEdenStageRuntime"), true);
});

test("eden page script and client runtime delegate refresh and runtime projection helpers to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-refresh-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-refresh-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenRefreshRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenPersonalBox(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenPageTheme(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenVersions(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenCapabilityInstall(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenOrganization(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenTheoryState(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenProcessPreview(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenAcademyState({"), true);
  assert.equal(clientRuntimeSource.includes("return refreshEdenSessionSurfaces({"), true);
  assert.equal(clientRuntimeSource.includes("const response = await requestJson('/api/eden/personal-box');"), false);
  assert.equal(clientRuntimeSource.includes("const response = await requestJson('/api/eden/academy');"), false);
  assert.equal(helperSource.includes("async function refreshEdenPersonalBox"), true);
  assert.equal(helperSource.includes("async function refreshEdenAcademyState"), true);
  assert.equal(helperSource.includes("async function refreshEdenSessionSurfaces"), true);
});

test("eden page script and client runtime delegate runtime default projection helpers to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-projection-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-projection-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenProjectionRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenPersonalBoxRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenPageThemeRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenProcessRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenVersionsRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenCapabilityInstallRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenOrganizationRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenTheoryAnnexRuntime(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return findEdenActionById(surface, actionId);"), true);
  assert.equal(clientRuntimeSource.includes("return surface.runtime && surface.runtime.mode === 'personalBox'"), false);
  assert.equal(clientRuntimeSource.includes("return surface.runtime && surface.runtime.mode === 'organization'"), false);
  assert.equal(helperSource.includes("function readEdenPersonalBoxRuntime"), true);
  assert.equal(helperSource.includes("function readEdenOrganizationRuntime"), true);
  assert.equal(helperSource.includes("function findEdenActionById"), true);
});

test("eden page script and client runtime delegate viewport, focus, visibility, relief, surface-meta, and checkpoint view helpers to the extracted runtime", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-view-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-view-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenViewRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenAcademyCanvasState(model, state);"), true);
  assert.equal(clientRuntimeSource.includes("return isEdenActionVisible(action, state);"), true);
  assert.equal(clientRuntimeSource.includes("return cameraForEdenSurface(surface, { core, stage, state, overrideZoom });"), true);
  assert.equal(clientRuntimeSource.includes("return focusEdenTarget(targetId, {"), true);
  assert.equal(clientRuntimeSource.includes("modelCameraTargets: model.cameraTargets,"), true);
  assert.equal(clientRuntimeSource.includes("return isEdenSurfaceVisible(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return projectEdenSurfaceRect(surface, { core, state });"), true);
  assert.equal(clientRuntimeSource.includes("return readEdenSurfaceReliefLevel(surface, state);"), true);
  assert.equal(clientRuntimeSource.includes("return applyEdenSurfaceMeta(container, surface);"), true);
  assert.equal(clientRuntimeSource.includes("return renderEdenCheckpointView(model, state, {"), true);
  assert.equal(clientRuntimeSource.includes("function viewport()"), false);
  assert.equal(clientRuntimeSource.includes("return { width: stage.clientWidth, height: stage.clientHeight };"), false);
  assert.equal(clientRuntimeSource.includes("const range = surface.visibleRange || {};"), false);
  assert.equal(clientRuntimeSource.includes("const topLeft = core.worldToScreen(state.camera, surface.x, surface.y);"), false);
  assert.equal(clientRuntimeSource.includes("if (state.focusSurfaceId === surface.id) return Math.round(relief.focus ?? relief.base ?? 1);"), false);
  assert.equal(helperSource.includes("function readEdenAcademyCanvasState"), true);
  assert.equal(helperSource.includes("function readEdenViewport"), true);
  assert.equal(helperSource.includes("function focusEdenTarget"), true);
  assert.equal(helperSource.includes("function applyEdenSurfaceMeta"), true);
  assert.equal(helperSource.includes("function renderEdenCheckpointView"), true);
});

test("eden page script and client runtime delegate surface bind, ensure, and viewport dispatch orchestration to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-surface-runtime.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-surface-runtime.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenSurfaceRuntimePrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return ensureEdenSurfaceNode(surface, {"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenSurfaceCollection({"), true);
  assert.equal(clientRuntimeSource.includes("function bindSurfaceNode("), false);
  assert.equal(clientRuntimeSource.includes("function renderSurfaceDetails(node, surface)"), true);
  assert.equal(helperSource.includes("function bindEdenSurfaceNode"), true);
  assert.equal(helperSource.includes("function ensureEdenSurfaceNode"), true);
  assert.equal(helperSource.includes("function renderEdenSurfaceCollection"), true);
});

test("eden page script and client runtime delegate per-surface assembly and detail dispatch adapters to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-surface-adapters.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenSurfaceAdaptersPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("return ensureEdenPageSurface(surface, {"), true);
  assert.equal(clientRuntimeSource.includes("return renderEdenPageSurfaceDetails(node, surface, {"), true);
  assert.equal(clientRuntimeSource.includes("function renderTreeSurface("), false);
  assert.equal(clientRuntimeSource.includes("return ensureEdenSurfaceNode(surface, {"), false);
  assert.equal(clientRuntimeSource.includes("if (surface.surfaceKind === 'tree') renderTreeSurface(node, surface);"), false);
  assert.equal(clientRuntimeSource.includes("if (surface.panelKind === 'versions') renderEdenVersionsPanel(node, surface, {"), false);
  assert.equal(helperSource.includes("function ensureEdenPageSurface"), true);
  assert.equal(helperSource.includes("function renderEdenPageSurfaceDetails"), true);
  assert.equal(helperSource.includes("createTheorySurfaceNode: activeSurface => createEdenTheorySurfaceNode"), true);
  assert.equal(helperSource.includes("renderEdenTheoryPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenVersionsPanel(node, surface, {"), true);
});

test("eden page script and client runtime delegate process-view panel client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-process-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-process-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenProcessClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenProcessSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenProcessPanel(node, surface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-process-login-form]"), false);
  assert.equal(adapterSource.includes("createProcessSurfaceNode: activeSurface => createEdenProcessSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenProcessPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenProcessPanel"), true);
  assert.equal(helperSource.includes("createEdenProcessSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-process-login-form]"), true);
});

test("eden page script and client runtime delegate theory annex client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-theory-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-theory-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenTheoryClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenTheorySurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenTheoryPanel(node, surface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-tree-login-form]"), false);
  assert.equal(adapterSource.includes("createTheorySurfaceNode: activeSurface => createEdenTheorySurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenTheoryPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenTheoryPanel"), true);
  assert.equal(helperSource.includes("createEdenTheorySurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-tree-login-form]"), true);
});

test("eden page script and client runtime delegate versions panel client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-versions-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-versions-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenVersionsClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenVersionsSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenVersionsPanel(node, surface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-version-login-form]"), false);
  assert.equal(adapterSource.includes("createVersionsSurfaceNode: activeSurface => createEdenVersionsSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenVersionsPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenVersionsPanel"), true);
  assert.equal(helperSource.includes("createEdenVersionsSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-version-login-form]"), true);
});

test("eden page script and client runtime delegate edit-page panel client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-edit-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-edit-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenEditClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenEditPageSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenEditPagePanel(node, surface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-edit-login-form]"), false);
  assert.equal(adapterSource.includes("createEditSurfaceNode: activeSurface => createEdenEditPageSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenEditPagePanel(node, surface, {"), true);
  assert.equal(helperSource.includes("renderEdenEditPagePanel"), true);
  assert.equal(helperSource.includes("createEdenEditPageSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-edit-login-form]"), true);
});

test("eden page script and client runtime delegate personal-room panel client logic to the extracted helper", async () => {
  const pageScriptSource = await readFile(new URL("./eden-page-script.js", import.meta.url), "utf8");
  const clientRuntimeSource = await readFile(new URL("./eden-client-runtime.js", import.meta.url), "utf8");
  const helperSource = await readFile(new URL("./eden-personal-client.js", import.meta.url), "utf8");
  const adapterSource = await readFile(new URL("./eden-surface-adapters.js", import.meta.url), "utf8");

  assert.equal(pageScriptSource.includes('from "./eden-personal-client.js"'), true);
  assert.equal(pageScriptSource.includes("renderEdenPersonalClientPrelude()"), true);
  assert.equal(clientRuntimeSource.includes("createEdenPersonalBoxSurfaceNode(activeSurface"), false);
  assert.equal(clientRuntimeSource.includes("renderEdenPersonalBoxPanel(node, surface"), false);
  assert.equal(clientRuntimeSource.includes("[data-eden-login-form]"), false);
  assert.equal(adapterSource.includes("createPersonalSurfaceNode: activeSurface => createEdenPersonalBoxSurfaceNode"), true);
  assert.equal(adapterSource.includes("renderEdenPersonalBoxPanel(node, surface, {"), true);
  assert.equal(helperSource.includes("fillEdenPersonalEditor"), true);
  assert.equal(helperSource.includes("renderEdenPersonalBoxPanel"), true);
  assert.equal(helperSource.includes("createEdenPersonalBoxSurfaceNode"), true);
  assert.equal(helperSource.includes("[data-eden-login-form]"), true);
});
