export function renderSurfaceCommandActionsFactory() {
  return String.raw`
    const bindSurfaceCommandActions = ${bindSurfaceCommandActions.toString()};
  `;
}

export function bindSurfaceCommandActions({
  overlay = null,
  state = {},
  ensureSurfaceInspectorGraph = async () => {},
  updateSurfaceInspectorUi = () => {},
  visibleSurfaceCommands = () => [],
  executeSurfaceCommand = async () => {},
  worldSurfaceHref = () => "",
  windowTarget = globalThis?.window || null
} = {}) {
  overlay?.querySelectorAll?.("[data-surface-command-toggle]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.surfaceCommandOpen = !state.surfaceCommandOpen;
      if (state.surfaceCommandOpen) {
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
      } else {
        state.surfaceCommandQuery = "";
        state.surfaceCommandResult = null;
      }
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-close]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.surfaceCommandOpen = false;
      state.surfaceCommandQuery = "";
      state.surfaceCommandResult = null;
      updateSurfaceInspectorUi();
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-input]")?.forEach?.(node => {
    node.addEventListener?.("input", () => {
      state.surfaceCommandQuery = node.value || "";
      if (String(node.value || "").trim().toLowerCase() !== "whoami") state.surfaceCommandResult = null;
      state.surfaceCommandFocusRequested = true;
      updateSurfaceInspectorUi();
    });
    node.addEventListener?.("keydown", async event => {
      if (event.key !== "Enter") return;
      event.preventDefault?.();
      const items = visibleSurfaceCommands();
      if (items[0]) await executeSurfaceCommand(items[0]);
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-run]")?.forEach?.(node => {
    node.addEventListener?.("click", async event => {
      event.preventDefault?.();
      const index = Number(node.getAttribute?.("data-surface-command-run"));
      const items = visibleSurfaceCommands();
      if (Number.isFinite(index) && items[index]) await executeSurfaceCommand(items[index]);
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-result-world]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const identity = state.surfaceCommandResult?.identity || "";
      if (!identity) return;
      windowTarget?.location?.assign?.(worldSurfaceHref({ select: identity }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-result-source]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const identity = state.surfaceCommandResult?.identity || "";
      if (!identity) return;
      windowTarget?.location?.assign?.(worldSurfaceHref({ select: identity, mode: "source" }));
    });
  });
  overlay?.querySelectorAll?.("[data-surface-command-result-bootstrap]")?.forEach?.(node => {
    node.addEventListener?.("click", event => {
      event.preventDefault?.();
      const href = state.surfaceCommandResult?.bootstrapHref || "";
      if (!href) return;
      windowTarget?.location?.assign?.(href);
    });
  });
}
