import { relation } from "../../src/kernel.js";
import { runProcessGraph, runNode, predicatePasses } from "../../src/process-graph.js";
import {
  FALLBACK_EDITOR_BY_TRAIT,
  typeModelProjection,
  editorForValueType,
  processSpecFor,
  validateFlatRecord,
  validateProcessInput,
  compatibleWithType,
  matchAccepts,
  matchingValueTypes,
  valueMatchesType,
  coerceDomValue,
  inferTraitEditor,
  normalizeFields,
  jsTypeOf,
  previewValue
} from "../../src/type-model.js";
import { resolvePagePresentationTheme } from "../../src/runtime-presentation.js";
import {
  createSurfaceInspectionPoint,
  installSurfaceInspectionPoint
} from "../../src/runtime-surface-diagnostics.js";
import { cloneInspectionValue } from "../../src/runtime-surface-runtime-shared.js";
import { widgetTree, frontendProgram, templateWidgetTrees, stableJson } from "../../src/widgets.js";
import { renderGuidanceClient } from "../../src/runtime-guidance-client.js";
import { renderSurfaceCommandActionsFactory } from "./surface-command-actions.js";
import { renderSurfaceCommandIdentityActionsFactory } from "./surface-command-identity-actions.js";
import { renderSurfaceCommandViewFactory } from "./surface-command-view.js";
import { renderSurfaceInspectorActionsFactory } from "./surface-inspector-actions.js";
import { renderSurfaceInspectorFormActionsFactory } from "./surface-inspector-form-actions.js";
import { renderSurfaceInspectorOverlayViewFactory } from "./surface-inspector-overlay-view.js";
import { renderSurfaceInspectorPanelViewFactory } from "./surface-inspector-panel-view.js";
import { renderSurfaceInspectorVersionActionsFactory } from "./surface-inspector-version-actions.js";
import { renderWorldCommandActionsFactory } from "./world-command-actions.js";
import { renderWorldBrowserViewFactory } from "./world-browser-view.js";
import { renderWorldGraphActionsFactory } from "./world-graph-actions.js";
import { renderWorldGraphViewFactory } from "./world-graph-view.js";
import { renderWorldPostRenderFactory } from "./world-post-render.js";
import { renderWorldShellViewFactory } from "./world-shell-view.js";
import { renderWorldSurfaceViewFactory } from "./world-surface-view.js";
import { renderWorldTutorialActionsFactory } from "./world-tutorial-actions.js";
import { renderWorldTutorialCompanionFactory } from "./world-tutorial-companion.js";
import { renderGuidanceScopeInventoryFactory } from "../../src/runtime-guidance-scope-inventory-factory.js";
import { renderWidgetPageHead } from "./widget-page-head.js";
export function renderWidgetPage(world, { actor, rootWidget, frontendProgram: programId = null, appConfig = {} }) {
  const tree = world.project(w => widgetTree(w, rootWidget));
  const program = world.project(w => frontendProgram(w, programId));
  const typeModel = world.project(typeModelProjection);
  const templates = world.project(templateWidgetTrees);
  const html = renderDocument(tree, program, appConfig, typeModel, templates);

  world.emit({
    process: "widget.renderHtml",
    actor,
    claims: [relation(actor, "rendered", rootWidget)],
    body: { rootWidget, frontendProgram: programId, bytes: html.length }
  });

  return html;
}

function renderDocument(root, program, appConfig = {}, typeModel = {}, templates = []) {
  const title = root.props?.title ?? "Witness App";
  const pageTheme = resolvePagePresentationTheme(appConfig.pageChrome || {});
  const bodyAttrs = [
    appConfig.page ? `data-page="${escapeAttr(appConfig.page)}"` : "",
    appConfig.surfaceContext ? `data-surface-context="${escapeAttr(appConfig.surfaceContext)}"` : "",
    appConfig.surfaceRouteId ? `data-surface-route="${escapeAttr(appConfig.surfaceRouteId)}"` : "",
    appConfig.surfaceRootWidgetId ? `data-surface-root-widget="${escapeAttr(appConfig.surfaceRootWidgetId)}"` : "",
    appConfig.surfaceProgramId ? `data-surface-program="${escapeAttr(appConfig.surfaceProgramId)}"` : "",
    pageTheme.themeId ? `data-page-theme="${escapeAttr(pageTheme.themeId)}"` : "",
    pageTheme.material ? `data-page-material="${escapeAttr(pageTheme.material)}"` : "",
    pageTheme.typography ? `data-page-typography="${escapeAttr(pageTheme.typography)}"` : ""
  ].filter(Boolean).join(" ");
  const options = { excludeRoles: new Set(appConfig.excludeWidgetRoles ?? []), typeModel };
  const guidanceConfig = appConfig.guidance ?? appConfig.tutorial ?? null;
  return `<!doctype html>\n<html>\n${renderWidgetPageHead(title, pageTheme)}\n<body${bodyAttrs ? " " + bodyAttrs : ""}>\n${renderWidget(root, options)}\n${templates.map(template => renderWidgetTemplate(template, options)).join("\n")}\n${program ? renderClientEngine({ ...program, config: { ...appConfig, typeModel, pageChrome: pageTheme } }) : ""}\n${guidanceConfig ? renderGuidanceClient(guidanceConfig) : ""}\n</body>\n</html>`;
}

function renderWidgetTemplate(widget, options = {}) {
  const content = renderWidget(widget, { ...options, templateContent: true });
  if (widget.kind === "Option") {
    // Browsers do not consistently preserve top-level <option> nodes inside a
    // parsed template fragment. Keep the authored widget declarative, but wrap
    // it in a temporary <select> so the parser creates a real option element.
    return `<template data-widget-template="${escapeAttr(widget.id)}"><select data-template-wrapper="option">${content}</select></template>`;
  }
  return `<template data-widget-template="${escapeAttr(widget.id)}">${content}</template>`;
}

function renderWidget(widget, options = {}) {
  const role = widget.props?.role ?? widget.props?.["data-role"];
  if (role && options.excludeRoles?.has(role)) return "";
  if (widget.props?.template === true && !options.templateContent) return "";
  const children = widget.children.map(child => renderWidget(child, options)).join("\n");
  const attrs = renderAttrs(widget);

  switch (widget.kind) {
    case "Fragment":
      return children;
    case "Page":
      return `<main${attrs}>\n${children}\n</main>`;
    case "Box":
    case "Section":
      return `<section${attrs}>\n${children}\n</section>`;
    case "Header":
      return `<header${attrs}>\n${children}\n</header>`;
    case "Heading": {
      const level = clamp(Number(widget.props.level ?? 1), 1, 6);
      return `<h${level}${attrs}>${escapeHtml(widget.props.text ?? "")}</h${level}>`;
    }
    case "Paragraph":
      return `<p${attrs}>${escapeHtml(widget.props.text ?? "")}</p>`;
    case "Small":
      return `<small${attrs}>${escapeHtml(widget.props.text ?? "")}</small>`;
    case "Text":
      return `<div${attrs}>${escapeHtml(widget.props.text ?? "")}</div>`;
    case "Label":
      return `<label${attrs}>${children || escapeHtml(widget.props.text ?? "")}</label>`;
    case "Form":
      return `<form${attrs}>\n${children}\n</form>`;
    case "Input":
      return `<input${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "type", "valueType", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}" autocomplete="off" />`;
    case "Textarea":
      return `<textarea${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}">${escapeHtml(widget.props.text ?? "")}</textarea>`;
    case "Select":
      return `<select${attrs}${renderExtraAttrs(widget, ["name", "template"])} name="${escapeAttr(widget.props.name ?? "value")}">${children}</select>`;
    case "Option":
      return `<option${attrs}${renderExtraAttrs(widget, ["text", "value", "template"])} value="${escapeAttr(widget.props.value ?? "")}">${escapeHtml(widget.props.text ?? "")}</option>`;
    case "Details":
      return `<details${attrs}${renderExtraAttrs(widget, ["open", "template"])}${widget.props.open ? " open" : ""}>${children}</details>`;
    case "Summary":
      return `<summary${attrs}>${escapeHtml(widget.props.text ?? "")}</summary>`;
    case "ValueEditor":
      return renderValueEditor(widget, options.typeModel ?? {}, attrs);
    case "Button": {
      const type = widget.props.type ?? "button";
      return `<button${attrs}${renderExtraAttrs(widget, ["text", "type", "template"])} type="${escapeAttr(type)}">${escapeHtml(widget.props.text ?? "Button")}</button>`;
    }
    case "Link":
      return `<a${attrs}${renderExtraAttrs(widget, ["text", "href", "template"])} href="${escapeAttr(widget.props.href ?? "#")}">${escapeHtml(widget.props.text ?? widget.props.href ?? "Link")}</a>`;
    case "List":
      return `<ul${attrs}></ul>`;
    default:
      return `<section${attrs} data-kind="${escapeAttr(widget.kind)}">${children}</section>`;
  }
}

function renderValueEditor(widget, typeModel, attrs) {
  const valueType = widget.props.valueType ?? "textual";
  const editor = editorForValueType(typeModel, valueType);
  const name = escapeAttr(widget.props.name ?? "value");
  const placeholder = escapeAttr(widget.props.placeholder ?? "");
  const controlAttrs = `${attrs} name="${name}" data-value-type="${escapeAttr(valueType)}" data-editor-control="${escapeAttr(editor.control)}"`;
  let control = "";
  if (editor.control === "select") {
    const options = Array.isArray(editor.options) ? editor.options : [];
    const placeholderOption = widget.props.placeholder ? `<option value="">${escapeHtml(widget.props.placeholder)}</option>` : "";
    control = `<select${controlAttrs}>${placeholderOption}${options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
  } else if (editor.control === "checkbox") {
    control = `<input${controlAttrs} type="checkbox" />`;
  } else {
    const inputType = editor.control === "number" ? "number" : editor.control === "color" ? "color" : "text";
    control = `<input${controlAttrs} type="${escapeAttr(inputType)}" placeholder="${placeholder}" autocomplete="off" />`;
  }
  if (!widget.props.label) return control;
  return `<label class="value-editor-field"><span>${escapeHtml(widget.props.label)}</span>${control}</label>`;
}

function renderAttrs(widget) {
  const widgetId = widget.props.widgetId ?? widget.id;
  const guidanceTarget = typeof widget.props.guidanceTarget === "string" && widget.props.guidanceTarget !== ""
    ? widget.props.guidanceTarget
    : (typeof widget.props.tutorialTarget === "string" && widget.props.tutorialTarget !== ""
        ? widget.props.tutorialTarget
        : "");
  const parts = [`data-widget="${escapeAttr(widgetId)}"`];
  if (widget.version) parts.push(`data-widget-version="${escapeAttr(widget.version)}"`);
  if (widget.props.domId) parts.push(`id="${escapeAttr(widget.props.domId)}"`);
  if (widget.props.class) parts.push(`class="${escapeAttr(widget.props.class)}"`);
  if (widget.props.hidden === true) parts.push("hidden");
  if (widget.props.role) {
    parts.push(`data-role="${escapeAttr(widget.props.role)}"`);
    parts.push(`data-${escapeAttr(widget.props.role)}`);
  }
  if (widget.props.action) parts.push(`data-action="${escapeAttr(widget.props.action)}"`);
  if (guidanceTarget) {
    parts.push(`data-guidance-target="${escapeAttr(guidanceTarget)}"`);
    parts.push(`data-tutorial-target="${escapeAttr(guidanceTarget)}"`);
  }
  if (widget.props.type && widget.kind !== "Button") parts.push(`type="${escapeAttr(widget.props.type)}"`);
  if (widget.versionIndex != null) parts.push(`style="--version-color: ${escapeAttr(versionColor(widget.versionIndex))}"`);
  for (const [key, value] of Object.entries(widget.props || {})) {
    if (key.startsWith("event") && key.length > 5 && value != null) {
      parts.push(`data-${escapeAttr(camelToKebab(key.slice(5)))}="${escapeAttr(value)}"`);
    }
    if ((key.startsWith("data-") || key.startsWith("aria-")) && value != null) parts.push(`${escapeAttr(key)}="${escapeAttr(value)}"`);
  }
  return " " + parts.join(" ");
}

function renderExtraAttrs(widget, consumed = []) {
  const consumedSet = new Set(["class", "role", "action", "hidden", "template", "guidanceTarget", "tutorialTarget", "widgetId", "domId", "open", ...consumed]);
  const entries = Object.entries(widget.props || {})
    .filter(([key, value]) => !consumedSet.has(key) && !key.startsWith("event") && !key.startsWith("data-") && !key.startsWith("aria-") && value != null && typeof value !== "object");
  if (entries.length === 0) return "";
  return " " + entries.map(([key, value]) => `${escapeAttr(key)}="${escapeAttr(value)}"`).join(" ");
}

function camelToKebab(value) {
  return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function versionColor(index) {
  const colors = ["#375a7f", "#6b4f8a", "#667a3a", "#9a5a35", "#2f766f", "#8a3f65"];
  const n = Math.abs(Number(index) || 0) % colors.length;
  return colors[n];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function renderClientEngine(program) {
  const json = JSON.stringify(program).replace(/</g, "\\u003c");
  const commandTutorial = program.config?.guidance?.definition
    ?? program.config?.tutorial?.definition
    ?? null;
  const commandTutorialJson = JSON.stringify(commandTutorial).replace(/</g, "\\u003c");
  const frontendProgramScriptId = typeof program.config?.frontendProgramScriptId === "string" && program.config.frontendProgramScriptId.trim()
    ? program.config.frontendProgramScriptId.trim()
    : "witness-frontend-program";
  const engine = String.raw`(async () => {
  ${renderWorldTutorialCompanionFactory()}
  ${renderGuidanceScopeInventoryFactory()}
  ${renderSurfaceCommandActionsFactory()}
  ${renderSurfaceCommandIdentityActionsFactory()}
  ${renderSurfaceCommandViewFactory()}
  ${renderSurfaceInspectorActionsFactory()}
  ${renderSurfaceInspectorFormActionsFactory()}
  ${renderSurfaceInspectorOverlayViewFactory()}
  ${renderSurfaceInspectorPanelViewFactory()}
  ${renderSurfaceInspectorVersionActionsFactory()}
  ${renderWorldCommandActionsFactory()}
  ${renderWorldBrowserViewFactory()}
  ${renderWorldGraphActionsFactory()}
  ${renderWorldGraphViewFactory()}
  ${renderWorldPostRenderFactory()}
  ${renderWorldShellViewFactory()}
  ${renderWorldSurfaceViewFactory()}
  ${renderWorldTutorialActionsFactory()}
  const frontendProgramScriptId = ${JSON.stringify(frontendProgramScriptId)};
  let program = JSON.parse(document.getElementById(frontendProgramScriptId).textContent);
  let config = program.config || {};
  let typeModel = config.typeModel || {};
  const processTraceEnabled = config.traceProcessEvents !== false;
  const currentSurfaceContext = typeof config.surfaceContext === 'string' && config.surfaceContext.trim() ? config.surfaceContext.trim() : null;
  const runtimeSurfaces = Array.isArray(config.runtimeSurfaces) ? config.runtimeSurfaces : [];
  const runtimeSurfacesFor = context => runtimeSurfaces.filter(surface => {
    if (!Array.isArray(surface?.contexts) || !surface.contexts.length) return true;
    return surface.contexts.includes(context);
  });
  const commandTutorial = ${commandTutorialJson};
  const state = Object.create(null);
  const currentInitialStateScriptId = () => typeof config.initialStateScriptId === 'string' && config.initialStateScriptId.trim() ? config.initialStateScriptId.trim() : '';
  const currentInitialStateInto = () => typeof config.initialStateInto === 'string' && config.initialStateInto.trim() ? config.initialStateInto.trim() : '';
  const syncInitialState = (sourceDocument = document) => {
    const initialStateScriptId = currentInitialStateScriptId();
    const initialStateInto = currentInitialStateInto();
    if (!initialStateScriptId || !initialStateInto) return;
    const initialStateEl = sourceDocument.getElementById(initialStateScriptId);
    if (!initialStateEl?.textContent) return;
    try {
      state[initialStateInto] = JSON.parse(initialStateEl.textContent);
    } catch {}
  };
  syncInitialState(document);
  const liveProjectionProcesses = new Set([
    'defineWidget',
    'updateWidget',
    'widget.update',
    'widget.replace',
    'widget.replace.rollback',
    'attachWidget',
    'defineWidgetVersion',
    'activateWidgetVersion',
    'widgetVersion.migrate',
    'widgetVersion.rollback',
    'capability.install',
    'capability.remove'
  ]);
  let refreshInFlight = null;
  let liveProjectionStarted = false;
  const byWidget = id => document.querySelector('[data-widget="' + CSS.escape(id) + '"]');
  const byTemplate = id => document.querySelector('[data-widget-template="' + CSS.escape(id) + '"]');
  const readPath = (value, path) => String(path || '').split('.').filter(Boolean).reduce((x, key) => x == null ? undefined : x[key], value);
  const FALLBACK_EDITOR_BY_TRAIT = ${JSON.stringify(FALLBACK_EDITOR_BY_TRAIT)};
  const predicatePasses = ${predicatePasses.toString()};
  const runNode = ${runNode.toString()};
  const runProcessGraph = ${runProcessGraph.toString()};
  const cloneInspectionValue = ${cloneInspectionValue.toString()};
  const createSurfaceInspectionPoint = ${createSurfaceInspectionPoint.toString()};
  const installSurfaceInspectionPoint = ${installSurfaceInspectionPoint.toString()};
  const compatibleWithType = ${compatibleWithType.toString()};
  const editorForValueType = ${editorForValueType.toString()};
  const processSpecFor = ${processSpecFor.toString()};
  const normalizeFields = ${normalizeFields.toString()};
  const jsTypeOf = ${jsTypeOf.toString()};
  const previewValue = ${previewValue.toString()};
  const inferTraitEditor = ${inferTraitEditor.toString()};
  const coerceDomValue = ${coerceDomValue.toString()};
  const valueMatchesType = ${valueMatchesType.toString()};
  const matchingValueTypes = ${matchingValueTypes.toString()};
  const matchAccepts = ${matchAccepts.toString()};
  const validateFlatRecord = ${validateFlatRecord.toString()};
  const validateProcessInput = ${validateProcessInput.toString()};
  const textAt = (value, path) => String(readPath(value, path) ?? '');
  const setText = (id, text) => { const el = byWidget(id); if (el) el.textContent = text; };
  const setValue = (id, value) => {
    const el = byWidget(id);
    if (!el) return;
    if ('value' in el) el.value = value ?? '';
    else el.textContent = value ?? '';
  };
  const coerceBooleanFlag = value => value === true || value === 1 || value === '1' || String(value || '').trim().toLowerCase() === 'true';
  const setHidden = (id, hidden) => {
    const el = byWidget(id);
    if (!el) return;
    el.hidden = coerceBooleanFlag(hidden);
  };
  const setDisabled = (id, disabled) => {
    const el = byWidget(id);
    if (!el) return;
    const next = coerceBooleanFlag(disabled);
    if ('disabled' in el) el.disabled = next;
    else if (next) el.setAttribute('disabled', '');
    else el.removeAttribute('disabled');
  };
  const currentActor = () => state.session?.actor || state.actor || '';
  const applyTheme = () => { document.body.dataset.actor = currentActor() || ''; };
  const liveSurfaceInspectable = Boolean(config.page && config.page !== 'world');
  const validWorldGraphModes = new Set(['system', 'graph', 'things', 'primitive', 'witness', 'source', 'process']);
  const browserRuntimeCapabilities = Array.isArray(config.browserRuntimeCapabilities)
    ? config.browserRuntimeCapabilities.map(String).filter(Boolean)
    : [];
  const processViewHref = ({ program, event }) => {
    const url = new URL('/process', window.location.origin);
    if (program) url.searchParams.set('program', program);
    if (event) url.searchParams.set('event', event);
    return url.pathname + url.search;
  };
  const currentSurfaceRouteId = () => typeof config.surfaceRouteId === 'string' && config.surfaceRouteId.trim()
    ? config.surfaceRouteId.trim()
    : '';
  const currentSurfaceRootWidgetId = () => typeof config.surfaceRootWidgetId === 'string' && config.surfaceRootWidgetId.trim()
    ? config.surfaceRootWidgetId.trim()
    : (typeof program.rootWidget === 'string' && program.rootWidget.trim() ? program.rootWidget.trim() : '');
  const currentSurfaceRuntimeInspection = () => {
    const inspection = window?.__surfaceRuntimeInspection;
    return inspection && typeof inspection === 'object' ? inspection : null;
  };
  const backendFacingStepOps = new Set(['fetchJson', 'postJson', 'patchJson', 'deleteJson', 'refreshProjection', 'run']);
  const widgetPageRuntimeBridgeOps = new Set(['fetchJson', 'postJson', 'patchJson', 'deleteJson', 'refreshProjection']);
  const widgetPageRuntimeBridgeCount = () => (program.graph || program.steps || [])
    .filter(step => widgetPageRuntimeBridgeOps.has(String(step?.op || '')))
    .length;
  const widgetPageBoundInteractionCount = () => {
    const events = new Set();
    for (const step of (program.graph || program.steps || [])) {
      const event = typeof step?.event === 'string' ? step.event.trim() : '';
      if (!event || event === 'load' || event === 'error') continue;
      events.add(event);
    }
    return events.size;
  };
  const widgetPageRouteTarget = () => {
    const path = typeof window?.location?.pathname === 'string' && window.location.pathname
      ? window.location.pathname
      : '/';
    const surfaceId = currentSurfaceRootWidgetId();
    const routeId = currentSurfaceRouteId();
    return {
      path,
      ...(surfaceId ? { surfaceId } : {}),
      ...(routeId ? { routeId } : {})
    };
  };
  const widgetPageInspectionManifest = {
    activeSurfaceId: currentSurfaceRootWidgetId() || null,
    surfaces: currentSurfaceRootWidgetId() ? [{ id: currentSurfaceRootWidgetId() }] : [],
    routeTargets: [widgetPageRouteTarget()],
    browserRuntimeCapabilities,
    diagnostics: {
      includedRuntimeIds: [program.id].filter(Boolean)
    }
  };
  const widgetPageProcessTrace = [];
  const widgetPageProcessRuntime = {
    counts: {
      stepCount: (program.graph || program.steps || []).length,
      eventCount: [...new Set((program.graph || program.steps || []).map(step => String(step?.event || '').trim()).filter(Boolean))].length
    },
    inFlightCount: 0,
    trace: widgetPageProcessTrace,
    snapshot: () => cloneInspectionValue(state),
    derives: () => ({})
  };
  const buildWidgetPageRuntimeProbe = () => {
    const routeTarget = widgetPageRouteTarget();
    return {
      activeSurfaceId: currentSurfaceRootWidgetId() || null,
      currentProcessRefs: [program.id].filter(Boolean),
      processState: cloneInspectionValue(state),
      processDerives: {},
      runtimeBridgeCount: widgetPageRuntimeBridgeCount(),
      boundInteractionCount: widgetPageBoundInteractionCount(),
      routeStateTarget: cloneInspectionValue(routeTarget),
      activeRouteTarget: cloneInspectionValue(routeTarget)
    };
  };
  const widgetPageInspectionRuntime = {
    latestProbe: null,
    issues: [],
    expectationProviderCount: 0,
    get runtimeBridgeCount() {
      return widgetPageRuntimeBridgeCount();
    },
    get processRuntime() {
      return widgetPageProcessRuntime;
    },
    async rerunProbe() {
      this.latestProbe = buildWidgetPageRuntimeProbe();
      return cloneInspectionValue(this.latestProbe);
    },
    whenSettled() {
      return null;
    },
    clearIssues() {
      this.issues = [];
      return [];
    }
  };
  const syncWidgetPageRuntimeProbe = () => {
    widgetPageInspectionRuntime.latestProbe = buildWidgetPageRuntimeProbe();
    return widgetPageInspectionRuntime.latestProbe;
  };
  installSurfaceInspectionPoint(window, widgetPageInspectionManifest, widgetPageInspectionRuntime);
  syncWidgetPageRuntimeProbe();
  const worldSurfaceHref = ({ select = '', mode = '' } = {}) => {
    const url = new URL('/world', window.location.origin);
    if (select) url.searchParams.set('select', select);
    if (mode) url.searchParams.set('mode', mode);
    return url.pathname + url.search;
  };
  const selectedSurfaceWidgetId = () => String(state.surfaceInspectorSelectedId || '');
  const clearSurfaceInspectorHighlight = () => {
    document.querySelectorAll('[data-surface-inspector-selected]').forEach(node => node.removeAttribute('data-surface-inspector-selected'));
  };
  const applySurfaceInspectorHighlight = widgetId => {
    clearSurfaceInspectorHighlight();
    if (!widgetId) return;
    const element = byWidget(widgetId);
    if (!element) return;
    element.setAttribute('data-surface-inspector-selected', 'true');
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const selectedSurfaceWidgetElement = () => {
    const widgetId = selectedSurfaceWidgetId();
    return widgetId ? byWidget(widgetId) : null;
  };
  const selectedSurfaceWidgetNode = () => state.surfaceInspectorGraphById?.[selectedSurfaceWidgetId()] || null;
  const selectedSurfaceWidgetAuthored = () => state.surfaceInspectorWidgetsById?.[selectedSurfaceWidgetId()] || null;
  const surfaceInspectorGovernanceSummary = route => {
    if (!route || !route.governanceMode) return '';
    const sharedAuthority = route.sharedAuthorityPath === true ? 'shared authority path' : 'non-shared authority path';
    const authorityMechanism = route.authorityMechanism ? (' via ' + route.authorityMechanism) : '';
    const workflowRole = route.workflowRole ? (' (' + route.workflowRole + ')') : '';
    const notes = route.governanceNotes ? (' ' + String(route.governanceNotes)) : '';
    return ('Governance is ' + route.governanceMode + authorityMechanism + ' on the ' + sharedAuthority + workflowRole + '.' + notes).trim();
  };
  const selectedSurfaceWidgetEditAuthority = () => {
    const widget = selectedSurfaceWidgetAuthored();
    if (!widget) return { ok: false, reason: 'This selected element is not currently backed by a directly editable authored widget row.' };
    const actor = currentActor();
    if (!actor) return { ok: false, reason: 'Sign in to edit bootstrap state.' };
    if (widget.context) {
      const mutationContexts = Array.isArray(state.authority?.mutationContexts) ? state.authority.mutationContexts : [];
      if (mutationContexts.includes(widget.context)) return { ok: true, reason: '' };
      return { ok: false, reason: 'Read-only: this widget lives in context ' + widget.context + ' and the current actor lacks authority for that context.' };
    }
    if (widget.owner && widget.owner === actor) return { ok: true, reason: '' };
    if (widget.owner) return { ok: false, reason: 'Read-only: this unscoped widget is owned by ' + widget.owner + '.' };
    return { ok: false, reason: 'Read-only: this widget is not owned by the current actor.' };
  };
  const selectedSurfaceWidgetSource = () => {
    const node = selectedSurfaceWidgetNode();
    return (node?.sources || []).slice(-1)[0] || null;
  };
  const surfaceInspectorChildParentKinds = new Set(['Page', 'Box', 'Section', 'Header', 'Form', 'Label', 'Details', 'Select', 'Fragment']);
  const surfaceInspectorChildKindOptions = [
    { value: 'Text', label: 'Text' },
    { value: 'Heading', label: 'Heading' },
    { value: 'Paragraph', label: 'Paragraph' },
    { value: 'Box', label: 'Box' },
    { value: 'Section', label: 'Section' },
    { value: 'Button', label: 'Button' }
  ];
  const surfaceInspectorNodeValueString = (node, key) => {
    const row = [...(node?.values || []), ...(node?.properties || [])].find(entry => entry?.key === key);
    if (!row?.value || typeof row.value !== 'object') return '';
    if (row.value.type === 'string') return String(row.value.value || '');
    if (row.value.type === 'ref') return String(row.value.target || '');
    return '';
  };
  const selectedSurfaceWidgetVersionState = () => selectedSurfaceWidgetNode()?.widgetVersionState || null;
  const selectedSurfaceWidgetVersions = () => selectedSurfaceWidgetNode()?.widgetVersions || [];
  const selectedSurfaceWidgetEvolution = () => selectedSurfaceWidgetNode()?.widgetEvolution || null;
  const backendMigrationStatusFromStrategy = strategy => {
    switch (String(strategy || '')) {
      case 'compatible':
        return 'compatible';
      case 'migrate':
        return 'migrate';
      case 'fork':
        return 'forkRequired';
      default:
        return 'blocked';
    }
  };
  const previousDistinctVersionFromHistory = (rows, currentVersion) => {
    const history = [];
    for (const row of rows || []) {
      const version = String(row?.version || '').trim();
      if (!version || history[history.length - 1] === version) continue;
      history.push(version);
    }
    if (!history.length) return '';
    const current = String(currentVersion || '').trim();
    if (!current) return history.length >= 2 ? history[history.length - 2] : '';
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (history[index] !== current) continue;
      return index > 0 ? history[index - 1] : '';
    }
    return history.length >= 2 ? history[history.length - 2] : '';
  };
  const currentPreviewSessionId = () => {
    try {
      return new URL(window.location.href).searchParams.get('previewSessionId')?.trim() || '';
    } catch {
      return '';
    }
  };
  const currentSurfaceIdentityNode = () => {
    const identityId = typeof state.session?.identity === 'string' ? state.session.identity : '';
    return identityId ? (state.surfaceInspectorGraphById?.[identityId] || null) : null;
  };
  const currentSurfaceIdentityRecord = () => {
    const identityId = typeof state.session?.identity === 'string' ? state.session.identity : '';
    return identityId ? (state.surfaceBootstrapIdentitiesById?.[identityId] || null) : null;
  };
  const currentSurfaceIdentitySource = () => {
    const node = currentSurfaceIdentityNode();
    return (node?.sources || []).slice(-1)[0] || null;
  };
  const buildSurfaceWhoamiResult = () => {
    const identityRecord = currentSurfaceIdentityRecord();
    const identity = typeof state.session?.identity === 'string' ? state.session.identity : '';
    const actor = typeof state.session?.actor === 'string' ? state.session.actor : '';
    const label = typeof state.session?.label === 'string' ? state.session.label : '';
    const homeContext = typeof (identityRecord?.homeContext ?? state.session?.homeContext) === 'string' ? (identityRecord?.homeContext ?? state.session?.homeContext) : '';
    const perspective = typeof (identityRecord?.homePerspective ?? state.session?.perspective) === 'string' ? (identityRecord?.homePerspective ?? state.session?.perspective) : '';
    const authenticated = Boolean(state.session?.authenticated && identity);
    const title = authenticated ? (label || actor || identity) : 'user';
    const subtitle = authenticated
      ? ('Current signed-in identity / ' + identity)
      : 'Anonymous principal / sign in if you want the world to remember your label.';
    const rows = [
      ['principal', title],
      ['identity', identity || 'user'],
      ['actor', actor || 'user'],
      ['context', homeContext || ''],
      ['perspective', perspective || ''],
      ['sourcerer', 'TRUE']
    ].filter(([, value]) => value);
    return {
      kind: 'whoami',
      title,
      subtitle,
      rows,
      authenticated,
      identity,
      username: typeof identityRecord?.username === 'string' ? identityRecord.username : '',
      homeContextValue: homeContext || '',
      homePerspectiveValue: perspective || '',
      contextOptions: Array.isArray(state.surfaceBootstrapContexts) ? state.surfaceBootstrapContexts.map(row => row?.id).filter(Boolean) : [],
      editorReady: Boolean(identityRecord),
      editorLoading: authenticated && !identityRecord && !state.surfaceInspectorWidgetsError,
      editorError: authenticated && !identityRecord ? state.surfaceInspectorWidgetsError : '',
      bootstrapHref: authenticated && identity ? ('/_bootstrap?identity=' + encodeURIComponent(identity) + '#identity-form') : '',
      source: currentSurfaceIdentitySource(),
      note: authenticated
        ? 'The shortcut reveals inspectability and authority-to-begin. From here you can inspect the real world record, edit the current identity inline through a real identity.update path, or open the bootstrap editor.'
        : 'The shortcut reveals the deeper truth first. Sign in when you want this user to become a concrete identity record.'
    };
  };
  const openSurfaceWhoami = () => {
    state.surfaceCommandOpen = true;
    state.surfaceCommandQuery = 'whoami';
    state.surfaceCommandResult = buildSurfaceWhoamiResult();
    state.surfaceCommandFocusRequested = true;
    updateSurfaceInspectorUi();
    if (state.session?.authenticated && state.session?.identity) {
      void ensureSurfaceInspectorWidgets().then(() => {
        if (state.surfaceCommandResult?.kind !== 'whoami') return;
        state.surfaceCommandResult = buildSurfaceWhoamiResult();
        updateSurfaceInspectorUi();
      }).catch(error => {
        if (state.surfaceCommandResult?.kind !== 'whoami') return;
        state.surfaceCommandResult = {
          ...buildSurfaceWhoamiResult(),
          statusMessage: error instanceof Error ? error.message : String(error),
          statusLevel: 'error'
        };
        updateSurfaceInspectorUi();
      });
    }
  };
  const deriveSurfaceInspectorProcessSelection = widgetId => {
    if (!widgetId || !program?.graph?.length) return null;
    const element = byWidget(widgetId);
    if (!element) return null;
    const action = element.getAttribute('data-action') || '';
    if (action) {
      const event = 'click:' + action;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    const form = element.matches?.('form[data-widget]') ? element : element.closest?.('form[data-widget]');
    const formId = form?.getAttribute?.('data-widget') || '';
    if (formId) {
      const event = 'submit:' + formId;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    if (widgetId === program.rootWidget && (program.graph || []).some(step => step.event === 'load')) {
      return { program: program.id, event: 'load' };
    }
    return null;
  };
  const invalidateSurfaceInspectorGraph = () => {
    state.surfaceInspectorGraph = null;
    state.surfaceInspectorGraphById = null;
    state.surfaceInspectorGraphLoaded = false;
    state.surfaceInspectorGraphError = null;
  };
  const invalidateSurfaceInspectorWidgets = () => {
    state.surfaceInspectorWidgets = null;
    state.surfaceInspectorWidgetsById = null;
    state.surfaceBootstrapIdentities = null;
    state.surfaceBootstrapIdentitiesById = null;
    state.surfaceBootstrapContexts = null;
    state.surfaceBootstrapCapabilityCatalog = null;
    state.surfaceBootstrapCapabilityCatalogById = null;
    state.surfaceBootstrapCapabilityInstalls = null;
    state.surfaceInspectorWidgetsLoaded = false;
    state.surfaceInspectorWidgetsError = null;
  };
  const invalidateSurfaceInspectorRuntimeDiagnostics = () => {
    state.surfaceInspectorRuntimeDiagnostics = null;
    state.surfaceInspectorRuntimeDiagnosticsLoaded = false;
    state.surfaceInspectorRuntimeDiagnosticsError = null;
  };
  const setSurfaceInspectorStatus = (message, level = 'ok') => {
    state.surfaceInspectorStatus = message ? { message: String(message), level } : null;
  };
  const refreshSurfaceInspectorMetadata = async () => {
    if (!liveSurfaceInspectable) return;
    applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
    updateSurfaceInspectorUi();
    if (!state.surfaceInspectorOpen || !selectedSurfaceWidgetId()) return;
    await Promise.allSettled([
      ensureSurfaceInspectorGraph(),
      ensureSurfaceInspectorWidgets(),
      ensureSurfaceInspectorRuntimeDiagnostics()
    ]);
    updateSurfaceInspectorUi();
  };
  const selectedSurfaceInspectorProcessSelection = () => {
    const selectedNode = selectedSurfaceWidgetNode();
    if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) return selectedNode.processSelection;
    return deriveSurfaceInspectorProcessSelection(selectedSurfaceWidgetId());
  };
  const selectedSurfaceWidgetRuntimeCorrelation = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const selectedElement = selectedSurfaceWidgetElement();
    const processSelection = selectedSurfaceInspectorProcessSelection();
    const ops = summarizeSurfaceInspectorBackendOperations({
      processSelection,
      selectedElement,
      diagnostics: state.surfaceInspectorRuntimeDiagnostics
    });
    const inspection = currentSurfaceRuntimeInspection();
    if (!inspection) {
      if (!processSelection?.program || !processSelection?.event) {
        return {
          summary: '',
          rows: [],
          ops,
          unavailableReason: 'Shared runtime inspection is unavailable for this page.'
        };
      }
      return {
        summary: 'Authored event ' + processSelection.event + ' in ' + processSelection.program + ' is declared for this widget, but shared runtime probe data is unavailable for this page.',
        rows: [
          ['Frontend Program', processSelection.program],
          ['Frontend Event', processSelection.event]
        ],
        ops,
        unavailableReason: 'Shared runtime inspection is unavailable for this page.'
      };
    }
    const latestProbe = inspection.latestProbe && typeof inspection.latestProbe === 'object' ? inspection.latestProbe : null;
    const processInfo = inspection.process && typeof inspection.process === 'object' ? inspection.process : null;
    const currentProcessRefs = Array.isArray(latestProbe?.currentProcessRefs) ? latestProbe.currentProcessRefs.map(String).filter(Boolean) : [];
    const processStateKeys = latestProbe?.processState && typeof latestProbe.processState === 'object'
      ? Object.keys(latestProbe.processState)
      : [];
    const processDeriveKeys = latestProbe?.processDerives && typeof latestProbe.processDerives === 'object'
      ? Object.keys(latestProbe.processDerives)
      : [];
    if (!processSelection?.program || !processSelection?.event) {
      return {
        summary: currentProcessRefs.length
          ? ('No direct authored event is attached to this selected widget. The active surface still runs ' + currentProcessRefs.join(', ') + '.')
          : 'No direct authored event is attached to this selected widget.',
        rows: [
          ['Current Process Refs', currentProcessRefs.join(', ')],
          ['Trace Entries', processInfo?.traceLength ?? ''],
          ['Runtime Bridges', inspection.runtimeBridgeCount ?? latestProbe?.runtimeBridgeCount ?? ''],
          ['Bound Interactions', latestProbe?.boundInteractionCount ?? '']
        ].filter(([, value]) => value !== '' && value != null),
        ops,
        unavailableReason: latestProbe || processInfo ? '' : 'Runtime probe data has not arrived yet.'
      };
    }
    const processActive = currentProcessRefs.includes(processSelection.program);
    return {
      summary: 'Authored event ' + processSelection.event + ' in ' + processSelection.program
        + (processActive
          ? ' is active in the shared runtime probe for this surface.'
          : ' is declared for this widget, but is not currently the active process ref in the live probe.'),
      rows: [
        ['Frontend Program', processSelection.program],
        ['Frontend Event', processSelection.event],
        ['Process Active', processActive ? 'yes' : 'no'],
        ['Current Process Refs', currentProcessRefs.join(', ')],
        ['Trace Entries', processInfo?.traceLength ?? ''],
        ['In-Flight Steps', processInfo?.inFlightCount ?? ''],
        ['Runtime Bridges', inspection.runtimeBridgeCount ?? latestProbe?.runtimeBridgeCount ?? ''],
        ['Bound Interactions', latestProbe?.boundInteractionCount ?? ''],
        ['Route State Target', latestProbe?.routeStateTarget?.path || latestProbe?.routeStateTarget?.surfaceId || ''],
        ['Active Route Target', latestProbe?.activeRouteTarget?.path || latestProbe?.activeRouteTarget?.surfaceId || ''],
        ['State Keys', summarizeSurfaceInspectorKeyList(processStateKeys)],
        ['Derives', summarizeSurfaceInspectorKeyList(processDeriveKeys)]
      ].filter(([, value]) => value !== '' && value != null),
      ops,
      unavailableReason: latestProbe || processInfo ? '' : 'Runtime probe data has not arrived yet.'
    };
  };
  const selectedSurfaceBackendProgramSoul = () => {
    const knownPrograms = state.surfaceBootstrapBackendProgramsBySoul && typeof state.surfaceBootstrapBackendProgramsBySoul === 'object'
      ? state.surfaceBootstrapBackendProgramsBySoul
      : {};
    const souls = new Set();
    const addSoul = soul => {
      const normalized = String(soul || '').trim();
      if (!normalized || !knownPrograms[normalized]) return;
      souls.add(normalized);
    };
    const ownership = selectedSurfaceWidgetOwnership();
    (ownership?.chain || []).forEach(entry => addSoul(entry?.backendProgramSoul));
    const correlation = selectedSurfaceWidgetRuntimeCorrelation();
    (correlation?.ops || []).forEach(op => addSoul(op?.selectTarget));
    return souls.size === 1 ? [...souls][0] : '';
  };
  const selectedSurfaceBackendProgramAuthority = soul => {
    if (!soul) return { ok: false, reason: 'This selection does not currently resolve to one authored backend program soul.' };
    const actor = currentActor();
    if (!actor) return { ok: false, reason: 'Sign in to evolve authored backend program versions.' };
    const program = state.surfaceBootstrapBackendProgramsBySoul?.[soul] || null;
    if (!program) return { ok: false, reason: 'Authored backend program state is unavailable for ' + soul + '.' };
    if (program.context) {
      const mutationContexts = Array.isArray(state.authority?.mutationContexts) ? state.authority.mutationContexts : [];
      if (mutationContexts.includes(program.context)) return { ok: true, reason: '' };
      return { ok: false, reason: 'Read-only: backend program ' + soul + ' lives in context ' + program.context + ' and the current actor lacks direct authority there.' };
    }
    if (program.owner && program.owner === actor) return { ok: true, reason: '' };
    if (program.owner) return { ok: false, reason: 'Read-only: backend program ' + soul + ' is owned by ' + program.owner + '.' };
    return { ok: false, reason: 'Read-only: backend program ' + soul + ' is not directly mutable by the current actor.' };
  };
  const selectedSurfaceBackendEvolution = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    if (!state.surfaceInspectorWidgetsLoaded) {
      return {
        soul: '',
        authority: { ok: false, reason: '' },
        versionCandidates: [],
        rollbackAvailable: false,
        rollbackVersion: '',
        unavailableReason: 'Loading authored backend program state...'
      };
    }
    if (state.surfaceInspectorWidgetsError) {
      return {
        soul: '',
        authority: { ok: false, reason: '' },
        versionCandidates: [],
        rollbackAvailable: false,
        rollbackVersion: '',
        unavailableReason: 'Authored backend program state is unavailable right now.'
      };
    }
    const soul = selectedSurfaceBackendProgramSoul();
    if (!soul) {
      const correlation = selectedSurfaceWidgetRuntimeCorrelation();
      const backendTargets = [...new Set((correlation?.ops || []).map(op => String(op?.selectTarget || '').trim()).filter(Boolean))];
      return {
        soul: '',
        authority: { ok: false, reason: '' },
        versionCandidates: [],
        rollbackAvailable: false,
        rollbackVersion: '',
        unavailableReason: backendTargets.length > 1
          ? 'This selection lowers through multiple authored backend programs, so backend evolution is not exposed as one direct action here yet.'
          : 'This selection does not currently resolve to one authored backend program soul.'
      };
    }
    const versions = (state.surfaceBootstrapBackendProgramVersions || [])
      .filter(row => row?.soul === soul)
      .slice()
      .sort((left, right) =>
        Number(left?.index ?? 0) - Number(right?.index ?? 0)
        || String(left?.version || '').localeCompare(String(right?.version || ''))
      );
    const transitions = (state.surfaceBootstrapBackendProgramTransitions || []).filter(row => row?.soul === soul);
    const history = (state.surfaceBootstrapBackendProgramActivationHistory || []).filter(row => row?.soul === soul);
    const activeVersion = versions.find(row => row?.active === true)?.version || '';
    const rollbackVersion = previousDistinctVersionFromHistory(history, activeVersion);
    const versionCandidates = versions.map(row => {
      const transition = activeVersion && row.version !== activeVersion
        ? transitions.find(candidate => candidate?.from === activeVersion && candidate?.to === row.version) || null
        : null;
      return {
        soul,
        version: row.version,
        isActive: row.active === true,
        index: row.index ?? 0,
        transitionStrategy: transition?.strategy || null,
        migrationStatus: row.active === true
          ? 'compatible'
          : backendMigrationStatusFromStrategy(transition?.strategy || 'block')
      };
    });
    return {
      soul,
      authority: selectedSurfaceBackendProgramAuthority(soul),
      activeVersion,
      rollbackVersion,
      rollbackAvailable: Boolean(rollbackVersion),
      versionCandidates,
      history,
      unavailableReason: ''
    };
  };
  const ensureSurfaceInspectorGraph = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorGraph();
    if (state.surfaceInspectorGraphLoaded && state.surfaceInspectorGraphById) {
      return { ok: true, graph: state.surfaceInspectorGraph, byId: state.surfaceInspectorGraphById };
    }
    if (state.surfaceInspectorGraphPromise) return state.surfaceInspectorGraphPromise;
    state.surfaceInspectorGraphPromise = (async () => {
      const url = '/api/world-graph';
      const response = await fetch(resolveRuntimeUrl(url), requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorGraphError = body?.error || 'world graph request failed';
        state.surfaceInspectorGraphLoaded = true;
        return { ok: false, error: state.surfaceInspectorGraphError, status: response.status };
      }
      const graph = body.graph || body;
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
      state.surfaceInspectorGraph = graph;
      state.surfaceInspectorGraphById = Object.fromEntries(nodes.map(node => [node.id, node]));
      state.surfaceInspectorGraphLoaded = true;
      state.surfaceInspectorGraphError = null;
      return { ok: true, graph, byId: state.surfaceInspectorGraphById };
    })();
    try {
      return await state.surfaceInspectorGraphPromise;
    } finally {
      state.surfaceInspectorGraphPromise = null;
    }
  };
  const ensureSurfaceInspectorWidgets = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorWidgets();
    if (state.surfaceInspectorWidgetsLoaded && state.surfaceInspectorWidgetsById) {
      return { ok: true, widgets: state.surfaceInspectorWidgets, byId: state.surfaceInspectorWidgetsById };
    }
    if (state.surfaceInspectorWidgetsPromise) return state.surfaceInspectorWidgetsPromise;
    state.surfaceInspectorWidgetsPromise = (async () => {
      const url = '/api/bootstrap-state';
      const response = await fetch(resolveRuntimeUrl(url), requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorWidgetsError = body?.error || 'bootstrap widget state request failed';
        state.surfaceInspectorWidgetsLoaded = true;
        return { ok: false, error: state.surfaceInspectorWidgetsError, status: response.status };
      }
      const widgets = Array.isArray(body?.widgets) ? body.widgets : [];
      const identities = Array.isArray(body?.identities) ? body.identities : [];
      const contexts = Array.isArray(body?.contexts) ? body.contexts : [];
      const capabilityCatalog = Array.isArray(body?.capabilityCatalog) ? body.capabilityCatalog : [];
      const capabilityInstalls = Array.isArray(body?.capabilityInstalls) ? body.capabilityInstalls : [];
      state.surfaceInspectorWidgets = widgets;
      state.surfaceInspectorWidgetsById = Object.fromEntries(widgets.map(widget => [widget.id, widget]));
      state.surfaceBootstrapIdentities = identities;
      state.surfaceBootstrapIdentitiesById = Object.fromEntries(identities.map(identity => [identity.id, identity]));
      state.surfaceBootstrapContexts = contexts;
      state.surfaceBootstrapBackendPrograms = Array.isArray(body?.backendPrograms) ? body.backendPrograms : [];
      state.surfaceBootstrapBackendProgramsBySoul = Object.fromEntries(state.surfaceBootstrapBackendPrograms.map(program => [program.soul, program]));
      state.surfaceBootstrapBackendProgramVersions = Array.isArray(body?.backendProgramVersions) ? body.backendProgramVersions : [];
      state.surfaceBootstrapBackendProgramTransitions = Array.isArray(body?.backendProgramTransitions) ? body.backendProgramTransitions : [];
      state.surfaceBootstrapBackendProgramActivationHistory = Array.isArray(body?.backendProgramActivationHistory) ? body.backendProgramActivationHistory : [];
      state.surfaceBootstrapCapabilityCatalog = capabilityCatalog;
      state.surfaceBootstrapCapabilityCatalogById = Object.fromEntries(capabilityCatalog.map(row => [row.id, row]));
      state.surfaceBootstrapCapabilityInstalls = capabilityInstalls;
      state.authority = body?.authority && typeof body.authority === 'object' ? body.authority : state.authority;
      state.surfaceInspectorWidgetsLoaded = true;
      state.surfaceInspectorWidgetsError = null;
      return { ok: true, widgets, byId: state.surfaceInspectorWidgetsById };
    })();
    try {
      return await state.surfaceInspectorWidgetsPromise;
    } finally {
      state.surfaceInspectorWidgetsPromise = null;
    }
  };
  const ensureSurfaceInspectorRuntimeDiagnostics = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorRuntimeDiagnostics();
    if (state.surfaceInspectorRuntimeDiagnosticsLoaded && state.surfaceInspectorRuntimeDiagnostics) {
      return { ok: true, diagnostics: state.surfaceInspectorRuntimeDiagnostics };
    }
    if (state.surfaceInspectorRuntimeDiagnosticsPromise) return state.surfaceInspectorRuntimeDiagnosticsPromise;
    state.surfaceInspectorRuntimeDiagnosticsPromise = (async () => {
      try {
        const inspection = currentSurfaceRuntimeInspection();
        let diagnostics = null;
        if (!force && inspection?.serverDiagnostics && typeof inspection.serverDiagnostics === 'object') {
          diagnostics = inspection.serverDiagnostics;
        } else if (inspection && typeof inspection.refreshServerDiagnostics === 'function') {
          diagnostics = await inspection.refreshServerDiagnostics();
        } else {
          const url = '/api/runtime/diagnostics';
          const response = await fetch(url, requestOptions({}, { url }));
          diagnostics = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(diagnostics?.error || ('runtime diagnostics request failed (' + response.status + ')'));
          }
        }
        state.surfaceInspectorRuntimeDiagnostics = diagnostics && typeof diagnostics === 'object' ? diagnostics : null;
        state.surfaceInspectorRuntimeDiagnosticsLoaded = true;
        state.surfaceInspectorRuntimeDiagnosticsError = null;
        return { ok: true, diagnostics: state.surfaceInspectorRuntimeDiagnostics };
      } catch (error) {
        state.surfaceInspectorRuntimeDiagnostics = null;
        state.surfaceInspectorRuntimeDiagnosticsLoaded = true;
        state.surfaceInspectorRuntimeDiagnosticsError = error instanceof Error ? error.message : String(error);
        return { ok: false, error: state.surfaceInspectorRuntimeDiagnosticsError };
      }
    })();
    try {
      return await state.surfaceInspectorRuntimeDiagnosticsPromise;
    } finally {
      state.surfaceInspectorRuntimeDiagnosticsPromise = null;
    }
  };
  const selectedSurfaceWidgetOwnership = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const routeId = currentSurfaceRouteId();
    const surfaceProgramId = typeof config.surfaceProgramId === 'string' && config.surfaceProgramId.trim()
      ? config.surfaceProgramId.trim()
      : '';
    const inspection = currentSurfaceRuntimeInspection();
    const runtimeIds = Array.isArray(inspection?.runtimeIds) ? inspection.runtimeIds.map(String).filter(Boolean) : [];
    const browserRuntimeCapabilities = Array.isArray(inspection?.browserRuntimeCapabilities)
      ? inspection.browserRuntimeCapabilities.map(String).filter(Boolean)
      : [];
    const activeSurfaceId = typeof inspection?.activeSurfaceId === 'string' && inspection.activeSurfaceId.trim()
      ? inspection.activeSurfaceId.trim()
      : '';
    if (!routeId) {
      return {
        summary: 'Runtime ownership explains the current served route for this visible widget.',
        rows: [],
        chain: [],
        unavailableReason: 'Current page route metadata is unavailable for this selection.'
      };
    }
    const diagnostics = state.surfaceInspectorRuntimeDiagnostics;
    if (!diagnostics || typeof diagnostics !== 'object') {
      return {
        summary: 'Runtime ownership explains the current served route for this visible widget.',
        rows: [],
        chain: [],
        unavailableReason: state.surfaceInspectorRuntimeDiagnosticsError
          ? ('Runtime ownership metadata is unavailable right now. ' + state.surfaceInspectorRuntimeDiagnosticsError)
          : 'Loading runtime ownership metadata...'
      };
    }
    const mountedRoutes = Array.isArray(diagnostics.mountedRoutes) ? diagnostics.mountedRoutes : [];
    const mountedRoute = mountedRoutes.find(route => String(route?.id || '') === routeId) || null;
    if (!mountedRoute) {
      return {
        summary: 'Runtime ownership explains the current served route for this visible widget.',
        rows: [],
        chain: [],
        unavailableReason: 'Runtime diagnostics do not currently expose mounted route ' + routeId + '.'
      };
    }
    const governanceSummary = surfaceInspectorGovernanceSummary(mountedRoute);
    return {
      summary: [mountedRoute.ownerNote || ('Selected widget inherits runtime behavior from mounted route ' + routeId + '.'), governanceSummary]
        .filter(Boolean)
        .join(' '),
      rows: [
        ['Runtime Profile', diagnostics.activeProfile || ''],
        ['Server Runner', diagnostics.serverRunner?.id || mountedRoute.serverRunner || ''],
        ['Active Surface', activeSurfaceId || ''],
        ['Frontend Program', surfaceProgramId || ''],
        ['Runtime IDs', runtimeIds.join(', ')],
        ['Browser Capabilities', browserRuntimeCapabilities.join(', ')],
        ['Active Plugins', Array.isArray(diagnostics.plugins?.activePluginIds) ? diagnostics.plugins.activePluginIds.join(', ') : ''],
        ['Route', mountedRoute.id || routeId],
        ['Path', mountedRoute.path || ''],
        ['Handler', mountedRoute.handler || ''],
        ['Owner Class', mountedRoute.ownerClass || ''],
        ['Plugin', mountedRoute.ownerPluginId || ''],
        ['Bundle', mountedRoute.ownerBundleId || ''],
        ['Handler Set', mountedRoute.ownerHandlerSetId || (Array.isArray(mountedRoute.ownerHandlerSetIds) ? mountedRoute.ownerHandlerSetIds.join(', ') : '')],
        ['Backend Program', mountedRoute.ownerBackendProgramSoul || ''],
        ['Serves', mountedRoute.serves || ''],
        ['Operation Semantics', mountedRoute.operationSemantics || ''],
        ['Governance Mode', mountedRoute.governanceMode || ''],
        ['Authority Mechanism', mountedRoute.authorityMechanism || ''],
        ['Shared Authority Path', typeof mountedRoute.sharedAuthorityPath === 'boolean' ? (mountedRoute.sharedAuthorityPath ? 'yes' : 'no') : ''],
        ['Workflow Role', mountedRoute.workflowRole || '']
      ].filter(([, value]) => value),
      chain: Array.isArray(mountedRoute.ownerChain) ? mountedRoute.ownerChain : [],
      unavailableReason: ''
    };
  };
  const selectedSurfaceWidgetRuntimeComposition = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const diagnostics = state.surfaceInspectorRuntimeDiagnostics;
    if (!diagnostics || typeof diagnostics !== 'object') {
      return {
        summary: '',
        rows: [],
        unavailableReason: state.surfaceInspectorRuntimeDiagnosticsError
          ? ('Runtime composition metadata is unavailable right now. ' + state.surfaceInspectorRuntimeDiagnosticsError)
          : 'Loading runtime composition metadata...'
      };
    }
    const composition = diagnostics.composition && typeof diagnostics.composition === 'object'
      ? diagnostics.composition
      : null;
    if (!composition) {
      return {
        summary: '',
        rows: [],
        unavailableReason: 'Runtime diagnostics do not currently expose active composition metadata.'
      };
    }
    const notes = Array.isArray(composition.notes) ? composition.notes.map(String).filter(Boolean) : [];
    const activeRunner = composition.activeRunnerId
      ? (composition.activeRunnerId + (composition.activeRunnerSource ? ' (' + composition.activeRunnerSource + ')' : ''))
      : (composition.activeRunnerSource || '');
    return {
      summary: composition.explanation
        ? String(composition.explanation)
        : 'Shared runtime diagnostics explain why this page is active through the current runtime composition.',
      rows: [
        ['Story', composition.storyId || ''],
        ['Startup Mode', composition.startupMode || ''],
        ['Active Runner', activeRunner],
        ['Runner Source', composition.activeRunnerSource || ''],
        ['Plugin Source', composition.activePluginSource || ''],
        ['Uses Authored Runner', typeof composition.usesAuthoredServerRunner === 'boolean' ? (composition.usesAuthoredServerRunner ? 'yes' : 'no') : ''],
        ['Uses Authored Plugin Installs', typeof composition.usesAuthoredRuntimePluginInstalls === 'boolean' ? (composition.usesAuthoredRuntimePluginInstalls ? 'yes' : 'no') : ''],
        ['Notes', notes.join(' ')]
      ].filter(([, value]) => value),
      unavailableReason: ''
    };
  };
  const selectedSurfaceWidgetScope = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const authoredWidget = selectedSurfaceWidgetAuthored();
    const selectedNode = selectedSurfaceWidgetNode();
    const inspection = currentSurfaceRuntimeInspection();
    const activeSurfaceId = typeof inspection?.activeSurfaceId === 'string' && inspection.activeSurfaceId.trim()
      ? inspection.activeSurfaceId.trim()
      : '';
    const latestProbe = inspection?.latestProbe && typeof inspection.latestProbe === 'object'
      ? inspection.latestProbe
      : null;
    const mountedCapabilitiesBySurface = Array.isArray(latestProbe?.mountedCapabilitiesBySurface)
      ? latestProbe.mountedCapabilitiesBySurface
      : [];
    const mountedSurface = activeSurfaceId
      ? mountedCapabilitiesBySurface.find(entry => String(entry?.surfaceId || '') === activeSurfaceId) || null
      : null;
    const capabilityIds = [
      ...(Array.isArray(mountedSurface?.capabilities) ? mountedSurface.capabilities : []),
      ...(Array.isArray(inspection?.browserRuntimeCapabilities) ? inspection.browserRuntimeCapabilities : []),
      ...(Array.isArray(browserRuntimeCapabilities) ? browserRuntimeCapabilities : [])
    ]
      .map(String)
      .map(value => value.trim())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    const contextId = typeof authoredWidget?.context === 'string' && authoredWidget.context.trim()
      ? authoredWidget.context.trim()
      : (typeof currentSurfaceContext === 'string' && currentSurfaceContext.trim()
          ? currentSurfaceContext.trim()
          : (typeof selectedNode?.context === 'string' && selectedNode.context.trim()
              ? selectedNode.context.trim()
              : ''));
    const capabilityCount = capabilityIds.length;
    if (!contextId && !activeSurfaceId && !capabilityCount) {
      return {
        summary: '',
        rows: [],
        contextId: '',
        capabilities: [],
        unavailableReason: 'Context and mounted capability metadata are not available for this selection yet.'
      };
    }
    return {
      summary: [
        contextId ? ('This widget currently lowers inside context ' + contextId + '.') : '',
        capabilityCount
          ? ('The active live surface exposes ' + capabilityCount + ' mounted capability' + (capabilityCount === 1 ? '' : 'ies') + ' for local behavior inspection.')
          : 'No mounted capability metadata is currently exposed for this surface.'
      ].filter(Boolean).join(' '),
      rows: [
        ['Context', contextId],
        ['Active Surface', activeSurfaceId],
        ['Mounted Capabilities', capabilityIds.join(', ')]
      ].filter(([, value]) => value),
      contextId,
      capabilities: capabilityIds.map(id => ({ id, label: id })),
      unavailableReason: ''
    };
  };
  const selectedSurfaceWidgetCapabilityAuthority = (contextId = '') => {
    if (!contextId) {
      return {
        mode: 'signin-required',
        reason: 'This selection does not currently expose a concrete context target for authored capability installs.'
      };
    }
    const actor = currentActor();
    if (!actor) {
      return {
        mode: 'signin-required',
        reason: 'Sign in to install or remove authored capabilities for this context.'
      };
    }
    const mutationContexts = Array.isArray(state.authority?.mutationContexts) ? state.authority.mutationContexts : [];
    if (mutationContexts.includes(contextId)) return { mode: 'direct', reason: '' };
    return {
      mode: 'proposal',
      reason: 'Read-only: this context is stewarded elsewhere. Submit still goes through the shared capability runtime and may create a witnessed proposal.'
    };
  };
  const selectedSurfaceWidgetCapabilities = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const scope = selectedSurfaceWidgetScope();
    const contextId = typeof scope?.contextId === 'string' ? scope.contextId.trim() : '';
    if (!state.surfaceInspectorWidgetsLoaded) {
      return {
        summary: '',
        rows: [],
        targetId: contextId,
        targetKind: 'context',
        authority: selectedSurfaceWidgetCapabilityAuthority(contextId),
        installed: [],
        available: [],
        unavailableReason: 'Loading authored capability state...'
      };
    }
    if (state.surfaceInspectorWidgetsError) {
      return {
        summary: '',
        rows: [],
        targetId: contextId,
        targetKind: 'context',
        authority: selectedSurfaceWidgetCapabilityAuthority(contextId),
        installed: [],
        available: [],
        unavailableReason: 'Authored capability state is unavailable right now.'
      };
    }
    if (!contextId) {
      return {
        summary: 'Authored capability installs can only be mutated against a concrete context target.',
        rows: [],
        targetId: '',
        targetKind: 'context',
        authority: selectedSurfaceWidgetCapabilityAuthority(''),
        installed: [],
        available: [],
        unavailableReason: 'This selection does not currently resolve to a context-backed capability target.'
      };
    }
    const catalog = Array.isArray(state.surfaceBootstrapCapabilityCatalog) ? state.surfaceBootstrapCapabilityCatalog : [];
    const capabilityById = state.surfaceBootstrapCapabilityCatalogById && typeof state.surfaceBootstrapCapabilityCatalogById === 'object'
      ? state.surfaceBootstrapCapabilityCatalogById
      : {};
    const installs = Array.isArray(state.surfaceBootstrapCapabilityInstalls) ? state.surfaceBootstrapCapabilityInstalls : [];
    const installedRows = installs
      .filter(row => row?.targetKind === 'context' && row?.target === contextId && row?.capability)
      .map(row => {
        const capability = capabilityById[row.capability] || null;
        const label = capability?.label || row.capability;
        const version = capability?.version ? (' [' + capability.version + ']') : '';
        const placement = Array.isArray(capability?.placement) ? capability.placement.filter(Boolean).join(', ') : '';
        const sourceState = capability?.capabilitySourceState ? ('source ' + capability.capabilitySourceState) : '';
        return {
          id: row.capability,
          label: label + version,
          summary: [placement ? ('placements: ' + placement) : '', sourceState].filter(Boolean).join(' / ')
        };
      })
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    const installedIds = new Set(installedRows.map(row => row.id));
    const availableRows = catalog
      .filter(row => row && row.id && !installedIds.has(row.id))
      .filter(row => {
        const placement = Array.isArray(row.placement) ? row.placement.map(String).filter(Boolean) : [];
        return placement.length === 0 || placement.includes('context');
      })
      .map(row => {
        const version = row.version ? (' [' + row.version + ']') : '';
        const placement = Array.isArray(row.placement) ? row.placement.filter(Boolean).join(', ') : '';
        const sourceState = row.capabilitySourceState ? ('source ' + row.capabilitySourceState) : '';
        return {
          id: row.id,
          label: (row.label || row.id) + version,
          summary: [placement ? ('placements: ' + placement) : '', sourceState].filter(Boolean).join(' / ')
        };
      })
      .sort((left, right) => String(left.id).localeCompare(String(right.id)));
    return {
      summary: 'These rows are explicit authored capability installs for context ' + contextId + '. Submit uses the shared capability runtime instead of a client-only shortcut.',
      rows: [
        ['Context', contextId],
        ['Installed', installedRows.map(row => row.id).join(', ')],
        ['Available', availableRows.map(row => row.id).join(', ')]
      ].filter(([, value]) => value),
      targetId: contextId,
      targetKind: 'context',
      authority: selectedSurfaceWidgetCapabilityAuthority(contextId),
      installed: installedRows,
      available: availableRows,
      unavailableReason: ''
    };
  };
  const selectedSurfaceWidgetChildCreation = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return null;
    const authoredWidget = selectedSurfaceWidgetAuthored();
    const versionRows = selectedSurfaceWidgetVersions();
    if (!state.surfaceInspectorWidgetsLoaded) {
      return {
        authoredWidget,
        versionRows,
        kindOptions: surfaceInspectorChildKindOptions,
        unavailableReason: ''
      };
    }
    if (state.surfaceInspectorWidgetsError) {
      return {
        authoredWidget,
        versionRows,
        kindOptions: surfaceInspectorChildKindOptions,
        unavailableReason: ''
      };
    }
    if (!authoredWidget) {
      return {
        authoredWidget: null,
        versionRows,
        kindOptions: surfaceInspectorChildKindOptions,
        unavailableReason: ''
      };
    }
    if (!surfaceInspectorChildParentKinds.has(authoredWidget.kind)) {
      return {
        authoredWidget,
        versionRows,
        kindOptions: surfaceInspectorChildKindOptions,
        unavailableReason: 'Child widget creation is only exposed for authored container widgets whose rendered children stay visible on the current page. ' + widgetId + ' is kind ' + authoredWidget.kind + '.'
      };
    }
    return {
      authoredWidget,
      versionRows,
      kindOptions: surfaceInspectorChildKindOptions,
      unavailableReason: ''
    };
  };
  const selectSurfaceInspectorWidget = async (widgetId, { refreshGraph = false, statusMessage = null } = {}) => {
    state.surfaceInspectorOpen = true;
    state.surfaceInspectorSelectedId = widgetId || '';
    state.surfaceInspectorMenu = widgetId && state.surfaceInspectorMenu
      ? { ...state.surfaceInspectorMenu, widgetId }
      : null;
    applySurfaceInspectorHighlight(widgetId || '');
    if (statusMessage) setSurfaceInspectorStatus(statusMessage, 'ok');
    if (!widgetId) {
      updateSurfaceInspectorUi();
      return { ok: true, widgetId: '' };
    }
    const [loaded, authored] = await Promise.all([
      ensureSurfaceInspectorGraph({ force: refreshGraph }),
      ensureSurfaceInspectorWidgets({ force: refreshGraph }),
      ensureSurfaceInspectorRuntimeDiagnostics({ force: refreshGraph })
    ]);
    if (!loaded.ok) {
      setSurfaceInspectorStatus(loaded.error || 'Failed to load world graph for inspector.', 'error');
    } else if (!authored.ok) {
      setSurfaceInspectorStatus(authored.error || 'Failed to load authored widget state for inspector.', 'error');
    } else if (state.surfaceInspectorRuntimeDiagnosticsError && !state.surfaceInspectorRuntimeDiagnostics) {
      setSurfaceInspectorStatus('Runtime ownership metadata is unavailable right now.', 'error');
    } else if (!state.surfaceInspectorGraphById?.[widgetId] && !statusMessage) {
      setSurfaceInspectorStatus('Selected widget is not yet visible in the world graph.', 'error');
    } else if (!statusMessage) {
      setSurfaceInspectorStatus('Selected ' + widgetId + '.', 'ok');
    }
    updateSurfaceInspectorUi();
    return { ok: true, widgetId };
  };
  const closeSurfaceInspectorMenu = () => {
    if (!state.surfaceInspectorMenu) return;
    state.surfaceInspectorMenu = null;
    updateSurfaceInspectorUi();
  };
  const surfaceInspectorTagLabel = element => {
    const tag = String(element?.tagName || '').toLowerCase();
    return tag ? '<' + tag + '>' : '';
  };
  const patchSurfaceWidget = async ({ id, patch }) => {
    const url = '/api/widgets/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const patchSurfaceIdentity = async ({ id, patch }) => {
    const url = '/api/identities/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const proposeSurfaceWidgetPatch = async ({ id, patch, reason = '' }) => {
    const url = '/api/widgets/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(patch || {}),
        reason: String(reason || '').trim()
      })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const proposeSurfaceWidgetVersionAction = async ({ targetProcess, soul, version = '', reason = '' }) => {
    const url = targetProcess === 'widgetVersion.rollback'
      ? '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback'
      : '/api/widget-versions/' + encodeURIComponent(soul) + '/activate';
    const bodyPayload = targetProcess === 'widgetVersion.activate'
      ? { version, reason: String(reason || '').trim() }
      : { reason: String(reason || '').trim() };
    const response = await fetch(url, requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const createSurfaceWidget = async body => {
    const url = '/api/widgets';
    const response = await fetch(url, requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {})
    }, { url }));
    const bodyJson = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body: bodyJson };
  };
  const installSurfaceCapability = async ({ capability, target, targetKind = 'context' }) => {
    const url = '/api/capability-installs';
    const response = await fetch(url, requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability, target, targetKind })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const removeSurfaceCapability = async ({ capability, target, targetKind = 'context' }) => {
    const url = '/api/capability-installs';
    const response = await fetch(url, requestOptions({
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ capability, target, targetKind })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const createAppPreviewSession = async () => {
    const url = '/api/runtime/app-preview-sessions';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST'
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const patchAppPreviewSessionCandidates = async ({ sessionId, candidates }) => {
    const url = '/api/runtime/app-preview-sessions/' + encodeURIComponent(sessionId) + '/candidates';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: Array.isArray(candidates) ? candidates : [] })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const deleteAppPreviewSession = async ({ sessionId }) => {
    const url = '/api/runtime/app-preview-sessions/' + encodeURIComponent(sessionId);
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'DELETE'
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const replaceSurfaceWidget = async ({ id, input }) => {
    const url = '/api/widgets/' + encodeURIComponent(id) + '/replace';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const rollbackSurfaceWidgetReplace = async ({ id, reason = '' }) => {
    const url = '/api/widgets/' + encodeURIComponent(id) + '/replace/rollback';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const evolutionReplaceFieldDefs = [
    { name: 'text', label: 'Text', control: 'textarea' },
    { name: 'title', label: 'Title', control: 'text' },
    { name: 'class', label: 'Class', control: 'text' },
    { name: 'hidden', label: 'Hidden', control: 'checkbox' },
    { name: 'role', label: 'Role', control: 'text' },
    { name: 'href', label: 'Href', control: 'text' },
    { name: 'name', label: 'Name', control: 'text' },
    { name: 'placeholder', label: 'Placeholder', control: 'text' },
    { name: 'autocomplete', label: 'Autocomplete', control: 'text' },
    { name: 'type', label: 'Type', control: 'text' },
    { name: 'action', label: 'Action', control: 'text' },
    { name: 'label', label: 'Label', control: 'text' },
    { name: 'valueType', label: 'Value Type', control: 'text' },
    { name: 'eventSoul', label: 'Event Soul', control: 'text' },
    { name: 'eventVersion', label: 'Event Version', control: 'text' },
    { name: 'dataId', label: 'Data Id', control: 'text', propKey: 'data-id' },
    { name: 'dataDone', label: 'Data Done', control: 'text', propKey: 'data-done' },
    { name: 'guidanceTarget', label: 'Guidance Target', control: 'text', propKey: 'data-guidance-target' },
    { name: 'template', label: 'Template', control: 'checkbox' },
    { name: 'level', label: 'Level', control: 'number' }
  ];
  const readSurfaceInspectorReplaceInput = form => {
    const formData = new FormData(form);
    const input = {
      kind: String(formData.get('kind') ?? '').trim()
    };
    for (const field of evolutionReplaceFieldDefs) {
      if (field.control === 'checkbox') {
        input[field.name] = form.querySelector('[name="' + CSS.escape(field.name) + '"]')?.checked === true;
        continue;
      }
      const value = String(formData.get(field.name) ?? '');
      if (field.control === 'number') {
        input[field.name] = value === '' ? '' : Number(value);
        continue;
      }
      input[field.name] = value;
    }
    return input;
  };
  const renderSurfaceInspectorEvolution = () => {
    const widgetId = selectedSurfaceWidgetId();
    const authoredWidget = selectedSurfaceWidgetAuthored();
    const evolution = selectedSurfaceWidgetEvolution();
    if (!widgetId || !authoredWidget || !evolution) return '';
    const authority = selectedSurfaceWidgetEditAuthority();
    const currentActorPresent = Boolean(currentActor());
    const previewSessionId = currentPreviewSessionId();
    const evolutionDraft = state.surfaceInspectorEvolutionDraft?.widgetId === widgetId
      ? state.surfaceInspectorEvolutionDraft
      : null;
    const replaceFieldsHtml = evolutionReplaceFieldDefs.map(field => {
      const propKey = field.propKey || field.name;
      const value = Object.prototype.hasOwnProperty.call(evolutionDraft?.input || {}, field.name)
        ? evolutionDraft.input[field.name]
        : authoredWidget?.props?.[propKey];
      if (field.control === 'checkbox') {
        return '<label class="surface-field"><span>' + escapeHtml(field.label) + '</span><input name="' + escapeHtml(field.name) + '" type="checkbox"' + (value === true ? ' checked' : '') + ' /></label>';
      }
      if (field.control === 'textarea') {
        return '<label class="surface-field"><span>' + escapeHtml(field.label) + '</span><textarea name="' + escapeHtml(field.name) + '" rows="3">' + escapeHtml(String(value ?? '')) + '</textarea></label>';
      }
      return '<label class="surface-field"><span>' + escapeHtml(field.label) + '</span><input name="' + escapeHtml(field.name) + '"' + (field.control === 'number' ? ' type="number"' : '') + ' value="' + escapeHtml(String(value ?? '')) + '" /></label>';
    }).join('');
    if (evolution.mode === 'versioned') {
      const rows = Array.isArray(evolution.versionCandidates) ? evolution.versionCandidates.filter(row => !row.isActive) : [];
      if (!rows.length) return '<section><div class="surface-inspector-meta">Replace / Upgrade</div><div class="surface-inspector-summary">No authored upgrade targets are available for this versioned widget yet.</div></section>';
      const selectedVersion = typeof evolutionDraft?.input?.version === 'string' && evolutionDraft.input.version
        ? evolutionDraft.input.version
        : (rows[0]?.version || '');
      const options = rows.map(row => '<option value="' + escapeHtml(row.version || '') + '"' + (row.version === selectedVersion ? ' selected' : '') + '>' + escapeHtml((row.version || '') + (row.migrationStatus ? ' [' + row.migrationStatus + ']' : '')) + '</option>').join('');
      const selected = rows.find(row => row.version === selectedVersion) || rows[0] || null;
      const blocked = selected && (selected.migrationStatus === 'blocked' || selected.migrationStatus === 'forkRequired');
      return '<section><div class="surface-inspector-meta">Replace / Upgrade</div>'
        + (previewSessionId ? '<div class="surface-inspector-summary">Rendering from preview session ' + escapeHtml(previewSessionId) + '.</div>' : '')
        + '<form class="surface-form" data-surface-inspector-evolution-form data-surface-inspector-evolution-mode="versioned" data-widget-id="' + escapeHtml(widgetId) + '" data-widget-soul="' + escapeHtml(widgetId) + '">'
        + '<label class="surface-field"><span>Target Version</span><select name="version">' + options + '</select></label>'
        + (currentActorPresent && !authority.ok ? '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this version change?" /></label>' : '')
        + '<div class="surface-inspector-summary">' + escapeHtml(blocked ? 'This authored transition is deferred and cannot be applied directly from the inspector.' : 'Preview or apply the authored version transition through shared widget-version rules.') + '</div>'
        + '<div class="surface-actions-compact">'
        + (!blocked ? '<button type="submit" data-surface-inspector-evolution-preview>Preview Upgrade</button>' : '')
        + (!blocked ? '<button type="button" data-surface-inspector-evolution-apply>' + escapeHtml(authority.ok ? 'Apply Upgrade' : 'Propose Upgrade') + '</button>' : '')
        + (previewSessionId ? '<button type="button" data-surface-inspector-evolution-discard>Discard Preview</button>' : '')
        + '</div>'
        + '</form>'
        + (selectedSurfaceWidgetVersionState()?.rollbackAvailable
          ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-evolution-version-rollback="' + escapeHtml(widgetId) + '">' + escapeHtml(authority.ok ? ('Rollback To ' + (selectedSurfaceWidgetVersionState()?.rollbackVersion || 'previous')) : ('Propose Rollback To ' + (selectedSurfaceWidgetVersionState()?.rollbackVersion || 'previous'))) + '</button></div>'
          : '')
        + '</section>';
    }
    const kindOptions = Array.isArray(evolution.kindOptions) ? evolution.kindOptions : [];
    const selectedKind = typeof evolutionDraft?.input?.kind === 'string' && evolutionDraft.input.kind
      ? evolutionDraft.input.kind
      : authoredWidget.kind;
    return '<section><div class="surface-inspector-meta">Replace / Upgrade</div>'
      + (previewSessionId ? '<div class="surface-inspector-summary">Rendering from preview session ' + escapeHtml(previewSessionId) + '.</div>' : '')
      + '<form class="surface-form" data-surface-inspector-evolution-form data-surface-inspector-evolution-mode="replace" data-widget-id="' + escapeHtml(widgetId) + '">'
      + '<label class="surface-field"><span>Replacement Kind</span><select name="kind">' + kindOptions.map(kind => '<option value="' + escapeHtml(kind) + '"' + (kind === selectedKind ? ' selected' : '') + '>' + escapeHtml(kind) + '</option>').join('') + '</select></label>'
      + replaceFieldsHtml
      + (currentActorPresent && !authority.ok ? '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this shared widget change?" /></label>' : '')
      + '<div class="surface-actions-compact"><button type="submit" data-surface-inspector-evolution-preview>Preview Replace</button><button type="button" data-surface-inspector-evolution-apply>' + escapeHtml(authority.ok ? 'Apply Replace' : 'Propose Replace') + '</button>' + (previewSessionId ? '<button type="button" data-surface-inspector-evolution-discard>Discard Preview</button>' : '') + '</div>'
      + '</form>'
      + (evolution.rollbackAvailable
        ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-evolution-replace-rollback="' + escapeHtml(widgetId) + '">' + escapeHtml(authority.ok ? 'Rollback Replace' : 'Propose Rollback Replace') + '</button></div>'
        : '')
      + (evolution.latestReplaceWitness?.migrationStatus
        ? '<div class="surface-inspector-summary">Latest replace status: ' + escapeHtml(evolution.latestReplaceWitness.migrationStatus) + '.</div>'
        : '')
      + '</section>';
  };
  const renderSurfaceInspectorBackendEvolution = () => {
    const widgetId = selectedSurfaceWidgetId();
    const evolution = selectedSurfaceBackendEvolution();
    if (!widgetId || !evolution?.soul) return '';
    if (evolution.unavailableReason) {
      return '<section><div class="surface-inspector-meta">Backend Evolution</div><div class="surface-inspector-summary">' + escapeHtml(evolution.unavailableReason) + '</div></section>';
    }
    const authority = evolution.authority || { ok: false, reason: '' };
    const currentActorPresent = Boolean(currentActor());
    const previewSessionId = currentPreviewSessionId();
    const rows = Array.isArray(evolution.versionCandidates) ? evolution.versionCandidates.filter(row => !row.isActive) : [];
    if (!rows.length) {
      return '<section><div class="surface-inspector-meta">Backend Evolution</div><div class="surface-inspector-summary">No authored backend version targets are available for ' + escapeHtml(evolution.soul) + ' yet.</div></section>';
    }
    const draft = state.surfaceInspectorBackendEvolutionDraft?.soul === evolution.soul
      ? state.surfaceInspectorBackendEvolutionDraft
      : null;
    const selectedVersion = typeof draft?.version === 'string' && draft.version
      ? draft.version
      : (rows[0]?.version || '');
    const selected = rows.find(row => row.version === selectedVersion) || rows[0] || null;
    const blocked = selected && (selected.migrationStatus === 'blocked' || selected.migrationStatus === 'forkRequired');
    return '<section><div class="surface-inspector-meta">Backend Evolution</div>'
      + (previewSessionId ? '<div class="surface-inspector-summary">Rendering from preview session ' + escapeHtml(previewSessionId) + '.</div>' : '')
      + '<form class="surface-form" data-surface-inspector-backend-evolution-form data-widget-id="' + escapeHtml(widgetId) + '" data-backend-soul="' + escapeHtml(evolution.soul) + '">'
      + '<label class="surface-field"><span>Backend Program</span><input value="' + escapeHtml(evolution.soul) + '" disabled /></label>'
      + '<label class="surface-field"><span>Target Version</span><select name="version">' + rows.map(row =>
          '<option value="' + escapeHtml(row.version || '') + '"' + (row.version === selectedVersion ? ' selected' : '') + '>' + escapeHtml((row.version || '') + (row.migrationStatus ? ' [' + row.migrationStatus + ']' : '')) + '</option>'
        ).join('') + '</select></label>'
      + '<div class="surface-inspector-summary">Current active version: ' + escapeHtml(evolution.activeVersion || 'none') + '.</div>'
      + (selected?.transitionStrategy ? '<div class="surface-inspector-summary">Authored transition strategy: ' + escapeHtml(selected.transitionStrategy) + '.</div>' : '')
      + (selected?.migrationStatus ? '<div class="surface-inspector-summary">Migration status: ' + escapeHtml(selected.migrationStatus) + '.</div>' : '')
      + (currentActorPresent && !authority.ok ? '<label class="surface-field"><span>Reason</span><input name="reason" placeholder="Why should this backend version change?" /></label>' : '')
      + '<div class="surface-inspector-summary">' + escapeHtml(blocked
        ? 'This authored backend transition is deferred and cannot be applied directly from the live inspector.'
        : 'Preview or apply the authored backend transition through shared backend-version rules.') + '</div>'
      + '<div class="surface-actions-compact">'
      + (!blocked ? '<button type="submit" data-surface-inspector-backend-evolution-preview>Preview Backend Upgrade</button>' : '')
      + (!blocked ? '<button type="button" data-surface-inspector-backend-evolution-apply>' + escapeHtml(authority.ok ? 'Apply Backend Upgrade' : 'Propose Backend Upgrade') + '</button>' : '')
      + (previewSessionId ? '<button type="button" data-surface-inspector-backend-evolution-discard>Discard Preview</button>' : '')
      + '</div>'
      + '</form>'
      + (evolution.rollbackAvailable
        ? '<div class="surface-actions-compact"><button type="button" data-surface-inspector-backend-evolution-rollback="' + escapeHtml(evolution.soul) + '">' + escapeHtml(authority.ok ? ('Rollback Backend To ' + (evolution.rollbackVersion || 'previous')) : ('Propose Rollback Backend To ' + (evolution.rollbackVersion || 'previous'))) + '</button></div>'
        : '')
      + (!authority.ok && currentActorPresent
        ? '<div class="surface-inspector-summary">' + escapeHtml(authority.reason || 'Direct backend version changes are blocked here, but you can create a real proposal for later approval.') + '</div>'
        : '')
      + '</section>';
  };
  const renderSurfaceInspectorEditor = () => renderSurfaceInspectorEditorView({
    widgetId: selectedSurfaceWidgetId(),
    authoredWidget: selectedSurfaceWidgetAuthored(),
    versionRows: selectedSurfaceWidgetVersions(),
    widgetsLoaded: state.surfaceInspectorWidgetsLoaded,
    widgetsError: state.surfaceInspectorWidgetsError,
    authority: selectedSurfaceWidgetEditAuthority(),
    currentActorPresent: Boolean(currentActor()),
    escapeHtml
  });
  const renderSurfaceInspectorChildCreate = () => {
    const creation = selectedSurfaceWidgetChildCreation();
    return renderSurfaceInspectorChildCreateView({
      widgetId: selectedSurfaceWidgetId(),
      authoredWidget: creation?.authoredWidget ?? selectedSurfaceWidgetAuthored(),
      versionRows: creation?.versionRows ?? selectedSurfaceWidgetVersions(),
      widgetsLoaded: state.surfaceInspectorWidgetsLoaded,
      widgetsError: state.surfaceInspectorWidgetsError,
      authority: selectedSurfaceWidgetEditAuthority(),
      currentActorPresent: Boolean(currentActor()),
      kindOptions: creation?.kindOptions ?? surfaceInspectorChildKindOptions,
      unavailableReason: creation?.unavailableReason || '',
      escapeHtml
    });
  };
  const renderSurfaceInspectorPanel = () => {
    const widgetId = selectedSurfaceWidgetId();
    const selectedNode = selectedSurfaceWidgetNode();
    const selectedElement = selectedSurfaceWidgetElement();
    const selectedSource = selectedSurfaceWidgetSource();
    const ownership = selectedSurfaceWidgetOwnership();
    const scope = selectedSurfaceWidgetScope();
    const capabilities = selectedSurfaceWidgetCapabilities();
    const composition = selectedSurfaceWidgetRuntimeComposition();
    const runtimeCorrelation = selectedSurfaceWidgetRuntimeCorrelation();
    const versionState = selectedSurfaceWidgetVersionState();
    const versionRows = selectedSurfaceWidgetVersions();
    const versionAuthority = versionRows.length ? selectedSurfaceWidgetEditAuthority() : { ok: false, reason: '' };
    const processSelection = selectedSurfaceInspectorProcessSelection();
    return renderSurfaceInspectorPanelView({
      liveSurfaceInspectable,
      surfaceInspectorOpen: state.surfaceInspectorOpen === true,
      widgetId,
      selectedRouteId: currentSurfaceRouteId(),
      selectedProgramId: typeof config.surfaceProgramId === 'string' && config.surfaceProgramId.trim() ? config.surfaceProgramId.trim() : '',
      selectedNodeKind: selectedNode?.kind || selectedElement?.getAttribute?.('data-kind') || surfaceInspectorTagLabel(selectedElement) || 'widget',
      selectedNodeContext: selectedNode?.context || '',
      selectedElementTag: surfaceInspectorTagLabel(selectedElement),
      selectedSourceFile: selectedSource?.file || '',
      processEvent: processSelection?.event || '',
      versionState,
      versionRows,
      versionAuthority,
      currentActorPresent: Boolean(currentActor()),
      statusMessage: state.surfaceInspectorStatus?.message || '',
      statusLevel: state.surfaceInspectorStatus?.level || 'ok',
      graphError: state.surfaceInspectorGraphError || '',
      ownershipSummary: ownership?.summary || '',
      ownershipRows: ownership?.rows || [],
      ownershipChain: ownership?.chain || [],
      ownershipUnavailableReason: ownership?.unavailableReason || '',
      scopeSummary: scope?.summary || '',
      scopeRows: scope?.rows || [],
      scopeContextId: scope?.contextId || '',
      scopeCapabilities: scope?.capabilities || [],
      scopeUnavailableReason: scope?.unavailableReason || '',
      capabilitySummary: capabilities?.summary || '',
      capabilityRows: capabilities?.rows || [],
      capabilityTargetId: capabilities?.targetId || '',
      capabilityTargetKind: capabilities?.targetKind || 'context',
      capabilityAuthority: capabilities?.authority || { mode: 'signin-required', reason: '' },
      installedCapabilities: capabilities?.installed || [],
      availableCapabilities: capabilities?.available || [],
      capabilityUnavailableReason: capabilities?.unavailableReason || '',
      compositionSummary: composition?.summary || '',
      compositionRows: composition?.rows || [],
      compositionUnavailableReason: composition?.unavailableReason || '',
      runtimeCorrelationSummary: runtimeCorrelation?.summary || '',
      runtimeCorrelationRows: runtimeCorrelation?.rows || [],
      runtimeCorrelationOps: runtimeCorrelation?.ops || [],
      runtimeCorrelationUnavailableReason: runtimeCorrelation?.unavailableReason || '',
      backendEvolutionHtml: renderSurfaceInspectorBackendEvolution(),
      evolutionHtml: renderSurfaceInspectorEvolution(),
      childCreateHtml: renderSurfaceInspectorChildCreate(),
      editorHtml: renderSurfaceInspectorEditor(),
      escapeHtml
    });
  };
  const clearSurfaceInspectorPreview = async ({ widgetId, statusMessage = 'Discarded preview.' } = {}) => {
    const previewSessionId = currentPreviewSessionId();
    if (previewSessionId) await deleteAppPreviewSession({ sessionId: previewSessionId });
    state.surfaceInspectorEvolutionDraft = null;
    state.surfaceInspectorBackendEvolutionDraft = null;
    setQueryParam({ name: 'previewSessionId', value: '' });
    invalidateSurfaceInspectorGraph();
    invalidateSurfaceInspectorWidgets();
    await refreshProjection();
    if (widgetId) {
      await selectSurfaceInspectorWidget(widgetId, {
        refreshGraph: true,
        statusMessage
      });
    }
  };
  const ensureSurfaceInspectorPreviewSession = async () => {
    const existing = currentPreviewSessionId();
    if (existing) return existing;
    const created = await createAppPreviewSession();
    if (!created?.ok) throw new Error(created?.body?.error || 'Preview session creation failed.');
    const sessionId = created?.body?.previewSession?.id || '';
    if (!sessionId) throw new Error('Preview session id missing.');
    setQueryParam({ name: 'previewSessionId', value: sessionId });
    return sessionId;
  };
  const storeSurfaceInspectorEvolutionDraft = form => {
    if (!form) return;
    const widgetId = form.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
    const mode = form.getAttribute('data-surface-inspector-evolution-mode') || 'replace';
    if (!widgetId) return;
    const input = mode === 'versioned'
      ? { version: String(new FormData(form).get('version') ?? '').trim() }
      : readSurfaceInspectorReplaceInput(form);
    state.surfaceInspectorEvolutionDraft = {
      widgetId,
      mode,
      input
    };
  };
  const storeSurfaceInspectorBackendEvolutionDraft = form => {
    if (!form) return;
    const soul = form.getAttribute('data-backend-soul') || '';
    if (!soul) return;
    state.surfaceInspectorBackendEvolutionDraft = {
      widgetId: form.getAttribute('data-widget-id') || selectedSurfaceWidgetId(),
      soul,
      version: String(new FormData(form).get('version') ?? '').trim()
    };
  };
  const bindSurfaceInspectorEvolutionActions = overlay => {
    overlay?.querySelectorAll?.('[data-surface-inspector-evolution-form]')?.forEach?.(form => {
      if (!form.__surfaceInspectorEvolutionDraftBound) {
        form.__surfaceInspectorEvolutionDraftBound = true;
        const syncDraft = () => storeSurfaceInspectorEvolutionDraft(form);
        form.addEventListener?.('input', syncDraft);
        form.addEventListener?.('change', syncDraft);
      }
      form.addEventListener?.('submit', async event => {
        event.preventDefault?.();
        const widgetId = form.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        const mode = form.getAttribute('data-surface-inspector-evolution-mode') || 'replace';
        const authority = selectedSurfaceWidgetEditAuthority();
        try {
          const previewSessionId = await ensureSurfaceInspectorPreviewSession();
          storeSurfaceInspectorEvolutionDraft(form);
          const candidate = mode === 'versioned'
            ? {
                kind: 'widget.version.activate',
                input: {
                  soul: form.getAttribute('data-widget-soul') || widgetId,
                  version: String(new FormData(form).get('version') ?? '').trim()
                }
              }
            : {
                kind: 'widget.replace',
                input: {
                  id: widgetId,
                  ...readSurfaceInspectorReplaceInput(form)
                }
              };
          state.surfaceInspectorEvolutionDraft = {
            widgetId,
            mode,
            input: structuredClone(candidate.input)
          };
          setSurfaceInspectorStatus('Preparing preview for ' + widgetId + '...', 'ok');
          updateSurfaceInspectorUi();
          const result = await patchAppPreviewSessionCandidates({ sessionId: previewSessionId, candidates: [candidate] });
          if (!result?.ok) throw new Error(result?.body?.error || 'Preview update failed.');
          const previewResult = Array.isArray(result?.body?.results) ? result.body.results[0] : null;
          setQueryParam({ name: 'previewSessionId', value: previewSessionId });
          invalidateSurfaceInspectorGraph();
          invalidateSurfaceInspectorWidgets();
          await refreshProjection();
          await selectSurfaceInspectorWidget(widgetId, {
            refreshGraph: true,
            statusMessage: previewResult?.ok
              ? ('Preview active for ' + widgetId + (previewResult?.migrationStatus ? ' [' + previewResult.migrationStatus + '].' : '.'))
              : (previewResult?.reason || 'Preview candidate blocked.')
          });
          if (!previewResult?.ok) {
            setSurfaceInspectorStatus(previewResult?.reason || 'Preview candidate blocked.', 'error');
            updateSurfaceInspectorUi();
          } else if (!authority.ok) {
            setSurfaceInspectorStatus('Preview active. Apply will create a proposal because direct mutation is blocked here.', 'ok');
            updateSurfaceInspectorUi();
          }
        } catch (error) {
          setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
          updateSurfaceInspectorUi();
        }
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-evolution-apply]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const form = button.closest('[data-surface-inspector-evolution-form]');
        if (!form) return;
        const widgetId = form.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        const mode = form.getAttribute('data-surface-inspector-evolution-mode') || 'replace';
        const authority = selectedSurfaceWidgetEditAuthority();
        const formData = new FormData(form);
        const reason = String(formData.get('reason') ?? '').trim();
        setSurfaceInspectorStatus((authority.ok ? 'Applying ' : 'Proposing ') + widgetId + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = mode === 'versioned'
          ? (authority.ok
            ? await activateSurfaceWidgetVersion({
                soul: form.getAttribute('data-widget-soul') || widgetId,
                version: String(formData.get('version') ?? '').trim()
              })
            : await proposeSurfaceWidgetVersionAction({
                targetProcess: 'widgetVersion.activate',
                soul: form.getAttribute('data-widget-soul') || widgetId,
                version: String(formData.get('version') ?? '').trim(),
                reason
              }))
          : await replaceSurfaceWidget({
              id: widgetId,
              input: {
                id: widgetId,
                ...readSurfaceInspectorReplaceInput(form),
                ...(authority.ok ? {} : { reason })
              }
            });
        if (!result?.ok) {
          setSurfaceInspectorStatus(result?.body?.error || 'Widget evolution apply failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        if (result.status === 202) {
          setSurfaceInspectorStatus('Created proposal ' + (result?.body?.proposal?.id || result?.proposalId || 'proposal') + '.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await clearSurfaceInspectorPreview({
          widgetId,
          statusMessage: mode === 'versioned'
            ? ('Applied version change for ' + widgetId + '.')
            : ('Applied replacement for ' + widgetId + '.')
        });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-evolution-discard]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const widgetId = button.closest('[data-surface-inspector-evolution-form]')?.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        await clearSurfaceInspectorPreview({ widgetId, statusMessage: 'Discarded preview for ' + widgetId + '.' });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-evolution-replace-rollback]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const widgetId = button.getAttribute('data-surface-inspector-evolution-replace-rollback') || selectedSurfaceWidgetId();
        const authority = selectedSurfaceWidgetEditAuthority();
        const result = authority.ok
          ? await rollbackSurfaceWidgetReplace({ id: widgetId })
          : await rollbackSurfaceWidgetReplace({ id: widgetId, reason: 'Rollback latest widget replacement' });
        if (!result?.ok) {
          setSurfaceInspectorStatus(result?.body?.error || 'Widget replacement rollback failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        if (result.status === 202) {
          setSurfaceInspectorStatus('Created proposal ' + (result?.body?.proposal?.id || result?.proposalId || 'proposal') + '.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await clearSurfaceInspectorPreview({ widgetId, statusMessage: 'Rolled back replacement for ' + widgetId + '.' });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-evolution-version-rollback]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const soul = button.getAttribute('data-surface-inspector-evolution-version-rollback') || selectedSurfaceWidgetId();
        const authority = selectedSurfaceWidgetEditAuthority();
        const versionState = selectedSurfaceWidgetVersionState();
        const result = authority.ok
          ? await rollbackSurfaceWidgetVersion({ soul })
          : await proposeSurfaceWidgetVersionAction({
              targetProcess: 'widgetVersion.rollback',
              soul,
              version: versionState?.rollbackVersion || '',
              reason: 'Rollback widget version'
            });
        if (!result?.ok) {
          setSurfaceInspectorStatus(result?.body?.error || 'Widget version rollback failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        if (result.status === 202) {
          setSurfaceInspectorStatus('Created proposal ' + (result?.body?.proposal?.id || result?.proposalId || 'proposal') + '.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await clearSurfaceInspectorPreview({ widgetId: soul, statusMessage: 'Rolled back version for ' + soul + '.' });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-backend-evolution-form]')?.forEach?.(form => {
      if (!form.__surfaceInspectorBackendEvolutionDraftBound) {
        form.__surfaceInspectorBackendEvolutionDraftBound = true;
        const syncDraft = () => storeSurfaceInspectorBackendEvolutionDraft(form);
        form.addEventListener?.('input', syncDraft);
        form.addEventListener?.('change', syncDraft);
      }
      form.addEventListener?.('submit', async event => {
        event.preventDefault?.();
        const widgetId = form.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        const soul = form.getAttribute('data-backend-soul') || '';
        const evolution = selectedSurfaceBackendEvolution();
        const authority = evolution?.authority || { ok: false, reason: '' };
        try {
          const previewSessionId = await ensureSurfaceInspectorPreviewSession();
          storeSurfaceInspectorBackendEvolutionDraft(form);
          const candidate = {
            kind: 'backendProgram.version.activate',
            input: {
              soul,
              version: String(new FormData(form).get('version') ?? '').trim()
            }
          };
          setSurfaceInspectorStatus('Preparing backend preview for ' + soul + '...', 'ok');
          updateSurfaceInspectorUi();
          const result = await patchAppPreviewSessionCandidates({ sessionId: previewSessionId, candidates: [candidate] });
          if (!result?.ok) throw new Error(result?.body?.error || 'Backend preview update failed.');
          const previewResult = Array.isArray(result?.body?.results) ? result.body.results[0] : null;
          setQueryParam({ name: 'previewSessionId', value: previewSessionId });
          invalidateSurfaceInspectorGraph();
          invalidateSurfaceInspectorWidgets();
          await refreshProjection();
          await selectSurfaceInspectorWidget(widgetId, {
            refreshGraph: true,
            statusMessage: previewResult?.ok
              ? ('Preview active for backend ' + soul + (previewResult?.migrationStatus ? ' [' + previewResult.migrationStatus + '].' : '.'))
              : (previewResult?.reason || 'Backend preview candidate blocked.')
          });
          if (!previewResult?.ok) {
            setSurfaceInspectorStatus(previewResult?.reason || 'Backend preview candidate blocked.', 'error');
            updateSurfaceInspectorUi();
          } else if (!authority.ok) {
            setSurfaceInspectorStatus('Backend preview active. Apply will create a proposal because direct mutation is blocked here.', 'ok');
            updateSurfaceInspectorUi();
          }
        } catch (error) {
          setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
          updateSurfaceInspectorUi();
        }
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-backend-evolution-apply]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const form = button.closest('[data-surface-inspector-backend-evolution-form]');
        if (!form) return;
        const widgetId = form.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        const soul = form.getAttribute('data-backend-soul') || '';
        const evolution = selectedSurfaceBackendEvolution();
        const authority = evolution?.authority || { ok: false, reason: '' };
        const formData = new FormData(form);
        const version = String(formData.get('version') ?? '').trim();
        const reason = String(formData.get('reason') ?? '').trim();
        setSurfaceInspectorStatus((authority.ok ? 'Applying ' : 'Proposing ') + soul + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = authority.ok
          ? await activateSurfaceBackendProgramVersion({ soul, version })
          : await proposeSurfaceBackendProgramVersionAction({
              targetProcess: 'backendProgramVersion.activate',
              soul,
              version,
              reason
            });
        if (!result?.ok) {
          setSurfaceInspectorStatus(result?.body?.error || 'Backend version apply failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        if (result.status === 202) {
          setSurfaceInspectorStatus('Created proposal ' + (result?.body?.proposal?.id || result?.proposalId || 'proposal') + '.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await clearSurfaceInspectorPreview({
          widgetId,
          statusMessage: 'Applied backend version change for ' + soul + '.'
        });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-backend-evolution-discard]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const widgetId = button.closest('[data-surface-inspector-backend-evolution-form]')?.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        await clearSurfaceInspectorPreview({ widgetId, statusMessage: 'Discarded backend preview.' });
      });
    });
    overlay?.querySelectorAll?.('[data-surface-inspector-backend-evolution-rollback]')?.forEach?.(button => {
      button.addEventListener?.('click', async event => {
        event.preventDefault?.();
        const soul = button.getAttribute('data-surface-inspector-backend-evolution-rollback') || '';
        if (!soul) return;
        const widgetId = selectedSurfaceWidgetId();
        const evolution = selectedSurfaceBackendEvolution();
        const authority = evolution?.authority || { ok: false, reason: '' };
        const result = authority.ok
          ? await rollbackSurfaceBackendProgramVersion({ soul })
          : await proposeSurfaceBackendProgramVersionAction({
              targetProcess: 'backendProgramVersion.rollback',
              soul,
              version: evolution?.rollbackVersion || '',
              reason: 'Rollback backend program version'
            });
        if (!result?.ok) {
          setSurfaceInspectorStatus(result?.body?.error || 'Backend version rollback failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        if (result.status === 202) {
          setSurfaceInspectorStatus('Created proposal ' + (result?.body?.proposal?.id || result?.proposalId || 'proposal') + '.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await clearSurfaceInspectorPreview({
          widgetId,
          statusMessage: 'Rolled back backend version for ' + soul + '.'
        });
      });
    });
  };
  const renderSurfaceInspectorMenu = () => {
    const selectedSource = selectedSurfaceWidgetSource();
    const processSelection = selectedSurfaceInspectorProcessSelection();
    return renderSurfaceInspectorMenuView({
      liveSurfaceInspectable,
      widgetId: String(state.surfaceInspectorMenu?.widgetId || ''),
      x: Number(state.surfaceInspectorMenu?.x) || 12,
      y: Number(state.surfaceInspectorMenu?.y) || 12,
      selectedSourceFile: selectedSource?.file || '',
      hasProcessSelection: Boolean(processSelection),
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      escapeHtml
    });
  };
  const liveSurfaceWidgetRows = () => {
    if (!liveSurfaceInspectable) return [];
    const rootWidget = byWidget(program.rootWidget);
    if (!rootWidget) return [];
    const widgetIds = [];
    rootWidget.querySelectorAll('[data-widget]').forEach(element => {
      const widgetId = element.getAttribute('data-widget') || '';
      if (widgetId && !widgetIds.includes(widgetId)) widgetIds.push(widgetId);
    });
    return widgetIds.map(widgetId => {
      const node = state.surfaceInspectorGraphById?.[widgetId] || null;
      return {
        id: widgetId,
        label: String(node?.label || widgetId),
        kind: String(node?.kind || 'widget'),
        context: String(node?.context || ''),
        source: (node?.sources || []).slice(-1)[0] || null,
        processSelection: node?.processSelection?.program && node?.processSelection?.event
          ? node.processSelection
          : deriveSurfaceInspectorProcessSelection(widgetId),
        versionState: node?.widgetVersionState || null,
        versionRows: node?.widgetVersions || []
      };
    });
  };
  const buildSurfaceCommandCatalog = () => {
    const items = [];
    const push = item => {
      if (!item?.id || !item?.action?.kind) return;
      items.push(item);
    };
    const widgetRows = liveSurfaceWidgetRows();
    const selectedWidget = widgetRows.find(row => row.id === selectedSurfaceWidgetId()) || null;
    const graphNodes = Array.isArray(state.surfaceInspectorGraph?.nodes)
      ? state.surfaceInspectorGraph.nodes
      : Object.values(state.surfaceInspectorGraphById || {});
    const widgetIds = new Set(widgetRows.map(row => row.id));
    const signedInIdentity = typeof state.session?.identity === 'string' ? state.session.identity : '';
    const signedInActor = typeof state.session?.actor === 'string' ? state.session.actor : '';
    const signedInLabel = typeof state.session?.label === 'string' ? state.session.label : '';
    const currentIdentitySource = currentSurfaceIdentitySource();
    const routeValue = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return row?.value?.type === 'string' ? String(row.value.value || '') : '';
    };
    push({
      id: 'surface-command:whoami',
      type: 'command',
      title: 'whoami',
      subtitle: signedInIdentity || 'user',
      search: 'whoami current user identity session sourcerer command surface',
      priority: 320,
      action: { kind: 'surface-whoami' }
    });
    if (signedInIdentity) {
      push({
        id: 'surface-command:identity-world',
        type: 'identity',
        title: 'Open Current User',
        subtitle: signedInIdentity,
        search: 'open current user identity world record session ' + signedInIdentity + ' ' + signedInActor + ' ' + signedInLabel,
        priority: 318,
        action: { kind: 'world-navigate', select: signedInIdentity }
      });
      if (currentIdentitySource?.file) {
        push({
          id: 'surface-command:identity-source',
          type: 'source',
          title: 'Open Current User Source',
          subtitle: currentIdentitySource.file,
          search: 'open current user identity source record ' + signedInIdentity + ' ' + currentIdentitySource.file,
          priority: 317,
          action: { kind: 'world-navigate', select: signedInIdentity, mode: 'source' }
        });
      }
    }
    for (const row of widgetRows) {
      const keywords = [row.id, row.label, row.kind, row.context].filter(Boolean).join(' ');
      push({
        id: 'surface-widget:' + row.id,
        type: 'widget',
        title: 'Inspect Widget ' + row.label,
        subtitle: row.id + (row.context ? ' / ' + row.context : ''),
        search: 'inspect widget live page rendered current surface ' + keywords,
        priority: row.id === selectedSurfaceWidgetId() ? 250 : 220,
        action: { kind: 'inspect-widget', widgetId: row.id }
      });
      if (row.processSelection?.program && row.processSelection?.event) {
        push({
          id: 'surface-widget-process:' + row.id,
          type: 'execution',
          title: 'Open Process For ' + row.label,
          subtitle: row.processSelection.event,
          search: 'open process witnessed execution live page widget ' + keywords + ' ' + row.processSelection.program + ' ' + row.processSelection.event,
          priority: 216,
          action: { kind: 'navigate', href: processViewHref(row.processSelection) }
        });
      }
      if (row.source?.file) {
        push({
          id: 'surface-widget-source:' + row.id,
          type: 'source',
          title: 'Show Source For ' + row.label,
          subtitle: row.source.file,
          search: 'show source live page widget witnessed source ' + keywords + ' ' + row.source.file,
          priority: 214,
          action: { kind: 'world-navigate', select: row.id, mode: 'source' }
        });
      }
    }
    if (selectedWidget) {
      push({
        id: 'surface-selected-world:' + selectedWidget.id,
        type: 'command',
        title: 'Open Selected Widget In World',
        subtitle: selectedWidget.id,
        search: 'open selected widget world witnesses graph ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 260,
        action: { kind: 'world-navigate', select: selectedWidget.id }
      });
      push({
        id: 'surface-selected-witness:' + selectedWidget.id,
        type: 'command',
        title: 'Show Witnesses For Selected Widget',
        subtitle: selectedWidget.id,
        search: 'show witnesses selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 258,
        action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'witness' }
      });
      if (selectedWidget.source?.file) {
        push({
          id: 'surface-selected-source:' + selectedWidget.id,
          type: 'command',
          title: 'Show Source For Selected Widget',
          subtitle: selectedWidget.source.file,
          search: 'show source selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.source.file,
          priority: 256,
          action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'source' }
        });
      }
      if (selectedWidget.processSelection?.program && selectedWidget.processSelection?.event) {
        push({
          id: 'surface-selected-process:' + selectedWidget.id,
          type: 'command',
          title: 'Open Process For Selected Widget',
          subtitle: selectedWidget.processSelection.event,
          search: 'open process selected widget witnessed execution live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.processSelection.program + ' ' + selectedWidget.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedWidget.processSelection) }
        });
      }
      for (const row of selectedWidget.versionRows.filter(entry => !entry.isActive)) {
        push({
          id: 'surface-selected-version:' + row.soul + ':' + row.version,
          type: 'command',
          title: 'Upgrade Selected Widget To ' + row.version,
          subtitle: row.soul,
          search: 'upgrade activate version selected widget live page ' + row.soul + ' ' + row.version,
          priority: 252,
          action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
        });
      }
      if (selectedWidget.versionState?.rollbackAvailable) {
        push({
          id: 'surface-selected-rollback:' + selectedWidget.versionState.soul,
          type: 'command',
          title: 'Rollback Selected Widget To ' + selectedWidget.versionState.rollbackVersion,
          subtitle: selectedWidget.versionState.soul,
          search: 'rollback selected widget version live page ' + selectedWidget.versionState.soul + ' ' + selectedWidget.versionState.rollbackVersion,
          priority: 251,
          action: { kind: 'widget-version-rollback', soul: selectedWidget.versionState.soul }
        });
      }
    }
    for (const surface of runtimeSurfacesFor('app-command')) {
      push({
        id: surface.id,
        type: surface.type || 'surface',
        title: surface.title,
        subtitle: surface.subtitle,
        search: surface.search,
        priority: 205,
        action: surface?.action && typeof surface.action === 'object'
          ? { ...surface.action }
          : { kind: 'navigate', href: surface.href }
      });
    }
    for (const node of graphNodes) {
      if (!node?.id) continue;
      const label = String(node.label || node.id);
      const kind = String(node.kind || 'thing');
      const keywords = [node.id, label, kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
      const source = (node.sources || []).slice(-1)[0] || null;
      if (!widgetIds.has(node.id)) {
        push({
          id: 'surface-world-node:' + node.id,
          type: kind,
          title: 'Open In World: ' + label,
          subtitle: kind + (node.context ? ' / ' + node.context : ''),
          search: 'open in world graph object capability widget route process source ' + keywords,
          priority: kind === 'capability' ? 198 : 170,
          action: { kind: 'world-navigate', select: node.id }
        });
      }
      if (kind === 'route') {
        const routePath = routeValue(node, 'path');
        const routeMethod = routeValue(node, 'method');
        if (routePath && routeMethod === 'GET') {
          push({
            id: 'surface-route:' + node.id,
            type: 'page',
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'open page route surface ' + routePath + ' ' + keywords,
            priority: 215,
            action: { kind: 'navigate', href: routePath }
          });
        }
      }
      if (source?.file) {
        push({
          id: 'surface-source:' + node.id,
          type: 'source',
          title: 'Show Source For ' + label,
          subtitle: source.file,
          search: 'show source witnessed file dsl ' + keywords + ' ' + source.file,
          priority: 166,
          action: { kind: 'world-navigate', select: node.id, mode: 'source' }
        });
      }
      if (node.processSelection?.program && node.processSelection?.event) {
        push({
          id: 'surface-process:' + node.id,
          type: 'execution',
          title: 'Open Process For ' + label,
          subtitle: node.processSelection.event,
          search: 'open process witnessed execution ' + keywords + ' ' + node.processSelection.program + ' ' + node.processSelection.event,
          priority: 167,
          action: { kind: 'navigate', href: processViewHref(node.processSelection) }
        });
      }
    }
    return [...new Map(items.map(item => [item.id, item])).values()];
  };
  const scoreSurfaceCommandItem = (item, query) => {
    if (!query) return item.priority || 0;
    const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
    const title = String(item.title || '').toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return item.priority || 0;
    let score = item.priority || 0;
    for (const term of terms) {
      if (title === term) score += 220;
      else if (title.startsWith(term)) score += 120;
      else if (title.includes(term)) score += 70;
      else if (haystack.includes(term)) score += 25;
      else return -1;
    }
    return score;
  };
  const visibleSurfaceCommands = () => {
    const query = String(state.surfaceCommandQuery || '').trim();
    return buildSurfaceCommandCatalog()
      .map(item => ({ ...item, score: scoreSurfaceCommandItem(item, query) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
      .slice(0, query ? 24 : 12);
  };
  const renderSurfaceWhoamiResult = whoami => renderSurfaceWhoamiResultView({ whoami, escapeHtml });
  const renderSurfaceCommandPalette = () => {
    const query = String(state.surfaceCommandQuery || '');
    const items = visibleSurfaceCommands();
    const whoami = state.surfaceCommandResult?.kind === 'whoami' ? state.surfaceCommandResult : null;
    return renderSurfaceCommandPaletteView({
      liveSurfaceInspectable,
      surfaceCommandOpen: state.surfaceCommandOpen,
      query,
      items,
      graphError: state.surfaceInspectorGraphError || '',
      graphLoaded: state.surfaceInspectorGraphLoaded === true,
      currentSelectionId: selectedSurfaceWidgetId(),
      whoami,
      escapeHtml
    });
  };
  const executeSurfaceCommand = async item => {
    if (!item?.action) return;
    const action = item.action;
    state.surfaceCommandOpen = false;
    state.surfaceCommandQuery = '';
    state.surfaceCommandFocusRequested = false;
    state.surfaceCommandResult = null;
    if (action.kind === 'navigate') {
      window.location.assign(action.href);
      return;
    }
    if (action.kind === 'surface-whoami') {
      openSurfaceWhoami();
      return;
    }
    if (action.kind === 'inspect-widget') {
      await selectSurfaceInspectorWidget(action.widgetId || '');
      updateSurfaceInspectorUi();
      return;
    }
    if (action.kind === 'world-navigate') {
      window.location.assign(worldSurfaceHref({ select: action.select || '', mode: action.mode || '' }));
      return;
    }
    if (action.kind === 'widget-version-activate') {
      setSurfaceInspectorStatus('Activating ' + (action.version || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await activateSurfaceWidgetVersion({ soul: action.soul || '', version: action.version || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version activation failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Activated ' + (action.version || '') + (result.body?.status ? ' (' + result.body.status + ')' : '.')
      });
      return;
    }
    if (action.kind === 'widget-version-rollback') {
      setSurfaceInspectorStatus('Rolling back ' + (action.soul || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await rollbackSurfaceWidgetVersion({ soul: action.soul || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version rollback failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Rolled back to ' + (result.body?.version || 'the previous version') + '.'
      });
    }
  };
  const updateSurfaceInspectorUi = () => {
    if (!liveSurfaceInspectable) return;
    const overlay = ensureSurfaceInspectorOverlayRoot({ documentTarget: document });
    if (!overlay) return;
    overlay.innerHTML = renderSurfaceInspectorOverlayView({
      surfaceCommandOpen: state.surfaceCommandOpen,
      surfaceInspectorOpen: state.surfaceInspectorOpen,
      commandPalette: renderSurfaceCommandPalette(),
      inspectorPanel: renderSurfaceInspectorPanel(),
      inspectorMenu: renderSurfaceInspectorMenu()
    });
    bindSurfaceCommandActions({
      overlay,
      state,
      ensureSurfaceInspectorGraph,
      updateSurfaceInspectorUi,
      visibleSurfaceCommands,
      executeSurfaceCommand,
      worldSurfaceHref,
      windowTarget: window
    });
    bindSurfaceCommandIdentityActions({
      overlay,
      state,
      buildSurfaceWhoamiResult,
      currentSurfaceIdentityRecord,
      patchSurfaceIdentity,
      applyTheme,
      updateSurfaceInspectorUi
    });
    bindSurfaceInspectorActions({
      overlay,
      state,
      clearSurfaceInspectorHighlight,
      setSurfaceInspectorStatus,
      selectedSurfaceWidgetId,
      applySurfaceInspectorHighlight,
      updateSurfaceInspectorUi,
      invalidateSurfaceInspectorGraph,
      invalidateSurfaceInspectorWidgets,
      invalidateSurfaceInspectorRuntimeDiagnostics,
      selectSurfaceInspectorWidget,
      worldSurfaceHref,
      selectedSurfaceInspectorProcessSelection,
      processViewHref,
      windowTarget: window
    });
    bindSurfaceInspectorVersionActions({
      overlay,
      setSurfaceInspectorStatus,
      updateSurfaceInspectorUi,
      activateSurfaceWidgetVersion,
      rollbackSurfaceWidgetVersion,
      invalidateSurfaceInspectorGraph,
      refreshProjection,
      selectSurfaceInspectorWidget
    });
    bindSurfaceInspectorFormActions({
      overlay,
      selectedSurfaceWidgetId,
      selectedSurfaceWidgetAuthored,
      selectedSurfaceWidgetEditAuthority,
      currentActor,
      setSurfaceInspectorStatus,
      updateSurfaceInspectorUi,
      patchSurfaceWidget,
      invalidateSurfaceInspectorGraph,
      invalidateSurfaceInspectorWidgets,
      invalidateSurfaceInspectorRuntimeDiagnostics,
      refreshProjection,
      selectSurfaceInspectorWidget,
      proposeSurfaceWidgetPatch,
      proposeSurfaceWidgetVersionAction,
      createSurfaceWidget,
      installSurfaceCapability,
      removeSurfaceCapability
    });
    bindSurfaceInspectorEvolutionActions(overlay);
    if (state.surfaceCommandOpen && state.surfaceCommandFocusRequested !== false) {
      const input = overlay.querySelector('[data-surface-command-input]');
      if (input) {
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
      state.surfaceCommandFocusRequested = false;
    }
  };
  const bootSurfaceInspector = () => {
    if (!liveSurfaceInspectable || state.surfaceInspectorBooted) return;
    state.surfaceInspectorBooted = true;
    updateSurfaceInspectorUi();
    document.addEventListener('contextmenu', event => {
      if (!state.surfaceInspectorOpen) return;
      const rootWidget = byWidget(program.rootWidget);
      const target = event.target?.closest?.('[data-widget]');
      if (!rootWidget || !target || !rootWidget.contains(target)) return;
      const widgetId = target.getAttribute('data-widget') || '';
      if (!widgetId) return;
      event.preventDefault();
      state.surfaceInspectorMenu = {
        widgetId,
        x: event.clientX,
        y: event.clientY
      };
      void selectSurfaceInspectorWidget(widgetId).catch(error => {
        setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
        updateSurfaceInspectorUi();
      });
    }, true);
    document.addEventListener('click', event => {
      if (!state.surfaceInspectorMenu) return;
      if (event.target?.closest?.('.surface-inspector-menu')) return;
      state.surfaceInspectorMenu = null;
      updateSurfaceInspectorUi();
    }, true);
    window.addEventListener('keydown', event => {
      const active = document.activeElement;
      const typing = active?.matches?.('input, textarea, select') || active?.isContentEditable;
      const key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === 'F1') {
        event.preventDefault();
        void ensureSurfaceInspectorGraph().then(() => {
          openSurfaceWhoami();
        }).catch(error => {
          setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
          openSurfaceWhoami();
        });
        return;
      }
      if (event.key === 'Escape' && state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = false;
        state.surfaceCommandQuery = '';
        state.surfaceCommandResult = null;
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === '/' && !typing && !state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key !== 'Escape') return;
      if (state.surfaceInspectorMenu) {
        event.preventDefault();
        state.surfaceInspectorMenu = null;
        updateSurfaceInspectorUi();
      }
    });
  };
  const commandTutorialStepById = new Map((commandTutorial?.steps || []).map(step => [step.id, step]));
  const commandTutorialConceptMap = new Map((commandTutorial?.concepts || []).map(concept => [concept.id, concept]));
  const commandTutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const commandTutorialPageHref = page => page === 'app' ? '/' : (page === 'bootstrap' ? '/_bootstrap' : (page === 'world' ? '/world' : null));
  const commandTutorialPageScopeKey = page => typeof page === 'string' && page.trim() ? ('page:' + page.trim()) : null;
  const commandTutorialChapterScopeKey = chapterId => typeof chapterId === 'string' && chapterId.trim() ? ('chapter:' + chapterId.trim()) : null;
  const commandTutorialStepScope = step => {
    if (!step) return null;
    const key = typeof step.scopeKey === 'string' && step.scopeKey.trim()
      ? step.scopeKey.trim()
      : (step.page === 'world' ? 'world' : commandTutorialPageScopeKey(step.page));
    if (!key) return null;
    const kind = typeof step.scopeKind === 'string' && step.scopeKind.trim()
      ? step.scopeKind.trim()
      : (key === 'world'
          ? 'world'
          : (key.startsWith('section:')
              ? 'section'
              : (key.startsWith('widget:')
                  ? 'widget'
                  : (key.startsWith('chapter:')
                      ? 'chapter'
                      : 'page'))));
    return {
      key,
      kind,
      page: typeof step.scopePage === 'string' && step.scopePage.trim() ? step.scopePage.trim() : (kind === 'world' ? 'world' : (step.page || null)),
      label: typeof step.scopeLabel === 'string' && step.scopeLabel.trim() ? step.scopeLabel.trim() : (step.title || ''),
      chapterId: step.chapterId || null,
      target: typeof step.target === 'string' && step.target.trim() ? step.target.trim() : null
    };
  };
  const commandTutorialScopeCatalog = new Map();
  const commandTutorialContextCatalog = new Map();
  const addCommandTutorialScope = info => {
    if (!info?.key) return;
    if (!commandTutorialScopeCatalog.has(info.key)) {
      commandTutorialScopeCatalog.set(info.key, { ...info });
      return;
    }
    commandTutorialScopeCatalog.set(info.key, {
      ...commandTutorialScopeCatalog.get(info.key),
      ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ''))
    });
  };
  const addCommandTutorialContext = info => {
    if (!info?.id || commandTutorialContextCatalog.has(info.id)) return;
    commandTutorialContextCatalog.set(info.id, { ...info });
  };
  const commandTutorialContextLabel = contextId => typeof contextId === 'string' && contextId.trim()
    ? (contextId.trim().charAt(0).toUpperCase() + contextId.trim().slice(1) + ' context')
    : null;
  const commandTutorialStepSurfaceContext = step => {
    if (!step) return null;
    const contextId = typeof step.surfaceContextId === 'string' && step.surfaceContextId.trim() ? step.surfaceContextId.trim() : '';
    if (!contextId) return null;
    return {
      id: contextId,
      label: typeof step.surfaceContextLabel === 'string' && step.surfaceContextLabel.trim() ? step.surfaceContextLabel.trim() : commandTutorialContextLabel(contextId)
    };
  };
  for (const scope of commandTutorial?.scopes || []) addCommandTutorialScope(commandTutorialStepScope(scope));
  for (const step of commandTutorial?.steps || []) {
    addCommandTutorialScope(commandTutorialStepScope(step));
    addCommandTutorialContext(commandTutorialStepSurfaceContext(step));
    if (step.page) addCommandTutorialScope({ key: commandTutorialPageScopeKey(step.page), kind: 'page', page: step.page, label: commandTutorialPageLabel(step.page) });
    if (step.page === 'world') addCommandTutorialScope({ key: 'world', kind: 'world', page: 'world', label: 'World surface' });
    if (step.chapterId) addCommandTutorialScope({ key: commandTutorialChapterScopeKey(step.chapterId), kind: 'chapter', chapterId: step.chapterId, label: step.chapterId });
  }
  const commandTutorialScopeInfo = scopeKey => commandTutorialScopeCatalog.get(typeof scopeKey === 'string' ? scopeKey.trim() : '') || null;
  const commandTutorialContextInfo = contextId => commandTutorialContextCatalog.get(typeof contextId === 'string' ? contextId.trim() : '') || null;
  const commandTutorialScopeTargetName = scopeKey => {
    const key = typeof scopeKey === 'string' ? scopeKey.trim() : '';
    if (!key) return null;
    const authored = commandTutorialScopeInfo(key);
    if (authored?.target && (!authored.page || authored.page === 'world')) return authored.target;
    const preferred = (commandTutorial?.steps || []).find(step => commandTutorialStepScope(step)?.key === key && step.page === 'world' && typeof step.target === 'string' && step.target.trim());
    if (preferred?.target) return preferred.target.trim();
    const fallback = (commandTutorial?.steps || []).find(step => commandTutorialStepScope(step)?.key === key && typeof step.target === 'string' && step.target.trim());
    return fallback?.target?.trim() || null;
  };
  const normalizeWorldTutorialProgress = progress => {
    if (!progress || typeof progress !== 'object') return null;
    const step = commandTutorialStepById.get(progress.stepId || '') || commandTutorial?.steps?.[0] || null;
    const disabledScopeKeys = [];
    const disabledContextIds = [];
    if (Array.isArray(progress.disabledScopeKeys)) {
      for (const key of progress.disabledScopeKeys.map(String).map(value => value.trim()).filter(Boolean)) {
        if (commandTutorialScopeInfo(key) && !disabledScopeKeys.includes(key)) disabledScopeKeys.push(key);
      }
    }
    if (Array.isArray(progress.disabledContextIds)) {
      for (const contextId of progress.disabledContextIds.map(String).map(value => value.trim()).filter(Boolean)) {
        if (commandTutorialContextInfo(contextId) && !disabledContextIds.includes(contextId)) disabledContextIds.push(contextId);
      }
    }
    for (const page of (Array.isArray(progress.disabledPages) ? progress.disabledPages : []).map(String).map(value => value.trim()).filter(Boolean)) {
      const pageKey = commandTutorialPageScopeKey(page);
      if (pageKey && commandTutorialScopeInfo(pageKey) && !disabledScopeKeys.includes(pageKey)) disabledScopeKeys.push(pageKey);
      if (page === 'world' && commandTutorialScopeInfo('world') && !disabledScopeKeys.includes('world')) disabledScopeKeys.push('world');
    }
    const stepScopeKey = commandTutorialStepScope(step)?.key || null;
    const chapterScopeKey = commandTutorialChapterScopeKey(step?.chapterId);
    const explicitReplayScopeKey = typeof progress.replayScopeKey === 'string' ? progress.replayScopeKey.trim() : '';
    const replayScopeKey = explicitReplayScopeKey && commandTutorialScopeInfo(explicitReplayScopeKey) && (explicitReplayScopeKey === stepScopeKey || explicitReplayScopeKey === chapterScopeKey)
      ? explicitReplayScopeKey
      : (typeof progress.replayStepId === 'string' && progress.replayStepId === step?.id ? stepScopeKey : null);
    const disabledPages = [];
    for (const key of disabledScopeKeys) {
      const scope = commandTutorialScopeInfo(key);
      if (!scope) continue;
      if (scope.kind === 'page' && scope.page && !disabledPages.includes(scope.page)) disabledPages.push(scope.page);
      if (scope.kind === 'world' && !disabledPages.includes('world')) disabledPages.push('world');
    }
    return {
      tutorialId: commandTutorial?.id || '',
      chapterId: step?.chapterId || null,
      stepId: step?.id || null,
      chapterStatus: typeof progress.chapterStatus === 'string' ? progress.chapterStatus : (step ? 'in_progress' : 'idle'),
      draftInputs: progress.draftInputs && typeof progress.draftInputs === 'object' ? progress.draftInputs : {},
      completedAt: typeof progress.completedAt === 'string' ? progress.completedAt : null,
      hidden: progress.hidden === true,
      disabledScopeKeys,
      disabledContextIds,
      replayScopeKey,
      disabledPages,
      replayStepId: replayScopeKey && step?.id ? step.id : null
    };
  };
  const commandTutorialStep = current => commandTutorialStepById.get(current?.stepId || '') || null;
  const commandTutorialPreviousStep = current => {
    const index = (commandTutorial?.steps || []).findIndex(step => step.id === current?.stepId);
    return index > 0 ? commandTutorial.steps[index - 1] : null;
  };
  const commandTutorialDisabledScopeKeysFor = current => normalizeWorldTutorialProgress(current)?.disabledScopeKeys || [];
  const commandTutorialDisabledContextIdsFor = current => normalizeWorldTutorialProgress(current)?.disabledContextIds || [];
  const commandTutorialDisabledPages = current => normalizeWorldTutorialProgress(current)?.disabledPages || [];
  const commandTutorialReplayScopeKeyFor = current => normalizeWorldTutorialProgress(current)?.replayScopeKey || null;
  const commandTutorialReplayStepId = current => normalizeWorldTutorialProgress(current)?.replayStepId || null;
  const commandTutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  const commandTutorialRevealedConcepts = current => {
    if (!commandTutorial?.steps?.length) return [];
    const currentIndex = current?.completedAt
      ? (commandTutorial.steps.length - 1)
      : commandTutorial.steps.findIndex(step => step.id === current?.stepId);
    if (currentIndex < 0) return [];
    const ids = [];
    for (const step of commandTutorial.steps.slice(0, currentIndex + 1)) {
      for (const concept of commandTutorialStepConcepts(step)) {
        if (!ids.includes(concept.id)) ids.push(concept.id);
      }
    }
    return ids.map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  };
  const commandTutorialScopeAncestors = scopeKey => {
    const scope = commandTutorialScopeInfo(scopeKey);
    if (!scope?.key) return [];
    const keys = [scope.key];
    if (scope.kind === 'widget' || scope.kind === 'section') {
      const pageKey = commandTutorialPageScopeKey(scope.page);
      if (pageKey) keys.push(pageKey);
      if (scope.page === 'world') keys.push('world');
    } else if (scope.kind === 'page' && scope.page === 'world') {
      keys.push('world');
    } else if (scope.kind === 'world') {
      const pageKey = commandTutorialPageScopeKey('world');
      if (pageKey) keys.push(pageKey);
    }
    return [...new Set(keys.filter(Boolean))];
  };
  const isCommandTutorialScopeDisabled = (current, scopeKey) => {
    const disabled = new Set(commandTutorialDisabledScopeKeysFor(current));
    return commandTutorialScopeAncestors(scopeKey).some(key => disabled.has(key));
  };
  const isCommandTutorialContextDisabled = (current, contextId) => {
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    return Boolean(normalizedContextId) && commandTutorialDisabledContextIdsFor(current).includes(normalizedContextId);
  };
  const worldTutorialSurfaceState = current => {
    const step = commandTutorialStep(current);
    if (!current || !step) return { kind: 'idle', page: null };
    if (current.completedAt) return { kind: 'completed', page: step.page || null };
    if (current.hidden) return { kind: 'hidden', page: step.page || null };
    if ((step.page || null) !== 'world') return { kind: 'offpage', page: step.page || null };
    const contextId = commandTutorialStepSurfaceContext(step)?.id || null;
    if (contextId && isCommandTutorialContextDisabled(current, contextId)) return { kind: 'disabled-context', page: step.page || null, contextId };
    const scopeKey = commandTutorialStepScope(step)?.key || null;
    if (scopeKey && isCommandTutorialScopeDisabled(current, scopeKey)) return { kind: 'disabled', page: step.page || null, scopeKey };
    return { kind: 'active', page: step.page || null, scopeKey };
  };
  const clearWorldTutorialScopeDisabled = (current, scopeKey = 'world') => {
    if (!current) return null;
    const keysToRemove = new Set(commandTutorialScopeAncestors(scopeKey));
    return normalizeWorldTutorialProgress({
      ...current,
      disabledScopeKeys: commandTutorialDisabledScopeKeysFor(current).filter(key => !keysToRemove.has(key)),
      disabledPages: []
    });
  };
  const disableWorldTutorialOnCurrentScope = current => {
    if (!current) return null;
    const scopeKey = commandTutorialStepScope(commandTutorialStep(current))?.key || 'world';
    return normalizeWorldTutorialProgress({
      ...current,
      hidden: false,
      disabledScopeKeys: [...new Set([...commandTutorialDisabledScopeKeysFor(current), scopeKey])],
      disabledPages: []
    });
  };
  const clearWorldTutorialContextDisabled = (current, contextId = currentSurfaceContext) => {
    if (!current) return null;
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    if (!normalizedContextId) return normalizeWorldTutorialProgress(current);
    return normalizeWorldTutorialProgress({
      ...current,
      disabledContextIds: commandTutorialDisabledContextIdsFor(current).filter(id => id !== normalizedContextId)
    });
  };
  const disableWorldTutorialOnCurrentContext = current => {
    if (!current) return null;
    const contextId = typeof currentSurfaceContext === 'string' ? currentSurfaceContext.trim() : '';
    if (!contextId) return normalizeWorldTutorialProgress(current);
    return normalizeWorldTutorialProgress({
      ...current,
      hidden: false,
      disabledContextIds: [...new Set([...commandTutorialDisabledContextIdsFor(current), contextId])]
    });
  };
  const requestWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return;
    }
    const requestId = (state.worldTutorialRequestId || 0) + 1;
    state.worldTutorialRequestId = requestId;
    const url = '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id);
    const res = await fetch(url, requestOptions({}, { url }));
    const body = await res.json().catch(() => ({ progress: null }));
    if (state.worldTutorialRequestId !== requestId) return;
    if (!res.ok) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = body?.error || 'tutorial request failed';
      state.worldTutorialLoaded = true;
      return;
    }
    state.worldTutorialProgress = normalizeWorldTutorialProgress(body.progress);
    state.worldTutorialError = null;
    state.worldTutorialLoaded = true;
  };
  const persistWorldTutorialProgress = async nextProgress => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: state.worldTutorialProgress } };
    }
    const url = '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextProgress)
    }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = response.ok
      ? normalizeWorldTutorialProgress(body.progress || nextProgress)
      : normalizeWorldTutorialProgress(state.worldTutorialProgress);
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const clearWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: null } };
    }
    const url = '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({ method: 'DELETE' }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = null;
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance reset failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const syncSession = session => {
    const authenticated = Boolean(session?.authenticated);
    state.session = authenticated ? session : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    state.actor = state.session.actor || '';
    state.worldTutorialLoaded = false;
    state.worldTutorialProgress = null;
    state.worldTutorialError = null;
    applyTheme();
    updateSurfaceInspectorUi();
  };
  const traceEndpoint = '/api/process-events';
  const traceContext = { runId: null, stepId: null };
  const makeRunId = () => (globalThis.crypto?.randomUUID?.() || ('run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
  const withTraceContext = async (runId, stepId, fn) => {
    const previous = { ...traceContext };
    traceContext.runId = runId || previous.runId || null;
    traceContext.stepId = stepId || null;
    try {
      return await fn();
    } finally {
      traceContext.runId = previous.runId;
      traceContext.stepId = previous.stepId;
    }
  };
  const requestOptions = (options, { url = '', disableTrace = false } = {}) => {
    const next = { credentials: 'same-origin', ...(options || {}) };
    if (!disableTrace && url !== traceEndpoint && traceContext.runId) {
      next.headers = {
        ...(next.headers || {}),
        'x-witness-process-run': traceContext.runId,
        'x-witness-step-id': traceContext.stepId || ''
      };
    }
    return next;
  };
  const resolveRuntimeUrl = url => {
    const text = String(url || '').trim();
    if (!text) return window.location.href;
    try {
      const resolved = new URL(text, window.location.href);
      const previewSessionId = currentPreviewSessionId();
      if (
        previewSessionId
        && resolved.origin === window.location.origin
        && !resolved.searchParams.has('previewSessionId')
      ) {
        resolved.searchParams.set('previewSessionId', previewSessionId);
      }
      return resolved.toString();
    } catch {
      const resolved = new URL(text, 'http://127.0.0.1');
      const previewSessionId = currentPreviewSessionId();
      if (previewSessionId && !resolved.searchParams.has('previewSessionId')) {
        resolved.searchParams.set('previewSessionId', previewSessionId);
      }
      return resolved.toString();
    }
  };
  const activateSurfaceWidgetVersion = async ({ soul, version }) => {
    const url = '/api/widget-versions/' + encodeURIComponent(soul) + '/activate';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const rollbackSurfaceWidgetVersion = async ({ soul }) => {
    const url = '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST'
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const activateSurfaceBackendProgramVersion = async ({ soul, version }) => {
    const url = '/api/backend-program-versions/' + encodeURIComponent(soul) + '/activate';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const rollbackSurfaceBackendProgramVersion = async ({ soul, reason = '' }) => {
    const url = '/api/backend-program-versions/' + encodeURIComponent(soul) + '/rollback';
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reason ? { reason } : {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const proposeSurfaceBackendProgramVersionAction = async ({ targetProcess, soul, version = '', reason = '' }) => {
    const url = targetProcess === 'backendProgramVersion.rollback'
      ? '/api/backend-program-versions/' + encodeURIComponent(soul) + '/rollback'
      : '/api/backend-program-versions/' + encodeURIComponent(soul) + '/activate';
    const bodyPayload = targetProcess === 'backendProgramVersion.activate'
      ? { version, reason: String(reason || '').trim() }
      : { reason: String(reason || '').trim() };
    const response = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const scopeFor = extra => ({ state, event: state.event || {}, ...extra });
  const traceStepBody = (process, body = {}) => ({
    process,
    runId: body.runId || '',
    program: body.program || program.id || '',
    event: body.event || '',
    nodeId: body.nodeId || '',
    op: body.op || '',
    status: body.status || '',
    frontier: Array.isArray(body.frontier) ? body.frontier : [],
    repeat: body.repeat ?? null,
    repeatCount: body.repeatCount ?? null,
    message: body.message || '',
    eventData: body.eventData ?? null,
    actor: currentActor() || '',
    timestamp: Date.now()
  });
  const recordProcessEvent = async (process, body = {}) => {
    const entry = traceStepBody(process, body);
    widgetPageProcessTrace.push(cloneInspectionValue(entry));
    if (widgetPageProcessTrace.length > 200) widgetPageProcessTrace.shift();
    syncWidgetPageRuntimeProbe();
    if (!processTraceEnabled) return entry;
    try {
      await fetch(traceEndpoint, requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry)
      }, { url: traceEndpoint, disableTrace: true }));
    } catch {}
    return entry;
  };
  const evaluateExpression = (expression, scope) => {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    return Function(...names, 'return (' + expression + ');')(...values);
  };
  const interpolateString = (value, scope) => {
    const text = String(value ?? '');
    const exact = text.match(/^\$\{([^}]+)\}$/);
    if (exact) {
      try { return evaluateExpression(exact[1], scope); }
      catch { return ''; }
    }
    return text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
      try {
        const result = evaluateExpression(expression, scope);
        return result == null ? '' : String(result);
      } catch {
        return '';
      }
    });
  };
  const interpolateValue = (value, scope) => {
    if (typeof value === 'string') return interpolateString(value, scope);
    if (Array.isArray(value)) return value.map(item => interpolateValue(item, scope));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)]));
    return value;
  };
  function summarizeSurfaceInspectorKeyList(keys = []) {
    const values = Array.isArray(keys) ? keys.map(String).filter(Boolean) : [];
    if (!values.length) return '';
    if (values.length <= 4) return values.join(', ');
    return values.slice(0, 4).join(', ') + ' +' + (values.length - 4);
  }
  function surfaceInspectorTypedValueToString(value) {
    if (!value || typeof value !== 'object') return '';
    if (value.type === 'string') return String(value.value || '');
    if (value.type === 'ref') return String(value.target || '');
    return '';
  }
  function surfaceInspectorRecordFieldString(record = null, key = '') {
    const fields = record && typeof record === 'object' && record.type === 'record' && record.fields && typeof record.fields === 'object'
      ? record.fields
      : null;
    if (!fields || !key || !Object.prototype.hasOwnProperty.call(fields, key)) return '';
    return surfaceInspectorTypedValueToString(fields[key]);
  }
  function surfaceInspectorNodeRecordFieldString(node = null, containerKey = '', key = '') {
    const row = [...(node?.values || []), ...(node?.properties || [])]
      .find(entry => entry?.key === containerKey);
    return surfaceInspectorRecordFieldString(row?.value, key);
  }
  function surfaceInspectorEventDataForElement(element = null) {
    const payload = {};
    const dataset = element?.dataset && typeof element.dataset === 'object' ? element.dataset : {};
    for (const [key, value] of Object.entries(dataset)) {
      if (!key || key === 'widget' || key === 'surfaceInspectorSelected') continue;
      payload[key] = value === 'true' ? true : value === 'false' ? false : value;
    }
    return payload;
  }
  function surfaceInspectorPathSegments(value = '') {
    const text = String(value || '').trim();
    if (!text) return [];
    try {
      return new URL(text, window.location.origin).pathname.split('/').filter(Boolean);
    } catch {
      return text.split('?')[0].split('/').filter(Boolean);
    }
  }
  function surfaceInspectorRouteMatchesTemplate(routePath = '', templateUrl = '') {
    const routeSegments = surfaceInspectorPathSegments(routePath);
    const templateSegments = surfaceInspectorPathSegments(templateUrl);
    if (!routeSegments.length || routeSegments.length !== templateSegments.length) return false;
    for (let index = 0; index < routeSegments.length; index += 1) {
      const routeSegment = routeSegments[index];
      const templateSegment = templateSegments[index];
      const routeWildcard = routeSegment.startsWith(':');
      const templateWildcard = templateSegment.includes('$' + '{');
      if (routeWildcard || templateWildcard) continue;
      if (routeSegment !== templateSegment) return false;
    }
    return true;
  }
  function resolveSurfaceInspectorRouteForRequest({ method = '', url = '', diagnostics = null } = {}) {
    const upperMethod = String(method || '').toUpperCase();
    const mountedRoutes = Array.isArray(diagnostics?.mountedRoutes) ? diagnostics.mountedRoutes : [];
    const routeMatch = mountedRoutes.find(route =>
      String(route?.method || '').toUpperCase() === upperMethod
      && surfaceInspectorRouteMatchesTemplate(route?.path || route?.matcher || '', url)
    );
    if (routeMatch) return routeMatch;
    const routes = Array.isArray(diagnostics?.routes) ? diagnostics.routes : [];
    return routes.find(route =>
      String(route?.method || '').toUpperCase() === upperMethod
      && surfaceInspectorRouteMatchesTemplate(route?.matcher || route?.path || '', url)
    ) || null;
  }
  function resolveSurfaceInspectorGraphRouteForRequest({ method = '', url = '' } = {}) {
    const upperMethod = String(method || '').toUpperCase();
    const nodes = Object.values(state.surfaceInspectorGraphById || {});
    return nodes.find(node => {
      const nodeMethod = surfaceInspectorNodeValueString(node, 'method').toUpperCase();
      const nodePath = surfaceInspectorNodeValueString(node, 'path');
      if (!nodeMethod || !nodePath) return false;
      return nodeMethod === upperMethod && surfaceInspectorRouteMatchesTemplate(nodePath, url);
    }) || null;
  }
  function summarizeSurfaceInspectorBackendOperations({
    processSelection = null,
    selectedElement = null,
    diagnostics = null
  } = {}) {
    if (!processSelection?.program || !processSelection?.event) return [];
    if (processSelection.program !== program.id) return [];
    const eventData = surfaceInspectorEventDataForElement(selectedElement);
    const scope = { state, event: eventData };
    const steps = (program.graph || program.steps || []).filter(step => step.event === processSelection.event);
    return steps
      .filter(step => backendFacingStepOps.has(step.op))
      .map(step => {
        const params = interpolateValue(step.params || {}, scope);
        if (step.op === 'refreshProjection') {
          return {
            label: 'refreshProjection',
            summary: 'Re-runs the shared page projection instead of treating client state as the source of truth.'
          };
        }
        if (step.op === 'run') {
          return {
            label: 'run ' + String(params.event || ''),
            summary: 'Dispatches authored frontend event ' + String(params.event || '') + ' through the shared process graph.'
          };
        }
        const method = step.op === 'fetchJson'
          ? 'GET'
          : step.op === 'postJson'
            ? String(params.method || 'POST').toUpperCase()
            : step.op === 'patchJson'
              ? String(params.method || 'PATCH').toUpperCase()
              : String(params.method || 'DELETE').toUpperCase();
        const url = String(params.url || '').trim();
        const route = resolveSurfaceInspectorRouteForRequest({ method, url, diagnostics });
        const routeNode = route?.id
          ? (state.surfaceInspectorGraphById?.[route.id] || null)
          : resolveSurfaceInspectorGraphRouteForRequest({ method, url });
        const authoredBackendProgramSoul = route?.ownerBackendProgramSoul
          || surfaceInspectorNodeValueString(routeNode, 'backendProgramSoul')
          || surfaceInspectorNodeRecordFieldString(routeNode, 'params', 'backendProgramSoul')
          || surfaceInspectorNodeRecordFieldString(routeNode, 'values', 'backendProgramSoul');
        const routeLabel = route?.path || route?.matcher || surfaceInspectorNodeValueString(routeNode, 'path');
        const routeOwner = [
          route?.ownerClass || (authoredBackendProgramSoul ? 'backend-program' : ''),
          authoredBackendProgramSoul || '',
          route?.ownerPluginId || '',
          route?.handler || surfaceInspectorNodeValueString(routeNode, 'handler')
        ].filter(Boolean).join(' / ');
        const governanceSummary = surfaceInspectorGovernanceSummary(route);
        return {
          label: (method + ' ' + (url || routeLabel || step.op)).trim(),
          selectTarget: authoredBackendProgramSoul || route?.id || routeNode?.id || '',
          selectLabel: authoredBackendProgramSoul ? 'Show Backend Program' : ((route?.id || routeNode?.id) ? 'Show Backend Route' : ''),
          summary: (route || routeNode)
            ? ('Lowers through ' + routeLabel + ' with owner ' + routeOwner + '.' + (governanceSummary ? (' ' + governanceSummary) : ''))
            : ('Authored step ' + step.op + ' targets ' + (url || 'a runtime route') + '.')
        };
      });
  }
  const applyInterpolations = (root, scope) => {
    const applyElementAttrs = element => {
      for (const attr of [...element.attributes]) {
        if (!attr.value.includes('\${')) continue;
        const value = interpolateString(attr.value, scope);
        if (attr.name === 'selected' || attr.name === 'checked' || attr.name === 'disabled') {
          if (value === false || value === '' || value === 'false' || value == null) element.removeAttribute(attr.name);
          else element.setAttribute(attr.name, attr.name);
        } else if (value == null || value === false) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute(attr.name, String(value));
        }
      }
    };
    if (root?.nodeType === Node.ELEMENT_NODE) applyElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent && current.textContent.includes('\${')) current.textContent = interpolateString(current.textContent, scope);
        continue;
      }
      applyElementAttrs(current);
    }
  };
  const instantiateTemplate = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const fragment = template.content.cloneNode(true);
    applyInterpolations(fragment, scope);
    return fragment;
  };
  const instantiateSelectOption = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const option = template.content.querySelector('option')?.cloneNode(true);
    if (!option) throw new Error('option template ' + templateId + ' did not yield an option');
    applyInterpolations(option, scope);
    return option;
  };
  const appendTemplateInstance = (target, instance) => {
    const wrapper = instance.firstElementChild;
    if (wrapper?.getAttribute?.('data-template-wrapper') === 'option') {
      while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
      return;
    }
    target.appendChild(instance);
  };
  const renderCollection = ({ widget, from, template, itemAs = 'item', indexAs = 'index', emptyWidget = null, limit = null, reverse = false }) => {
    const el = byWidget(widget);
    if (!el) return;
    const value = Array.isArray(from) ? from : readPath(state, from);
    let items = Array.isArray(value) ? [...value] : [];
    if (reverse) items.reverse();
    if (limit != null && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    el.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const target = el.tagName === 'SELECT' ? el : fragment;
    if (items.length === 0) {
      if (emptyWidget) appendTemplateInstance(target, instantiateTemplate(emptyWidget, scopeFor({ item: null, index: 0 })));
      if (target !== el) el.appendChild(fragment);
      return;
    }
    items.forEach((item, index) => {
      const scope = scopeFor({ item, index, [itemAs]: item, [indexAs]: index });
      if (el.tagName === 'SELECT') {
        el.appendChild(instantiateSelectOption(template, scope));
        return;
      }
      appendTemplateInstance(target, instantiateTemplate(template, scope));
    });
    if (target !== el) el.appendChild(fragment);
  };
  const renderWorldGraph = ({ widget, from }) => {
    const root = byWidget(widget);
    if (!root) return;
    const value = readPath(state, from) || {};
    const graph = value.graph || value;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const groups = graph.groups || [];
    const width = Math.max(900, ...nodes.map(n => (n.x || 0) + 240), ...groups.map(g => (g.x || 0) + (g.width || 0) + 24));
    const height = Math.max(420, ...nodes.map(n => (n.y || 0) + 90), ...groups.map(g => (g.y || 0) + (g.height || 0) + 24));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    if (!state.worldGraphUrlStateApplied) {
      state.worldGraphUrlStateApplied = true;
      const params = new URLSearchParams(window.location.search);
      const selectedFromUrl = params.get('select') || '';
      const modeFromUrl = params.get('mode') || '';
      if (selectedFromUrl) state.worldGraphSelectedId = selectedFromUrl;
      if (validWorldGraphModes.has(modeFromUrl)) {
        state.worldGraphMode = modeFromUrl;
        state.worldGraphInitialSourcePending = modeFromUrl === 'source';
      }
    }
    let selectedId = state.worldGraphSelectedId && byId[state.worldGraphSelectedId] ? state.worldGraphSelectedId : (nodes[0]?.id || '');
    const primitiveIndex = buildPrimitiveIndex();
    const sourceFiles = [...new Map(nodes.flatMap(n => (n.sources || []).map(src => [src.file, src])).filter(([file]) => file).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).values()];
    const currentMode = () => state.worldGraphMode || 'graph';
    const renderModeMenu = () => renderWorldModeMenuView({
      currentMode: currentMode(),
      escapeHtml
    });
    const linkRef = id => byId[id]
      ? '<button class="world-ref-button" data-world-select="' + escapeHtml(id) + '">' + escapeHtml(id) + '</button>'
      : '<button class="world-ref-button" data-world-primitive="' + escapeHtml(String(id || '')) + '" data-world-primitive-kind="unresolved-ref">' + escapeHtml(String(id || '')) + '</button>';
    const linkKind = kind => '<button class="world-kind-button" data-world-kind="' + escapeHtml(kind) + '">' + escapeHtml(kind) + '</button>';
    const typedStringValue = value => {
      if (!value || typeof value !== 'object') return null;
      if (value.type === 'string') return String(value.value || '');
      if (value.type === 'ref') return String(value.target || '');
      return null;
    };
    const nodeValueString = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return typedStringValue(row?.value);
    };
    const routePathFor = node => nodeValueString(node, 'path');
    const routeMethodFor = node => nodeValueString(node, 'method');
    const sourceForNode = node => (node?.sources || []).slice(-1)[0] || null;
    const processViewHref = ({ program, event }) => {
      const url = new URL('/process', window.location.origin);
      if (program) url.searchParams.set('program', program);
      if (event) url.searchParams.set('event', event);
      return url.pathname + url.search;
    };
    const currentWorldTutorialStep = commandTutorialStepById.get(state.worldTutorialProgress?.stepId || '') || null;
    const commandTutorialDisabledScopeRows = () => {
      const stepScopeKey = commandTutorialStepScope(currentWorldTutorialStep)?.key || null;
      const stepScopeAncestors = commandTutorialScopeAncestors(stepScopeKey);
      const stepContextId = commandTutorialStepSurfaceContext(currentWorldTutorialStep)?.id || null;
      const rows = commandTutorialDisabledContextIdsFor(state.worldTutorialProgress).map(contextId => {
        const context = commandTutorialContextInfo(contextId);
        const matchingStep = (stepContextId && stepContextId === contextId ? currentWorldTutorialStep : null)
          || (commandTutorial?.steps || []).find(step => commandTutorialStepSurfaceContext(step)?.id === contextId && step.page === 'world')
          || (commandTutorial?.steps || []).find(step => commandTutorialStepSurfaceContext(step)?.id === contextId)
          || null;
        const focusScopeKey = commandTutorialStepScope(matchingStep)?.key || null;
        return {
          type: 'context',
          contextId,
          scopeKey: focusScopeKey,
          page: matchingStep?.page || null,
          label: context?.label || commandTutorialContextLabel(contextId) || contextId,
          kind: 'context',
          pageLabel: matchingStep?.page ? commandTutorialPageLabel(matchingStep.page) : '',
          currentStepTitle: stepContextId === contextId ? currentWorldTutorialStep?.title || null : null,
          href: matchingStep?.page ? commandTutorialPageHref(matchingStep.page) : null,
          target: matchingStep?.page === 'world' && focusScopeKey ? commandTutorialScopeTargetName(focusScopeKey) : null
        };
      });
      for (const scopeKey of commandTutorialDisabledScopeKeysFor(state.worldTutorialProgress)) {
        const scope = commandTutorialScopeInfo(scopeKey);
        rows.push({
          type: 'scope',
          scopeKey,
          page: scope?.page || null,
          label: scope?.label || scopeKey,
          kind: scope?.kind || 'scope',
          pageLabel: scope?.page ? commandTutorialPageLabel(scope.page) : '',
          currentStepTitle: stepScopeAncestors.includes(scopeKey) ? currentWorldTutorialStep?.title || null : null,
          href: scope?.page ? commandTutorialPageHref(scope.page) : null,
          target: scope?.page === 'world' ? commandTutorialScopeTargetName(scopeKey) : null
        });
      }
      return rows;
    };
    const commandTutorialScopeInventoryRows = () => buildGuidanceScopeInventoryRowsFromHelpers({
      scopes: commandTutorialScopeCatalog,
      steps: commandTutorial?.steps || [],
      progress: state.worldTutorialProgress,
      currentStep: currentWorldTutorialStep,
      currentSurfacePage: 'world',
      stepScopeFn: commandTutorialStepScope,
      stepSurfaceContextFn: commandTutorialStepSurfaceContext,
      stepIndexFn: stepId => (commandTutorial?.steps || []).findIndex(step => step.id === stepId),
      scopeInfoFn: commandTutorialScopeInfo,
      contextInfoFn: commandTutorialContextInfo,
      scopeTargetNameFn: commandTutorialScopeTargetName,
      scopeAncestorsFn: commandTutorialScopeAncestors,
      disabledScopeKeysFn: commandTutorialDisabledScopeKeysFor,
      disabledContextIdsFn: commandTutorialDisabledContextIdsFor,
      isScopeDisabledFn: isCommandTutorialScopeDisabled,
      pageLabelFn: commandTutorialPageLabel
    });
    const continueWorldTutorialOnPage = page => {
      const href = commandTutorialPageHref(page);
      if (!href) return;
      const target = new URL(href, window.location.origin);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    };
    const queueWorldTutorialStateLoad = () => {
      if (!state.session?.authenticated || !commandTutorial?.id || state.worldTutorialLoaded === true || state.worldTutorialLoading === true) return;
      state.worldTutorialLoading = true;
      void requestWorldTutorialProgress()
        .catch(() => {})
        .finally(() => {
          state.worldTutorialLoading = false;
          if (byWidget(widget)) draw();
        });
    };
    const linkPrimitive = (kind, value) => {
      const text = String(value ?? '');
      if (sourceFiles.some(src => src.file === text)) return '<button class="world-ref-button" data-world-source-file="' + escapeHtml(text) + '">' + escapeHtml(text) + '</button>';
      return '<button class="world-ref-button" data-world-primitive="' + escapeHtml(text) + '" data-world-primitive-kind="' + escapeHtml(kind) + '">' + escapeHtml(text) + '</button>';
    };
    function buildPrimitiveIndex() {
      const map = new Map();
      const add = (kind, value, where = '') => {
        const text = String(value ?? '');
        if (!text) return;
        if (!map.has(kind)) map.set(kind, new Map());
        const bucket = map.get(kind);
        if (!bucket.has(text)) bucket.set(text, { value: text, count: 0, where: new Set() });
        const entry = bucket.get(text);
        entry.count += 1;
        if (where) entry.where.add(where);
      };
      const visitTyped = (value, where) => {
        if (!value || typeof value !== 'object') return;
        if (value.type === 'string') add('string', value.value, where);
        else if (value.type === 'number') add('number', value.value, where);
        else if (value.type === 'boolean') add('boolean', value.value, where);
        else if (value.type === 'null') add('null', 'null', where);
        else if (value.type === 'ref') { if (!byId[value.target]) add('unresolved-ref', value.target, where); }
        else if (value.type === 'list') (value.items || []).forEach(x => visitTyped(x, where));
        else if (value.type === 'record') Object.values(value.fields || {}).forEach(x => visitTyped(x, where));
      };
      for (const n of nodes) {
        add('kind', n.kind || 'thing', n.id);
        if (n.context && !byId[n.context]) add('context', n.context, n.id);
        for (const p of [...(n.properties || []), ...(n.values || [])]) visitTyped(p.value, n.id + '.' + p.key);
        for (const b of n.badges || []) add('badge', b.label || b, n.id);
      }
      for (const e of edges) {
        add('relation', e.rel, e.from + '→' + e.to);
        for (const p of e.properties || []) {
          if (typeof p.value === 'string' || typeof p.value === 'number' || typeof p.value === 'boolean') add('association-property', p.value, e.rel + '.' + p.key);
        }
      }
      return map;
    }
    const runtimeSurfaceAction = surface => surface?.action && typeof surface.action === 'object'
      ? { ...surface.action }
      : { kind: 'navigate', href: surface?.href };
    const buildWorldCommandCatalog = () => {
      const selectedNode = byId[selectedId] || null;
      const items = [];
      const push = item => {
        if (!item?.id || !item?.action?.kind) return;
        items.push(item);
      };
      if (selectedNode && sourceForNode(selectedNode)?.file) {
        push({
          id: 'command:selected-source',
          type: 'command',
          title: 'Show Source For Selected Object',
          subtitle: selectedNode.id,
          search: 'selected source show source witnesses ' + selectedNode.id,
          priority: 260,
          action: { kind: 'source', file: sourceForNode(selectedNode).file, focusId: selectedNode.id }
        });
      }
      if (selectedNode) {
        push({
          id: 'command:selected-witnesses',
          type: 'command',
          title: 'Show Witnesses For Selected Object',
          subtitle: selectedNode.id,
          search: 'show witnesses selected object history ' + selectedNode.id + ' ' + selectedNode.label,
          priority: 255,
          action: { kind: 'mode', mode: 'witness' }
        });
      }
      if (selectedNode?.processEvents?.length) {
        for (const entry of selectedNode.processEvents) {
          push({
            id: 'command:selected-process:' + selectedNode.id + ':' + entry.event,
            type: 'command',
            title: 'Show Process For ' + entry.event,
            subtitle: selectedNode.id + ' / ' + entry.stepCount + ' steps',
            search: 'show process selected object frontend program event ' + selectedNode.id + ' ' + entry.event,
            priority: 258,
            action: { kind: 'navigate', href: processViewHref({ program: selectedNode.id, event: entry.event }) }
          });
        }
      } else if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) {
        push({
          id: 'command:selected-process:' + selectedNode.id,
          type: 'command',
          title: 'Show Process For Selected Object',
          subtitle: selectedNode.processSelection.program + ' / ' + selectedNode.processSelection.event,
          search: 'show process selected object frontend execution ' + selectedNode.id + ' ' + selectedNode.processSelection.program + ' ' + selectedNode.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedNode.processSelection) }
        });
      }
      const versionState = selectedNode?.widgetVersionState || null;
      const versionRows = selectedNode?.widgetVersions || [];
      if (selectedNode?.kind === 'widget' && versionRows.length) {
        for (const row of versionRows.filter(entry => !entry.isActive)) {
          push({
            id: 'command:widget-version:' + row.soul + ':' + row.version,
            type: 'command',
            title: 'Upgrade Widget To ' + row.version,
            subtitle: row.soul + (row.transitionFromActive ? ' / ' + row.transitionFromActive : ''),
            search: 'upgrade widget activate version ' + row.soul + ' ' + row.version + ' ' + (row.transitionFromActive || ''),
            priority: 250,
            action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
          });
        }
        if (versionState?.rollbackAvailable) {
          push({
            id: 'command:widget-version-rollback:' + versionState.soul,
            type: 'command',
            title: 'Rollback Widget To ' + versionState.rollbackVersion,
            subtitle: versionState.soul,
            search: 'rollback widget version ' + versionState.soul + ' ' + versionState.rollbackVersion,
            priority: 248,
            action: { kind: 'widget-version-rollback', soul: versionState.soul }
          });
        }
      }
      for (const surface of runtimeSurfacesFor('world-command')) {
        push({
          id: surface.id,
          type: surface.type || 'surface',
          tier: surface.tier || 'internal',
          title: surface.title,
          subtitle: surface.subtitle,
          search: surface.search,
          priority: 210,
          action: runtimeSurfaceAction(surface)
        });
      }
      if (state.session?.authenticated) {
        const tutorialProgress = state.worldTutorialProgress;
        if (tutorialProgress && !tutorialProgress.completedAt) {
          if (tutorialProgress.hidden && currentWorldTutorialStep?.page) {
            push({
              id: 'tutorial:resume:' + (currentWorldTutorialStep.page || 'current'),
              type: 'surface',
              tier: 'harness',
              title: 'Resume Tutorial On ' + commandTutorialPageLabel(currentWorldTutorialStep.page),
              subtitle: currentWorldTutorialStep.title || currentWorldTutorialStep.id,
              search: 'resume tutorial sourcery guidance hidden surface ' + (currentWorldTutorialStep.page || '') + ' ' + (currentWorldTutorialStep.title || ''),
              priority: 214,
              action: { kind: 'tutorial-resume', href: commandTutorialPageHref(currentWorldTutorialStep.page) || '/world' }
            });
          }
          for (const row of commandTutorialDisabledScopeRows()) {
            push({
              id: 'tutorial:enable:' + (row.type === 'context' ? ('context:' + row.contextId) : row.scopeKey),
              type: 'command',
              tier: 'harness',
              title: 'Enable Sourcery For ' + row.label,
              subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label + (row.pageLabel ? (' / ' + row.pageLabel) : '')),
              search: 'enable tutorial on sourcery guidance disabled ' + row.type + ' ' + (row.scopeKey || row.contextId || '') + ' ' + row.label + ' ' + row.kind + ' ' + (row.page || '') + ' ' + (row.currentStepTitle || ''),
              priority: 222,
              action: row.type === 'context'
                ? { kind: 'tutorial-enable-context', contextId: row.contextId }
                : { kind: 'tutorial-enable-scope', scopeKey: row.scopeKey }
            });
            if (row.href) {
              push({
                id: 'tutorial:open-disabled:' + row.scopeKey,
                type: 'surface',
                tier: 'harness',
                title: 'Open ' + row.pageLabel + ' Sourcery Recovery',
                subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label),
                search: 'open disabled tutorial sourcery guidance recovery ' + row.scopeKey + ' ' + row.pageLabel + ' ' + row.label + ' ' + (row.currentStepTitle || ''),
                priority: 216,
                action: { kind: 'navigate', href: row.href }
              });
            }
          }
          if (currentWorldTutorialStep?.page && currentWorldTutorialStep.page !== 'world') {
            const targetHref = commandTutorialPageHref(currentWorldTutorialStep.page);
            if (targetHref) {
              push({
                id: 'tutorial:continue:' + currentWorldTutorialStep.page,
                type: 'surface',
                tier: 'harness',
                title: 'Continue Tutorial On ' + commandTutorialPageLabel(currentWorldTutorialStep.page),
                subtitle: currentWorldTutorialStep.title || currentWorldTutorialStep.id,
                search: 'continue tutorial sourcery current step surface ' + currentWorldTutorialStep.page + ' ' + (currentWorldTutorialStep.title || ''),
                priority: 218,
                action: { kind: 'navigate', href: targetHref }
              });
            }
          }
        }
      }
      for (const node of nodes) {
        const keywords = [node.id, node.label, node.kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
        push({
          id: 'node:' + node.id,
          type: node.kind || 'thing',
          tier: node.surfaceTier || null,
          title: String(node.label || node.id),
          subtitle: (node.kind || 'thing') + (node.surfaceTier ? ' / ' + node.surfaceTier : '') + (node.context ? ' / ' + node.context : ''),
          search: keywords,
          priority: node.kind === 'capability' ? 190 : node.kind === 'widget' ? 180 : node.kind === 'process' ? 175 : 150,
          action: { kind: 'select', id: node.id, mode: 'graph' }
        });
        const routePath = routePathFor(node);
        if (node.kind === 'route' && routePath && routeMethodFor(node) === 'GET') {
          push({
            id: 'route:' + node.id,
            type: 'page',
            tier: node.surfaceTier || null,
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'page route surface ' + routePath + ' ' + node.id + ' ' + (node.surfaceTier || ''),
            priority: 205,
            action: { kind: 'navigate', href: routePath }
          });
        }
        if (node.kind === 'process') {
          push({
            id: 'execution:' + node.id,
            type: 'execution',
            tier: node.surfaceTier || null,
            title: 'Inspect Witnessed Process ' + String(node.label || node.id),
            subtitle: node.context || 'process',
            search: 'witnessed execution process witnesses runs ' + keywords,
            priority: 185,
            action: { kind: 'select', id: node.id, mode: 'graph' }
          });
        }
        const source = sourceForNode(node);
        if (source?.file) {
          push({
            id: 'source:' + node.id,
            type: 'source',
            tier: node.surfaceTier || null,
            title: 'Open Source For ' + String(node.label || node.id),
            subtitle: source.file,
            search: 'source witnessed file dsl ' + keywords + ' ' + source.file,
            priority: 170,
            action: { kind: 'source', file: source.file, focusId: node.id }
          });
        }
      }
      return [...new Map(items.map(item => [item.id, item])).values()];
    };
    const scoreWorldCommandItem = (item, query) => {
      if (!query) return item.priority || 0;
      const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
      const title = String(item.title || '').toLowerCase();
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return item.priority || 0;
      let score = item.priority || 0;
      for (const term of terms) {
        if (title === term) score += 220;
        else if (title.startsWith(term)) score += 120;
        else if (title.includes(term)) score += 70;
        else if (haystack.includes(term)) score += 25;
        else return -1;
      }
      return score;
    };
    const visibleWorldCommands = () => {
      const query = String(state.worldCommandQuery || '').trim();
      return buildWorldCommandCatalog()
        .map(item => ({ ...item, score: scoreWorldCommandItem(item, query) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
        .slice(0, query ? 24 : 12);
    };
    const renderWorldCommandPalette = () => renderWorldCommandPaletteView({
      worldCommandOpen: state.worldCommandOpen,
      query: String(state.worldCommandQuery || ''),
      items: visibleWorldCommands(),
      escapeHtml
    });
    const renderWorldTutorialPanel = () => {
      if (!state.session?.authenticated) return '';
      const progress = state.worldTutorialProgress;
      const step = commandTutorialStep(progress);
      const surface = worldTutorialSurfaceState(progress);
      if (!progress && !state.worldTutorialError) return '';
      const currentConcepts = step ? commandTutorialStepConcepts(step) : [];
      const revealedConcepts = commandTutorialRevealedConcepts(progress);
      const disabledRows = commandTutorialDisabledScopeRows();
      const inventoryRows = commandTutorialScopeInventoryRows();
      const previous = commandTutorialPreviousStep(progress);
      const currentScopeKey = commandTutorialStepScope(step)?.key || null;
      const currentScopeDisabled = Boolean(progress && currentScopeKey && isCommandTutorialScopeDisabled(progress, currentScopeKey));
      const currentContextId = commandTutorialStepSurfaceContext(step)?.id || null;
      const currentContextDisabled = Boolean(progress && currentContextId && isCommandTutorialContextDisabled(progress, currentContextId));
      const summary = !progress
        ? 'Tutorial progress is not active on this surface yet.'
        : progress.completedAt
          ? 'Tutorial complete. The world surface remains available for truthful inspection and handoff into real product pages.'
          : surface.kind === 'offpage'
            ? (() => {
                return currentContextDisabled
                  ? ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface, but Sourcery is disabled in that context until you re-enable it.')
                  : (currentScopeDisabled
                  ? ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface, but Sourcery is disabled there until you re-enable that scope.')
                  : ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface.'));
              })()
            : surface.kind === 'disabled-context'
              ? 'Sourcery is disabled for this context, but the current step remains recoverable without losing progress.'
            : surface.kind === 'disabled'
              ? 'Sourcery is disabled for this scope, but the current step remains recoverable without losing progress.'
              : surface.kind === 'hidden'
                ? 'Tutorial paused. Resume to continue with the current authored step.'
                : (commandTutorialReplayScopeKeyFor(progress)
                    ? ('Replaying this scope from here: ' + (step?.title || '') + '. This replays guidance only and does not roll back app state.')
                    : (step ? (step.title + ' (' + step.chapterId + ' / ' + step.page + ')') : 'Tutorial in progress.'));
      return renderWorldTutorialPanelView({
        sessionAuthenticated: Boolean(state.session?.authenticated),
        progress,
        error: state.worldTutorialError || '',
        step,
        surfaceKind: surface.kind,
        summary,
        disabledRows,
        inventoryRows,
        previousStep: previous,
        currentSurfaceContext,
        currentConcepts,
        revealedConcepts,
        resumeLabel: surface.kind === 'offpage'
          ? ('Continue On ' + commandTutorialPageLabel(surface.page))
          : (surface.kind === 'disabled-context'
            ? 'Enable Sourcery In This Context'
            : (surface.kind === 'disabled' ? 'Enable Sourcery Here' : 'Resume Tutorial')),
        escapeHtml
      });
    };
    const renderInspector = () => renderWorldInspectorView({
      selectedKind: state.worldGraphSelectedKind || '',
      nodes,
      selectedId,
      byId,
      edges,
      worldGraphVersionStatus: state.worldGraphVersionStatus,
      linkRef,
      linkKind,
      linkPrimitive,
      escapeHtml
    });
    const ensureWorldSystemOverview = async ({ force = false } = {}) => {
      if (!force && state.worldSystemLoaded && state.worldSystemModel) return state.worldSystemModel;
      if (state.worldSystemPromise) return state.worldSystemPromise;
      state.worldSystemLoading = true;
      state.worldSystemPromise = (async () => {
        const url = '/api/world-system';
        const response = await fetch(resolveRuntimeUrl(url), requestOptions({}, { url }));
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          state.worldSystemError = body?.error || 'system overview request failed';
          state.worldSystemLoaded = true;
          return null;
        }
        state.worldSystemModel = body;
        state.worldSystemError = null;
        state.worldSystemLoaded = true;
        return body;
      })();
      try {
        return await state.worldSystemPromise;
      } finally {
        state.worldSystemLoading = false;
        state.worldSystemPromise = null;
        if (byWidget(widget)) draw();
      }
    };
    const renderCanvas = () => {
      if (currentMode() === 'system') {
        if (!state.worldSystemLoaded && !state.worldSystemLoading) void ensureWorldSystemOverview();
        return renderWorldSystemOverviewView({
          model: state.worldSystemModel || null,
          loading: state.worldSystemLoading === true,
          error: state.worldSystemError || '',
          escapeHtml
        });
      }
      if (currentMode() === 'source') return renderWorldSourceDocumentView({
        doc: state.worldGraphSource,
        sourceFiles,
        worldGraphSourceFocus: state.worldGraphSourceFocus,
        selectedId,
        byId,
        escapeHtml
      });
      if (currentMode() === 'primitive') return renderWorldPrimitiveBrowserView({
        primitiveIndex,
        selectedKind: state.worldGraphSelectedPrimitiveKind,
        selectedValue: state.worldGraphSelectedPrimitiveValue,
        byId,
        escapeHtml
      });
      if (currentMode() === 'things') return renderWorldThingListView({
        nodes,
        selectedKind: state.worldGraphSelectedKind || 'thing',
        escapeHtml
      });
      if (currentMode() === 'witness') return renderWorldWitnessBrowserView({
        selectedNode: byId[selectedId] || null,
        escapeHtml
      });
      if (currentMode() === 'process') return renderWorldProcessExplorerView();
      return renderWorldGraphCanvasView({
        width,
        height,
        nodes,
        edges,
        groups,
        byId,
        selectedId,
        escapeHtml
      });
    };
    const openSourceFile = async (file, focusId = selectedId) => {
      if (!file) return;
      state.worldGraphSourceFocus = focusId || selectedId;
      const res = await fetch('/api/source?file=' + encodeURIComponent(file), requestOptions({}, { url: '/api/source' }));
      state.worldGraphSource = await res.json().catch(() => ({ file, text: 'Failed to load source' }));
      state.worldGraphMode = 'source';
      state.worldGraphPrimitiveMode = false;
    };
    const openSourceForSelected = async () => {
      const src = (byId[selectedId]?.sources || []).slice(-1)[0];
      if (src?.file) await openSourceFile(src.file, selectedId);
    };
    const tutorialDomRoot = () => root.closest('[data-widget="world_graph_page"]') || root;
    const focusWorldTutorialTarget = targetName => {
      if (!targetName) return false;
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-tutorial-target="' + CSS.escape(targetName) + '"]');
      if (!target) return false;
      const scope = target.closest('.world-main-pane, .world-graph-inspector, .world-command-palette, nav, form, section') || target;
      domRoot.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      target.setAttribute('data-tutorial-current', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = target.matches?.('input, textarea, select, button, a')
        ? target
        : target.querySelector?.('input, textarea, select, button, a, [tabindex]');
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const focusWorldTutorialScopeTarget = targetName => {
      if (!targetName) return false;
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-tutorial-target="' + CSS.escape(targetName) + '"]');
      if (!target) return false;
      const scope = target.closest('.world-main-pane, .world-graph-inspector, .world-command-palette, nav, form, section') || target;
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = target.matches?.('input, textarea, select, button, a')
        ? target
        : target.querySelector?.('input, textarea, select, button, a, [tabindex]');
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const focusWorldTutorialDisabledList = () => {
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-world-tutorial-disabled-list]');
      if (!target) return false;
      domRoot.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      target.setAttribute('data-tutorial-focus-scope', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.querySelector('button, [tabindex]')?.focus?.({ preventScroll: true });
      return true;
    };
    const updateWorldTutorialApi = () => {
      window.__witnessTutorial = {
        get currentStepId() { return state.worldTutorialProgress?.stepId || null; },
        get currentChapterId() { return state.worldTutorialProgress?.chapterId || null; },
        get currentPage() { return commandTutorialStep(state.worldTutorialProgress)?.page || null; },
        get currentScopeKey() { return commandTutorialStepScope(commandTutorialStep(state.worldTutorialProgress))?.key || null; },
        get currentConceptIds() { return commandTutorialStepConcepts(commandTutorialStep(state.worldTutorialProgress)).map(concept => concept.id); },
        get revealedConceptIds() { return commandTutorialRevealedConcepts(state.worldTutorialProgress).map(concept => concept.id); },
        get replayScopeKey() { return commandTutorialReplayScopeKeyFor(state.worldTutorialProgress); },
        get replayStepId() { return commandTutorialReplayStepId(state.worldTutorialProgress); },
        get completedAt() { return state.worldTutorialProgress?.completedAt || null; },
        get hidden() { return state.worldTutorialProgress?.hidden === true; },
        get disabledScopeKeys() { return commandTutorialDisabledScopeKeysFor(state.worldTutorialProgress); },
        get disabledContextIds() { return commandTutorialDisabledContextIdsFor(state.worldTutorialProgress); },
        get disabledPages() { return commandTutorialDisabledPages(state.worldTutorialProgress); },
        get surfacePage() { return 'world'; },
        get surfaceContext() { return typeof config.surfaceContext === 'string' && config.surfaceContext.trim() ? config.surfaceContext.trim() : null; },
        get surfaceRouteId() { return typeof config.surfaceRouteId === 'string' && config.surfaceRouteId.trim() ? config.surfaceRouteId.trim() : null; },
        get surfaceRootWidgetId() { return typeof config.surfaceRootWidgetId === 'string' && config.surfaceRootWidgetId.trim() ? config.surfaceRootWidgetId.trim() : null; },
        get surfaceProgramId() { return typeof config.surfaceProgramId === 'string' && config.surfaceProgramId.trim() ? config.surfaceProgramId.trim() : null; },
        get surfaceStatus() { return worldTutorialSurfaceState(state.worldTutorialProgress).kind; }
      };
    };
    const advanceWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      if (!current) return;
      const step = commandTutorialStep(current);
      const nextIndex = (commandTutorial?.steps || []).findIndex(candidate => candidate.id === step?.id);
      const next = nextIndex >= 0 ? (commandTutorial.steps[nextIndex + 1] || null) : null;
      if (!next) {
        await persistWorldTutorialProgress({ ...current, chapterStatus: 'completed', completedAt: new Date().toISOString(), hidden: false, replayScopeKey: null });
        return;
      }
      await persistWorldTutorialProgress({ ...current, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, hidden: false, replayScopeKey: null });
    };
    const backWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const previous = commandTutorialPreviousStep(current);
      if (!current || !previous) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: previous.chapterId,
        stepId: previous.id,
        completedAt: null,
        hidden: false,
        replayScopeKey: commandTutorialStepScope(previous)?.key || null
      });
    };
    const restartWorldTutorialChapter = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      const first = (commandTutorial?.steps || []).find(candidate => candidate.chapterId === (current?.chapterId || step?.chapterId));
      if (!current || !first) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: first.chapterId,
        stepId: first.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayScopeKey: null
      });
    };
    const restartWorldTutorialFromHere = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      if (!current || !step) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: step.chapterId,
        stepId: step.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayScopeKey: commandTutorialStepScope(step)?.key || null
      });
    };
    const resumeWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const surface = worldTutorialSurfaceState(current);
      if (!current) return;
      if (surface.kind === 'offpage') {
        continueWorldTutorialOnPage(surface.page);
        return;
      }
      if (surface.kind === 'disabled-context') {
        await persistWorldTutorialProgress(clearWorldTutorialContextDisabled(current, surface.contextId || commandTutorialStepSurfaceContext(commandTutorialStep(current))?.id || currentSurfaceContext));
        return;
      }
      if (surface.kind === 'disabled') {
        await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(current, surface.scopeKey || commandTutorialStepScope(commandTutorialStep(current))?.key || 'world'));
        return;
      }
      await persistWorldTutorialProgress({ ...current, hidden: false, replayScopeKey: null });
    };
    const runWorldTutorialSuggestion = async suggestion => {
      await runGuidanceSuggestionAction(suggestion, {
        resumeTutorial: async () => {
          await resumeWorldTutorial();
          draw();
        },
        enableCurrentPage: async scopeKey => {
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(state.worldTutorialProgress, scopeKey || commandTutorialStepScope(commandTutorialStep(state.worldTutorialProgress))?.key || 'world'));
          draw();
        },
        enableContext: async contextId => {
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(clearWorldTutorialContextDisabled(state.worldTutorialProgress, contextId || commandTutorialStepSurfaceContext(commandTutorialStep(state.worldTutorialProgress))?.id || currentSurfaceContext));
          draw();
        },
        enablePage: async (scopeKey, page) => {
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(state.worldTutorialProgress, scopeKey || (page === 'world' ? 'world' : null)));
          if (page && page !== 'world') continueWorldTutorialOnPage(page);
          else draw();
        },
        continueSurface: async page => {
          continueWorldTutorialOnPage(page);
        },
        focusDisabledScopes: async () => {
          focusWorldTutorialDisabledList();
        },
        focusTarget: async target => {
          focusWorldTutorialTarget(target);
        },
        openRuntimeIssues: async () => {
          const shell = window.__sourceryCompanionShell;
          if (!shell?.panel) return;
          shell.panel.hidden = false;
          shell.issues?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        },
        focusRuntimeTarget: async targetId => {
          const node = document.getElementById(targetId);
          node?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
          node?.focus?.();
        },
        rerunRuntimeProbe: async () => {
          const inspection = window.world || window.__surfaceRuntimeInspection || null;
          await inspection?.rerunProbe?.();
        },
        copyRuntimeInspection: async () => {
          const inspection = window.world || window.__surfaceRuntimeInspection || null;
          const payload = typeof inspection?.inspect === 'function' ? inspection.inspect() : null;
          const shell = window.__sourceryCompanionShell || null;
          const surfaceSegment = typeof shell?.inspection?.activeSurfaceId === 'string' && shell.inspection.activeSurfaceId.trim()
            ? shell.inspection.activeSurfaceId.trim().replace(/[\\/:*?"<>|]+/g, '-')
            : 'surface';
          const routeSegment = typeof window.location?.pathname === 'string' && window.location.pathname.trim()
            ? window.location.pathname.trim().replace(/[\\/:*?"<>|]+/g, '-')
            : 'route';
          if (!document?.createElement || !document.body?.appendChild) return;
          const BlobCtor = window.Blob || globalThis?.Blob;
          const URLApi = window.URL || globalThis?.URL;
          if (typeof BlobCtor !== 'function' || typeof URLApi?.createObjectURL !== 'function') return;
          const blob = new BlobCtor([JSON.stringify(payload ?? null, null, 2)], { type: 'application/json' });
          const href = URLApi.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = href;
          anchor.download = 'sourcery-' + (surfaceSegment || 'surface') + '-' + (routeSegment || 'route') + '.json';
          anchor.hidden = true;
          document.body.appendChild(anchor);
          anchor.click?.();
          anchor.parentNode?.removeChild?.(anchor);
          URLApi.revokeObjectURL?.(href);
        }
      });
    };
    const syncWorldTutorialCompanion = () => {
      if (!state.session?.authenticated) return;
      syncWorldTutorialCompanionShell({
        windowTarget: window,
        documentTarget: document,
        progress: state.worldTutorialProgress,
        currentStep: progress => commandTutorialStep(progress),
        tutorialSurfaceState: worldTutorialSurfaceState,
        tutorialPageLabel: commandTutorialPageLabel,
        tutorialStepScope: commandTutorialStepScope,
        tutorialStepSurfaceContext: commandTutorialStepSurfaceContext,
        tutorialContextInfo: commandTutorialContextInfo,
        isTutorialContextDisabled: isCommandTutorialContextDisabled,
        isTutorialScopeDisabled: isCommandTutorialScopeDisabled,
        scopeInventoryRowsFn: commandTutorialScopeInventoryRows,
        onResume: async () => {
          await resumeWorldTutorial();
          draw();
        }
      });
    };
    if (!state.worldTutorialCompanionBound) {
      state.worldTutorialCompanionBound = true;
      ensureWorldTutorialCompanionShell({
        documentTarget: document,
        windowTarget: window,
        runSuggestion: runWorldTutorialSuggestion
      });
    }
    const executeWorldCommand = async item => {
      if (!item?.action) return;
      const action = item.action;
      state.worldCommandOpen = false;
      state.worldCommandQuery = '';
      state.worldCommandFocusRequested = false;
      if (action.kind === 'navigate') {
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'mode') {
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode !== 'source') state.worldGraphSource = null;
        if (state.worldGraphMode === 'source' && !state.worldGraphSource) await openSourceForSelected();
        draw();
        return;
      }
      if (action.kind === 'source') {
        await openSourceFile(action.file, action.focusId || selectedId);
        draw();
        return;
      }
      if (action.kind === 'tutorial-enable-scope') {
        if (!state.session?.authenticated || !state.worldTutorialProgress) return;
        const nextProgress = clearWorldTutorialScopeDisabled(state.worldTutorialProgress, action.scopeKey);
        const response = await fetch('/api/guidance-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextProgress)
        }, { url: '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id) }));
        const body = await response.json().catch(() => ({}));
        state.worldTutorialProgress = response.ok
          ? normalizeWorldTutorialProgress(body.progress || nextProgress)
          : state.worldTutorialProgress;
        state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
        state.worldTutorialLoaded = true;
        state.worldCommandOpen = false;
        state.worldCommandQuery = '';
        draw();
        return;
      }
      if (action.kind === 'tutorial-enable-context') {
        if (!state.session?.authenticated || !state.worldTutorialProgress) return;
        const nextProgress = clearWorldTutorialContextDisabled(state.worldTutorialProgress, action.contextId || currentSurfaceContext);
        const response = await fetch('/api/guidance-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextProgress)
        }, { url: '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id) }));
        const body = await response.json().catch(() => ({}));
        state.worldTutorialProgress = response.ok
          ? normalizeWorldTutorialProgress(body.progress || nextProgress)
          : state.worldTutorialProgress;
        state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
        state.worldTutorialLoaded = true;
        state.worldCommandOpen = false;
        state.worldCommandQuery = '';
        draw();
        return;
      }
      if (action.kind === 'tutorial-resume') {
        if (state.session?.authenticated && state.worldTutorialProgress) {
          const nextProgress = {
            ...state.worldTutorialProgress,
            hidden: false,
            replayScopeKey: null
          };
          await fetch('/api/guidance-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(nextProgress)
          }, { url: '/api/guidance-progress/' + encodeURIComponent(commandTutorial.id) })).catch(() => {});
          state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
          state.worldTutorialLoaded = true;
        }
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'widget-version-activate') {
        await requestWidgetVersionChange({ soul: action.soul, version: action.version });
        return;
      }
      if (action.kind === 'widget-version-rollback') {
        await requestWidgetVersionRollback({ soul: action.soul });
        return;
      }
      if (action.kind === 'select') {
        selectedId = action.id;
        state.worldGraphSelectedId = action.id;
        state.worldGraphSelectedKind = '';
        state.worldGraphPrimitiveMode = false;
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode === 'source') await openSourceForSelected();
        else state.worldGraphSource = null;
        draw();
      }
    };
    const requestWidgetVersionChange = async ({ soul, version }) => {
      if (!soul || !version) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/activate', requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version })
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/activate' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Activated ' + version + (body.status ? ' (' + body.status + ')' : ''))
          : (body.error || 'Widget version activation failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const requestWidgetVersionRollback = async ({ soul }) => {
      if (!soul) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/rollback', requestOptions({
        method: 'POST'
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Rolled back to ' + (body.version || 'previous version'))
          : (body.error || 'Widget version rollback failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const draw = () => {
      queueWorldTutorialStateLoad();
      root.innerHTML = renderWorldGraphShell({
        tutorialPanel: renderWorldTutorialPanel(),
        inspector: renderInspector(),
        modeMenu: renderModeMenu(),
        commandPalette: renderWorldCommandPalette(),
        canvas: renderCanvas()
      });
      queuePendingWorldSourceLoad({
        state,
        currentMode,
        openSourceForSelected,
        byWidget,
        widget,
        redraw: draw
      });
      bindWorldGraphActions({
        root,
        state,
        draw,
        currentMode,
        openSourceForSelected,
        openSourceFile,
        requestWidgetVersionChange,
        requestWidgetVersionRollback,
        processViewHref,
        getSelectedId: () => selectedId,
        setSelectedId: id => {
          selectedId = id;
        },
        windowTarget: window
      });
      bindWorldCommandActions({
        root,
        state,
        draw,
        visibleWorldCommands,
        executeWorldCommand
      });
      bindWorldTutorialActions({
        root,
        state,
        draw,
        focusWorldTutorialTarget,
        focusWorldTutorialScopeTarget,
        focusWorldTutorialDisabledList,
        resumeWorldTutorial,
        advanceWorldTutorial,
        backWorldTutorial,
        restartWorldTutorialChapter,
        restartWorldTutorialFromHere,
        persistWorldTutorialProgress,
        clearWorldTutorialScopeDisabled,
        clearWorldTutorialContextDisabled,
        disableWorldTutorialOnCurrentScope,
        disableWorldTutorialOnCurrentContext,
        clearWorldTutorialProgress,
        currentSurfaceContext,
        windowTarget: window
      });
      runWorldPostRender({
        root,
        state,
        byId,
        getSelectedId: () => selectedId,
        currentMode,
        updateWorldTutorialApi,
        worldTutorialSurfaceState,
        commandTutorialStep,
        focusWorldTutorialTarget,
        tutorialDomRoot,
        syncWorldCommandFocus
      });
      syncWorldTutorialCompanion();
    };
    if (!state.worldCommandShortcutBound) {
      state.worldCommandShortcutBound = true;
      bindWorldCommandShortcuts({
        state,
        draw,
        windowTarget: window,
        documentTarget: document
      });
    }
    draw();
  };
  const initSession = async () => {
    const url = '/api/session';
    const res = await fetch(resolveRuntimeUrl(url), requestOptions({}, { url }));
    const body = await res.json().catch(() => ({ authenticated: false }));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    await requestWorldTutorialProgress().catch(() => {});
  };
  const setSession = async ({ from }) => {
    const credentials = state[from] || {};
    const url = '/api/session';
    const res = await fetch(resolveRuntimeUrl(url), requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username || '',
        password: credentials.password || ''
      })
    }, { url }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    await requestWorldTutorialProgress().catch(() => {});
  };
  const logout = async () => {
    const url = '/api/session';
    const res = await fetch(resolveRuntimeUrl(url), requestOptions({ method: 'DELETE' }, { url }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'logout failed');
    }
    syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
    await requestWorldTutorialProgress().catch(() => {});
  };
  const formForWidget = widget => {
    const el = byWidget(widget);
    if (!el) return null;
    return el.matches?.('form') ? el : el.querySelector?.('form') || null;
  };
  const readTypedForm = (data, schema) => {
    const result = validateProcessInput(typeModel, schema, data, { coerceStrings: true });
    if (result.ok) return result.value;
    const first = result.failures?.[0];
    throw new Error(first?.reason || ('typed validation failed for ' + schema));
  };
  const readFormData = (form, { checkboxes } = {}) => {
    const data = Object.fromEntries(new FormData(form).entries());
    if (checkboxes === 'boolean') {
      for (const field of Array.from(form.elements || [])) {
        if (!(field instanceof HTMLInputElement)) continue;
        if (field.type !== 'checkbox' || !field.name) continue;
        data[field.name] = Boolean(field.checked);
      }
    }
    return data;
  };
  const readForm = ({ widget, into, schema, checkboxes }) => {
    const form = formForWidget(widget);
    if (!form) throw new Error('widget ' + widget + ' does not contain a form');
    const data = readFormData(form, { checkboxes });
    state[into] = schema ? readTypedForm(data, schema) : data;
  };
  const clearForm = ({ widget }) => { formForWidget(widget)?.reset?.(); };
  const setQueryParam = ({ name, param, value = '', href = '', replace = true, reload = false }) => {
    const key = String(name || param || '').trim();
    if (!key) throw new Error('setQueryParam requires a parameter name');
    const url = new URL(href || window.location.href, window.location.origin);
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
    if (reload) {
      window.location.assign(url.toString());
      return;
    }
    if (replace === false) window.history.pushState({}, '', url.toString());
    else window.history.replaceState({}, '', url.toString());
  };
  const domEventPayload = target => {
    const data = { ...(target?.dataset || {}) };
    if (target && 'name' in target && target.name) data.name = target.name;
    if (target && 'value' in target) data.value = target.value;
    if (target && 'checked' in target) data.checked = Boolean(target.checked);
    if (target && 'selectedIndex' in target) data.selectedIndex = Number(target.selectedIndex);
    return data;
  };
  const domKeyboardPayload = (event, target = null) => ({
    ...domEventPayload(target),
    key: event?.key || '',
    code: event?.code || '',
    altKey: Boolean(event?.altKey),
    ctrlKey: Boolean(event?.ctrlKey),
    metaKey: Boolean(event?.metaKey),
    shiftKey: Boolean(event?.shiftKey),
    repeat: Boolean(event?.repeat)
  });
  const bindSubmitHandlers = () => {
    for (const step of program.steps.filter(s => s.event && s.event.startsWith('submit:'))) {
      const widget = step.event.slice('submit:'.length);
      const form = byWidget(widget);
      if (form && !form.__witnessBound) {
        form.__witnessBound = true;
        form.addEventListener('submit', event => { event.preventDefault(); safeRun('submit:' + widget); });
      }
    }
  };
  const refreshProjection = async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const res = await fetch(window.location.href, requestOptions({}, { url: window.location.pathname }));
      if (!res.ok) throw new Error('projection refresh failed');
      const html = await res.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      const nextProgramEl = nextDocument.getElementById(frontendProgramScriptId);
      if (nextProgramEl?.textContent) {
        program = JSON.parse(nextProgramEl.textContent);
        config = program.config || {};
        typeModel = config.typeModel || {};
      }
      const nextRoot = nextDocument.querySelector('[data-widget="' + CSS.escape(program.rootWidget) + '"]');
      const currentRoot = byWidget(program.rootWidget);
      if (!nextRoot || !currentRoot) throw new Error('projection root not found');
      currentRoot.replaceWith(nextRoot);
      document.querySelectorAll('[data-widget-template]').forEach(node => node.remove());
      const currentProgramEl = document.getElementById(frontendProgramScriptId);
      const templateAnchor = currentProgramEl || document.body.lastChild;
      nextDocument.querySelectorAll('[data-widget-template]').forEach(template => {
        const clone = template.cloneNode(true);
        if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(clone, templateAnchor);
        else document.body.appendChild(clone);
      });
      if (currentProgramEl && nextProgramEl?.textContent) currentProgramEl.textContent = nextProgramEl.textContent;
      const initialStateScriptId = currentInitialStateScriptId();
      const initialStateInto = currentInitialStateInto();
      if (initialStateScriptId && initialStateInto) {
        const nextInitialStateEl = nextDocument.getElementById(initialStateScriptId);
        if (nextInitialStateEl?.textContent) {
          const currentInitialStateEl = document.getElementById(initialStateScriptId);
          if (currentInitialStateEl) currentInitialStateEl.textContent = nextInitialStateEl.textContent;
          else if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(nextInitialStateEl.cloneNode(true), templateAnchor);
          else document.body.appendChild(nextInitialStateEl.cloneNode(true));
        }
        syncInitialState(nextDocument);
      }
      bindSubmitHandlers();
      await safeRun('load');
      invalidateSurfaceInspectorGraph();
      invalidateSurfaceInspectorWidgets();
      invalidateSurfaceInspectorRuntimeDiagnostics();
      await refreshSurfaceInspectorMetadata();
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };
  const bootLiveProjection = () => {
    if (!config.liveProjection || liveProjectionStarted) return;
    liveProjectionStarted = true;
    const stream = new EventSource('/api/events');
    stream.onmessage = event => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (!liveProjectionProcesses.has(payload.process)) return;
        void refreshProjection();
      } catch {}
    };
  };
  const resolveBody = ({ from, pick, body }, executionScope = {}) => {
    if (body) return interpolateValue(body, scopeFor({}));
    const source = from
      ? (readPath(state, from) ?? readPath(scopeFor(executionScope), from) ?? {})
      : {};
    if (!pick) return source;
    const out = {};
    for (const key of pick) out[key] = source[key];
    return out;
  };
  const stepTraceMeta = (step, event, runId, extra = {}) => ({
    runId,
    program: program.id || '',
    event,
    nodeId: step?.id || '',
    op: step?.op || '',
    frontier: Array.isArray(step?.after) ? [...step.after] : [],
    repeat: step?.repeat ?? null,
    ...extra
  });
  async function run(event, eventData = {}, { runId = makeRunId() } = {}) {
    state.event = eventData;
    widgetPageProcessRuntime.inFlightCount += 1;
    syncWidgetPageRuntimeProbe();
    const nodes = (program.graph || program.steps || []).filter(s => s.event === event);
    try {
      await recordProcessEvent('frontend.process.start', {
        runId,
        program: program.id || '',
        event,
        status: 'start',
        eventData
      });
      await runProcessGraph(
        nodes,
        event,
        async (node, nextState, executionScope) => {
          await executeStep(node, { runId, stateRef: nextState, executionScope });
        },
        state,
        {
          onNodeStart: async node => {
            await recordProcessEvent('frontend.step.start', stepTraceMeta(node, event, runId, { status: 'start' }));
          },
          onNodeSkipped: async node => {
            await recordProcessEvent('frontend.step.skipped', stepTraceMeta(node, event, runId, { status: 'skipped' }));
          },
          onNodeDone: async (node, meta) => {
            await recordProcessEvent('frontend.step.done', stepTraceMeta(node, event, runId, {
              status: 'done',
              repeatCount: meta.count ?? null
            }));
          },
          onNodeFailed: async (node, error) => {
            await recordProcessEvent('frontend.step.failed', stepTraceMeta(node, event, runId, {
              status: 'failed',
              message: error instanceof Error ? error.message : String(error)
            }));
          }
        }
      );
      await recordProcessEvent('frontend.process.done', {
        runId,
        program: program.id || '',
        event,
        status: 'done'
      });
    } catch (error) {
      await recordProcessEvent('frontend.process.failed', {
        runId,
        program: program.id || '',
        event,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      widgetPageProcessRuntime.inFlightCount = Math.max(0, widgetPageProcessRuntime.inFlightCount - 1);
      syncWidgetPageRuntimeProbe();
    }
  }
  const hasEventHandlers = event => (program.graph || program.steps || []).some(step => step.event === event);
  async function dispatchError(error, event, step = null) {
    if (event === 'error') throw error;
    if (!hasEventHandlers('error')) throw error;
    await run('error', {
      message: error instanceof Error ? error.message : String(error),
      event,
      stepId: step?.id || '',
      op: step?.op || ''
    });
  }
  async function safeRun(event, eventData = {}, step = null) {
    try {
      await run(event, eventData);
    } catch (error) {
      await dispatchError(error, event, step);
    }
  }
  async function executeStep(step, { runId, stateRef = state, executionScope = {} }) {
    const p = interpolateValue(step.params || {}, scopeFor(executionScope));
    try {
      await withTraceContext(runId, step.id, async () => {
        if (step.op === 'initSession') await initSession(p);
        if (step.op === 'setSession') await setSession(p);
        if (step.op === 'logout') await logout(p);
        if (step.op === 'setText') setText(p.widget, p.text || '');
        if (step.op === 'setValue') setValue(p.widget, p.value ?? '');
        if (step.op === 'setHidden') setHidden(p.widget, p.hidden);
        if (step.op === 'setDisabled') setDisabled(p.widget, p.disabled);
        if (step.op === 'fetchJson') {
          const res = await fetch(resolveRuntimeUrl(p.url), requestOptions({}, { url: p.url }));
          stateRef[p.into] = await res.json().catch(() => ({}));
          if (!res.ok && !p.allowFailure) throw new Error(stateRef[p.into]?.error || 'request failed');
        }
        if (step.op === 'renderCollection') renderCollection(p);
        if (step.op === 'renderWorldGraph') renderWorldGraph(p);
        if (step.op === 'readForm') readForm(p);
        if (step.op === 'refreshProjection') await refreshProjection();
        if (step.op === 'navigate') window.location.assign(p.url || p.href || window.location.href);
        if (step.op === 'setQueryParam') setQueryParam(p);
        if (step.op === 'dispatchDomEvent') throw new Error('dispatchDomEvent has been retired; use native page.surface refresh, navigation, boundary, policy, or capability semantics instead');
        if (step.op === 'reloadPage') window.location.reload();
        if (step.op === 'postJson' || step.op === 'patchJson' || step.op === 'deleteJson') {
          const method = step.op === 'postJson' ? (p.method || 'POST') : step.op === 'patchJson' ? (p.method || 'PATCH') : (p.method || 'DELETE');
          const options = requestOptions({ method, headers: { 'content-type': 'application/json' } }, { url: p.url });
          if (step.op !== 'deleteJson') options.body = JSON.stringify(resolveBody(p, executionScope));
          const res = await fetch(resolveRuntimeUrl(p.url), options);
          stateRef[p.into || 'lastResponse'] = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(stateRef[p.into || 'lastResponse'].error || 'request failed');
        }
        if (step.op === 'clearForm') clearForm(p);
        if (step.op === 'run') await run(p.event, stateRef.event);
      });
    } catch (error) {
      throw error;
    }
  }
  bindSubmitHandlers();
  bootSurfaceInspector();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    safeRun('click:' + button.dataset.action, { ...button.dataset, done: button.dataset.done === 'true' });
  });
  document.addEventListener('change', event => {
    const field = event.target.closest('input[data-widget], select[data-widget], textarea[data-widget]');
    if (!field) return;
    safeRun('change:' + field.getAttribute('data-widget'), domEventPayload(field));
  });
  document.addEventListener('input', event => {
    const field = event.target.closest('input[data-widget], select[data-widget], textarea[data-widget]');
    if (!field) return;
    safeRun('input:' + field.getAttribute('data-widget'), domEventPayload(field));
  });
  document.addEventListener('keydown', event => {
    const field = event.target?.closest?.('[data-widget]');
    const widget = field?.getAttribute('data-widget') || program.rootWidget || '';
    if (!widget) return;
    const semanticEvent = 'keydown:' + widget;
    if (!hasEventHandlers(semanticEvent)) return;
    safeRun(semanticEvent, domKeyboardPayload(event, field));
  });
  bootLiveProjection();
  updateSurfaceInspectorUi();
  safeRun('load');
})();`;
  return `<script type="application/json" id="${escapeAttr(frontendProgramScriptId)}">${json}</script>\n<script>\n${engine}\n</script>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}


