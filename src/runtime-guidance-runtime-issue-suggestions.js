export function renderRuntimeIssueSuggestionsFactory() {
  return String.raw`
    const surfaceRuntimeIssueSeverityRank = ${surfaceRuntimeIssueSeverityRank.toString()};
    const trimString = ${trimString.toString()};
    const issueExplainCopy = ${issueExplainCopy.toString()};
    const summarizeSurfaceRuntimeIssues = ${summarizeSurfaceRuntimeIssues.toString()};
    const buildRuntimeIssueSuggestions = ${buildRuntimeIssueSuggestions.toString()};
    const summarizeCompanionAttention = ${summarizeCompanionAttention.toString()};
  `;
}

function surfaceRuntimeIssueSeverityRank(severity) {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export function summarizeSurfaceRuntimeIssues(issues = []) {
  const summary = {
    total: 0,
    active: 0,
    resolved: 0,
    bySeverity: { error: 0, warning: 0, info: 0 },
    worstSeverity: null
  };
  for (const issue of issues ?? []) {
    summary.total += 1;
    if (issue?.status === "resolved") summary.resolved += 1;
    else summary.active += 1;
    const severity = trimString(issue?.severity) || "info";
    if (!Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)) summary.bySeverity[severity] = 0;
    summary.bySeverity[severity] += 1;
    if (!summary.worstSeverity || surfaceRuntimeIssueSeverityRank(severity) > surfaceRuntimeIssueSeverityRank(summary.worstSeverity)) {
      summary.worstSeverity = severity;
    }
  }
  return summary;
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function issueExplainCopy(issue = {}) {
  const parts = [
    issue.phase ? `phase=${issue.phase}` : "",
    issue.kind ? `kind=${issue.kind}` : "",
    issue.surfaceId ? `surface=${issue.surfaceId}` : "",
    issue.processRef ? `process=${issue.processRef}` : "",
    issue.targetId ? `target=${issue.targetId}` : "",
    issue.route ? `route=${issue.route}` : ""
  ].filter(Boolean);
  return parts.length
    ? `This surfaced from runtime inspection (${parts.join(", ")}).`
    : "This surfaced from the runtime issue ledger.";
}

export function buildRuntimeIssueSuggestions({
  issues = [],
  inspection = null,
  limit = 3
} = {}) {
  const active = (Array.isArray(issues) ? issues : []).filter(issue => issue?.status !== "resolved");
  const sorted = [...active].sort((left, right) => {
    const severityDelta = surfaceRuntimeIssueSeverityRank(right?.severity) - surfaceRuntimeIssueSeverityRank(left?.severity);
    if (severityDelta !== 0) return severityDelta;
    return Number(right?.updatedAt || right?.at || 0) - Number(left?.updatedAt || left?.at || 0);
  });
  return sorted.slice(0, Math.max(0, Number(limit) || 0)).map(issue => ({
    id: `runtime-issue:${issue.id}`,
    title: trimString(issue.message) || trimString(issue.kind) || "Runtime issue",
    body: issueExplainCopy(issue),
    buttonLabel: issue.targetId ? "Show Target" : "Open Issues",
    explain: issueExplainCopy(issue),
    action: issue.targetId
      ? { kind: "focusRuntimeTarget", targetId: issue.targetId }
      : { kind: "openRuntimeIssues" },
    severity: trimString(issue.severity) || "info",
    issueId: issue.id
  }));
}

export function summarizeCompanionAttention({
  issueSummary = summarizeSurfaceRuntimeIssues([]),
  suggestions = [],
  guidance = null
} = {}) {
  const guidanceVisible = Boolean(guidance?.visible);
  const activeIssues = Number(issueSummary?.active || 0);
  const suggestionCount = Array.isArray(suggestions) ? suggestions.length : 0;
  const visible = activeIssues > 0 || suggestionCount > 0 || guidanceVisible;
  let worstSeverity = issueSummary?.worstSeverity || null;
  if (!worstSeverity && guidanceVisible) worstSeverity = "info";
  let fabLabel = "Sourcery";
  if (activeIssues > 0) fabLabel = `Issues ${activeIssues}`;
  else if (guidanceVisible && guidance?.label) fabLabel = guidance.label;
  return {
    visible,
    fabLabel,
    worstSeverity,
    activeIssues,
    suggestionCount,
    guidanceVisible
  };
}