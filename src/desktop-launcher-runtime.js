export function renderDesktopLauncherRuntimeFactory() {
  return String.raw`
    const setDesktopLauncherStatus = ${setDesktopLauncherStatus.toString()};
    const renderDesktopLauncherState = ${renderDesktopLauncherState.toString()};
    const refreshDesktopLauncherState = ${refreshDesktopLauncherState.toString()};
    const startDesktopLauncherRuntime = ${startDesktopLauncherRuntime.toString()};
  `;
}

export function setDesktopLauncherStatus({
  documentTarget = null,
  text = ""
} = {}) {
  const status = documentTarget?.getElementById?.("launcher-status");
  if (status) status.textContent = text || "";
}

export function renderDesktopLauncherState({
  state = null,
  initialMessage = "",
  documentTarget = null,
  renderDesktopRecentWorlds = () => {},
  setStatus = () => {}
} = {}) {
  const byId = id => documentTarget?.getElementById?.(id) || null;
  const profile = byId("launcher-profile");
  const runtimeStatus = byId("launcher-runtime-status");
  const summary = byId("launcher-summary");
  const status = byId("launcher-status");
  const recentWorlds = byId("recent-worlds");

  if (profile) profile.textContent = state?.runtimeProfile || "full";
  if (runtimeStatus) runtimeStatus.textContent = state?.runtimeStatus || "idle";
  if (summary) {
    summary.textContent = state?.launcherRequired === false
      ? "Desktop runtime is already active."
      : "Open or create a named WORLD_HOME before entering the app.";
  }
  if (!status?.textContent && initialMessage) setStatus(initialMessage);
  renderDesktopRecentWorlds({
    root: recentWorlds,
    rows: state?.recentWorldHomes || [],
    document: documentTarget
  });
}

export async function refreshDesktopLauncherState({
  desktop = null,
  render = () => {}
} = {}) {
  if (!desktop || typeof desktop.getDesktopShellState !== "function") {
    throw new Error("Desktop bridge unavailable. Restart the desktop shell.");
  }
  const state = await desktop.getDesktopShellState();
  render(state);
  return state;
}

export function startDesktopLauncherRuntime({
  windowTarget = globalThis?.window || null,
  documentTarget = globalThis?.document || null,
  initialMessage = "",
  bindDesktopLauncherAction = globalThis?.bindDesktopLauncherAction || (() => null),
  bindDesktopRecentWorlds = globalThis?.bindDesktopRecentWorlds || (() => null),
  renderDesktopRecentWorlds = globalThis?.renderDesktopRecentWorlds || (() => {})
} = {}) {
  const byId = id => documentTarget?.getElementById?.(id) || null;
  const desktop = windowTarget?.witnessDesktop || null;
  let state = null;

  const setStatus = text => {
    setDesktopLauncherStatus({
      documentTarget,
      text
    });
  };

  const render = nextState => {
    state = nextState;
    renderDesktopLauncherState({
      state,
      initialMessage,
      documentTarget,
      renderDesktopRecentWorlds,
      setStatus
    });
  };

  const refresh = async () => {
    state = await refreshDesktopLauncherState({
      desktop,
      render
    });
    return state;
  };

  bindDesktopRecentWorlds({
    root: byId("recent-worlds"),
    desktop,
    setStatus,
    refresh
  });

  bindDesktopLauncherAction({
    button: byId("open-existing-world"),
    desktop,
    action: "openWorldHome",
    setStatus,
    refresh,
    workingLabel: "Opening world...",
    canceledLabel: "Open world canceled."
  });
  bindDesktopLauncherAction({
    button: byId("create-new-world"),
    desktop,
    action: "createWorldHome",
    setStatus,
    refresh,
    workingLabel: "Creating world...",
    canceledLabel: "Create world canceled."
  });

  const started = refresh().catch(error => {
    setStatus(error instanceof Error ? error.message : String(error));
    return null;
  });

  return {
    refresh,
    render,
    setStatus,
    started,
    getState() {
      return state;
    }
  };
}
