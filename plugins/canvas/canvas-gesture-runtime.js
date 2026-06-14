function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { px: event.clientX - rect.left, py: event.clientY - rect.top };
}

function hitInstance(wx, wy) {
  if (!state.model) return null;
  const list = state.model.instances;
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return n;
  }
  return null;
}

function handlePositions(n) {
  return [
    ['nw', n.x, n.y], ['n', n.x + n.w / 2, n.y], ['ne', n.x + n.w, n.y],
    ['e', n.x + n.w, n.y + n.h / 2], ['se', n.x + n.w, n.y + n.h],
    ['s', n.x + n.w / 2, n.y + n.h], ['sw', n.x, n.y + n.h], ['w', n.x, n.y + n.h / 2]
  ];
}

function hitHandle(n, wx, wy) {
  const tolerance = 6 / state.camera.zoom;
  for (const h of handlePositions(n)) {
    if (Math.abs(wx - h[1]) <= tolerance && Math.abs(wy - h[2]) <= tolerance) return h[0];
  }
  return null;
}

function selectionBounds() {
  return core.selectionBounds([...state.selected].map(findInstance));
}

function groupCorners(bounds) {
  return [
    ['nw', bounds.x, bounds.y],
    ['ne', bounds.x + bounds.w, bounds.y],
    ['se', bounds.x + bounds.w, bounds.y + bounds.h],
    ['sw', bounds.x, bounds.y + bounds.h]
  ];
}

function hitGroupCorner(bounds, wx, wy) {
  const tolerance = 7 / state.camera.zoom;
  for (const c of groupCorners(bounds)) {
    if (Math.abs(wx - c[1]) <= tolerance && Math.abs(wy - c[2]) <= tolerance) return c[0];
  }
  return null;
}

function cursorForHandle(h) {
  if (h === 'nw' || h === 'se') return 'nwse-resize';
  if (h === 'ne' || h === 'sw') return 'nesw-resize';
  if (h === 'n' || h === 's') return 'ns-resize';
  if (h === 'e' || h === 'w') return 'ew-resize';
  return null;
}

function hitConnector(wx, wy) {
  if (!state.model) return null;
  for (const c of state.model.connectors) {
    const a = findInstance(c.fromInstance), b = findInstance(c.toInstance);
    if (!a || !b) continue;
    const { start, end } = core.layoutConnector(a, b);
    if (core.segmentDistance(wx, wy, start.x, start.y, end.x, end.y) <= 6 / state.camera.zoom) return c;
  }
  return null;
}

function bindCanvasPointerRuntime() {
  canvas.addEventListener('pointerdown', event => {
    if (!state.model) return;
    hideOverlay();
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    canvas.setPointerCapture(event.pointerId);
    if (event.button === 1 || state.spaceDown || state.mode === 'pan') { startPan(px, py); return; }
    if (event.button !== 0) return;
    const node = hitInstance(w.x, w.y);
    if (state.mode === 'connect') {
      if (!node || !isLive()) return;
      const c = center(node);
      state.drag = { kind: 'rubber', from: node };
      state.rubber = { x1: c.x, y1: c.y, x2: w.x, y2: w.y };
      markDirty();
      return;
    }
    const sole = soleSelected();
    if (sole && isLive()) {
      const handle = hitHandle(sole, w.x, w.y);
      if (handle) {
        state.drag = { kind: 'resize', id: sole.id, handle: handle, startRect: { x: sole.x, y: sole.y, w: sole.w, h: sole.h }, moved: false };
        return;
      }
    }
    if (selectionSize() > 1 && isLive()) {
      const bounds = selectionBounds();
      const corner = bounds ? hitGroupCorner(bounds, w.x, w.y) : null;
      if (corner) {
        const origins = {};
        for (const id of state.selected) {
          const member = findInstance(id);
          if (member) origins[id] = { x: member.x, y: member.y, w: member.w, h: member.h };
        }
        state.drag = {
          kind: 'groupResize',
          corner: corner,
          anchor: {
            x: corner.indexOf('w') >= 0 ? bounds.x + bounds.w : bounds.x,
            y: corner.indexOf('n') >= 0 ? bounds.y + bounds.h : bounds.y
          },
          startCorner: {
            x: corner.indexOf('w') >= 0 ? bounds.x : bounds.x + bounds.w,
            y: corner.indexOf('n') >= 0 ? bounds.y : bounds.y + bounds.h
          },
          origins: origins,
          moved: false
        };
        return;
      }
    }
    if (node) {
      if (event.shiftKey) {
        toggleSelected(node.id);
        state.drag = null;
      } else if (isLive() && state.selected.has(node.id) && selectionSize() > 1) {
        const origins = {};
        for (const id of state.selected) {
          const member = findInstance(id);
          if (member) origins[id] = { x: member.x, y: member.y };
        }
        state.drag = { kind: 'group', anchorId: node.id, origins: origins, startWX: w.x, startWY: w.y, moved: false };
      } else if (isLive()) {
        selectOnly(node.id);
        state.drag = { kind: 'node', id: node.id, offsetX: w.x - node.x, offsetY: w.y - node.y, moved: false };
      } else {
        selectOnly(node.id);
        state.drag = null;
      }
    } else {
      const connector = hitConnector(w.x, w.y);
      if (connector) {
        state.selected = new Set();
        state.selectedConnector = connectorKey(connector);
        state.drag = null;
      } else {
        if (!event.shiftKey) clearSelection();
        state.drag = { kind: 'marquee', x1: w.x, y1: w.y, x2: w.x, y2: w.y, additive: event.shiftKey };
      }
    }
    renderInspector();
    markDirty();
  });

  canvas.addEventListener('pointermove', event => {
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if (!state.drag) {
      if (state.mode === 'select' && !state.spaceDown) {
        const sole = soleSelected();
        const handle = sole ? hitHandle(sole, w.x, w.y) : null;
        canvas.style.cursor = (handle && cursorForHandle(handle)) || 'default';
      }
      return;
    }
    const drag = state.drag;
    if (drag.kind === 'node') {
      const node = findInstance(drag.id);
      if (!node) return;
      node.x = snapValue(w.x - drag.offsetX);
      node.y = snapValue(w.y - drag.offsetY);
      drag.moved = true;
    } else if (drag.kind === 'group') {
      const anchorOrigin = drag.origins[drag.anchorId];
      if (!anchorOrigin) return;
      const deltaX = snapValue(anchorOrigin.x + (w.x - drag.startWX)) - anchorOrigin.x;
      const deltaY = snapValue(anchorOrigin.y + (w.y - drag.startWY)) - anchorOrigin.y;
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (member) { member.x = drag.origins[id].x + deltaX; member.y = drag.origins[id].y + deltaY; }
      }
      drag.moved = true;
    } else if (drag.kind === 'resize') {
      const node = findInstance(drag.id);
      if (!node) return;
      const start = drag.startRect;
      let left = start.x, top = start.y, right = start.x + start.w, bottom = start.y + start.h;
      if (drag.handle.includes('e')) right = Math.max(snapValue(w.x), left + MIN_W);
      if (drag.handle.includes('w')) left = Math.min(snapValue(w.x), right - MIN_W);
      if (drag.handle.includes('s')) bottom = Math.max(snapValue(w.y), top + MIN_H);
      if (drag.handle.includes('n')) top = Math.min(snapValue(w.y), bottom - MIN_H);
      node.x = left; node.y = top; node.w = right - left; node.h = bottom - top;
      drag.moved = true;
    } else if (drag.kind === 'groupResize') {
      const cornerX = snapValue(w.x), cornerY = snapValue(w.y);
      const denomX = drag.startCorner.x - drag.anchor.x;
      const denomY = drag.startCorner.y - drag.anchor.y;
      const sx = denomX ? Math.max(0.05, (cornerX - drag.anchor.x) / denomX) : 1;
      const sy = denomY ? Math.max(0.05, (cornerY - drag.anchor.y) / denomY) : 1;
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (!member) continue;
        const o = drag.origins[id];
        member.x = Math.round(drag.anchor.x + (o.x - drag.anchor.x) * sx);
        member.y = Math.round(drag.anchor.y + (o.y - drag.anchor.y) * sy);
        member.w = Math.max(MIN_W, Math.round(o.w * sx));
        member.h = Math.max(MIN_H, Math.round(o.h * sy));
      }
      drag.moved = true;
    } else if (drag.kind === 'marquee') {
      drag.x2 = w.x;
      drag.y2 = w.y;
    } else if (drag.kind === 'pan') {
      state.camera.x = drag.camX + (px - drag.startPx);
      state.camera.y = drag.camY + (py - drag.startPy);
      drag.moved = true;
    } else if (drag.kind === 'rubber') {
      state.rubber.x2 = w.x;
      state.rubber.y2 = w.y;
    }
    markDirty();
  });

  canvas.addEventListener('pointerup', async event => {
    const drag = state.drag;
    state.drag = null;
    if (drag && drag.kind === 'pan') canvas.style.cursor = state.mode === 'pan' || state.spaceDown ? 'grab' : 'default';
    if (!drag || !state.model) { state.rubber = null; markDirty(); return; }
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if ((drag.kind === 'node' || drag.kind === 'resize') && drag.moved) {
      const node = findInstance(drag.id);
      if (node) {
        queueMove(node.id, { x: node.x, y: node.y, w: node.w, h: node.h });
        renderInspector();
      }
    } else if ((drag.kind === 'group' || drag.kind === 'groupResize') && drag.moved) {
      for (const id of Object.keys(drag.origins)) {
        const member = findInstance(id);
        if (member) queueMove(member.id, { x: member.x, y: member.y, w: member.w, h: member.h });
      }
      renderInspector();
    } else if (drag.kind === 'marquee') {
      const left = Math.min(drag.x1, drag.x2), right = Math.max(drag.x1, drag.x2);
      const top = Math.min(drag.y1, drag.y2), bottom = Math.max(drag.y1, drag.y2);
      const hits = state.model.instances
        .filter(n => n.x < right && n.x + n.w > left && n.y < bottom && n.y + n.h > top)
        .map(n => n.id);
      if (drag.additive) hits.forEach(id => state.selected.add(id));
      else state.selected = new Set(hits);
      state.selectedConnector = null;
      renderInspector();
      markDirty();
    } else if (drag.kind === 'pan' && drag.moved) {
      queueCamera();
    } else if (drag.kind === 'rubber') {
      state.rubber = null;
      const target = hitInstance(w.x, w.y);
      if (target && target.id !== drag.from.id) {
        showOverlay(px, py, 'relation name', 'references', async rel => {
          await post('canvas.relate', { from: drag.from.thing, rel: rel, to: target.thing, perspective: state.perspective });
          await refresh();
        });
      }
      markDirty();
    }
  });
}

function bindCanvasViewportRuntime() {
  canvas.addEventListener('wheel', event => {
    if (!state.model) return;
    event.preventDefault();
    const { px, py } = pointerPosition(event);
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    state.camera = core.zoomCameraAt(state.camera, px, py, factor);
    queueCamera();
    markDirty();
  }, { passive: false });

  canvas.addEventListener('dblclick', event => {
    if (!state.model) return;
    if (!isLive()) { setStatus('read-only: history view'); return; }
    const { px, py } = pointerPosition(event);
    const w = screenToWorld(px, py);
    if (hitInstance(w.x, w.y)) return;
    showOverlay(px, py, 'new thing name', '', async name => {
      await post('canvas.createThing', { perspective: state.perspective, name: name, x: snapValue(w.x), y: snapValue(w.y) });
      await refresh();
    });
  });
}

function bindCanvasDropRuntime() {
  stage.addEventListener('dragenter', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    dropDepth += 1;
    updateDropState(true);
    event.preventDefault();
  });

  stage.addEventListener('dragover', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = canAcceptFileDrop() ? 'copy' : 'none';
    updateDropState(true);
  });

  stage.addEventListener('dragleave', event => {
    if (!event.dataTransfer || !event.dataTransfer.types.includes('Files')) return;
    dropDepth = Math.max(0, dropDepth - 1);
    if (!dropDepth) updateDropState(false);
  });

  stage.addEventListener('drop', async event => {
    if (!event.dataTransfer) return;
    const files = [...event.dataTransfer.files || []];
    dropDepth = 0;
    updateDropState(false);
    if (!files.length) return;
    event.preventDefault();
    if (!isLive()) { setStatus('read-only: history view'); return; }
    if (!isAuthenticated()) { setStatus('sign in first'); return; }
    if (!state.perspective) { setStatus('choose a perspective first'); return; }
    const { px, py } = pointerPosition(event);
    const start = screenToWorld(px, py);
    let placedAny = false;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setStatus('uploading ' + file.name + '...');
      const uploaded = await uploadAssetFile(file);
      if (!uploaded.ok) {
        setStatus('upload failed for ' + file.name + ': ' + uploaded.error);
        continue;
      }
      const offset = index * 24;
      const placed = await post('canvas.place', {
        perspective: state.perspective,
        thing: uploaded.asset.id,
        x: snapValue(start.x + offset),
        y: snapValue(start.y + offset)
      });
      if (!placed) {
        setStatus('placement failed for ' + file.name + ' after upload');
        continue;
      }
      const placedInstance = placed?.witness?.body?.instance;
      if (placedInstance) selectOnly(placedInstance);
      placedAny = true;
      setStatus('uploaded ' + file.name);
    }
    if (placedAny) await refresh();
  });
}

export function renderCanvasGestureRuntimePrelude() {
  return `
${pointerPosition.toString()}
${hitInstance.toString()}
${handlePositions.toString()}
${hitHandle.toString()}
${selectionBounds.toString()}
${groupCorners.toString()}
${hitGroupCorner.toString()}
${cursorForHandle.toString()}
${hitConnector.toString()}
${bindCanvasPointerRuntime.toString()}
${bindCanvasViewportRuntime.toString()}
${bindCanvasDropRuntime.toString()}
`;
}
