async function post(process, params) {
  if (!isLive()) {
    setStatus("read-only: history view");
    return null;
  }
  if (!isAuthenticated()) {
    setStatus("sign in first");
    return null;
  }
  if (process !== "canvas.batch") await flushOutbox(true);
  const response = await fetch("/api/canvas/process", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ process, params })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    setStatus(process + " rejected: " + (body.error || response.status));
    return null;
  }
  setStatus(body.statusMessage || (process + " witnessed"));
  return body;
}

async function uploadAssetFile(file) {
  const form = new FormData();
  form.set("file", file, file.name || "upload.bin");
  form.set("perspective", state.perspective || "");
  if (state.model?.perspective?.context) form.set("dropContext", state.model.perspective.context);
  const response = await fetch("/api/assets?perspective=" + encodeURIComponent(state.perspective), {
    method: "POST",
    body: form
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: body.error || ("upload failed (" + response.status + ")") };
  }
  return { ok: true, asset: body.asset, witness: body.witness };
}

async function loadPerspectives() {
  const body = await fetch("/api/canvas/perspectives", { headers: headers() }).then(r => r.json());
  const select = el("perspective-select");
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "(choose a perspective)";
  select.appendChild(blank);
  for (const p of body.perspectives) {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.title + " (" + (p.owner || "?") + ")";
    select.appendChild(option);
  }
  if (state.perspective && body.perspectives.some(p => p.id === state.perspective)) {
    select.value = state.perspective;
  } else {
    state.perspective = "";
    select.value = "";
  }
}

async function loadCanvas() {
  if (!state.perspective) {
    adoptModel(null, false);
    return;
  }
  const response = await fetch("/api/canvas?perspective=" + encodeURIComponent(state.perspective), { headers: headers() });
  if (!response.ok) {
    setStatus("perspective not found");
    adoptModel(null, false);
    return;
  }
  const body = await response.json();
  adoptModel(body.canvas, true);
}

export function renderCanvasIoRuntimePrelude() {
  return `
${post.toString()}
${uploadAssetFile.toString()}
${loadPerspectives.toString()}
${loadCanvas.toString()}
`;
}
