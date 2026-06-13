export const DESKTOP_IPC_CHANNELS = Object.freeze({
  openWorldHome: "witness:desktop:open-world-home",
  createWorldHome: "witness:desktop:create-world-home",
  revealWorldHome: "witness:desktop:reveal-world-home",
  getDesktopShellState: "witness:desktop:get-state"
});

export const DESKTOP_ONLY_POWERS = Object.freeze([
  "openWorldHome",
  "createWorldHome",
  "revealWorldHome"
]);

export function createDesktopShellState({
  worldHome = null,
  runtimeProfile = "full",
  shellId = "desktop",
  availablePowers = DESKTOP_ONLY_POWERS,
  recentWorldHomes = [],
  launcherRequired = false,
  runtimeStatus = "idle",
  appRoot = null,
  manifestPath = null,
  selectedTarget = null
} = {}) {
  return {
    shellId,
    worldHome,
    runtimeProfile,
    appRoot,
    manifestPath,
    selectedTarget,
    availablePowers: [...availablePowers],
    recentWorldHomes: [...recentWorldHomes],
    launcherRequired,
    runtimeStatus
  };
}

export function createWitnessDesktopApi({
  invoke
}) {
  return Object.freeze({
    openWorldHome: request => invoke(DESKTOP_IPC_CHANNELS.openWorldHome, request),
    createWorldHome: request => invoke(DESKTOP_IPC_CHANNELS.createWorldHome, request),
    revealWorldHome: () => invoke(DESKTOP_IPC_CHANNELS.revealWorldHome),
    getDesktopShellState: () => invoke(DESKTOP_IPC_CHANNELS.getDesktopShellState)
  });
}
