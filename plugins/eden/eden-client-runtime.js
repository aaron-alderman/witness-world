export function startEdenClientRuntime({
  model = {},
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null
} = {}) {
  const core = __canvasCore;
  const stage = documentTarget.getElementById("eden-stage");
  const surfacesRoot = documentTarget.getElementById("eden-surfaces");
  const promptEl = documentTarget.getElementById("eden-prompt");
  const statusEl = documentTarget.getElementById("eden-status");
  const chapterEl = documentTarget.getElementById("eden-chapter");
  const chapterTitleEl = documentTarget.getElementById("eden-chapter-title");
  const chapterBodyEl = documentTarget.getElementById("eden-chapter-body");
  const chapterUnlocksEl = documentTarget.getElementById("eden-chapter-unlocks");
  const chapterQuestsEl = documentTarget.getElementById("eden-chapter-quests");
  const chapterTracksEl = documentTarget.getElementById("eden-chapter-tracks");
  const svg = documentTarget.getElementById("eden-connections");
  const ns = "http://www.w3.org/2000/svg";
  const state = {
    camera: core.createCameraState(),
    drag: null,
    elements: new Map(),
    focusSurfaceId: null,
    hoverSurfaceId: null,
    focusReliefKey: null,
    hoverReliefKey: null,
    detailStatus: "",
    session: model.session || { authenticated: false, actor: null, identity: null, label: null },
    personalStatus: { tone: "", text: "" },
    personalEditingId: null,
    editStatus: { tone: "", text: "" },
    versionStatus: { tone: "", text: "" },
    capabilityStatus: { tone: "", text: "" },
    organizationStatus: { tone: "", text: "" },
    theoryStatus: { tone: "", text: "" },
    processStatus: { tone: "", text: "" },
    theoryTeachBackDraft: "",
    embeddedModes: Object.create(null)
  };

  const byId = new Map(model.surfaces.map(surface => [surface.id, surface]));
  const targetById = new Map(model.cameraTargets.map(target => [target.id, target]));

  function academyState() {
    return readEdenAcademyCanvasState(model, state);
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function requestJson(url, options = {}) {
    return requestEdenJson(url, options);
  }

  function setPersonalStatus(text, tone = "") {
    setEdenPanelStatus(state, "personalStatus", text, tone);
  }

  function setEditStatus(text, tone = "") {
    setEdenPanelStatus(state, "editStatus", text, tone);
  }

  function setVersionStatus(text, tone = "") {
    setEdenPanelStatus(state, "versionStatus", text, tone);
  }

  function setCapabilityStatus(text, tone = "") {
    setEdenPanelStatus(state, "capabilityStatus", text, tone);
  }

  function setOrganizationStatus(text, tone = "") {
    setEdenPanelStatus(state, "organizationStatus", text, tone);
  }

  function setTheoryStatus(text, tone = "") {
    setEdenPanelStatus(state, "theoryStatus", text, tone);
  }

  function setProcessStatus(text, tone = "") {
    setEdenPanelStatus(state, "processStatus", text, tone);
  }

  function actionVisible(action) {
    return isEdenActionVisible(action, state);
  }

  function cameraForSurface(surface, overrideZoom = null) {
    return cameraForEdenSurface(surface, { core, stage, state, overrideZoom });
  }

  function focusTarget(targetId) {
    return focusEdenTarget(targetId, {
      byId,
      cameraForSurface,
      modelCameraTargets: model.cameraTargets,
      render,
      state,
      targetById
    });
  }

  function isVisible(surface) {
    return isEdenSurfaceVisible(surface, state);
  }

  function rectToScreen(surface) {
    return projectEdenSurfaceRect(surface, { core, state });
  }

  function reliefLevelFor(surface) {
    return readEdenSurfaceReliefLevel(surface, state);
  }

  function applySurfaceMeta(container, surface) {
    return applyEdenSurfaceMeta(container, surface);
  }

  function renderActions(container, surface) {
    return renderEdenSurfaceActions(container, surface, {
      actionVisible,
      focusTarget,
      runExpertShortcut,
      setStatus
    });
  }

  function personalBoxRuntime(surface) {
    return readEdenPersonalBoxRuntime(surface, state);
  }

  function pageThemeRuntime(surface) {
    return readEdenPageThemeRuntime(surface, state);
  }

  function processRuntime(surface) {
    return readEdenProcessRuntime(surface, state);
  }

  function versionsRuntime(surface) {
    return readEdenVersionsRuntime(surface, state);
  }

  async function createEdenVersionProposal(surface, { processName, version = null, reason, statusText }) {
    return createEdenVersionProposalRequest(surface, { processName, version, reason, statusText }, {
      render,
      requestJson,
      setVersionStatus,
      state,
      versionsRuntime
    });
  }

  async function createEdenCapabilityInstallProposal(surface, row) {
    return createEdenCapabilityInstallProposalRequest(surface, row, {
      capabilityInstallRuntime,
      render,
      requestJson,
      setCapabilityStatus,
      state
    });
  }

  function capabilityInstallRuntime(surface) {
    return readEdenCapabilityInstallRuntime(surface, state);
  }

  function organizationRuntime(surface) {
    return readEdenOrganizationRuntime(surface, state);
  }

  function theoryAnnexRuntime(surface) {
    return readEdenTheoryAnnexRuntime(surface, state);
  }

  function actionById(surface, actionId) {
    return findEdenActionById(surface, actionId);
  }

  function embeddedMode(surfaceId) {
    return ensureEdenEmbeddedMode(surfaceId, state);
  }

  function embeddedDocument(surfaceId) {
    return readEdenEmbeddedDocument(surfaceId, state.elements);
  }

  function embeddedWindow(surfaceId) {
    return readEdenEmbeddedWindow(surfaceId, state.elements);
  }

  function setEmbeddedSurfaceInspector(surfaceId, open) {
    return setEdenEmbeddedSurfaceInspector(surfaceId, open, {
      embeddedDocument
    });
  }

  function setEmbeddedSurfaceCommand(surfaceId, open) {
    return setEdenEmbeddedSurfaceCommand(surfaceId, open, {
      embeddedDocument
    });
  }

  function seedEmbeddedCommandQuery(surfaceId, query) {
    return seedEdenEmbeddedCommandQuery(surfaceId, query, {
      embeddedDocument
    });
  }

  function syncEmbeddedMode(surface) {
    return syncEdenEmbeddedModeState(surface, {
      embeddedMode,
      setEmbeddedSurfaceCommand,
      setEmbeddedSurfaceInspector,
      stateElements: state.elements,
      syncEmbeddedSurfaceNode: syncEdenEmbeddedSurfaceNode
    });
  }

  function toggleEmbeddedInspect(surface, next = null) {
    return toggleEdenEmbeddedInspect(surface, next, {
      embeddedMode,
      render,
      setStatus,
      state,
      syncEmbeddedMode
    });
  }

  function readReliefSignals(section) {
    return readEdenReliefActiveSignals(section, {
      byId,
      versionsRuntime,
      state
    });
  }

  function readReliefLevel(surface, section) {
    return readEdenReliefLevelForSection(surface, section, {
      state,
      reliefKey: buildEdenReliefKey,
      reliefActiveSignals: readReliefSignals
    });
  }

  function runExpertShortcut(surfaceId = "eden.surface.todo", query = "whoami") {
    return openEdenExpertShortcut(surfaceId, query, {
      byId,
      isVisible,
      targetById,
      focusTarget,
      state,
      cameraForSurface,
      toggleEmbeddedInspect,
      embeddedDocument,
      embeddedWindow,
      setStatus,
      setEmbeddedSurfaceCommand,
      seedEmbeddedCommandQuery
    });
  }

  async function refreshPersonalBox(surface) {
    return refreshEdenPersonalBox(surface, {
      personalBoxRuntime,
      render,
      requestJson,
      setPersonalStatus,
      state
    });
  }

  async function refreshPageTheme(surface) {
    return refreshEdenPageTheme(surface, {
      pageThemeRuntime,
      render,
      requestJson,
      setEditStatus
    });
  }

  async function refreshVersions(surface) {
    return refreshEdenVersions(surface, {
      render,
      requestJson,
      setVersionStatus,
      versionsRuntime
    });
  }

  async function refreshCapabilityInstall(surface) {
    return refreshEdenCapabilityInstall(surface, {
      capabilityInstallRuntime,
      render,
      requestJson,
      setCapabilityStatus,
      state
    });
  }

  async function refreshOrganization(surface) {
    return refreshEdenOrganization(surface, {
      organizationRuntime,
      render,
      requestJson,
      setOrganizationStatus,
      state
    });
  }

  async function refreshTheoryState(surface) {
    return refreshEdenTheoryState(surface, {
      render,
      requestJson,
      setTheoryStatus,
      state,
      theoryAnnexRuntime
    });
  }

  async function refreshProcessPreview(surface) {
    return refreshEdenProcessPreview(surface, {
      processRuntime,
      refreshAcademyState,
      render,
      requestJson,
      setProcessStatus,
      state,
      windowObj: windowTarget
    });
  }

  async function refreshAcademyState() {
    return refreshEdenAcademyState({
      academyState,
      model,
      render,
      requestJson,
      setStatus,
      state
    });
  }

  async function refreshSessionSurfaces() {
    return refreshEdenSessionSurfaces({
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
    });
  }

  function reloadEmbeddedTodoPage() {
    const todoNode = state.elements.get("eden.surface.todo");
    const frame = todoNode?.querySelector?.("iframe");
    if (!frame) return;
    const base = frame.dataset.baseSrc || frame.getAttribute("src") || "/";
    frame.dataset.baseSrc = base.split("?")[0];
    const next = new URL(frame.dataset.baseSrc, windowTarget.location.origin);
    next.searchParams.set("edenThemeRev", String(Date.now()));
    frame.src = next.pathname + next.search;
  }

  function renderEmbeddedReliefOverlay(node, surface) {
    return renderEdenEmbeddedRelief(node, surface, {
      state,
      render,
      embeddedMode,
      reliefActiveSignals: readReliefSignals,
      reliefKey: buildEdenReliefKey,
      reliefLevelForSection: readReliefLevel,
      scrollReliefSectionIntoView: (activeSurface, sectionId) => scrollEdenReliefSectionIntoView(activeSurface, sectionId, {
        stateElements: state.elements
      }),
      computeReliefBoxes: (activeSurface, activeNode) => computeEdenReliefBoxes(activeSurface, activeNode, {
        reliefSections: readEdenReliefSections
      })
    });
  }

  function ensureSurface(surface) {
    return ensureEdenPageSurface(surface, {
      academyState,
      actionById,
      applySurfaceMeta,
      capabilityInstallRuntime,
      createEdenVersionProposal,
      createEdenCapabilityInstallProposal,
      embeddedMode,
      focusTarget,
      organizationRuntime,
      pageThemeRuntime,
      personalBoxRuntime,
      processRuntime,
      refreshAcademyState,
      refreshCapabilityInstall,
      refreshOrganization,
      refreshPageTheme,
      refreshPersonalBox,
      refreshProcessPreview,
      refreshSessionSurfaces,
      refreshVersions,
      reloadEmbeddedTodoPage,
      render,
      renderActions,
      renderTrackCard,
      requestJson,
      setCapabilityStatus,
      setEditStatus,
      setEmbeddedSurfaceCommand,
      setOrganizationStatus,
      setPersonalStatus,
      setProcessStatus,
      setStatus,
      setTheoryStatus,
      setVersionStatus,
      state,
      surfacesRoot,
      syncEmbeddedMode,
      theoryAnnexRuntime,
      toggleEmbeddedInspect,
      versionsRuntime
    });
  }

  function renderSurfaceDetails(node, surface) {
    return renderEdenPageSurfaceDetails(node, surface, {
      academyState,
      actionById,
      capabilityInstallRuntime,
      createEdenCapabilityInstallProposal,
      organizationRuntime,
      pageThemeRuntime,
      personalBoxRuntime,
      processRuntime,
      refreshAcademyState,
      refreshPersonalBox,
      refreshSessionSurfaces,
      render,
      renderEmbeddedReliefOverlay,
      renderTrackCard,
      requestJson,
      setCapabilityStatus,
      setPersonalStatus,
      setTheoryStatus,
      state,
      syncEmbeddedMode,
      theoryAnnexRuntime,
      versionsRuntime
    });
  }

  function renderTrackCard(track) {
    return renderEdenTrackCard(track);
  }

  function renderCheckpoint() {
    return renderEdenCheckpointView(model, state, {
      root: chapterEl,
      title: chapterTitleEl,
      body: chapterBodyEl,
      unlocks: chapterUnlocksEl,
      quests: chapterQuestsEl,
      tracks: chapterTracksEl
    });
  }

  function render() {
    renderEdenSurfaceCollection({
      ensureSurface,
      isVisible,
      model,
      rectToScreen,
      reliefLevelFor,
      renderActions,
      renderSurfaceDetails,
      state
    });
    renderEdenConnections(svg, { core, isVisible, model, ns, state });
    renderEdenPrompt(promptEl, { model, state });
    renderCheckpoint();
    const checkpoint = readEdenVisibleCheckpoint(model, state);
    setStatus((state.detailStatus || checkpoint?.title || model.neighborhood.title || "Eden Canvas") + " · " + state.camera.zoom.toFixed(2) + "x");
  }

  setStatus(model.neighborhood.title || "Eden Canvas");
  bindEdenStageRuntime({
    core,
    focusTarget,
    render,
    resetViewButton: documentTarget.getElementById("eden-reset-view"),
    runExpertShortcut,
    stage,
    state,
    windowObj: windowTarget
  });
  initEdenCamera({ focusTarget, model, render, targetById });
  return { model, render, state };
}

export function renderEdenClientRuntimePrelude() {
  return String.raw`
    const startEdenClientRuntime = ${startEdenClientRuntime.toString()};
  `;
}
