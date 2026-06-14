export function renderDesktopLauncherActionsFactory() {
  return String.raw`
    const runDesktopLauncherAction = ${runDesktopLauncherAction.toString()};
    const bindDesktopLauncherAction = ${bindDesktopLauncherAction.toString()};
  `;
}

export async function runDesktopLauncherAction({
  desktop = null,
  action = "",
  setStatus = () => {},
  refresh = async () => {},
  workingLabel = "",
  canceledLabel = "",
  failureLabel = "Desktop action failed."
} = {}) {
  if (!desktop || typeof desktop[action] !== "function") {
    throw new Error("Desktop bridge unavailable. Restart the desktop shell.");
  }
  setStatus(workingLabel);
  const result = await desktop[action]();
  if (result?.canceled) {
    setStatus(canceledLabel);
    return result;
  }
  if (result?.ok === false) {
    setStatus(result.reason || failureLabel);
    await refresh();
    return result;
  }
  return result;
}

export function bindDesktopLauncherAction({
  button = null,
  desktop = null,
  action = "",
  setStatus = () => {},
  refresh = async () => {},
  workingLabel = "",
  canceledLabel = "",
  failureLabel = "Desktop action failed."
} = {}) {
  if (!button?.addEventListener) return null;
  const handler = async () => runDesktopLauncherAction({
    desktop,
    action,
    setStatus,
    refresh,
    workingLabel,
    canceledLabel,
    failureLabel
  });
  button.addEventListener("click", () => {
    void handler();
  });
  return handler;
}
