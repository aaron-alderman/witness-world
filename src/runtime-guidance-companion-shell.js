import {
  buildRuntimeIssueSuggestions,
  summarizeCompanionAttention
} from "./runtime-guidance-runtime-issue-suggestions.js";
import { summarizeSurfaceRuntimeIssues } from "./runtime-guidance-runtime-issue-suggestions.js";
import {
  renderGuidanceCompanionActionsFactory,
  runGuidanceSuggestionAction
} from "./runtime-guidance-companion-actions.js";
import { renderRuntimeIssueSuggestionsFactory } from "./runtime-guidance-runtime-issue-suggestions.js";

export function renderSourceryCompanionShellFactory() {
  return String.raw`
    ${renderGuidanceCompanionActionsFactory()}
    ${renderRuntimeIssueSuggestionsFactory()}
    const COMPANION_GLOBAL_KEY = "__sourceryCompanionShell";
    const escapeHtml = ${escapeHtml.toString()};
    const appendChildren = ${appendChildren.toString()};
    const serializeJsonDocument = ${serializeJsonDocument.toString()};
    const sanitizeDownloadSegment = ${sanitizeDownloadSegment.toString()};
    const triggerJsonDownload = ${triggerJsonDownload.toString()};
    const copyTextToClipboard = ${copyTextToClipboard.toString()};
    const buildIssueClipboardPayload = ${buildIssueClipboardPayload.toString()};
    const buildWitnessCoreSuggestions = ${buildWitnessCoreSuggestions.toString()};
    const buildWitnessCoreSuggestion = ${buildWitnessCoreSuggestion.toString()};
    const refreshWitnessCoreStatus = ${refreshWitnessCoreStatus.toString()};
    const postWitnessCoreGenerationAction = ${postWitnessCoreGenerationAction.toString()};
    const startWitnessCoreStatusPolling = ${startWitnessCoreStatusPolling.toString()};
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

function serializeJsonDocument(payload) {
  try {
    return JSON.stringify(payload ?? null, null, 2);
  } catch (error) {
    return JSON.stringify({
      error: "Failed to serialize payload.",
      details: String(error?.message || error || "unknown")
    }, null, 2);
  }
}

function sanitizeDownloadSegment(value, fallback = "snapshot") {
  const normalized = trimString(value)
    .replaceAll(/[\\/:*?"<>|]+/g, "-")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized || fallback;
}

function triggerJsonDownload({ window, document, filename, payload }) {
  if (!document?.createElement || !document?.body?.appendChild) return false;
  const BlobCtor = window?.Blob || globalThis?.Blob;
  const URLApi = window?.URL || globalThis?.URL;
  if (typeof BlobCtor !== "function" || typeof URLApi?.createObjectURL !== "function") return false;
  const blob = new BlobCtor([serializeJsonDocument(payload)], { type: "application/json" });
  const href = URLApi.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = trimString(filename) || "sourcery-inspection.json";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  anchor.click?.();
  anchor.parentNode?.removeChild?.(anchor);
  URLApi.revokeObjectURL?.(href);
  return true;
}

async function copyTextToClipboard(window, text) {
  if (!window?.navigator?.clipboard?.writeText) return false;
  try {
    await window.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function buildIssueClipboardPayload({ issues = [], window } = {}) {
  const allIssues = Array.isArray(issues) ? issues : [];
  const activeIssues = allIssues.filter(issue => issue?.status !== "resolved");
  const exportedIssues = activeIssues.length > 0 ? activeIssues : allIssues;
  return {
    route: trimString(window?.location?.pathname) || "/",
    activeOnly: activeIssues.length > 0,
    issueCount: exportedIssues.length,
    exportedAt: new Date().toISOString(),
    issues: exportedIssues
  };
}

export function buildWitnessCoreSuggestions(status = null, coreUrl = "") {
  if (!status || typeof status !== "object") return [];
  const generations = Array.isArray(status.generations) ? status.generations : [];
  const latest = generations[generations.length - 1] ?? null;
  const aliases = status.aliases ?? {};
  const process = status.process && typeof status.process === "object" ? status.process : null;
  const state = latest?.state || "unknown";
  const failed = ["compile_failed", "proof_failed"].includes(state);
  const running = ["candidate", "proof_running"].includes(state);
  const severity = failed ? "error" : (running ? "warning" : "info");
  const latestLabel = latest?.id ? `${latest.id} / ${state}` : "no generations yet";
  const stableLabel = aliases.current_stable || aliases.last_good || "-";
  const coreRoot = coreUrl ? coreUrl.replace(/\/$/, "") : "";
  const suggestions = [{
    id: "witness-core-status",
    title: failed ? "Witness Core Proof Failed" : (running ? "Witness Core Proof Running" : "Witness Core Live"),
    body: `latest: ${latestLabel}\nstable: ${stableLabel}`,
    severity,
    buttonLabel: "Open Core",
    action: { kind: "openWitnessCore", url: coreUrl ? `${coreUrl.replace(/\/$/, "")}/generations` : null }
  }];
  let deferredProcessStopSuggestion = null;
  if (process?.command) {
    const processRunning = process.running === true;
    const processSeverity = processRunning
      ? ((Number(process.restartCount || 0) > 0 || process.lastError) ? "warning" : "info")
      : "error";
    const processSummary = processRunning
      ? `running pid=${process.pid ?? "-"}`
      : `exited code=${process.lastExitCode ?? "unknown"}`;
    const processDetail = [
      process.command ? `command: ${process.command}` : "",
      process.workingDir ? `cwd: ${process.workingDir}` : "",
      `restarts: ${Number(process.restartCount || 0)}`,
      process.lastError ? `error: ${process.lastError}` : ""
    ].filter(Boolean).join("\n");
    suggestions.push({
      id: "witness-core-process",
      title: processRunning ? "Witness Core App Process Running" : "Witness Core App Process Exited",
      body: [processSummary, processDetail].filter(Boolean).join("\n"),
      severity: processSeverity,
      buttonLabel: "Open Core",
      action: { kind: "openWitnessCore", url: coreUrl ? `${coreUrl.replace(/\/$/, "")}/processes` : null }
    });
    if (coreRoot) {
      suggestions.push({
        id: "witness-core-process-restart",
        title: processRunning ? "Restart App Process" : "Start App Process",
        body: processRunning ? "restart the supervised app child process" : "start the supervised app child process",
        severity: processRunning ? "warning" : "info",
        buttonLabel: processRunning ? "Restart" : "Start",
        action: {
          kind: "restartWitnessCoreProcess",
          url: `${coreRoot}/processes/restart`
        }
      });
      if (processRunning) {
        deferredProcessStopSuggestion = {
          id: "witness-core-process-stop",
          title: "Stop App Process",
          body: "stop the supervised app child process and leave the core running",
          severity: "warning",
          buttonLabel: "Stop",
          action: {
            kind: "stopWitnessCoreProcess",
            url: `${coreRoot}/processes/stop`
          }
        };
      }
    }
  }
  const greenLocal = typeof aliases.current_green_local === "string" && aliases.current_green_local.trim()
    ? aliases.current_green_local.trim()
    : "";
  const currentStable = typeof aliases.current_stable === "string" && aliases.current_stable.trim()
    ? aliases.current_stable.trim()
    : "";
  const lastGood = typeof aliases.last_good === "string" && aliases.last_good.trim()
    ? aliases.last_good.trim()
    : "";
  if (greenLocal && greenLocal !== currentStable && coreRoot) {
    suggestions.push({
      id: "witness-core-promote",
      title: "Promote Green Local",
      body: `promote ${greenLocal} to stable`,
      severity: failed ? "warning" : "info",
      buttonLabel: "Promote",
      action: {
        kind: "promoteWitnessCoreGeneration",
        generationId: greenLocal,
        url: `${coreRoot}/generations/${encodeURIComponent(greenLocal)}/promote`
      }
    });
  }
  if (failed && lastGood && coreRoot) {
    suggestions.push({
      id: "witness-core-rollback",
      title: "Rollback To Last Good",
      body: `restore ${lastGood} as stable`,
      severity: "warning",
      buttonLabel: "Rollback",
      action: {
        kind: "rollbackWitnessCoreGeneration",
        generationId: lastGood,
        url: `${coreRoot}/generations/${encodeURIComponent(lastGood)}/rollback`
      }
    });
  }
  if (deferredProcessStopSuggestion) {
    suggestions.push(deferredProcessStopSuggestion);
  }
  return suggestions;
}

function buildWitnessCoreSuggestion(status = null, coreUrl = "") {
  return buildWitnessCoreSuggestions(status, coreUrl)[0] ?? null;
}

async function refreshWitnessCoreStatus({ window, shell, coreUrl = "" } = {}) {
  const normalizedCoreUrl = trimString(coreUrl) || trimString(window?.__witnessCoreUrl);
  if (!normalizedCoreUrl || typeof window?.fetch !== "function") return;
  try {
    const [generationsResponse, healthResponse] = await Promise.all([
      window.fetch(`${normalizedCoreUrl.replace(/\/$/, "")}/generations`, { cache: "no-store" }),
      window.fetch(`${normalizedCoreUrl.replace(/\/$/, "")}/health`, { cache: "no-store" })
    ]);
    if (!generationsResponse?.ok && !healthResponse?.ok) {
      shell?.setCoreStatusSuggestions?.([]);
      return;
    }
    const generations = generationsResponse?.ok ? await generationsResponse.json() : {};
    const health = healthResponse?.ok ? await healthResponse.json() : {};
    const status = {
      ...(generations ?? {}),
      process: health?.process ?? null,
      service: health?.service ?? "witness-core",
      ok: health?.ok !== false
    };
    const suggestions = buildWitnessCoreSuggestions(status, normalizedCoreUrl);
    shell?.setCoreStatusSuggestions?.(suggestions);
  } catch {
    shell?.setCoreStatusSuggestions?.([]);
  }
}

async function postWitnessCoreGenerationAction({ window, shell, url } = {}) {
  const targetUrl = trimString(url);
  if (!targetUrl || typeof window?.fetch !== "function") return false;
  const response = await window.fetch(targetUrl, {
    method: "POST"
  });
  if (!response?.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `Witness core action failed (${response?.status || "unknown"})`);
  }
  await refreshWitnessCoreStatus({ window, shell });
  return true;
}

function startWitnessCoreStatusPolling({ window, shell, intervalMs = 2500 } = {}) {
  const coreUrl = typeof window?.__witnessCoreUrl === "string" && window.__witnessCoreUrl.trim()
    ? window.__witnessCoreUrl.trim()
    : "";
  if (!coreUrl || !shell || shell.__witnessCorePollingStarted) return;
  shell.__witnessCorePollingStarted = true;
  const poll = async () => {
    await refreshWitnessCoreStatus({ window, shell, coreUrl });
  };
  void poll();
  const timer = window.setInterval?.(poll, intervalMs);
  shell.__witnessCorePollingTimer = timer ?? null;
  shell.__refreshWitnessCoreStatus = () => refreshWitnessCoreStatus({ window, shell, coreUrl });
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
  if (window?.__sourceryCompanionEnabled === false) enabled = false;
  if (!enabled || !document?.createElement || !document?.body?.appendChild) {
    return { render() {}, destroy() {}, updateGuidanceState() {}, setExtraSuggestions() {}, setPanelAction() {}, setPinned() {} };
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

  const panelActionButton = document.createElement("button");
  panelActionButton.type = "button";
  panelActionButton.id = "sourcery-companion-panel-action";
  panelActionButton.hidden = true;

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.id = "sourcery-companion-download-json-action";
  downloadButton.textContent = "Download JSON";
  const copyIssuesButton = document.createElement("button");
  copyIssuesButton.type = "button";
  copyIssuesButton.id = "sourcery-companion-copy-issues-action";
  copyIssuesButton.textContent = "Copy Issues";
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

  appendChildren(actions, guidanceButton, panelActionButton, downloadButton, copyIssuesButton, clearButton, rerunButton);
  appendChildren(panel, summary, meta, actions, suggestionsTitle, suggestions, issuesTitle, issues);
  appendChildren(root, fab, panel);
  document.body.appendChild(root);

  let open = false;
  let guidanceState = { visible: false, label: "Sourcery", onResume: null };
  let extraSuggestions = [];
  let coreStatusSuggestions = [];
  let rankedSuggestions = [];
  let shellInspection = inspection;
  let shellIssueLedger = issueLedger;
  let suggestionRunner = null;
  let panelAction = { visible: false, label: "", onClick: null };
  let pinned = window?.__sourceryCompanionPinned === true;

  const toggle = () => {
    open = !open;
    panel.hidden = !open;
  };

  fab.addEventListener?.("click", toggle);
  guidanceButton.addEventListener?.("click", () => {
    if (typeof guidanceState.onResume === "function") guidanceState.onResume();
  });
  panelActionButton.addEventListener?.("click", () => {
    if (typeof panelAction.onClick === "function") panelAction.onClick();
  });
  downloadButton.addEventListener?.("click", async () => {
    const payload = typeof shellInspection?.inspect === "function" ? shellInspection.inspect() : null;
    const surfaceSegment = sanitizeDownloadSegment(shellInspection?.activeSurfaceId, "surface");
    const routeSegment = sanitizeDownloadSegment(window?.location?.pathname, "route");
    triggerJsonDownload({
      window,
      document,
      filename: `sourcery-${surfaceSegment}-${routeSegment}.json`,
      payload
    });
  });
  copyIssuesButton.addEventListener?.("click", async () => {
    const issueRows = typeof shellIssueLedger?.list === "function" ? shellIssueLedger.list() : [];
    const payload = buildIssueClipboardPayload({ issues: issueRows, window });
    await copyTextToClipboard(window, serializeJsonDocument(payload));
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
      const surfaceSegment = sanitizeDownloadSegment(shellInspection?.activeSurfaceId, "surface");
      const routeSegment = sanitizeDownloadSegment(window?.location?.pathname, "route");
      triggerJsonDownload({
        window,
        document,
        filename: `sourcery-${surfaceSegment}-${routeSegment}.json`,
        payload
      });
    },
    openWitnessCore: async url => {
      const targetUrl = trimString(url) || trimString(window?.__witnessCoreUrl);
      if (targetUrl) window?.open?.(targetUrl, "_blank", "noopener");
    },
    promoteWitnessCoreGeneration: async (_generationId, url) => {
      const response = await window?.fetch?.("/api/runtime/app-snapshot/promote-current", { method: "POST" }).catch(() => null);
      if (response && !response.ok) throw new Error(await response.text().catch(() => "Witness core promote failed"));
    },
    rollbackWitnessCoreGeneration: async (_generationId, url) => {
      const response = await window?.fetch?.("/api/runtime/app-snapshot/rollback-stable", { method: "POST" }).catch(() => null);
      if (response && !response.ok) throw new Error(await response.text().catch(() => "Witness core rollback failed"));
    },
    restartWitnessCoreProcess: async url => {
      await postWitnessCoreGenerationAction({ window, shell, url });
    },
    stopWitnessCoreProcess: async url => {
      await postWitnessCoreGenerationAction({ window, shell, url });
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
    const allSuggestions = [...issueSuggestions, ...coreStatusSuggestions, ...extraSuggestions];
    rankedSuggestions = allSuggestions;
    const attention = summarizeCompanionAttention({
      issueSummary,
      suggestions: allSuggestions,
      guidance: guidanceState
    });

    root.hidden = !(attention.visible || pinned);
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

    panelActionButton.hidden = !panelAction.visible;
    panelActionButton.textContent = panelAction.label || "Open";
    panelActionButton.disabled = typeof panelAction.onClick !== "function";

    suggestionsTitle.hidden = allSuggestions.length === 0;
    suggestions.hidden = allSuggestions.length === 0;
    suggestions.innerHTML = renderSuggestionListHtml(allSuggestions);

    issuesTitle.hidden = issueRows.length === 0;
    issues.hidden = issueRows.length === 0;
    issues.innerHTML = renderIssueListHtml(issueRows);

    downloadButton.hidden = typeof shellInspection?.inspect !== "function";
    copyIssuesButton.hidden = issueRows.length === 0;
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
    setCoreStatusSuggestions(rows = []) {
      coreStatusSuggestions = Array.isArray(rows) ? [...rows] : [];
      render();
    },
    setPanelAction(action = null) {
      panelAction = action && typeof action === "object"
        ? {
            visible: action.visible !== false,
            label: trimString(action.label) || "Open",
            onClick: typeof action.onClick === "function" ? action.onClick : null
          }
        : { visible: false, label: "", onClick: null };
      render();
    },
    setPinned(value = false) {
      pinned = value === true;
      if (window && typeof window === "object") window.__sourceryCompanionPinned = pinned;
      render();
    },
    destroy() {
      issueLedgerUnsubscribe();
      if (shell.__witnessCorePollingTimer != null) window?.clearInterval?.(shell.__witnessCorePollingTimer);
      root.parentNode?.removeChild?.(root);
      if (window?.[COMPANION_GLOBAL_KEY] === shell) delete window[COMPANION_GLOBAL_KEY];
    }
  };

  if (window && typeof window === "object") window[COMPANION_GLOBAL_KEY] = shell;
  startWitnessCoreStatusPolling({ window, shell });
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
