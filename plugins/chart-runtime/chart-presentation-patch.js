function assignNestedPatchValue(target, path, value) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (!parts.length) return false;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const nextPart = parts[index + 1];
    if (Array.isArray(cursor)) {
      const arrayIndex = Number(part);
      if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;
      cursor[arrayIndex] ??= /^\d+$/.test(nextPart) ? [] : {};
      cursor = cursor[arrayIndex];
      continue;
    }
    if (cursor[part] == null || typeof cursor[part] !== "object") {
      cursor[part] = /^\d+$/.test(nextPart) ? [] : {};
    }
    cursor = cursor[part];
  }
  const leaf = parts[parts.length - 1];
  if (Array.isArray(cursor)) {
    const arrayIndex = Number(leaf);
    if (!Number.isInteger(arrayIndex) || arrayIndex < 0) return false;
    cursor[arrayIndex] = value;
    return true;
  }
  cursor[leaf] = value;
  return true;
}

function readNestedValue(source, path) {
  let cursor = source;
  for (const part of String(path ?? "").split(".").filter(Boolean)) {
    if (cursor == null) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function findLayerByName(view, layerName) {
  const name = String(layerName ?? "").trim();
  if (!name || !Array.isArray(view?.layers)) return null;
  return view.layers.find(layer => String(layer?.name ?? "") === name) ?? null;
}

export function readChartPresentationPatchValue(view, path) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (parts[0] === "layerStyles" && parts.length >= 3) {
    const layer = findLayerByName(view, parts[1]);
    return layer ? readNestedValue(layer, parts.slice(2).join(".")) : undefined;
  }
  return readNestedValue(view, path);
}

export function assignChartPresentationPatchValue(view, path, value) {
  const parts = String(path ?? "").split(".").filter(Boolean);
  if (parts[0] === "layerStyles" && parts.length >= 3) {
    const layer = findLayerByName(view, parts[1]);
    return layer ? assignNestedPatchValue(layer, parts.slice(2).join("."), value) : false;
  }
  return assignNestedPatchValue(view, path, value);
}

export function applyChartPresentationPatch(view, path, value) {
  if (!view || typeof view !== "object") return false;
  return assignChartPresentationPatchValue(view, path, value);
}
