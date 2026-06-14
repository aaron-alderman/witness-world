function requestEdenJson(url, options = {}) {
  return fetch(url, { credentials: "same-origin", ...options }).then(async response => ({
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => ({}))
  }));
}

function setEdenPanelStatus(state, key, text, tone = "") {
  state[key] = { text: text || "", tone: tone || "" };
}

function renderEdenSurfaceActions(container, surface, deps) {
  const {
    actionVisible,
    focusTarget,
    runExpertShortcut,
    setStatus
  } = deps;
  if (!container) return;
  container.innerHTML = "";
  const actions = (surface.actions || []).filter(actionVisible);
  for (const action of actions) {
    const interactive = action.state === "open" && (action.href || action.cameraTargetId || action.commandQuery);
    const node = document.createElement(interactive && action.href ? "a" : "button");
    if (node.tagName === "A") node.href = action.href;
    else node.type = "button";
    node.className = "eden-chip " + (action.state === "open" ? "is-open" : "is-locked");
    if (!interactive) node.disabled = node.tagName === "BUTTON";
    const label = document.createElement("span");
    label.textContent = action.label;
    node.appendChild(label);
    if (action.requires && action.state !== "open") {
      const note = document.createElement("span");
      note.className = "eden-chip-note";
      note.textContent = action.requires;
      node.appendChild(note);
    }
    node.addEventListener("click", event => {
      if (action.state !== "open") {
        event.preventDefault();
        setStatus(action.requires || (action.label + " is not unlocked yet"));
        return;
      }
      if (action.cameraTargetId) {
        event.preventDefault();
        focusTarget(action.cameraTargetId);
        return;
      }
      if (action.commandQuery) {
        event.preventDefault();
        runExpertShortcut(action.commandSurfaceId || surface.id, action.commandQuery);
      }
    });
    container.appendChild(node);
  }
}

function buildEdenVersionProposalId(state, processName, runtime, suffix = "") {
  const actorPart = String(state.session?.actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const processPart = String(processName || "edenVersions.action").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const soulPart = String(runtime?.soul || "version-surface").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const extra = String(suffix || "").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return ["proposal", "eden", actorPart, processPart, soulPart, extra || String(Date.now())].filter(Boolean).join(".");
}

async function createEdenVersionProposalRequest(surface, proposal, deps) {
  const {
    render,
    requestJson,
    setVersionStatus,
    state,
    versionsRuntime
  } = deps;
  const { processName, version = null, reason, statusText } = proposal;
  const runtime = versionsRuntime(surface);
  const body = {
    surfaceId: runtime.surfaceId || surface.id,
    soul: runtime.soul || surface.versionSoul || ""
  };
  if (version) body.version = version;
  if (runtime.publishedVersion) body.publishedVersion = runtime.publishedVersion;
  if (runtime.draftVersion) body.draftVersion = runtime.draftVersion;
  const response = await requestJson("/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: buildEdenVersionProposalId(state, processName, runtime, version || processName),
      targetProcess: processName,
      targetKind: "widgetVersion",
      targetId: runtime.soul || surface.versionSoul || "",
      bodyJson: JSON.stringify(body),
      reason
    })
  });
  if (!response.ok) {
    setVersionStatus(response.body?.error || "version proposal creation failed", "error");
    render();
    return false;
  }
  setVersionStatus(statusText + " as " + (response.body?.proposal?.id || "proposal") + ".", "ok");
  return true;
}

function buildEdenCapabilityInstallProposalId(state, runtime, capability) {
  const actorPart = String(state.session?.actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const targetPart = String(runtime?.target || "capability-target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const capabilityPart = String(capability || "capability").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return ["proposal", "eden", actorPart, "capability.install", targetPart, capabilityPart].filter(Boolean).join(".");
}

async function createEdenCapabilityInstallProposalRequest(surface, row, deps) {
  const {
    capabilityInstallRuntime,
    render,
    requestJson,
    setCapabilityStatus,
    state
  } = deps;
  const runtime = capabilityInstallRuntime(surface);
  const targetLabel = runtime.targetLabel || runtime.target || "this target";
  const capabilityLabel = row.label || row.id;
  const response = await requestJson("/api/proposals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: buildEdenCapabilityInstallProposalId(state, runtime, row.id),
      targetProcess: "capability.install",
      targetKind: runtime.targetKind || "context",
      targetId: runtime.target || "",
      bodyJson: JSON.stringify({
        capability: row.id,
        target: runtime.target || "",
        targetKind: runtime.targetKind || "context"
      }),
      reason: "Install " + capabilityLabel + " on " + targetLabel + " through proposal review"
    })
  });
  if (!response.ok) {
    setCapabilityStatus(response.body?.error || ("proposal creation failed for " + capabilityLabel), "error");
    render();
    return false;
  }
  setCapabilityStatus("Proposed installing " + capabilityLabel + " on " + targetLabel + " as " + (response.body?.proposal?.id || "proposal") + ".", "ok");
  return true;
}

export function renderEdenActionRuntimePrelude() {
  return `
${requestEdenJson.toString()}
${setEdenPanelStatus.toString()}
${renderEdenSurfaceActions.toString()}
${buildEdenVersionProposalId.toString()}
${createEdenVersionProposalRequest.toString()}
${buildEdenCapabilityInstallProposalId.toString()}
${createEdenCapabilityInstallProposalRequest.toString()}
`;
}
