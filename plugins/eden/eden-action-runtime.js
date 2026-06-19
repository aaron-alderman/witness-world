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
    versionsRuntime
  } = deps;
  const { processName, version = null, statusText } = proposal;
  const runtime = versionsRuntime(surface);
  const routeByProcess = {
    "edenVersions.activate": "/api/eden/versions/activate",
    "edenVersions.rollback": "/api/eden/versions/rollback",
    "edenVersions.publish": "/api/eden/versions/publish"
  };
  const body = {};
  setVersionStatus(statusText + " as proposal.", "ok");
  render();
  if (version) body.version = version;
  const response = await requestJson(routeByProcess[processName] || "/api/eden/versions/publish", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    setVersionStatus(response.body?.error || "version proposal creation failed", "error");
    render();
    return false;
  }
  if (response.body?.versionState && typeof response.body.versionState === "object") {
    surface.runtime = response.body.versionState;
  }
  setVersionStatus(statusText + " as proposal.", "ok");
  return true;
}

function buildEdenCapabilityInstallProposalId(state, runtime, capability) {
  const actorPart = String(state.session?.actor || "guest").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const targetPart = String(runtime?.target || "capability-target").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  const capabilityPart = String(capability || "capability").replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return ["proposal", "eden", actorPart, "capability.install", targetPart, capabilityPart].filter(Boolean).join(".");
}

async function createEdenCapabilityInstallProposalRequest(surface, row, deps) {
  const { capabilityInstallRuntime, render, requestJson, setCapabilityStatus } = deps;
  const runtime = capabilityInstallRuntime(surface);
  const targetLabel = runtime.targetLabel || runtime.target || "this target";
  const capabilityLabel = row.label || row.id;
  setCapabilityStatus("Proposed installing " + capabilityLabel + " on " + targetLabel + " as proposal.", "ok");
  render();
  const response = await requestJson("/api/eden/capability-installs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ capability: row.id })
  });
  if (!response.ok) {
    setCapabilityStatus(response.body?.error || ("proposal creation failed for " + capabilityLabel), "error");
    render();
    return false;
  }
  if (response.body?.capabilityState && typeof response.body.capabilityState === "object") {
    surface.runtime = response.body.capabilityState;
  }
  setCapabilityStatus("Proposed installing " + capabilityLabel + " on " + targetLabel + " as proposal.", "ok");
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
