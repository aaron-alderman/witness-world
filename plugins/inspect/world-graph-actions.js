export function renderWorldGraphActionsFactory() {
  return String.raw`
    const bindWorldGraphActions = ${bindWorldGraphActions.toString()};
  `;
}

export function bindWorldGraphActions({
  root = null,
  state = {},
  draw = () => {},
  currentMode = () => "graph",
  openSourceForSelected = async () => {},
  openSourceFile = async () => {},
  requestWidgetVersionChange = async () => {},
  requestWidgetVersionRollback = async () => {},
  processViewHref = () => "",
  getSelectedId = () => "",
  setSelectedId = () => {},
  windowTarget = globalThis?.window || null
} = {}) {
  const selectGraphId = async id => {
    setSelectedId(id);
    state.worldGraphSelectedId = id;
    state.worldGraphSelectedKind = "";
    state.worldGraphPrimitiveMode = false;
    if (currentMode() === "source") await openSourceForSelected();
    else state.worldGraphSource = null;
    draw();
  };

  root?.querySelectorAll?.("[data-world-mode]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      state.worldGraphMode = el.getAttribute?.("data-world-mode") || "graph";
      if (state.worldGraphMode !== "source") state.worldGraphSource = null;
      if (state.worldGraphMode === "source" && !state.worldGraphSource) await openSourceForSelected();
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-node-id], [data-world-select]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      const selectedId = el.getAttribute?.("data-world-node-id") || el.getAttribute?.("data-world-select");
      if (!selectedId) return;
      await selectGraphId(selectedId);
    });
  });
  root?.querySelectorAll?.("[data-world-kind]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldGraphSelectedKind = el.getAttribute?.("data-world-kind") || "";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-clear-kind]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldGraphSelectedKind = "";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-source-file]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      const file = el.getAttribute?.("data-world-source-file") || "";
      await openSourceFile(file, el.getAttribute?.("data-world-source-focus") || state.worldGraphSourceFocus || getSelectedId());
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-widget-activate]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await requestWidgetVersionChange({
        soul: el.getAttribute?.("data-world-widget-activate") || "",
        version: el.getAttribute?.("data-world-widget-version") || ""
      });
    });
  });
  root?.querySelectorAll?.("[data-world-widget-rollback]")?.forEach?.(el => {
    el.addEventListener?.("click", async event => {
      event.preventDefault?.();
      await requestWidgetVersionRollback({
        soul: el.getAttribute?.("data-world-widget-rollback") || ""
      });
    });
  });
  root?.querySelectorAll?.("[data-world-open-process-program]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      const program = el.getAttribute?.("data-world-open-process-program") || "";
      const processEvent = el.getAttribute?.("data-world-open-process-event") || "";
      if (!program || !processEvent) return;
      windowTarget?.location?.assign?.(processViewHref({ program, event: processEvent }));
    });
  });
  root?.querySelectorAll?.("[data-world-jump-to-graph]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      const id = el.getAttribute?.("data-world-jump-to-graph");
      if (!id) return;
      setSelectedId(id);
      state.worldGraphSelectedId = id;
      state.worldGraphSelectedKind = "";
      state.worldGraphSource = null;
      state.worldGraphMode = "graph";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-close-source]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldGraphSource = null;
      state.worldGraphMode = "graph";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-primitive], [data-world-primitive-kind-only]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldGraphMode = "primitive";
      state.worldGraphPrimitiveMode = true;
      state.worldGraphSource = null;
      state.worldGraphSelectedPrimitiveKind = el.getAttribute?.("data-world-primitive-kind") || el.getAttribute?.("data-world-primitive-kind-only") || state.worldGraphSelectedPrimitiveKind || "";
      state.worldGraphSelectedPrimitiveValue = el.getAttribute?.("data-world-primitive") || "";
      draw();
    });
  });
  root?.querySelectorAll?.("[data-world-close-primitive]")?.forEach?.(el => {
    el.addEventListener?.("click", event => {
      event.preventDefault?.();
      state.worldGraphPrimitiveMode = false;
      state.worldGraphMode = "graph";
      draw();
    });
  });
}
