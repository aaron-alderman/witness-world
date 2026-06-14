function showOverlay(px, py, placeholder, value, onCommit) {
  overlayInput.style.display = 'block';
  overlayInput.style.left = Math.max(4, Math.min(px, stage.clientWidth - 150)) + 'px';
  overlayInput.style.top = Math.max(4, Math.min(py, stage.clientHeight - 30)) + 'px';
  overlayInput.placeholder = placeholder;
  overlayInput.value = value || '';
  overlayCommit = onCommit;
  overlayInput.focus();
  overlayInput.select();
}

function hideOverlay() {
  overlayInput.style.display = 'none';
  overlayCommit = null;
}

function setMode(mode) {
  state.mode = mode;
  el('mode-select-btn').classList.toggle('mode-active', mode === 'select');
  el('mode-connect-btn').classList.toggle('mode-active', mode === 'connect');
  el('mode-pan-btn').classList.toggle('mode-active', mode === 'pan');
  canvas.style.cursor = mode === 'connect' ? 'crosshair' : mode === 'pan' ? 'grab' : 'default';
}

function startPan(px, py) {
  state.drag = { kind: 'pan', startPx: px, startPy: py, camX: state.camera.x, camY: state.camera.y, moved: false };
  canvas.style.cursor = 'grabbing';
}

async function duplicateSelected() {
  const node = soleSelected();
  if (!node) {
    setStatus('select a single node to duplicate');
    return;
  }
  const result = await post('canvas.duplicate', {
    perspective: state.perspective,
    instance: node.id,
    x: snapValue(node.x + 24),
    y: snapValue(node.y + 24)
  });
  if (result) selectOnly(result.witness.body.instance);
  await refresh();
}

function bindCanvasOverlayInput() {
  overlayInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const value = overlayInput.value.trim();
      const commit = overlayCommit;
      hideOverlay();
      if (value && commit) commit(value);
    }
    if (event.key === 'Escape') hideOverlay();
    event.stopPropagation();
  });
}

function bindCanvasKeyboardShortcuts() {
  window.addEventListener('keydown', async event => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.code === 'Space' && !event.repeat) {
      state.spaceDown = true;
      if (!state.drag) canvas.style.cursor = 'grab';
      event.preventDefault();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'D')) {
      event.preventDefault();
      if (state.model && isLive()) await duplicateSelected();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'Z')) {
      event.preventDefault();
      if (state.model && isLive()) {
        const result = await post('canvas.undo', { perspective: state.perspective });
        if (result) await refresh();
      }
      return;
    }
    if ((event.ctrlKey || event.metaKey) && (event.key === 'y' || event.key === 'Y')) {
      event.preventDefault();
      if (state.model && isLive()) {
        const result = await post('canvas.redo', { perspective: state.perspective });
        if (result) await refresh();
      }
      return;
    }
    if (event.key === 'Escape') {
      if (!isLive()) {
        exitHistory();
        return;
      }
      clearSelection();
      setMode('select');
      hideOverlay();
      renderInspector();
      markDirty();
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && state.model && isLive()) {
      if (selectionSize() > 1) {
        await post('canvas.removeMany', { perspective: state.perspective, instances: [...state.selected] });
        clearSelection();
        await refresh();
      } else if (selectionSize() === 1) {
        await post('canvas.remove', { perspective: state.perspective, instance: [...state.selected][0] });
        clearSelection();
        await refresh();
      } else if (state.selectedConnector) {
        const c = findConnector(state.selectedConnector);
        if (c) await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to, perspective: state.perspective });
        clearSelection();
        await refresh();
      }
    }
  });

  window.addEventListener('keyup', event => {
    if (event.code === 'Space') {
      state.spaceDown = false;
      if (!state.drag) canvas.style.cursor = state.mode === 'connect' ? 'crosshair' : state.mode === 'pan' ? 'grab' : 'default';
    }
  });
}

export function renderCanvasInteractionRuntimePrelude() {
  return `
${showOverlay.toString()}
${hideOverlay.toString()}
${setMode.toString()}
${startPan.toString()}
${duplicateSelected.toString()}
${bindCanvasOverlayInput.toString()}
${bindCanvasKeyboardShortcuts.toString()}
`;
}
