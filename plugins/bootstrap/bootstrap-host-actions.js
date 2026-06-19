import {
  bootstrapHostActionContractsByAction
} from "./bootstrap-host-action-contracts.js";

export function renderBootstrapHostActionFactory() {
  return String.raw`
    const bootstrapHostActionContractsByAction = ${JSON.stringify(bootstrapHostActionContractsByAction)};
    const contractForAction = ${contractForAction.toString()};
    const statusSetterForTarget = ${statusSetterForTarget.toString()};
    const runBootstrapHostAction = ${runBootstrapHostAction.toString()};
    const bindBootstrapHostActions = ${bindBootstrapHostActions.toString()};
  `;
}

function contractForAction(action = "", contractsByAction = bootstrapHostActionContractsByAction) {
  const key = typeof action === "string" ? action.trim() : "";
  return key ? (contractsByAction[key] || null) : null;
}

function statusSetterForTarget(statusTarget = "bootstrap", {
  setBootstrapStatus = () => {},
  setDesktopStatus = () => {}
} = {}) {
  return statusTarget === "desktop" ? setDesktopStatus : setBootstrapStatus;
}

export function bindBootstrapHostActions({
  target,
  source = "bootstrap-top-cards",
  guidanceStep = () => null,
  tutorialStep = () => null,
  openAppHome = async () => ({ opened: false, reason: "missing-opener" }),
  desktopApi = () => null,
  setBootstrapStatus = () => {},
  setDesktopStatus = () => {}
} = {}) {
  const resolvedTarget = target || globalThis?.window || globalThis || null;
  const resolvedDocument = resolvedTarget?.document || globalThis?.document || null;
  const run = async event => {
    if (event?.detail?.source !== source) return;
    const action = String(event.detail.action || "");
    try {
      await runBootstrapHostAction({
        action,
        guidanceStep,
        tutorialStep,
        openAppHome,
        desktopApi,
        setBootstrapStatus,
        setDesktopStatus
      });
    } catch (error) {
      (action.startsWith("desktop-") ? setDesktopStatus : setBootstrapStatus)(error.message);
    }
  };
  resolvedTarget?.addEventListener?.("witness:bootstrap-host-action", run);
  for (const [selector, action] of [
    ["[data-action=\"openBootstrapAppHome\"]", "open-app"],
    ["[data-action=\"openBootstrapDesktopWorld\"]", "desktop-open-world"],
    ["[data-action=\"createBootstrapDesktopWorld\"]", "desktop-create-world"],
    ["[data-action=\"revealBootstrapDesktopWorld\"]", "desktop-reveal-world"]
  ]) {
    const node = resolvedDocument?.querySelector?.(selector);
    if (!node || node.__bootstrapHostActionBound) continue;
    node.__bootstrapHostActionBound = true;
    node.addEventListener("click", event => {
      event.preventDefault();
      void run({ detail: { source, action } });
    });
  }
  return resolvedTarget;
}

export async function runBootstrapHostAction({
  action = "",
  guidanceStep = () => null,
  tutorialStep = () => null,
  openAppHome = async () => ({ opened: false, reason: "missing-opener" }),
  desktopApi = () => null,
  setBootstrapStatus = () => {},
  setDesktopStatus = () => {},
  contractsByAction = bootstrapHostActionContractsByAction
} = {}) {
  const contract = contractForAction(action, contractsByAction);
  if (!contract) {
    setBootstrapStatus(`Unknown bootstrap host action: ${action || "(blank)"}`);
    return { handled: false, reason: "unknown-action", action };
  }
  if (contract.kind === "openAppHome") {
    const current = guidanceStep() ?? tutorialStep();
    return openAppHome({ advance: current?.id === contract.advanceFromCurrentStepId });
  }
  if (contract.kind === "desktopApi") {
    const api = desktopApi();
    if (!api) return { handled: false, reason: "desktop-unavailable" };
    const method = typeof contract.desktopMethod === "string" ? contract.desktopMethod.trim() : "";
    const fn = method ? api?.[method] : null;
    if (typeof fn !== "function") return { handled: false, reason: "desktop-method-unavailable", action, method };
    const result = await fn.call(api);
    const setStatus = statusSetterForTarget(contract.statusTarget, { setBootstrapStatus, setDesktopStatus });
    if (result?.canceled) {
      const status = contract.canceledStatus || "Action canceled.";
      setStatus(status);
      return { handled: true, action, result, status };
    }
    const failureReasonField = typeof contract.failureReasonField === "string" ? contract.failureReasonField.trim() : "";
    const failureReason = failureReasonField ? result?.[failureReasonField] : "";
    const status = result?.ok === false
      ? (failureReason || contract.failureFallbackStatus || "Action failed.")
      : (contract.successStatus || "");
    if (status) setStatus(status);
    return { handled: true, action, result, status };
  }
  setBootstrapStatus(`Unknown bootstrap host action: ${action || "(blank)"}`);
  return { handled: false, reason: "unknown-action", action };
}
