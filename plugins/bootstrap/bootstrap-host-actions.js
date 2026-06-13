export function renderBootstrapHostActionFactory() {
  return String.raw`
    const runBootstrapHostAction = ${runBootstrapHostAction.toString()};
    const bindBootstrapHostActions = ${bindBootstrapHostActions.toString()};
  `;
}

export function bindBootstrapHostActions({
  target,
  source = "bootstrap-top-cards",
  tutorialStep = () => null,
  openAppHome = async () => ({ opened: false, reason: "missing-opener" }),
  desktopApi = () => null,
  setBootstrapStatus = () => {},
  setDesktopStatus = () => {}
} = {}) {
  target.addEventListener("witness:bootstrap-host-action", async event => {
    if (event?.detail?.source !== source) return;
    const action = String(event.detail.action || "");
    try {
      await runBootstrapHostAction({
        action,
        tutorialStep,
        openAppHome,
        desktopApi,
        setBootstrapStatus,
        setDesktopStatus
      });
    } catch (error) {
      (action.startsWith("desktop-") ? setDesktopStatus : setBootstrapStatus)(error.message);
    }
  });
  return target;
}

export async function runBootstrapHostAction({
  action = "",
  tutorialStep = () => null,
  openAppHome = async () => ({ opened: false, reason: "missing-opener" }),
  desktopApi = () => null,
  setBootstrapStatus = () => {},
  setDesktopStatus = () => {}
} = {}) {
  if (action === "open-app") {
    const current = tutorialStep();
    return openAppHome({ advance: current?.id === "open-app" });
  }
  if (action === "desktop-open-world") {
    const api = desktopApi();
    if (!api) return { handled: false, reason: "desktop-unavailable" };
    const result = await api.openWorldHome();
    if (result?.canceled) {
      setDesktopStatus("Open world canceled.");
      return { handled: true, action, result, status: "Open world canceled." };
    }
    setDesktopStatus("Switching to the selected world home.");
    return { handled: true, action, result, status: "Switching to the selected world home." };
  }
  if (action === "desktop-create-world") {
    const api = desktopApi();
    if (!api) return { handled: false, reason: "desktop-unavailable" };
    const result = await api.createWorldHome();
    if (result?.canceled) {
      setDesktopStatus("Create world canceled.");
      return { handled: true, action, result, status: "Create world canceled." };
    }
    setDesktopStatus("Switching to the new world home.");
    return { handled: true, action, result, status: "Switching to the new world home." };
  }
  if (action === "desktop-reveal-world") {
    const api = desktopApi();
    if (!api) return { handled: false, reason: "desktop-unavailable" };
    const result = await api.revealWorldHome();
    const status = result?.ok === false
      ? (result.reason || "Unable to reveal world home.")
      : "Revealed current world home.";
    setDesktopStatus(status);
    return { handled: true, action, result, status };
  }
  setBootstrapStatus(`Unknown bootstrap host action: ${action || "(blank)"}`);
  return { handled: false, reason: "unknown-action", action };
}
