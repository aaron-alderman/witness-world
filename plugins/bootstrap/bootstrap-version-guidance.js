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
    const packageContextForProposal = ${packageContextForProposal.toString()};
    const summarizePackageProposalTarget = ${summarizePackageProposalTarget.toString()};
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
  const hasRef = (idField, refField) => Boolean(normalizedText(body?.[idField]) || normalizedText(body?.[refField]));
  if (targetProcess === "widgetVersion.activate" || targetProcess === "backendProgramVersion.activate") {
    if (!soul) issues.push("Body JSON must include soul.");
    if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
    if (!version) issues.push("Body JSON must include version.");
  }
  if (targetProcess === "widgetVersion.rollback" || targetProcess === "backendProgramVersion.rollback") {
    if (!soul) issues.push("Body JSON must include soul.");
    if (targetId && soul && soul !== targetId) issues.push("Body JSON soul should match targetId.");
  }
  if (targetProcess === "package.define") {
    if (!normalizedText(body?.id)) issues.push("Body JSON must include id.");
    if (!normalizedText(body?.packageKind)) issues.push("Body JSON must include packageKind.");
    if (targetId && normalizedText(body?.context) && normalizedText(body?.context) !== targetId) {
      issues.push("Body JSON context should match targetId.");
    }
  }
  if (targetProcess === "packageRevision.define") {
    if (!normalizedText(body?.id)) issues.push("Body JSON must include id.");
    if (targetId && normalizedText(body?.package) && normalizedText(body?.package) !== targetId) {
      issues.push("Body JSON package should match targetId.");
    }
  }
  if (targetProcess === "packageRevision.publish") {
    if (targetId && normalizedText(body?.id) && normalizedText(body?.id) !== targetId) {
      issues.push("Body JSON id should match targetId.");
    }
  }
  if (targetProcess === "packagePatch.define") {
    if (!hasRef("package", "packageRef")) issues.push("Body JSON must include package or packageRef.");
    if (targetId && normalizedText(body?.revision) && normalizedText(body?.revision) !== targetId) {
      issues.push("Body JSON revision should match targetId.");
    }
    if (!normalizedText(body?.path)) issues.push("Body JSON must include path.");
    if (!normalizedText(body?.operation)) issues.push("Body JSON must include operation.");
    if (!normalizedText(body?.sourceLanguage)) issues.push("Body JSON must include sourceLanguage.");
  }
  if (targetProcess === "packageNamespace.define") {
    if (!normalizedText(body?.name)) issues.push("Body JSON must include name.");
    if (!hasRef("package", "packageRef")) issues.push("Body JSON must include package or packageRef.");
    if (targetId && normalizedText(body?.context) && normalizedText(body?.context) !== targetId) {
      issues.push("Body JSON context should match targetId.");
    }
  }
  if (targetProcess === "packageDependency.define") {
    if (targetId && normalizedText(body?.sourceRevision) && normalizedText(body?.sourceRevision) !== targetId) {
      issues.push("Body JSON sourceRevision should match targetId.");
    }
    if (!normalizedText(body?.targetKind)) issues.push("Body JSON must include targetKind.");
    if (!hasRef("targetId", "targetRef")) issues.push("Body JSON must include targetId or targetRef.");
  }
  if (targetProcess === "packageTransformer.define") {
    if (!hasRef("package", "packageRef")) issues.push("Body JSON must include package or packageRef.");
    if (!hasRef("sourceRevision", "sourceRevisionRef") && !hasRef("sourceNamespace", "sourceNamespaceRef")) {
      issues.push("Body JSON must include sourceRevision/sourceRevisionRef or sourceNamespace/sourceNamespaceRef.");
    }
    if (targetId && normalizedText(body?.targetRevision) && normalizedText(body?.targetRevision) !== targetId) {
      issues.push("Body JSON targetRevision should match targetId.");
    }
    if (
      !targetId
      && !hasRef("targetRevision", "targetRevisionRef")
      && !hasRef("targetNamespace", "targetNamespaceRef")
    ) {
      issues.push("Body JSON must include targetRevision/targetRevisionRef or targetNamespace/targetNamespaceRef.");
    }
  }
  return issues;
}

function packageContextForProposal({
  targetProcess = "",
  targetId = "",
  body = {},
  packageRows = [],
  packageRevisionRows = []
} = {}) {
  const packageById = new Map((packageRows || []).map(row => [row.id, row]));
  const revisionById = new Map((packageRevisionRows || []).map(row => [row.id, row]));
  if (targetProcess === "package.define" || targetProcess === "packageNamespace.define") {
    return normalizedText(body?.context) || targetId || "";
  }
  if (targetProcess === "packageRevision.define") {
    const packageId = normalizedText(body?.package) || targetId;
    return packageById.get(packageId)?.context || "";
  }
  if (targetProcess === "packageRevision.publish") {
    const revisionId = normalizedText(body?.id) || targetId;
    const revisionRow = revisionById.get(revisionId);
    return packageById.get(revisionRow?.package || "")?.context || "";
  }
  if (
    targetProcess === "packagePatch.define"
    || targetProcess === "packageDependency.define"
    || targetProcess === "packageTransformer.define"
  ) {
    const revisionId = normalizedText(body?.revision)
      || normalizedText(body?.sourceRevision)
      || normalizedText(body?.targetRevision)
      || targetId;
    const revisionRow = revisionById.get(revisionId);
    return packageById.get(revisionRow?.package || normalizedText(body?.package) || "")?.context || "";
  }
  return "";
}

function summarizePackageProposalTarget({
  targetProcess = "",
  targetId = "",
  body = {},
  packageRows = [],
  packageRevisionRows = [],
  authoritySummaryText = ""
} = {}) {
  const revisionById = new Map((packageRevisionRows || []).map(row => [row.id, row]));
  const packageContext = packageContextForProposal({
    targetProcess,
    targetId,
    body,
    packageRows,
    packageRevisionRows
  });
  const authorityText = authoritySummaryText || authoritySummary(packageContext || null, []);
  if (targetProcess === "package.define") {
    const parts = [
      "Package definition proposal for context " + (targetId || normalizedText(body?.context) || "(missing targetId)") + ".",
      normalizedText(body?.id)
        ? "Package id: " + normalizedText(body.id) + "."
        : 'Body JSON should include {"id":"package.plugin.example","packageKind":"plugin"}.'
    ];
    if (normalizedText(body?.packageKind)) parts.push("Package kind: " + normalizedText(body.packageKind) + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packageRevision.define") {
    const packageId = normalizedText(body?.package) || targetId || "(missing targetId)";
    const parts = [
      "Package revision proposal for package " + packageId + ".",
      normalizedText(body?.id)
        ? "Revision id: " + normalizedText(body.id) + "."
        : 'Body JSON should include {"id":"packageRevision.plugin.example.v1"}.'
    ];
    if (normalizedText(body?.version)) parts.push("Requested version: " + normalizedText(body.version) + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packageRevision.publish") {
    const revisionId = normalizedText(body?.id) || targetId || "(missing targetId)";
    const revisionRow = revisionById.get(revisionId) || null;
    const parts = [
      "Package revision publish proposal for " + revisionId + ".",
      revisionRow?.status
        ? "Current status: " + revisionRow.status + "."
        : "Approval will publish the revision through the shared package lane."
    ];
    if (revisionRow?.package) parts.push("Package: " + revisionRow.package + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packagePatch.define") {
    const parts = [
      "Package patch proposal for revision " + (targetId || normalizedText(body?.revision) || "(missing targetId)") + ".",
      normalizedText(body?.path)
        ? "Path: " + normalizedText(body.path) + "."
        : "Body JSON should include patch path, operation, and source language."
    ];
    if (normalizedText(body?.operation)) parts.push("Operation: " + normalizedText(body.operation) + ".");
    if (normalizedText(body?.sourceLanguage)) parts.push("Source language: " + normalizedText(body.sourceLanguage) + ".");
    if (normalizedText(body?.package)) parts.push("Package: " + normalizedText(body.package) + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packageNamespace.define") {
    const parts = [
      "Package namespace proposal for context " + (targetId || normalizedText(body?.context) || "(missing targetId)") + ".",
      normalizedText(body?.name)
        ? "Namespace: " + normalizedText(body.name) + "."
        : 'Body JSON should include {"name":"localName","package":"package.plugin.example"}.'
    ];
    if (normalizedText(body?.package)) parts.push("Package: " + normalizedText(body.package) + ".");
    if (normalizedText(body?.revision)) parts.push("Revision: " + normalizedText(body.revision) + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packageDependency.define") {
    const parts = [
      "Package dependency proposal for source revision " + (targetId || normalizedText(body?.sourceRevision) || "(missing targetId)") + ".",
      normalizedText(body?.targetKind) && normalizedText(body?.targetId)
        ? "Dependency target: " + normalizedText(body.targetKind) + " " + normalizedText(body.targetId) + "."
        : 'Body JSON should include {"targetKind":"...","targetId":"..."}.'
    ];
    if (normalizedText(body?.sourcePackage)) parts.push("Source package: " + normalizedText(body.sourcePackage) + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  if (targetProcess === "packageTransformer.define") {
    const parts = [
      "Package transformer proposal for target revision " + (targetId || normalizedText(body?.targetRevision) || normalizedText(body?.targetNamespace) || "(missing targetId)") + ".",
      normalizedText(body?.package)
        ? "Package: " + normalizedText(body.package) + "."
        : 'Body JSON should include {"package":"package.plugin.example"} plus source and target refs.'
    ];
    const sourceRef = normalizedText(body?.sourceRevision) || normalizedText(body?.sourceNamespace);
    const targetRef = normalizedText(body?.targetRevision) || normalizedText(body?.targetNamespace) || targetId;
    if (sourceRef) parts.push("Source: " + sourceRef + ".");
    if (targetRef) parts.push("Target: " + targetRef + ".");
    if (authorityText) parts.push(authorityText);
    return parts.join(" ");
  }
  return "";
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
  packageRows = [],
  packageRevisionRows = [],
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
  if (String(targetProcess).startsWith("package")) {
    return summarizePackageProposalTarget({
      targetProcess,
      targetId,
      body,
      packageRows,
      packageRevisionRows,
      authoritySummaryText
    });
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
  const packageRows = authored.packages || [];
  const packageRevisionRows = authored.packageRevisions || [];
  const packageContext = packageContextForProposal({
    targetProcess,
    targetId,
    body,
    packageRows,
    packageRevisionRows
  });
  const authorityContexts = authored.authority?.mutationContexts || [];

  return summarizeGovernedProposalTarget({
    targetProcess,
    targetKind,
    targetId,
    body,
    packageRows,
    packageRevisionRows,
    widgetActivationHistoryRows,
    widgetTransitionRows,
    backendVersionRows,
    backendTransitionRows,
    backendActivationHistoryRows,
    authoritySummaryText: authoritySummary(packageContext || backendProgramRow?.context || null, authorityContexts)
  });
}
