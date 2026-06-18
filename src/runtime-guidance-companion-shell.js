import {
  buildRuntimeIssueSuggestions,
  summarizeCompanionAttention
} from "./runtime-guidance-runtime-issue-suggestions.js";
import { summarizeSurfaceRuntimeIssues } from "./runtime-guidance-runtime-issue-suggestions.js";
import { runGuidanceSuggestionAction } from "./runtime-guidance-companion-actions.js";
import { renderRuntimeIssueSuggestionsFactory } from "./runtime-guidance-runtime-issue-suggestions.js";

export function renderSourceryCompanionShellFactory() {
  return String.raw`
    ${renderRuntimeIssueSuggestionsFactory()}
    const COMPANION_GLOBAL_KEY = "__sourceryCompanionShell";
    const escapeHtml = ${escapeHtml.toString()};
    const appendChildren = ${appendChildren.toString()};
    const renderIssueListHtml = ${renderIssueListHtml.toString()};
    const renderSuggestionListHtml = ${renderSuggestionListHtml.toString()};
    const ensureSourceryCompanionShellStyles = ${ensureSourceryCompanionShellStyles.toString()};
    const getOrCreateSourceryCompanionShell = ${getOrCreateSourceryCompanionShell.toString()};
    const createSourceryCompanionShell = ${createSourceryCompanionShell.toString()};
    const createSurfaceDiagnosticsOverlay = ${createSurfaceDiagnosticsOverlay.toString()};
  `;
}

const COMPANION_GLOBAL_KEY = "__sourceryCompanionShell";

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function appendChildren(parent, ...children) {
  if (!parent) return parent;
  for (const child of children) {
    if (!child) continue;
    if (typeof parent.append === "function") parent.append(child);
    else parent.appendChild?.(child);
  }
  return parent;
}

export function ensureSourceryCompanionShellStyles(document) {
  if (!document?.createElement || !document?.head?.appendChild) return null;
  const existing = document.getElementById?.("sourcery-companion-style");
  if (existing) return existing;
  const style = document.createElement("style");
  style.id = "sourcery-companion-style";
  style.textContent = `
#sourcery-companion-root { position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; font: 12px/1.4 system-ui, sans-serif; }
#sourcery-companion-root[hidden] { display: none; }
#sourcery-companion-fab, #surface-runtime-diagnostics-fab { min-width: 56px; min-height: 56px; border-radius: 999px; border: 1px solid rgba(255,255,255,.12); color: #fff; background: #334155; box-shadow: 0 10px 30px rgba(0,0,0,.35); cursor: pointer; padding: 0 14px; font-weight: 700; }
#sourcery-companion-fab.sourcery-companion-severity-error, #surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-error { background: #991b1b; }
#sourcery-companion-fab.sourcery-companion-severity-warning, #surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-warning { background: #92400e; }
#sourcery-companion-fab.sourcery-companion-severity-info, #surface-runtime-diagnostics-fab.surface-runtime-diagnostics-severity-info { background: #1d4ed8; }
#sourcery-companion-panel, #surface-runtime-diagnostics-panel { position: absolute; right: 0; bottom: 72px; width: min(520px, calc(100vw - 32px)); max-height: min(70vh, 720px); overflow: auto; border-radius: 14px; background: rgba(15,23,42,.98); color: #e2e8f0; border: 1px solid rgba(148,163,184,.28); box-shadow: 0 18px 48px rgba(0,0,0,.42); padding: 14px; }
#sourcery-companion-panel[hidden], #surface-runtime-diagnostics-panel[hidden] { display: none; }
.sourcery-companion-summary, .surface-runtime-diagnostics-summary { font-weight: 700; margin-bottom: 8px; }
.sourcery-companion-meta, .surface-runtime-diagnostics-meta { color: #94a3b8; margin-bottom: 8px; white-space: pre-wrap; }
.sourcery-companion-section-title { font-weight: 700; margin: 12px 0 8px; color: #cbd5e1; }
.sourcery-companion-actions, .surface-runtime-diagnostics-actions { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.sourcery-companion-actions button, .surface-runtime-diagnostics-actions button { border-radius: 10px; border: 1px solid rgba(148,163,184,.28); background: #1e293b; color: #e2e8f0; padding: 6px 10px; cursor: pointer; }
.sourcery-companion-suggestions, .surface-runtime-diagnostics-list { display: grid; gap: 8px; }
.sourcery-companion-suggestion, .tutorial-suggestion { border: 1px solid rgba(148,163,184,.18); border-radius: 10px; padding: 10px; background: rgba(30,41,59,.75); }
.sourcery-companion-suggestion.sourcery-companion-severity-error { border-color: rgba(248,113,113,.55); }
.sourcery-companion-suggestion.sourcery-companion-severity-warning { border-color: rgba(251,191,36,.45); }
.sourcery-companion-suggestion strong { display: block; margin-bottom: 4px; }
.sourcery-companion-suggestion p { margin: 0 0 8px; color: #cbd5e1; }
.sourcery-companion-issue, .surface-runtime-diagnostics-item { border: 1px solid rgba(148,163,184,.18); border-radius: 10px; padding: 10px; background: rgba(30,41,59,.75); }
.sourcery-companion-issue.sourcery-companion-status-resolved, .surface-runtime-diagnostics-item.surface-runtime-diagnostics-status-resolved { opacity: .72; }
.sourcery-companion-issue.sourcery-companion-severity-error, .surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-error { border-color: rgba(248,113,113,.55); }
.sourcery-companion-issue.sourcery-companion-severity-warning, .surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-warning { border-color: rgba(251,191,36,.45); }
.sourcery-companion-issue.sourcery-companion-severity-info, .surface-runtime-diagnostics-item.surface-runtime-diagnostics-severity-info { border-color: rgba(96,165,250,.35); }
.sourcery-companion-issue-head, .surface-runtime-diagnostics-item-head { display: flex; justify-content: space-between; gap: 8px; font-weight: 700; }
.sourcery-companion-issue-meta, .surface-runtime-diagnostics-item-meta { color: #94a3b8; margin-top: 4px; white-space: pre-wrap; }
`;
  document.head.appendChild(style);
  return style;
}

function renderIssueListHtml(issues = []) {
  return issues.map(issue => {
    const details = issue?.details == null
      ? ""
      : (typeof issue.details === "string" ? issue.details : JSON.stringify(issue.details));
    return `<div class="sourcery-companion-issue sourcery-companion-severity-${escapeHtml(issue.severity || "info")} sourcery-companion-status-${escapeHtml(issue.status || "active")}">
  <div class="sourcery-companion-issue-head"><span>${escapeHtml(issue.message || issue.kind || issue.id)}</span><span>${escapeHtml(issue.severity || "info")} / ${escapeHtml(issue.status || "active")}</span></div>
  <div class="sourcery-companion-issue-meta">${escapeHtml([
    issue.phase ? `phase=${issue.phase}` : "",
    issue.surfaceId ? `surface=${issue.surfaceId}` : "",
    issue.processRef ? `process=${issue.processRef}` : "",
    issue.targetId ? `target=${issue.targetId}` : "",
    issue.route ? `route=${issue.route}` : "",
    issue.correlationId ? `corr=${issue.correlationId}` : ""
  ].filter(Boolean).join(" | "))}</div>
  ${details ? `<div class="sourcery-companion-issue-meta">${escapeHtml(details)}</div>` : ""}
</div>`;
  }).join("");
}

function renderSuggestionListHtml(suggestions = []) {
  return suggestions.map(suggestion => `<div class="sourcery-companion-suggestion sourcery-companion-severity-${escapeHtml(suggestion.severity || "info")}" data-suggestion-id="${escapeHtml(suggestion.id)}">
  <strong>${escapeHtml(suggestion.title)}</strong>
  <p>${escapeHtml(suggestion.body)}</p>
  <div class="sourcery-companion-actions"><button type="button" data-companion-suggestion-action="${escapeHtml(suggestion.id)}">${escapeHtml(suggestion.buttonLabel || "Open")}</button></div>
</div>`).join("");
}

export function getOrCreateSourceryCompanionShell({
  document,
  window,
  enabled = true,
  inspection = null,
  issueLedger = null
} = {}) {
  if (!enabled || !document?.createElement || !document?.body?.appendChild) {
    return { render() {}, destroy() {}, updateGuidanceState() {}, setExtraSuggestions() {} };
  }
  const existing = window?.[COMPANION_GLOBAL_KEY];
  if (existing) {
    if (inspection) existing.inspection = inspection;
    if (issueLedger && issueLedger !== existing.issueLedger) {
      existing.issueLedgerUnsubscribe?.();
      existing.issueLedger = issueLedger;
      existing.issueLedgerUnsubscribe = issueLedger?.subscribe?.(() => existing.render()) ?? (() => {});
    } else if (issueLedger) {
      existing.issueLedger = issueLedger;
    }
    return existing;
  }

  ensureSourceryCompanionShellStyles(document);
  const root = document.createElement("div");
  root.id = "sourcery-companion-root";
  root.hidden = true;

  const fab = document.createElement("button");
  fab.id = "sourcery-companion-fab";
  fab.type = "button";

  const panel = document.createElement("div");
  panel.id = "sourcery-companion-panel";
  panel.hidden = true;

  const summary = document.createElement("div");
  summary.className = "sourcery-companion-summary";
  const meta = document.createElement("div");
  meta.className = "sourcery-companion-meta";
  const actions = document.createElement("div");
  actions.className = "sourcery-companion-actions";

  const guidanceButton = document.createElement("button");
  guidanceButton.type = "button";
  guidanceButton.id = "sourcery-companion-guidance-action";
  guidanceButton.hidden = true;

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy JSON";
  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  const rerunButton = document.createElement("button");
  rerunButton.type = "button";
  rerunButton.textContent = "Rerun Probe";

  const suggestionsTitle = document.createElement("div");
  suggestionsTitle.className = "sourcery-companion-section-title";
  suggestionsTitle.textContent = "Now";
  const suggestions = document.createElement("div");
  suggestions.className = "sourcery-companion-suggestions";
  suggestions.id = "sourcery-companion-suggestions";

  const issuesTitle = document.createElement("div");
  issuesTitle.className = "sourcery-companion-section-title";
  issuesTitle.textContent = "Runtime Issues";
  const issues = document.createElement("div");
  issues.className = "surface-runtime-diagnostics-list";
  issues.id = "sourcery-companion-issues";

  appendChildren(actions, guidanceButton, copyButton, clearButton, rerunButton);
  appendChildren(panel, summary, meta, actions, suggestionsTitle, suggestions, issuesTitle, issues);
  appendChildren(root, fab, panel);
  document.body.appendChild(root);

  let open = false;
  let guidanceState = { visible: false, label: "Sourcery", onResume: null };
  let extraSuggestions = [];
  let rankedSuggestions = [];
  let shellInspection = inspection;
  let shellIssueLedger = issueLedger;
  let suggestionRunner = null;

  const toggle = () => {
    open = !open;
    panel.hidden = !open;
  };

  fab.addEventListener?.("click", toggle);
  guidanceButton.addEventListener?.("click", () => {
    if (typeof guidanceState.onResume === "function") guidanceState.onResume();
  });
  copyButton.addEventListener?.("click", async () => {
    const payload = typeof shellInspection?.inspect === "function" ? shellInspection.inspect() : null;
    const json = JSON.stringify(payload, null, 2);
    if (window?.navigator?.clipboard?.writeText) {
      try {
        await window.navigator.clipboard.writeText(json);
      } catch {}
    }
  });
  clearButton.addEventListener?.("click", () => shellInspection?.clearIssues?.());
  rerunButton.addEventListener?.("click", () => shellInspection?.rerunProbe?.());

  const defaultRuntimeSuggestionHandlers = {
    openRuntimeIssues: async () => {
      open = true;
      panel.hidden = false;
      issues.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    },
    focusRuntimeTarget: async targetId => {
      const node = document?.getElementById?.(targetId);
      node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      node?.focus?.();
    },
    rerunRuntimeProbe: async () => shellInspection?.rerunProbe?.(),
    copyRuntimeInspection: async () => {
      const payload = typeof shellInspection?.inspect === "function" ? shellInspection.inspect() : null;
      const json = JSON.stringify(payload, null, 2);
      if (window?.navigator?.clipboard?.writeText) {
        try {
          await window.navigator.clipboard.writeText(json);
        } catch {}
      }
    }
  };

  const dispatchSuggestionAction = async suggestion => {
    if (typeof suggestionRunner === "function") {
      await suggestionRunner(suggestion);
      return;
    }
    await runGuidanceSuggestionAction(suggestion, defaultRuntimeSuggestionHandlers);
  };

  suggestions.addEventListener?.("click", event => {
    void (async () => {
      const button = event?.target?.closest?.("[data-companion-suggestion-action]");
      if (!button) return;
      const suggestionId = button.getAttribute("data-companion-suggestion-action");
      const suggestion = rankedSuggestions.find(row => row.id === suggestionId);
      if (suggestion) await dispatchSuggestionAction(suggestion);
    })();
  });

  const render = () => {
    const issueRows = typeof shellIssueLedger?.list === "function" ? shellIssueLedger.list() : [];
    const issueSummary = summarizeSurfaceRuntimeIssues(issueRows);
    const issueSuggestions = buildRuntimeIssueSuggestions({
      issues: issueRows,
      inspection: shellInspection
    });
    const allSuggestions = [...issueSuggestions, ...extraSuggestions];
    rankedSuggestions = allSuggestions;
    const attention = summarizeCompanionAttention({
      issueSummary,
      suggestions: allSuggestions,
      guidance: guidanceState
    });

    root.hidden = !attention.visible;
    fab.className = `sourcery-companion-severity-${attention.worstSeverity || "info"}`;
    fab.textContent = attention.fabLabel;

    summary.textContent = attention.activeIssues > 0
      ? `Sourcery companion: ${attention.activeIssues} active runtime issue${attention.activeIssues === 1 ? "" : "s"}`
      : "Sourcery companion";
    meta.textContent = [
      `route: ${trimString(window?.location?.pathname) || "/"}`,
      `active surface: ${trimString(shellInspection?.activeSurfaceId) || "-"}`,
      `process refs: ${((shellInspection?.latestProbe?.currentProcessRefs ?? []).join(", ")) || "-"}`
    ].join("\n");

    guidanceButton.hidden = !guidanceState.visible;
    guidanceButton.textContent = guidanceState.label || "Resume Sourcery";
    guidanceButton.disabled = typeof guidanceState.onResume !== "function";

    suggestionsTitle.hidden = allSuggestions.length === 0;
    suggestions.hidden = allSuggestions.length === 0;
    suggestions.innerHTML = renderSuggestionListHtml(allSuggestions);

    issuesTitle.hidden = issueRows.length === 0;
    issues.hidden = issueRows.length === 0;
    issues.innerHTML = renderIssueListHtml(issueRows);

    copyButton.hidden = !shellInspection;
    clearButton.hidden = !shellInspection;
    rerunButton.hidden = !shellInspection?.rerunProbe;
  };

  const issueLedgerUnsubscribe = shellIssueLedger?.subscribe?.(() => render()) ?? (() => {});
  render();

  const shell = {
    root,
    fab,
    panel,
    suggestions,
    issues,
    inspection: shellInspection,
    issueLedger: shellIssueLedger,
    issueLedgerUnsubscribe,
    render,
    getRankedSuggestions() {
      return rankedSuggestions;
    },
    setSuggestionRunner(runner) {
      suggestionRunner = typeof runner === "function" ? runner : null;
    },
    updateGuidanceState(next = {}) {
      guidanceState = {
        visible: Boolean(next.visible),
        label: trimString(next.label) || "Sourcery",
        onResume: typeof next.onResume === "function" ? next.onResume : null
      };
      render();
    },
    setExtraSuggestions(rows = []) {
      extraSuggestions = Array.isArray(rows) ? [...rows] : [];
      render();
    },
    destroy() {
      issueLedgerUnsubscribe();
      root.parentNode?.removeChild?.(root);
      if (window?.[COMPANION_GLOBAL_KEY] === shell) delete window[COMPANION_GLOBAL_KEY];
    }
  };

  if (window && typeof window === "object") window[COMPANION_GLOBAL_KEY] = shell;
  return shell;
}

export function createSourceryCompanionShell(options = {}) {
  return getOrCreateSourceryCompanionShell(options);
}

export function createSurfaceDiagnosticsOverlay({
  document,
  window,
  inspection,
  issueLedger,
  enabled = false
} = {}) {
  const shell = getOrCreateSourceryCompanionShell({
    document,
    window,
    enabled,
    inspection,
    issueLedger
  });
  return {
    render: () => shell.render(),
    destroy: () => shell.destroy()
  };
}