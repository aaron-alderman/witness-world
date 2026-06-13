export function renderBootstrapBackendVersionControlsViewFactory() {
  return String.raw`
    const buildBootstrapBackendVersionControlsProjection = ${buildBootstrapBackendVersionControlsProjection.toString()};
    const buildBootstrapBackendVersionControlsView = ${buildBootstrapBackendVersionControlsView.toString()};
    const applyBootstrapBackendVersionControlsView = ${applyBootstrapBackendVersionControlsView.toString()};
  `;
}

export function buildBootstrapBackendVersionControlsProjection({
  activateSoul = "",
  activateVersion = "",
  rollbackSoul = "",
  backendProgramRows = [],
  backendProgramVersionRows = [],
  backendProgramTransitionRows = [],
  backendProgramActivationHistoryRows = [],
  authorityContexts = []
} = {}) {
  const localAuthoritySummary = (contextId, contexts = []) => contextId
    ? (contexts.includes(contextId)
        ? "Current actor can mutate context " + contextId + " directly."
        : "Current actor is outside mutation context " + contextId + "; direct actions may require a stewarded path.")
    : "No explicit context is attached to this target in bootstrap state.";
  const localBuildVersionActivationGuidance = ({
    soul = "",
    currentVersion = "",
    targetVersion = "",
    targetIndex = 0,
    transitionStrategy = null,
    authoritySummaryText = "",
    missingSelectionHelp = "Choose a target to review activation strategy and authority."
  } = {}) => {
    if (!soul || !targetVersion) {
      return { helpText: missingSelectionHelp, submitDisabled: true };
    }
    const issues = [];
    if (currentVersion === targetVersion) issues.push("target version is already active");
    if (currentVersion && currentVersion !== targetVersion && transitionStrategy === "block") {
      issues.push("no compatible transition is defined from " + currentVersion + " to " + targetVersion);
    }
    const parts = [
      "Current active version: " + (currentVersion || "none") + ".",
      "Target version: " + targetVersion + " (index " + (targetIndex ?? 0) + ")."
    ];
    if (transitionStrategy) parts.push("Transition strategy: " + transitionStrategy + ".");
    if (authoritySummaryText) parts.push(authoritySummaryText);
    if (issues.length) parts.push("Blocking issues: " + issues.join("; ") + ".");
    return { helpText: parts.join(" "), submitDisabled: issues.length > 0 };
  };
  const localPreviousVersionFromHistory = (rows, currentVersion) => {
    const sequence = [];
    for (const row of rows || []) {
      const version = String(row?.version ?? "").trim();
      if (!version || sequence[sequence.length - 1] === version) continue;
      sequence.push(version);
    }
    if (!sequence.length) return null;
    const current = String(currentVersion ?? "").trim();
    if (!current) return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
    for (let index = sequence.length - 1; index >= 0; index -= 1) {
      if (sequence[index] !== current) continue;
      return index > 0 ? sequence[index - 1] : null;
    }
    return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
  };
  const localBuildVersionRollbackGuidance = ({
    soul = "",
    currentVersion = "",
    previousVersion = null,
    authoritySummaryText = "",
    missingSelectionHelp = "Choose a target to inspect rollback availability."
  } = {}) => {
    if (!soul) {
      return { helpText: missingSelectionHelp, submitDisabled: true };
    }
    const parts = [
      "Current active version: " + (currentVersion || "none") + ".",
      previousVersion
        ? "Rollback target from activation history: " + previousVersion + "."
        : "No prior activation history is available for rollback."
    ];
    if (authoritySummaryText) parts.push(authoritySummaryText);
    return { helpText: parts.join(" "), submitDisabled: !currentVersion || !previousVersion };
  };
  const localTransitionRowFor = (rows, from, to) =>
    (rows || []).find(row => row.from === from && row.to === to) || null;
  const soulOptions = (backendProgramRows || []).map(row => ({
    value: row.soul,
    label: row.soul
  }));
  const buildActivateView = () => {
    const selectedSoul = soulOptions.some(row => row.value === activateSoul)
      ? activateSoul
      : (soulOptions[0]?.value || "");
    const versions = (backendProgramVersionRows || []).filter(row => row.soul === selectedSoul);
    const versionOptions = versions.map(row => ({ value: row.version, label: row.version }));
    const selectedVersion = versionOptions.some(row => row.value === activateVersion)
      ? activateVersion
      : (versionOptions[0]?.value || "");
    const current = versions.find(row => row.active)?.version || "";
    const target = versions.find(row => row.version === selectedVersion) || null;
    const transition = current && selectedVersion && current !== selectedVersion
      ? localTransitionRowFor(
          (backendProgramTransitionRows || []).filter(row => row.soul === selectedSoul),
          current,
          selectedVersion
        )
      : null;
    const program = (backendProgramRows || []).find(row => row.soul === selectedSoul) || null;
    const guidance = localBuildVersionActivationGuidance({
      soul: selectedSoul,
      currentVersion: current,
      targetVersion: target?.version || "",
      targetIndex: target?.index ?? 0,
      transitionStrategy: current && current !== selectedVersion ? (transition?.strategy || "block") : null,
      authoritySummaryText: localAuthoritySummary(program?.context || null, authorityContexts),
      missingSelectionHelp: "Choose a backend program soul and target version to review activation strategy and authority."
    });
    return {
      soulOptions,
      selectedSoul,
      versionOptions,
      selectedVersion,
      helpText: guidance.helpText,
      submitDisabled: guidance.submitDisabled
    };
  };
  const buildRollbackView = () => {
    const selectedSoul = soulOptions.some(row => row.value === rollbackSoul)
      ? rollbackSoul
      : (soulOptions[0]?.value || "");
    const versions = (backendProgramVersionRows || []).filter(row => row.soul === selectedSoul);
    const current = versions.find(row => row.active)?.version || "";
    const previous = localPreviousVersionFromHistory(
      (backendProgramActivationHistoryRows || []).filter(row => row.soul === selectedSoul),
      current
    );
    const program = (backendProgramRows || []).find(row => row.soul === selectedSoul) || null;
    const guidance = localBuildVersionRollbackGuidance({
      soul: selectedSoul,
      currentVersion: current,
      previousVersion: previous,
      authoritySummaryText: localAuthoritySummary(program?.context || null, authorityContexts),
      missingSelectionHelp: "Choose a backend program soul to inspect rollback availability."
    });
    return {
      soulOptions,
      selectedSoul,
      helpText: guidance.helpText,
      submitDisabled: guidance.submitDisabled
    };
  };

  return buildBootstrapBackendVersionControlsView({
    activate: buildActivateView(),
    rollback: buildRollbackView()
  });
}

export function buildBootstrapBackendVersionControlsView({
  activate = {},
  rollback = {}
} = {}) {
  return {
    activate: {
      soulOptions: activate.soulOptions || [],
      selectedSoul: activate.selectedSoul || "",
      versionOptions: activate.versionOptions || [],
      selectedVersion: activate.selectedVersion || "",
      helpText: activate.helpText || "",
      submitDisabled: activate.submitDisabled === true
    },
    rollback: {
      soulOptions: rollback.soulOptions || [],
      selectedSoul: rollback.selectedSoul || "",
      helpText: rollback.helpText || "",
      submitDisabled: rollback.submitDisabled === true
    }
  };
}

export function applyBootstrapBackendVersionControlsView({
  view = {},
  fillSelect = () => {},
  byId = () => null,
  setStatus = () => {},
  editingDisabled = false,
  operatorDisabled = false
} = {}) {
  fillSelect("backend-program-activate-soul", view.activate?.soulOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const activateSoulSelect = byId("backend-program-activate-soul");
  if (activateSoulSelect && [...activateSoulSelect.options].some(option => option.value === view.activate?.selectedSoul)) {
    activateSoulSelect.value = view.activate.selectedSoul;
  }
  fillSelect("backend-program-activate-version", view.activate?.versionOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const versionSelect = byId("backend-program-activate-version");
  if (versionSelect && [...versionSelect.options].some(option => option.value === view.activate?.selectedVersion)) {
    versionSelect.value = view.activate.selectedVersion;
  }
  fillSelect("backend-program-rollback-soul", view.rollback?.soulOptions || [], row => row.value, row => row.label, { includeBlank: false });
  const rollbackSoulSelect = byId("backend-program-rollback-soul");
  if (rollbackSoulSelect && [...rollbackSoulSelect.options].some(option => option.value === view.rollback?.selectedSoul)) {
    rollbackSoulSelect.value = view.rollback.selectedSoul;
  }
  setStatus("backend-program-activate-help", view.activate?.helpText || "");
  setStatus("backend-program-rollback-help", view.rollback?.helpText || "");
  const activateButton = byId("backend-program-activate-form")?.querySelector('button[type="submit"]');
  if (activateButton) activateButton.disabled = editingDisabled || operatorDisabled || Boolean(view.activate?.submitDisabled);
  const rollbackButton = byId("backend-program-rollback-form")?.querySelector('button[type="submit"]');
  if (rollbackButton) rollbackButton.disabled = editingDisabled || operatorDisabled || Boolean(view.rollback?.submitDisabled);
}
