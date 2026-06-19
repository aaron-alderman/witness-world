import {
  applyBootstrapScopedControlsView,
  buildBootstrapScopedControlsView
} from "./bootstrap-scoped-controls-view.js";
import { createBootstrapDomHelpers } from "./bootstrap-dom-helpers.js";
import { createBootstrapLiveStateReaders } from "./bootstrap-live-state.js";

export function renderBootstrapScopedControlsSyncFactory() {
  return String.raw`
    const syncBootstrapScopedControlsState = ${syncBootstrapScopedControlsState.toString()};
    const applyBootstrapScopedControlsState = ${applyBootstrapScopedControlsState.toString()};
    const runBootstrapScopedControlsSync = ${runBootstrapScopedControlsSync.toString()};
    const buildBootstrapScopedControlsSyncDeps = ${buildBootstrapScopedControlsSyncDeps.toString()};
    const createBootstrapScopedControlsSyncDepsBuilder = ${createBootstrapScopedControlsSyncDepsBuilder.toString()};
    const createBootstrapScopedControlsSyncDepsBuilderFromBootstrap = ${createBootstrapScopedControlsSyncDepsBuilderFromBootstrap.toString()};
    const createBootstrapScopedControlsSyncHandler = ${createBootstrapScopedControlsSyncHandler.toString()};
    const bindBootstrapScopedControlsSync = ${bindBootstrapScopedControlsSync.toString()};
  `;
}

export function syncBootstrapScopedControlsState({
  readSelectValue = () => "",
  contextRows = [],
  contextBindableTargets = () => [],
  contextScopeRows = () => [],
  contextExportRows = () => [],
  stewardshipTargetKinds = [],
  stewardshipTargetsFor = () => []
} = {}) {
  return buildBootstrapScopedControlsView({
    readSelectValue,
    contextRows,
    contextBindableTargets,
    contextScopeRows,
    contextExportRows,
    stewardshipTargetKinds,
    stewardshipTargetsFor
  });
}

export function applyBootstrapScopedControlsState({
  view = {},
  authored = {},
  session = {},
  fillSelect = () => {},
  setSelectedValue = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  const editingDisabled = !session.authenticated && (authored.identities || []).length > 0;
  applyBootstrapScopedControlsView({
    view,
    editingDisabled,
    fillSelect,
    setSelectedValue,
    setSubmitDisabled
  });
  return view || {};
}

export function runBootstrapScopedControlsSync({
  detail = null,
  existingView = {},
  authored = {},
  session = {},
  readSelectValue = () => "",
  contextRows = [],
  contextBindableTargets = () => [],
  contextScopeRows = () => [],
  contextExportRows = () => [],
  stewardshipTargetKinds = [],
  stewardshipTargetsFor = () => [],
  fillSelect = () => {},
  setSelectedValue = () => {},
  setSubmitDisabled = () => {},
  allowedSources = ["bootstrap-scoped-controls", "bootstrap-remove-controls"],
  allowedFamilies = [
    "context-binding-target",
    "context-export-target",
    "context-import-export",
    "stewardship-target"
  ]
} = {}) {
  if (detail) {
    const source = String(detail.source || "");
    if (!allowedSources.includes(source)) return { handled: false, view: existingView || {} };
    const family = String(detail.family || "");
    if (!allowedFamilies.includes(family)) return { handled: false, view: existingView || {} };
  }
  const view = syncBootstrapScopedControlsState({
    readSelectValue,
    contextRows,
    contextBindableTargets,
    contextScopeRows,
    contextExportRows,
    stewardshipTargetKinds,
    stewardshipTargetsFor
  });
  applyBootstrapScopedControlsState({
    view,
    authored,
    session,
    fillSelect,
    setSelectedValue,
    setSubmitDisabled
  });
  return { handled: true, view };
}

export function buildBootstrapScopedControlsSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  existingView = {},
  ...deps
} = {}) {
  const {
    byId = () => null,
    fillSelect = () => {},
    readSelectValue = id => byId(id)?.value || "",
    setSelectedValue = (id, selectedValue) => {
      const select = byId(id);
      if (select && [...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
    },
    setSubmitDisabled = (formId, disabled) => {
      const button = byId(formId)?.querySelector('button[type="submit"]');
      if (button) button.disabled = Boolean(disabled);
    }
  } = dom;
  const authored = typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {});
  const session = typeof liveState.session === "function" ? (liveState.session() || {}) : (state.session || {});
  return {
    ...deps,
    authored,
    session,
    existingView,
    contextRows: deps.contextRows || (typeof liveState.contextRows === "function" ? (liveState.contextRows() || []) : (state.bootstrapState?.contexts || [])),
    contextBindableTargets: deps.contextBindableTargets || (typeof liveState.contextBindableTargets === "function"
      ? liveState.contextBindableTargets.bind(liveState)
      : (contextId => (state.model?.contextBindableTargets || []).filter(row => !row.context || row.context === contextId))),
    contextScopeRows: deps.contextScopeRows || (typeof liveState.contextScopeRows === "function"
      ? liveState.contextScopeRows.bind(liveState)
      : ((contextId, sourceKind = null) => (state.bootstrapState?.contextScopes || [])
        .filter(row => row.context === contextId && (!sourceKind || row.sourceKind === sourceKind)))),
    contextExportRows: deps.contextExportRows || (typeof liveState.contextExportRows === "function"
      ? liveState.contextExportRows.bind(liveState)
      : (contextId => (state.bootstrapState?.contextExports || []).filter(row => row.context === contextId))),
    stewardshipTargetKinds: deps.stewardshipTargetKinds || (typeof liveState.stewardshipTargetKinds === "function"
      ? (liveState.stewardshipTargetKinds() || [])
      : (state.model?.stewardshipTargetKinds || [])),
    stewardshipTargetsFor: deps.stewardshipTargetsFor || (typeof liveState.stewardshipTargetsFor === "function"
      ? liveState.stewardshipTargetsFor.bind(liveState)
      : (targetKind => {
        const authored = state.bootstrapState || {};
        if (targetKind === "context") return authored.contexts || [];
        if (targetKind === "perspective") return authored.perspectives || [];
        return [];
      })),
    readSelectValue,
    fillSelect,
    setSelectedValue,
    setSubmitDisabled
  };
}

export function createBootstrapScopedControlsSyncDepsBuilder(base = {}) {
  return () => buildBootstrapScopedControlsSyncDeps(base);
}

export function createBootstrapScopedControlsSyncDepsBuilderFromBootstrap({
  state = {},
  document = null,
  ...deps
} = {}) {
  const resolvedDocument = document || globalThis?.document || globalThis?.window?.document || null;
  return createBootstrapScopedControlsSyncDepsBuilder({
    ...deps,
    state,
    liveState: createBootstrapLiveStateReaders({ state }),
    dom: createBootstrapDomHelpers({ document: resolvedDocument })
  });
}

export function createBootstrapScopedControlsSyncHandler({
  buildDeps = null,
  ...deps
} = {}) {
  return event => {
    const resolvedDeps = typeof buildDeps === "function" ? (buildDeps() || {}) : deps;
    return runBootstrapScopedControlsSync({
      ...resolvedDeps,
      detail: event?.detail || {}
    });
  };
}

export function bindBootstrapScopedControlsSync({
  target = null,
  ...deps
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const handler = createBootstrapScopedControlsSyncHandler(deps);
  for (const [formId, source, family] of [
    ["context-binding-form", "bootstrap-scoped-controls", "context-binding-target"],
    ["context-export-form", "bootstrap-scoped-controls", "context-export-target"],
    ["context-import-form", "bootstrap-scoped-controls", "context-import-export"],
    ["stewardship-form", "bootstrap-scoped-controls", "stewardship-target"],
    ["context-binding-remove-form", "bootstrap-remove-controls", "context-binding-target"],
    ["context-export-remove-form", "bootstrap-remove-controls", "context-export-target"],
    ["context-import-remove-form", "bootstrap-remove-controls", "context-import-export"],
    ["stewardship-remove-form", "bootstrap-remove-controls", "stewardship-target"]
  ]) {
    const form = resolvedDocument?.getElementById?.(formId);
    if (!form || form.__bootstrapScopedControlsSyncBound) continue;
    form.__bootstrapScopedControlsSyncBound = true;
    const trigger = () => handler({ detail: { source, family } });
    form.addEventListener("change", trigger);
    form.addEventListener("input", trigger);
  }
  return handler;
}
