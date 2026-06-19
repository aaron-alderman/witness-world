import {
  applyBootstrapBackendAuthoringControlsView,
  buildBootstrapBackendAuthoringControlsProjection
} from "./bootstrap-backend-authoring-controls-view.js";
import {
  applyBootstrapBackendVersionControlsView,
  buildBootstrapBackendVersionControlsProjection
} from "./bootstrap-backend-version-controls-view.js";

export function renderBootstrapControlsSyncFactory() {
  return String.raw`
    const syncBootstrapBackendAuthoringControlsState = ${syncBootstrapBackendAuthoringControlsState.toString()};
    const applyBootstrapBackendAuthoringControlsState = ${applyBootstrapBackendAuthoringControlsState.toString()};
    const syncBootstrapBackendVersionControlsState = ${syncBootstrapBackendVersionControlsState.toString()};
    const applyBootstrapBackendVersionControlsState = ${applyBootstrapBackendVersionControlsState.toString()};
    const runBootstrapBackendControlsRender = ${runBootstrapBackendControlsRender.toString()};
    const buildBootstrapBackendControlsSyncDeps = ${buildBootstrapBackendControlsSyncDeps.toString()};
    const createBootstrapBackendControlsSyncDepsBuilder = ${createBootstrapBackendControlsSyncDepsBuilder.toString()};
    const runBootstrapBackendAuthoringControlsSync = ${runBootstrapBackendAuthoringControlsSync.toString()};
    const bindBootstrapBackendAuthoringControlsSync = ${bindBootstrapBackendAuthoringControlsSync.toString()};
    const runBootstrapBackendVersionControlsSync = ${runBootstrapBackendVersionControlsSync.toString()};
    const bindBootstrapBackendVersionControlsSync = ${bindBootstrapBackendVersionControlsSync.toString()};
  `;
}

export function syncBootstrapBackendAuthoringControlsState({
  readFieldValue = () => "",
  contextRows = [],
  backendProgramRows = [],
  backendProgramVersionRows = [],
  supportedBackendOps = []
} = {}) {
  return buildBootstrapBackendAuthoringControlsProjection({
    programContext: readFieldValue("backend-program-form", "context"),
    versionSoul: readFieldValue("backend-program-version-form", "soul"),
    versionContext: readFieldValue("backend-program-version-form", "context"),
    transitionFrom: readFieldValue("backend-program-version-form", "transitionFrom"),
    transitionStrategy: readFieldValue("backend-program-version-form", "transitionStrategy"),
    stepVersion: readFieldValue("backend-step-form", "version"),
    stepOp: readFieldValue("backend-step-form", "op"),
    contextRows,
    backendProgramRows,
    backendProgramVersionRows,
    supportedBackendOps
  });
}

export function applyBootstrapBackendAuthoringControlsState({
  view = {},
  fillSelect = () => {},
  setSelectedValue = () => {}
} = {}) {
  applyBootstrapBackendAuthoringControlsView({
    view,
    fillSelect,
    setSelectedValue
  });
  return view || {};
}

export function syncBootstrapBackendVersionControlsState({
  readSelectValue = () => "",
  backendProgramRows = [],
  backendProgramVersionRows = [],
  backendProgramTransitionRows = [],
  backendProgramActivationHistoryRows = [],
  authorityContexts = []
} = {}) {
  return buildBootstrapBackendVersionControlsProjection({
    activateSoul: readSelectValue("backend-program-activate-soul"),
    activateVersion: readSelectValue("backend-program-activate-version"),
    rollbackSoul: readSelectValue("backend-program-rollback-soul"),
    backendProgramRows,
    backendProgramVersionRows,
    backendProgramTransitionRows,
    backendProgramActivationHistoryRows,
    authorityContexts
  });
}

export function applyBootstrapBackendVersionControlsState({
  view = {},
  authored = {},
  session = {},
  fillSelect = () => {},
  byId = () => null,
  setStatus = () => {}
} = {}) {
  const editingDisabled = !session.authenticated && (authored.identities || []).length > 0;
  const operator = authored.operator || {};
  const operatorDisabled = operator.mutations?.enabled === false;
  applyBootstrapBackendVersionControlsView({
    view,
    fillSelect,
    byId,
    setStatus,
    editingDisabled,
    operatorDisabled
  });
  return view || {};
}

export function runBootstrapBackendControlsRender({
  syncBootstrapBackendAuthoringControlsStateFn = syncBootstrapBackendAuthoringControlsState,
  applyBootstrapBackendAuthoringControlsStateFn = applyBootstrapBackendAuthoringControlsState,
  syncBootstrapBackendVersionControlsStateFn = syncBootstrapBackendVersionControlsState,
  applyBootstrapBackendVersionControlsStateFn = applyBootstrapBackendVersionControlsState,
  ...deps
} = {}) {
  const authoringView = syncBootstrapBackendAuthoringControlsStateFn(deps);
  const versionView = syncBootstrapBackendVersionControlsStateFn(deps);
  applyBootstrapBackendAuthoringControlsStateFn({
    ...deps,
    view: authoringView
  });
  applyBootstrapBackendVersionControlsStateFn({
    ...deps,
    view: versionView
  });
  return { handled: true, authoringView, versionView };
}

export function buildBootstrapBackendControlsSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  ...deps
} = {}) {
  const {
    byId = () => null,
    formField = () => null,
    fillSelect = () => {},
    setStatus = () => {},
    readSelectValue = id => byId(id)?.value || "",
    readFieldValue = (formId, fieldName) => String(formField(byId(formId), fieldName)?.value || ""),
    setSelectedValue = (id, selectedValue) => {
      const select = byId(id);
      if (select && [...select.options].some(option => option.value === selectedValue)) select.value = selectedValue;
    }
  } = dom;
  const authored = typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {});
  const session = typeof liveState.session === "function" ? (liveState.session() || {}) : (state.session || {});
  const model = typeof liveState.model === "function" ? (liveState.model() || {}) : (state.model || {});
  return {
    ...deps,
    authored,
    session,
    contextRows: deps.contextRows || (authored.contexts || []),
    backendProgramRows: deps.backendProgramRows || (authored.backendPrograms || []),
    backendProgramVersionRows: deps.backendProgramVersionRows || (authored.backendProgramVersions || []),
    backendProgramTransitionRows: deps.backendProgramTransitionRows || (authored.backendProgramTransitions || []),
    backendProgramActivationHistoryRows: deps.backendProgramActivationHistoryRows || (authored.backendProgramActivationHistory || []),
    supportedBackendOps: deps.supportedBackendOps || (model.supportedBackendOps || []),
    authorityContexts: deps.authorityContexts || (authored.authority?.mutationContexts || []),
    byId,
    fillSelect,
    setStatus,
    readSelectValue,
    readFieldValue,
    setSelectedValue
  };
}

export function createBootstrapBackendControlsSyncDepsBuilder(base = {}) {
  return () => buildBootstrapBackendControlsSyncDeps(base);
}

export function runBootstrapBackendAuthoringControlsSync({
  detail = {},
  expectedSource = "bootstrap-backend-authoring-controls",
  syncBootstrapBackendAuthoringControlsStateFn = syncBootstrapBackendAuthoringControlsState,
  applyBootstrapBackendAuthoringControlsStateFn = applyBootstrapBackendAuthoringControlsState,
  ...deps
} = {}) {
  if (detail.source !== expectedSource) return { handled: false };
  const view = syncBootstrapBackendAuthoringControlsStateFn(deps);
  applyBootstrapBackendAuthoringControlsStateFn({
    ...deps,
    view
  });
  return { handled: true, view };
}

export function bindBootstrapBackendAuthoringControlsSync({
  target = null,
  buildDeps = null,
  ...deps
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const handler = event => {
    const resolvedDeps = typeof buildDeps === "function" ? (buildDeps() || {}) : deps;
    return runBootstrapBackendAuthoringControlsSync({
      ...resolvedDeps,
      detail: event?.detail || {}
    });
  };
  for (const formId of ["backend-program-form", "backend-program-version-form", "backend-step-form"]) {
    const form = resolvedDocument?.getElementById?.(formId);
    if (!form || form.__bootstrapBackendAuthoringSyncBound) continue;
    form.__bootstrapBackendAuthoringSyncBound = true;
    const trigger = () => handler({ detail: { source: "bootstrap-backend-authoring-controls" } });
    form.addEventListener("change", trigger);
    form.addEventListener("input", trigger);
  }
  return handler;
}

export function runBootstrapBackendVersionControlsSync({
  detail = {},
  expectedSource = "bootstrap-backend-version-controls",
  syncBootstrapBackendVersionControlsStateFn = syncBootstrapBackendVersionControlsState,
  applyBootstrapBackendVersionControlsStateFn = applyBootstrapBackendVersionControlsState,
  ...deps
} = {}) {
  if (detail.source !== expectedSource) return { handled: false };
  const view = syncBootstrapBackendVersionControlsStateFn(deps);
  applyBootstrapBackendVersionControlsStateFn({
    ...deps,
    view
  });
  return { handled: true, view };
}

export function bindBootstrapBackendVersionControlsSync({
  target = null,
  buildDeps = null,
  ...deps
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const handler = event => {
    const resolvedDeps = typeof buildDeps === "function" ? (buildDeps() || {}) : deps;
    return runBootstrapBackendVersionControlsSync({
      ...resolvedDeps,
      detail: event?.detail || {}
    });
  };
  for (const formId of ["backend-program-activate-form", "backend-program-rollback-form"]) {
    const form = resolvedDocument?.getElementById?.(formId);
    if (!form || form.__bootstrapBackendVersionSyncBound) continue;
    form.__bootstrapBackendVersionSyncBound = true;
    const trigger = () => handler({ detail: { source: "bootstrap-backend-version-controls" } });
    form.addEventListener("change", trigger);
    form.addEventListener("input", trigger);
  }
  return handler;
}
