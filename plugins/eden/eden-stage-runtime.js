function readEdenVisibleZoomRow(rows, zoom) {
  return (Array.isArray(rows) ? rows : []).find(row => {
    const minZoom = row.visibleRange?.minZoom ?? 0;
    const maxZoom = row.visibleRange?.maxZoom ?? 99;
    return zoom >= minZoom && zoom <= maxZoom;
  }) || null;
}

function readEdenVisiblePrompt(model, state) {
  return readEdenVisibleZoomRow(model?.prompts, state?.camera?.zoom ?? 0);
}

function readEdenVisibleCheckpoint(model, state) {
  return readEdenVisibleZoomRow(model?.checkpoints, state?.camera?.zoom ?? 0);
}

function renderEdenConnections(svg, deps) {
  const {
    core,
    isVisible,
    model,
    ns,
    state
  } = deps;
  svg.innerHTML = "";
  const visible = new Map((model.surfaces || []).filter(isVisible).map(surface => [surface.id, surface]));
  for (const connection of model.connections || []) {
    const from = visible.get(connection.from);
    const to = visible.get(connection.to);
    if (!from || !to) continue;
    const { start, end } = core.layoutConnector(from, to);
    const a = core.worldToScreen(state.camera, start.x, start.y);
    const b = core.worldToScreen(state.camera, end.x, end.y);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(a.x));
    line.setAttribute("y1", String(a.y));
    line.setAttribute("x2", String(b.x));
    line.setAttribute("y2", String(b.y));
    line.setAttribute("stroke-width", connection.visualType === "pipe" ? "4" : connection.visualType === "path" ? "3" : "2");
    line.setAttribute("stroke", connection.visualType === "pipe" ? "var(--eden-pipe)" : connection.visualType === "path" ? "var(--eden-path)" : "var(--eden-wire)");
    line.setAttribute("stroke-dasharray", connection.visualType === "path" ? "10 10" : "none");
    line.setAttribute("stroke-linecap", "round");
    svg.appendChild(line);
    if (connection.label) {
      const text = document.createElementNS(ns, "text");
      text.setAttribute("x", String((a.x + b.x) / 2));
      text.setAttribute("y", String((a.y + b.y) / 2 - 6));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("class", "eden-connector-label");
      text.textContent = connection.label;
      svg.appendChild(text);
    }
  }
}

function renderEdenPrompt(promptEl, deps) {
  const { model, state } = deps;
  const prompt = readEdenVisiblePrompt(model, state);
  promptEl.hidden = !prompt;
  promptEl.textContent = prompt ? prompt.text : "";
}

function initEdenCamera(deps) {
  const { focusTarget, model, render, targetById } = deps;
  const target = (model.cameraTargets || []).find(row => row.id === "home")
    || (model.cameraTargets || []).find(row => row.surfaceId === model.neighborhood?.defaultSurfaceId)
    || (model.cameraTargets || [])[0]
    || null;
  if (target) focusTarget(target.id);
  else render();
}

function bindEdenStageRuntime(deps) {
  const {
    core,
    focusTarget,
    render,
    resetViewButton,
    runExpertShortcut,
    stage,
    state,
    windowObj
  } = deps;

  function pointerPosition(event) {
    const rect = stage.getBoundingClientRect();
    return { px: event.clientX - rect.left, py: event.clientY - rect.top };
  }

  stage.addEventListener("pointerdown", event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (event.target?.closest?.("button, input, select, textarea, a, form")) return;
    state.drag = { px: event.clientX, py: event.clientY, camera: { ...state.camera } };
    stage.classList.add("is-dragging");
  });

  windowObj.addEventListener("pointermove", event => {
    if (!state.drag) return;
    state.camera.x = state.drag.camera.x + (event.clientX - state.drag.px);
    state.camera.y = state.drag.camera.y + (event.clientY - state.drag.py);
    render();
  });

  windowObj.addEventListener("pointerup", () => {
    state.drag = null;
    stage.classList.remove("is-dragging");
  });

  stage.addEventListener("wheel", event => {
    event.preventDefault();
    const { px, py } = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.camera = core.zoomCameraAt(state.camera, px, py, factor);
    render();
  }, { passive: false });

  windowObj.addEventListener("keydown", event => {
    if (event.key !== "F1") return;
    event.preventDefault();
    runExpertShortcut("eden.surface.todo", "whoami");
  });

  if (resetViewButton) {
    resetViewButton.addEventListener("click", () => focusTarget("home"));
  }
  windowObj.addEventListener("resize", render);
}

export function renderEdenStageRuntimePrelude() {
  return `
${readEdenVisibleZoomRow.toString()}
${readEdenVisiblePrompt.toString()}
${readEdenVisibleCheckpoint.toString()}
${renderEdenConnections.toString()}
${renderEdenPrompt.toString()}
${initEdenCamera.toString()}
${bindEdenStageRuntime.toString()}
`;
}
