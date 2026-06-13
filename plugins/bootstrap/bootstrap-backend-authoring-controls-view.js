export function renderBootstrapBackendAuthoringControlsViewFactory() {
  return String.raw`
    const buildBootstrapBackendAuthoringControlsProjection = ${buildBootstrapBackendAuthoringControlsProjection.toString()};
    const buildBootstrapBackendAuthoringControlsView = ${buildBootstrapBackendAuthoringControlsView.toString()};
    const applyBootstrapBackendAuthoringControlsView = ${applyBootstrapBackendAuthoringControlsView.toString()};
  `;
}

export function buildBootstrapBackendAuthoringControlsProjection({
  programContext = "",
  versionSoul = "",
  versionContext = "",
  transitionFrom = "",
  transitionStrategy = "",
  stepVersion = "",
  stepOp = "",
  contextRows = [],
  backendProgramRows = [],
  backendProgramVersionRows = [],
  supportedBackendOps = []
} = {}) {
  const soulOptions = (backendProgramRows || []).map(row => ({
    value: row.soul,
    label: row.soul
  }));
  const selectedVersionSoul = soulOptions.some(row => row.value === versionSoul)
    ? versionSoul
    : (soulOptions[0]?.value || "");
  const transitionFromOptions = (backendProgramVersionRows || [])
    .filter(row => row.soul === selectedVersionSoul)
    .map(row => ({
      value: row.version,
      label: row.version
    }));
  const strategyOptions = ["compatible", "migrate", "block", "fork"].map(value => ({
    value,
    label: value
  }));
  const stepVersionOptions = (backendProgramVersionRows || []).map(row => ({
    value: row.version,
    label: row.version
  }));
  const stepOpOptions = (supportedBackendOps || []).map(value => ({
    value,
    label: value
  }));
  return buildBootstrapBackendAuthoringControlsView({
    programContext,
    versionSoul,
    versionContext,
    transitionFrom,
    transitionStrategy,
    stepVersion,
    stepOp,
    contextRows,
    soulOptions,
    transitionFromOptions,
    strategyOptions,
    stepVersionOptions,
    stepOpOptions
  });
}

export function buildBootstrapBackendAuthoringControlsView({
  programContext = "",
  versionSoul = "",
  versionContext = "",
  transitionFrom = "",
  transitionStrategy = "",
  stepVersion = "",
  stepOp = "",
  contextRows = [],
  soulOptions = [],
  transitionFromOptions = [],
  strategyOptions = [],
  stepVersionOptions = [],
  stepOpOptions = []
} = {}) {
  const contextOptions = (contextRows || []).map(row => ({
    value: row.id,
    label: row.id
  }));
  const selectedVersionSoul = (soulOptions || []).some(row => row.value === versionSoul)
    ? versionSoul
    : (soulOptions?.[0]?.value || "");
  return {
    contextOptions,
    soulOptions,
    selectedProgramContext: contextOptions.some(row => row.value === programContext) ? programContext : "",
    selectedVersionSoul,
    selectedVersionContext: contextOptions.some(row => row.value === versionContext) ? versionContext : "",
    transitionFromOptions,
    selectedTransitionFrom: (transitionFromOptions || []).some(row => row.value === transitionFrom) ? transitionFrom : "",
    strategyOptions,
    selectedTransitionStrategy: (transitionFromOptions || []).some(row => row.value === transitionFrom)
      ? ((strategyOptions || []).some(row => row.value === transitionStrategy)
          ? transitionStrategy
          : (strategyOptions?.[0]?.value || ""))
      : "",
    stepVersionOptions,
    selectedStepVersion: (stepVersionOptions || []).some(row => row.value === stepVersion)
      ? stepVersion
      : (stepVersionOptions?.[0]?.value || ""),
    stepOpOptions,
    selectedStepOp: (stepOpOptions || []).some(row => row.value === stepOp)
      ? stepOp
      : (stepOpOptions?.[0]?.value || "")
  };
}

export function applyBootstrapBackendAuthoringControlsView({
  view = {},
  fillSelect = () => {},
  setSelectedValue = () => {}
} = {}) {
  fillSelect("backend-program-context", view.contextOptions || [], row => row.value, row => row.label);
  setSelectedValue("backend-program-context", view.selectedProgramContext);
  fillSelect("backend-program-version-context", view.contextOptions || [], row => row.value, row => row.label);
  setSelectedValue("backend-program-version-context", view.selectedVersionContext);
  fillSelect("backend-program-version-soul", view.soulOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("backend-program-version-soul", view.selectedVersionSoul);
  fillSelect("backend-program-version-transition-from", view.transitionFromOptions || [], row => row.value, row => row.label);
  setSelectedValue("backend-program-version-transition-from", view.selectedTransitionFrom);
  fillSelect("backend-program-version-transition-strategy", view.strategyOptions || [], row => row.value, row => row.label);
  setSelectedValue("backend-program-version-transition-strategy", view.selectedTransitionStrategy);
  fillSelect("backend-step-version", view.stepVersionOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("backend-step-version", view.selectedStepVersion);
  fillSelect("backend-step-op", view.stepOpOptions || [], row => row.value, row => row.label, { includeBlank: false });
  setSelectedValue("backend-step-op", view.selectedStepOp);
}
