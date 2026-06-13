function normalizedText(value) {
  return String(value ?? "").trim();
}

export function renderBootstrapVersionGuidanceFactory() {
  return String.raw`
    const normalizedText = ${normalizedText.toString()};
    const uniqueVersionSequence = ${uniqueVersionSequence.toString()};
    const previousVersionFromHistory = ${previousVersionFromHistory.toString()};
    const transitionRowFor = ${transitionRowFor.toString()};
    const authoritySummary = ${authoritySummary.toString()};
    const buildVersionActivationGuidance = ${buildVersionActivationGuidance.toString()};
    const buildVersionRollbackGuidance = ${buildVersionRollbackGuidance.toString()};
    const proposalBodyIssues = ${proposalBodyIssues.toString()};
    const summarizeVersionedProposalTarget = ${summarizeVersionedProposalTarget.toString()};
    const summarizeGovernedProposalTarget = ${summarizeGovernedProposalTarget.toString()};
    const summarizeGovernedProposalTargetFromBootstrap = ${summarizeGovernedProposalTargetFromBootstrap.toString()};
  `;
}

export function uniqueVersionSequence(rows) {
  const result = [];
  for (const row of rows || []) {
    const version = normalizedText(row?.version);
    if (!version) continue;
    if (result[result.length - 1] === version) continue;
    result.push(version);
  }
  return result;
}

export function previousVersionFromHistory(rows, currentVersion) {
  const sequence = uniqueVersionSequence(rows);
  if (!sequence.length) return null;
  const current = normalizedText(currentVersion);
  if (!current) return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
  for (let index = sequence.length - 1; index >= 0; index -= 1) {
    if (sequence[index] !== current) continue;
    return index > 0 ? sequence[index - 1] : null;
  }
  return sequence.length >= 2 ? sequence[sequence.length - 2] : null;
}

export function transitionRowFor(rows, from, to) {
  return (rows || []).find(row => row.from === from && row.to === to) || null;
}

export function authoritySummary(contextId, authorityContexts = []) {
  return contextId
    ? (authorityContexts.includes(contextId)
        ? "Current actor can mutate context " + contextId + " directly."
        : "Current actor is outside mutation context " + contextId + "; direct actions may require a stewarded path.")
    : "No explicit context is attached to this target in bootstrap state.";
}

export function buildVersionActivationGuidance({
  soul = "",
  currentVersion = "",
  targetVersion = "",
  targetIndex = 0,
  transitionStrategy = null,
  authoritySummaryText = "",
  missingSelectionHelp = "Choose a target to review activation strategy and authority."
} = {}) {
  if (!soul || !targetVersion) {
    return {
      helpText: missingSelectionHelp,
      submitDisabled: true
    };
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
  return {
    helpText: parts.join(" "),
    submitDisabled: issues.length > 0
  };
}

export function buildVersionRollbackGuidance({
  soul = "",
  currentVersion = "",
  previousVersion = null,
  authoritySummaryText = "",
  missingSelectionHelp = "Choose a target to inspect rollback availability."
} = {}) {
  if (!soul) {
    return {
      helpText: missingSelectionHelp,
      submitDisabled: true
    };
  }
  const parts = [
    "Current active version: " + (currentVersion || "none") + ".",
    previousVersion
      ? "Rollback target from activation history: " + previousVersion + "."
      : "No prior activation history is available for rollback."
  ];
  if (authoritySummaryText) parts.push(authoritySummaryText);
  return {
    helpText: parts.join(" "),
    submitDisabled: !currentVersion || !previousVersion
  };
}

export function proposalBodyIssues({ targetProcess, targetId, body }) {
  const issues = [];
  const soul = normalizedText(body?.soul);
  const version = normalizedText(body?.version);
  if (targetProcess === "widgetVersion.activate" || targetProcess === "backendProgramVersion.activate") {
    if (!soul) issues.push("Body JSON must include soul.");
    if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
    if (!version) issues.push("Body JSON must include version.");
  }
  if (targetProcess === "widgetVersion.rollback" || targetProcess === "backendProgramVersion.rollback") {
    if (!soul) issues.push("Body JSON must include soul.");
    if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
  }
  return issues;
}

export function summarizeVersionedProposalTarget({
  domain = "backend",
  change = "activate",
  targetId = "",
  body = {},
  currentVersion = "",
  previousVersion = null,
  transitionStrategy = null,
  authoritySummaryText = ""
} = {}) {
  const requestedVersion = normalizedText(body?.version);
  const exampleSoul = targetId || "...";
  const isWidget = domain === "widget";
  const subject = isWidget ? "Widget version" : "Backend program";
  if (change === "activate") {
    const parts = [
      subject + " activation proposal for soul " + (targetId || "(missing targetId)") + ".",
      requestedVersion
        ? "Requested version: " + requestedVersion + "."
        : 'Body JSON should include {"soul":"' + exampleSoul + '","version":"..."}.'
    ];
    if (currentVersion) parts.push("Current active version: " + currentVersion + ".");
    if (transitionStrategy) parts.push("Transition strategy: " + transitionStrategy + ".");
    else if (currentVersion && requestedVersion) parts.push("Missing transition defaults to block.");
    if (isWidget) parts.push("Approval requires authority on the governed widget target.");
    else if (authoritySummaryText) parts.push(authoritySummaryText);
    return parts.join(" ");
  }
  const parts = [
    subject + " rollback proposal for soul " + (targetId || "(missing targetId)") + ".",
    'Body JSON should include {"soul":"' + exampleSoul + '"}.'
  ];
  if (currentVersion) parts.push("Current active version: " + currentVersion + ".");
  parts.push(previousVersion ? "Expected rollback target: " + previousVersion + "." : "No previous activation is currently visible.");
  if (isWidget) parts.push("Approval requires stewarded authority on the governed widget target.");
  else if (authoritySummaryText) parts.push(authoritySummaryText);
  return parts.join(" ");
}

export function summarizeGovernedProposalTarget({
  targetProcess = "",
  targetKind = "",
  targetId = "",
  body = {},
  widgetActivationHistoryRows = [],
  widgetTransitionRows = [],
  backendVersionRows = [],
  backendTransitionRows = [],
  backendActivationHistoryRows = [],
  authoritySummaryText = ""
} = {}) {
  if (!targetProcess) return "Choose a target process to see proposal semantics.";
  if (targetProcess === "widgetVersion.activate") {
    const version = normalizedText(body?.version);
    const current = (widgetActivationHistoryRows || []).slice(-1)[0]?.version || "";
    const transition = current && version ? transitionRowFor(widgetTransitionRows, current, version) : null;
    return summarizeVersionedProposalTarget({
      domain: "widget",
      change: "activate",
      targetId,
      body,
      currentVersion: current,
      transitionStrategy: transition?.strategy || (current && version ? "block" : null)
    });
  }
  if (targetProcess === "widgetVersion.rollback") {
    const current = (widgetActivationHistoryRows || []).slice(-1)[0]?.version || "";
    const previous = previousVersionFromHistory(widgetActivationHistoryRows, current);
    return summarizeVersionedProposalTarget({
      domain: "widget",
      change: "rollback",
      targetId,
      body,
      currentVersion: current,
      previousVersion: previous
    });
  }
  if (targetProcess === "backendProgramVersion.activate") {
    const version = normalizedText(body?.version);
    const current = (backendVersionRows || []).find(row => row.active)?.version || "";
    const transition = current && version ? transitionRowFor(backendTransitionRows, current, version) : null;
    return summarizeVersionedProposalTarget({
      domain: "backend",
      change: "activate",
      targetId,
      body,
      currentVersion: current,
      transitionStrategy: transition?.strategy || (current && version ? "block" : null),
      authoritySummaryText
    });
  }
  if (targetProcess === "backendProgramVersion.rollback") {
    const current = (backendVersionRows || []).find(row => row.active)?.version || "";
    const previous = previousVersionFromHistory(backendActivationHistoryRows, current);
    return summarizeVersionedProposalTarget({
      domain: "backend",
      change: "rollback",
      targetId,
      body,
      currentVersion: current,
      previousVersion: previous,
      authoritySummaryText
    });
  }
  if (String(targetProcess).startsWith("widgetVersion.") || String(targetProcess).startsWith("backendProgramVersion.")) {
    return "Governed version change proposal. Use targetId as the versioned soul and include any required version details in Body JSON.";
  }
  return "Proposal targets " + targetProcess + " on " + (targetKind || "target") + " " + (targetId || "(missing targetId)") + ". Approval will run later through the open proposal queue.";
}

export function summarizeGovernedProposalTargetFromBootstrap({
  targetProcess = "",
  targetKind = "",
  targetId = "",
  body = {},
  authored = {}
} = {}) {
  const widgetActivationHistoryRows = (authored.widgetVersionActivationHistory || [])
    .filter(row => row.soul === targetId);
  const widgetTransitionRows = (authored.widgetVersionTransitions || [])
    .filter(row => row.soul === targetId);
  const backendVersionRows = (authored.backendProgramVersions || [])
    .filter(row => row.soul === targetId);
  const backendTransitionRows = (authored.backendProgramTransitions || [])
    .filter(row => row.soul === targetId);
  const backendActivationHistoryRows = (authored.backendProgramActivationHistory || [])
    .filter(row => row.soul === targetId);
  const backendProgramRow = (authored.backendPrograms || [])
    .find(row => row.soul === targetId) || null;
  const authorityContexts = authored.authority?.mutationContexts || [];

  return summarizeGovernedProposalTarget({
    targetProcess,
    targetKind,
    targetId,
    body,
    widgetActivationHistoryRows,
    widgetTransitionRows,
    backendVersionRows,
    backendTransitionRows,
    backendActivationHistoryRows,
    authoritySummaryText: authoritySummary(backendProgramRow?.context || null, authorityContexts)
  });
}
