export function renderWorldCommandActionsFactory() {
  return String.raw`
    const bindWorldCommandActions = ${bindWorldCommandActions.toString()};
    const syncWorldCommandFocus = ${syncWorldCommandFocus.toString()};
    const bindWorldCommandShortcuts = ${bindWorldCommandShortcuts.toString()};
  `;
}

export function bindWorldCommandActions({
  root = null,
  state = {},
  draw = () => {},
  visibleWorldCommands = () => [],
  executeWorldCommand = async () => {}
} = {}) {
  root?.querySelectorAll?.("[data-world-command-toggle]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldCommandOpen = true;
      state.worldCommandFocusRequested = true;
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-command-close]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldCommandOpen = false;
      state.worldCommandQuery = "";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-command-input]")?.forEach?.(el => {
    el.addEventListener?.("input", () => {
      state.worldCommandQuery = el.value || "";
      state.worldCommandFocusRequested = true;
      draw();
    });
    el.addEventListener?.("keydown", async event => {
      if (event.key !== "Enter") return;
      event.preventDefault?.();
      const items = visibleWorldCommands();
      if (items[0]) await executeWorldCommand(items[0]);
    });
  });
  root?.querySelectorAll?.("[data-world-command-run]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      const index = Number(el.getAttribute?.("data-world-command-run"));
      const items = visibleWorldCommands();
      if (Number.isFinite(index) && items[index]) await executeWorldCommand(items[index]);
    });
  });
}

export function syncWorldCommandFocus({ root = null, state = {} } = {}) {
  if (!state.worldCommandOpen || state.worldCommandFocusRequested === false) return false;
  const input = root?.querySelector?.("[data-world-command-input]");
  if (input) {
    input.focus?.();
    const length = input.value.length;
    input.setSelectionRange?.(length, length);
  }
  state.worldCommandFocusRequested = false;
  return true;
}

export function bindWorldCommandShortcuts({
  state = {},
  draw = () => {},
  windowTarget = globalThis?.window || null,
  documentTarget = globalThis?.document || null
} = {}) {
  windowTarget?.addEventListener?.("keydown", event => {
    const active = documentTarget?.activeElement;
    const typing = active?.matches?.("input, textarea, select") || active?.isContentEditable;
    const key = String(event.key || "").toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "k") {
      event.preventDefault?.();
      state.worldCommandOpen = true;
      state.worldCommandFocusRequested = true;
      draw();
      return;
    }
    if (event.key === "Escape" && state.worldCommandOpen) {
      event.preventDefault?.();
      state.worldCommandOpen = false;
      state.worldCommandQuery = "";
      draw();
      return;
    }
    if (event.key === "/" && !typing && !state.worldCommandOpen) {
      event.preventDefault?.();
      state.worldCommandOpen = true;
      state.worldCommandFocusRequested = true;
      draw();
    }
  });
}
