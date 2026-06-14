async function refreshEdenPersonalBox(surface, deps) {
  const {
    personalBoxRuntime,
    render,
    requestJson,
    setPersonalStatus,
    state
  } = deps;
  const response = await requestJson("/api/eden/personal-box");
  if (!response.ok) {
    setPersonalStatus(response.body?.error || "personal box refresh failed", "error");
    render();
    return;
  }
  const runtime = personalBoxRuntime(surface);
  runtime.actor = response.body?.actor || null;
  runtime.items = Array.isArray(response.body?.items) ? response.body.items : [];
  surface.runtime = runtime;
  state.session = {
    authenticated: Boolean(response.body?.authenticated),
    actor: response.body?.actor || null,
    identity: response.body?.identity || null,
    label: response.body?.label || null
  };
  if (!runtime.items.some(item => item.id === state.personalEditingId)) state.personalEditingId = null;
  render();
}

async function refreshEdenPageTheme(surface, deps) {
  const {
    pageThemeRuntime,
    render,
    requestJson,
    setEditStatus
  } = deps;
  const response = await requestJson("/api/eden/page-theme");
  if (!response.ok) {
    setEditStatus(response.body?.error || "page theme refresh failed", "error");
    render();
    return;
  }
  const runtime = pageThemeRuntime(surface);
  runtime.actor = response.body?.actor || null;
  runtime.pageId = response.body?.pageId || runtime.pageId;
  runtime.pageTheme = response.body?.pageTheme || runtime.pageTheme;
  surface.runtime = runtime;
  render();
}

async function refreshEdenVersions(surface, deps) {
  const {
    render,
    requestJson,
    setVersionStatus,
    versionsRuntime
  } = deps;
  const response = await requestJson("/api/eden/versions");
  if (!response.ok) {
    setVersionStatus(response.body?.error || "versions refresh failed", "error");
    render();
    return;
  }
  surface.runtime = response.body?.versionState || versionsRuntime(surface);
  render();
}

async function refreshEdenCapabilityInstall(surface, deps) {
  const {
    capabilityInstallRuntime,
    render,
    requestJson,
    setCapabilityStatus,
    state
  } = deps;
  const response = await requestJson("/api/eden/capability-installs");
  if (!response.ok) {
    setCapabilityStatus(response.body?.error || "capability shelf refresh failed", "error");
    render();
    return;
  }
  const runtime = capabilityInstallRuntime(surface);
  surface.runtime = response.body?.capabilityState || runtime;
  state.session = {
    authenticated: Boolean(response.body?.authenticated),
    actor: response.body?.actor || null,
    identity: response.body?.identity || null,
    label: response.body?.label || null
  };
  render();
}

async function refreshEdenOrganization(surface, deps) {
  const {
    organizationRuntime,
    render,
    requestJson,
    setOrganizationStatus,
    state
  } = deps;
  const response = await requestJson("/api/eden/organization");
  if (!response.ok) {
    setOrganizationStatus(response.body?.error || "commons refresh failed", "error");
    render();
    return;
  }
  surface.runtime = response.body?.organizationState || organizationRuntime(surface);
  state.session = {
    authenticated: Boolean(response.body?.authenticated),
    actor: response.body?.actor || null,
    identity: response.body?.identity || null,
    label: response.body?.label || null
  };
  render();
}

async function refreshEdenTheoryState(surface, deps) {
  const {
    render,
    requestJson,
    setTheoryStatus,
    state,
    theoryAnnexRuntime
  } = deps;
  const response = await requestJson("/api/eden/theory");
  if (!response.ok) {
    setTheoryStatus(response.body?.error || "theory annex refresh failed", "error");
    render();
    return;
  }
  surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
  state.session = {
    authenticated: Boolean(response.body?.authenticated),
    actor: response.body?.actor || null,
    identity: response.body?.identity || null,
    label: response.body?.label || null
  };
  render();
}

async function refreshEdenProcessPreview(surface, deps) {
  const {
    processRuntime,
    refreshAcademyState,
    render,
    requestJson,
    setProcessStatus,
    state,
    windowObj
  } = deps;
  const runtime = processRuntime(surface);
  const url = new URL("/api/process-view", windowObj.location.origin);
  if (runtime.processProgram) url.searchParams.set("program", runtime.processProgram);
  if (runtime.processEvent) url.searchParams.set("event", runtime.processEvent);
  const response = await requestJson(url.pathname + url.search);
  if (!response.ok) {
    setProcessStatus(response.body?.error || "process preview refresh failed", "error");
    render();
    return;
  }
  runtime.preview = response.body || null;
  runtime.actor = state.session.actor || null;
  surface.runtime = runtime;
  await refreshAcademyState();
  render();
}

async function refreshEdenAcademyState(deps) {
  const {
    academyState,
    model,
    render,
    requestJson,
    setStatus,
    state
  } = deps;
  const response = await requestJson("/api/eden/academy");
  if (!response.ok) {
    setStatus(response.body?.error || "academy refresh failed");
    render();
    return;
  }
  model.academy = response.body?.academy || academyState();
  const actionMap = new Map((response.body?.surfaces || []).map(surface => [surface.id, Array.isArray(surface.actions) ? surface.actions : []]));
  for (const surface of model.surfaces || []) {
    if (actionMap.has(surface.id)) surface.actions = actionMap.get(surface.id);
  }
  const checkpointMap = new Map((response.body?.checkpoints || []).map(checkpoint => [checkpoint.id, Array.isArray(checkpoint.quests) ? checkpoint.quests : []]));
  for (const checkpoint of model.checkpoints || []) {
    if (checkpointMap.has(checkpoint.id)) checkpoint.quests = checkpointMap.get(checkpoint.id);
  }
  state.session = {
    authenticated: Boolean(response.body?.authenticated),
    actor: response.body?.actor || null,
    identity: response.body?.identity || null,
    label: response.body?.label || null
  };
  render();
}

async function refreshEdenSessionSurfaces(deps) {
  const {
    byId,
    processRuntime,
    refreshAcademyState,
    refreshCapabilityInstall,
    refreshOrganization,
    refreshPageTheme,
    refreshPersonalBox,
    refreshProcessPreview,
    refreshTheoryState,
    refreshVersions,
    theoryAnnexRuntime
  } = deps;
  const tasks = [];
  const treeSurface = byId.get("eden.surface.tree");
  if (treeSurface && theoryAnnexRuntime(treeSurface).lessons.length) tasks.push(refreshTheoryState(treeSurface));
  const personalSurface = byId.get("eden.surface.personal");
  if (personalSurface && personalSurface.panelKind === "personalBox") tasks.push(refreshPersonalBox(personalSurface));
  const editSurface = byId.get("eden.surface.edit");
  if (editSurface && editSurface.panelKind === "editPage") tasks.push(refreshPageTheme(editSurface));
  const versionsSurface = byId.get("eden.surface.versions");
  if (versionsSurface && versionsSurface.panelKind === "versions") tasks.push(refreshVersions(versionsSurface));
  const worldSurface = byId.get("eden.surface.world");
  if (worldSurface && worldSurface.panelKind === "capabilityInstall") tasks.push(refreshCapabilityInstall(worldSurface));
  const commonsSurface = byId.get("eden.surface.commons");
  if (commonsSurface && commonsSurface.panelKind === "organization") tasks.push(refreshOrganization(commonsSurface));
  const processSurface = byId.get("eden.surface.process");
  if (processSurface && processSurface.panelKind === "processView" && processRuntime(processSurface).preview) tasks.push(refreshProcessPreview(processSurface));
  tasks.push(refreshAcademyState());
  await Promise.all(tasks);
}

export function renderEdenRefreshRuntimePrelude() {
  return `
${refreshEdenPersonalBox.toString()}
${refreshEdenPageTheme.toString()}
${refreshEdenVersions.toString()}
${refreshEdenCapabilityInstall.toString()}
${refreshEdenOrganization.toString()}
${refreshEdenTheoryState.toString()}
${refreshEdenProcessPreview.toString()}
${refreshEdenAcademyState.toString()}
${refreshEdenSessionSurfaces.toString()}
`;
}
