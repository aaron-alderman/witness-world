import {
  applyBootstrapCapabilityBaseSelectView,
  buildBootstrapCapabilityBaseSelectView
} from "./bootstrap-capability-controls-view.js";
import { createBootstrapDomHelpers } from "./bootstrap-dom-helpers.js";
import { createBootstrapLiveStateReaders } from "./bootstrap-live-state.js";

export function renderBootstrapCapabilityControlsSyncFactory() {
  return String.raw`
    const buildBootstrapCapabilityBaseSelectView = ${buildBootstrapCapabilityBaseSelectView.toString()};
    const applyBootstrapCapabilityBaseSelectView = ${applyBootstrapCapabilityBaseSelectView.toString()};
    const capabilityTargetRowsFor = ${capabilityTargetRowsFor.toString()};
    const capabilityTargetLabel = ${capabilityTargetLabel.toString()};
    const firstMatchingValue = ${firstMatchingValue.toString()};
    const buildBootstrapCapabilityControlsView = ${buildBootstrapCapabilityControlsView.toString()};
    const applyBootstrapCapabilityControlsView = ${applyBootstrapCapabilityControlsView.toString()};
    const syncBootstrapCapabilityControlsState = ${syncBootstrapCapabilityControlsState.toString()};
    const runBootstrapCapabilityControlsSync = ${runBootstrapCapabilityControlsSync.toString()};
    const runBootstrapCapabilityControlsRender = ${runBootstrapCapabilityControlsRender.toString()};
    const createBootstrapCapabilityControlsRuntime = ${createBootstrapCapabilityControlsRuntime.toString()};
    const createBootstrapCapabilityControlsRuntimeFromBootstrap = ${createBootstrapCapabilityControlsRuntimeFromBootstrap.toString()};
    const bindBootstrapCapabilityControlsSync = ${bindBootstrapCapabilityControlsSync.toString()};
    const buildBootstrapCapabilityControlsSyncDeps = ${buildBootstrapCapabilityControlsSyncDeps.toString()};
    const createBootstrapCapabilityControlsSyncDepsBuilder = ${createBootstrapCapabilityControlsSyncDepsBuilder.toString()};
  `;
}

function capabilityTargetRowsFor(targetKind, capabilityTargets = {}) {
  if (targetKind === "context") return capabilityTargets.contexts || [];
  if (targetKind === "serverRunner") return capabilityTargets.serverRunners || [];
  if (targetKind === "routePage") return capabilityTargets.routePages || [];
  return [];
}

function capabilityTargetLabel(targetKind, row = {}) {
  return targetKind === "routePage" ? row.id + " " + (row.path || "") : row.id;
}

function firstMatchingValue(options, currentValue) {
  return (options || []).some(option => option.value === currentValue) ? currentValue : (options?.[0]?.value || "");
}

export function buildBootstrapCapabilityControlsView({
  family = null,
  existingView = {},
  authored = {},
  model = {},
  readSelectValue = () => ""
} = {}) {
  const view = family ? { ...(existingView || {}) } : {};
  const families = family ? [family] : ["capability-install", "capability-remove"];
  for (const currentFamily of families) {
    const requireInstalled = currentFamily === "capability-remove";
    const capabilitySelectId = currentFamily === "capability-install" ? "capability-install-capability" : "capability-remove-capability";
    const kindSelectId = currentFamily === "capability-install" ? "capability-install-kind" : "capability-remove-kind";
    const targetSelectId = currentFamily === "capability-install" ? "capability-install-target" : "capability-remove-target";
    const capabilityId = readSelectValue(capabilitySelectId);
    const targetKind = readSelectValue(kindSelectId);
    const targetRows = capabilityTargetRowsFor(targetKind, model.capabilityTargets || {});
    const targetOptions = targetRows.map(row => ({ value: row.id, label: capabilityTargetLabel(targetKind, row) }));
    const selectedTargetId = firstMatchingValue(targetOptions, readSelectValue(targetSelectId));
    const capability = (authored.capabilityCatalog || []).find(row => row.id === capabilityId) || null;
    const target = targetRows.find(row => row.id === selectedTargetId) || null;
    const existing = (authored.capabilityInstalls || [])
      .find(row => row.capability === capabilityId && row.targetKind === targetKind && row.target === selectedTargetId) || null;
    let submitDisabled = true;
    let helpText = requireInstalled
      ? "Choose an installed capability target to remove."
      : "Choose a capability, target kind, and target to see placement and source guidance.";
    if (capability && targetKind && selectedTargetId && target) {
      const placements = Array.isArray(capability.placement) ? capability.placement : [];
      const placementOk = placements.includes(targetKind);
      const sourceState = capability.capabilitySourceState || "catalog-only";
      const packageSources = (capability.packageSources || []).map(row => row.pluginId).filter(Boolean);
      const issues = [];
      if (!placementOk) issues.push("capability does not support target kind " + targetKind);
      if (requireInstalled && !existing) issues.push("capability is not installed on this target");
      if (!requireInstalled && existing) issues.push("capability is already installed on this target");
      submitDisabled = issues.length > 0;
      helpText = [
        "Capability " + capability.id + " supports placements: " + (placements.join(", ") || "(none)") + ".",
        "Source state: " + sourceState + (packageSources.length ? " via " + packageSources.join(", ") + "." : "."),
        "Target: " + target.id + (target.context ? " @" + target.context : "") + "."
      ].join(" ") + (issues.length ? " Blocking issues: " + issues.join("; ") + "." : "");
    }
    view[currentFamily === "capability-install" ? "capabilityInstall" : "capabilityRemove"] = {
      targetOptions,
      selectedTargetId,
      helpText,
      submitDisabled
    };
  }
  return view;
}

export function applyBootstrapCapabilityControlsView({
  family = null,
  view = {},
  fillSelect = () => {},
  setSelectedValue = () => {},
  setStatus = () => {},
  setSubmitDisabled = () => {}
} = {}) {
  const families = family ? [family] : ["capability-install", "capability-remove"];
  for (const currentFamily of families) {
    const targetSelectId = currentFamily === "capability-install" ? "capability-install-target" : "capability-remove-target";
    const helpId = currentFamily === "capability-install" ? "capability-install-help" : "capability-remove-help";
    const formId = currentFamily === "capability-install" ? "capability-install-form" : "capability-remove-form";
    const currentView = currentFamily === "capability-install" ? view.capabilityInstall : view.capabilityRemove;
    fillSelect(targetSelectId, currentView?.targetOptions || [], row => row.value, row => row.label, { includeBlank: false });
    setSelectedValue(targetSelectId, currentView?.selectedTargetId);
    setStatus(helpId, currentView?.helpText || "");
    setSubmitDisabled(formId, Boolean(currentView?.submitDisabled));
  }
}

export function syncBootstrapCapabilityControlsState({
  family = null,
  existingView = {},
  ...deps
} = {}) {
  return buildBootstrapCapabilityControlsView({
    family,
    existingView,
    ...deps
  });
}

export function runBootstrapCapabilityControlsSync({
  family = null,
  existingView = {},
  ...deps
} = {}) {
  const view = syncBootstrapCapabilityControlsState({
    family,
    existingView,
    ...deps
  });
  applyBootstrapCapabilityControlsView({
    family,
    view,
    ...deps
  });
  return { handled: true, view };
}

export function runBootstrapCapabilityControlsRender({
  authored = {},
  model = {},
  readSelectValue = () => "",
  fillSelect = () => {},
  setSelectedValue = () => {},
  ...deps
} = {}) {
  applyBootstrapCapabilityBaseSelectView({
    view: buildBootstrapCapabilityBaseSelectView({
      readSelectValue,
      contextRows: authored.contexts || [],
      capabilityCatalog: authored.capabilityCatalog || [],
      capabilityTargetKinds: model.capabilityTargetKinds || []
    }),
    fillSelect,
    setSelectedValue
  });
  return runBootstrapCapabilityControlsSync({
    authored,
    model,
    readSelectValue,
    fillSelect,
    setSelectedValue,
    ...deps
  });
}

export function createBootstrapCapabilityControlsRuntime({
  target = null,
  buildDeps = null,
  ...deps
} = {}) {
  const resolveDeps = typeof buildDeps === "function"
    ? buildDeps
    : createBootstrapCapabilityControlsSyncDepsBuilder(deps);
  return {
    bind(options = {}) {
      return bindBootstrapCapabilityControlsSync({
        target,
        buildDeps: resolveDeps,
        ...options
      });
    },
    render() {
      return runBootstrapCapabilityControlsRender(resolveDeps());
    }
  };
}

export function createBootstrapCapabilityControlsRuntimeFromBootstrap({
  target = null,
  state = {},
  document = null
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = document || resolvedTarget?.document || globalThis?.document || null;
  return createBootstrapCapabilityControlsRuntime({
    target: resolvedTarget,
    liveState: createBootstrapLiveStateReaders({ state }),
    dom: createBootstrapDomHelpers({ document: resolvedDocument })
  });
}

export function bindBootstrapCapabilityControlsSync({
  target,
  eventName = "witness:bootstrap-capability-controls-sync",
  allowedSources = ["bootstrap-capability-controls", "bootstrap-remove-controls"],
  buildDeps = () => ({})
} = {}) {
  target.addEventListener(eventName, event => {
    const detail = event?.detail || {};
    if (!allowedSources.includes(detail.source)) return;
    if (detail.family !== "capability-install" && detail.family !== "capability-remove") return;
    runBootstrapCapabilityControlsSync({
      ...buildDeps(),
      family: detail.family
    });
  });
  return target;
}

export function buildBootstrapCapabilityControlsSyncDeps({
  state = {},
  liveState = {},
  dom = {},
  ...deps
} = {}) {
  const {
    byId = () => null,
    fillSelect = () => {},
    setStatus = () => {},
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
  return {
    ...deps,
    authored: typeof liveState.authored === "function" ? (liveState.authored() || {}) : (state.bootstrapState || {}),
    model: typeof liveState.model === "function" ? (liveState.model() || {}) : (state.model || {}),
    readSelectValue,
    fillSelect,
    setSelectedValue,
    setStatus,
    setSubmitDisabled
  };
}

export function createBootstrapCapabilityControlsSyncDepsBuilder(base = {}) {
  return () => buildBootstrapCapabilityControlsSyncDeps(base);
}
