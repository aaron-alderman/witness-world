import { projectors } from "./projectors-core.js";
import { projectEdenPersonalBoxItems } from "./eden-personal-box.js";
import { projectEdenPageTheme } from "./eden-page-theme.js";
import { projectEdenVersionState } from "./eden-versions.js";

const DEFAULT_GEOMETRY = { x: 40, y: 40, w: 160, h: 56 };
const CANVAS_VOCABULARY_RELS = new Set(["contains", "proxies", "cloneOf", "hasGeometry", "hasStyle", "hasCamera", "hasGrid", "hasModuleKind", "hasTitle", "hasDone"]);
const HIDDEN_THING_KINDS = new Set(["projectionInstance", "perspective", "widget", "widgetVersion", "widgetVersionTransition", "frontendProgram", "route", "description", "compiledArtifact", "context"]);
const EDEN_CONNECTION_RELS = new Map([
  ["edenWire", "wire"],
  ["edenPipe", "pipe"],
  ["edenPath", "path"]
]);

const byId = key => (a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0);
const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const stringOrNull = value => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const stringList = value => {
  if (Array.isArray(value)) {
    return value
      .map(item => stringOrNull(item))
      .filter(Boolean);
  }
  const single = stringOrNull(value);
  return single ? [single] : [];
};

function indexCurrentRelations(witnesses) {
  const current = projectors.currentRelations(witnesses);
  const kinds = new Map();
  const titles = new Map();
  for (const r of current) {
    if (r.rel === "hasModuleKind") kinds.set(r.from, r.to);
    if (r.rel === "hasTitle") titles.set(r.from, r.to);
  }
  return { current, kinds, titles };
}

function objectContextsMap(current) {
  return new Map(current.filter(row => row.rel === "inContext").map(row => [row.from, row.to]));
}

function assetAttachmentMaps(current, assetRows) {
  const assetById = new Map(Object.values(assetRows).map(row => [row.id, row]));
  const byTarget = new Map();
  const byAsset = new Map();
  for (const row of current) {
    if (row.rel !== "attachedAsset") continue;
    const asset = assetById.get(row.to);
    if (!asset) continue;
    if (!byTarget.has(row.from)) byTarget.set(row.from, []);
    byTarget.get(row.from).push(asset);
    if (!byAsset.has(row.to)) byAsset.set(row.to, []);
    byAsset.get(row.to).push(row.from);
  }
  for (const rows of byTarget.values()) rows.sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  for (const rows of byAsset.values()) rows.sort((a, b) => String(a).localeCompare(String(b)));
  return { byTarget, byAsset };
}

function assetIndex(witnesses, current, kinds, titles) {
  const assetDownloadUrl = contentUrl => {
    if (typeof contentUrl !== "string" || !contentUrl) return null;
    return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
  };
  const owners = projectors.owners(witnesses);
  const contexts = objectContextsMap(current);
  const rows = Object.create(null);

  for (const [id, kind] of kinds) {
    if (kind !== "asset") continue;
    rows[id] = {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      mimeType: null,
      sizeBytes: null,
      storageKey: null,
      visibility: "private",
      context: contexts.get(id) ?? null,
      contentUrl: null,
      downloadUrl: null,
      originalName: null,
      attachedTo: [],
      attachmentCount: 0
    };
  }

  for (const witness of witnesses) {
    if (witness.process !== "asset.upload" || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows[id] ?? {
      id,
      title: titles.get(id) ?? id,
      owner: owners.get(id) ?? null,
      mimeType: null,
      sizeBytes: null,
      storageKey: null,
      visibility: "private",
      context: contexts.get(id) ?? null,
      contentUrl: null,
      downloadUrl: null,
      originalName: null,
      attachedTo: [],
      attachmentCount: 0
    };
    row.originalName = typeof witness.body.originalName === "string" ? witness.body.originalName : row.originalName;
    row.title = titles.get(id) ?? row.originalName ?? row.title;
    row.mimeType = typeof witness.body.mimeType === "string" ? witness.body.mimeType : row.mimeType;
    row.sizeBytes = Number.isFinite(witness.body.sizeBytes) ? witness.body.sizeBytes : row.sizeBytes;
    row.storageKey = typeof witness.body.storageKey === "string" ? witness.body.storageKey : row.storageKey;
    row.visibility = witness.body.visibility === "public" || witness.body.visibility === "private"
      ? witness.body.visibility
      : row.visibility;
    row.context = contexts.get(id) ?? (typeof witness.body.context === "string" ? witness.body.context : row.context);
    row.contentUrl = typeof witness.body.contentUrl === "string" ? witness.body.contentUrl : row.contentUrl;
    row.downloadUrl = assetDownloadUrl(row.contentUrl);
    rows[id] = row;
  }

  for (const row of Object.values(rows)) {
    if (!row.downloadUrl) row.downloadUrl = assetDownloadUrl(row.contentUrl);
  }

  const attachments = assetAttachmentMaps(current, rows);
  for (const row of Object.values(rows)) {
    row.attachedTo = attachments.byAsset.get(row.id) ?? [];
    row.attachmentCount = row.attachedTo.length;
  }

  return rows;
}

function buildSpatialCanvasView({ perspective, instances, connectors }) {
  const surfaces = instances.map(instance => ({
    id: instance.id,
    surfaceId: instance.id,
    thing: instance.thing,
    title: instance.label,
    x: instance.x,
    y: instance.y,
    w: instance.w,
    h: instance.h,
    surfaceKind: "instance",
    style: instance.style ?? {}
  }));
  const connections = connectors.map(connector => ({
    id: `${connector.fromInstance}:${connector.rel}:${connector.toInstance}`,
    from: connector.fromInstance,
    to: connector.toInstance,
    label: connector.rel,
    visualType: "relation"
  }));
  return {
    mode: "perspective",
    camera: perspective?.camera ?? null,
    surfaces,
    connections,
    gotos: [],
    prompts: [],
    cameraTargets: []
  };
}

function compileVisibleRange(meta = {}) {
  return {
    minZoom: numberOr(meta.zoomMin, 0),
    maxZoom: numberOr(meta.zoomMax, 99)
  };
}

function sortById(rows) {
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sortByOrder(rows) {
  return rows.sort((a, b) => {
    const orderDiff = numberOr(a.order, 0) - numberOr(b.order, 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function perspectivesProjection(witnesses) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  const owners = projectors.owners(witnesses);
  const contexts = new Map(current.filter(r => r.rel === "inContext").map(r => [r.from, r.to]));
  const perspectives = [];
  for (const [id, kind] of kinds) {
    if (kind !== "perspective") continue;
    perspectives.push({ id, title: titles.get(id) ?? id, owner: owners.get(id) ?? null, context: contexts.get(id) ?? null });
  }
  return perspectives.sort(byId("id"));
}

export function canvasProjection(witnesses, perspectiveId) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  if (kinds.get(perspectiveId) !== "perspective") return null;
  const owners = projectors.owners(witnesses);
  const contexts = objectContextsMap(current);
  const assets = assetIndex(witnesses, current, kinds, titles);
  const attachments = assetAttachmentMaps(current, assets);

  const labelFor = id => titles.get(id) ?? id;

  let camera = null;
  let grid = null;
  const instances = [];
  const proxied = new Map();
  for (const r of current) {
    if (r.from === perspectiveId && r.rel === "hasCamera" && r.to === "camera") camera = { ...r.meta };
    if (r.from === perspectiveId && r.rel === "hasGrid" && r.to === "grid") grid = { ...r.meta };
    if (r.from !== perspectiveId || r.rel !== "contains") continue;
    const instance = r.to;
    if (kinds.get(instance) !== "projectionInstance") continue;
    const target = current.find(x => x.from === instance && x.rel === "proxies")?.to ?? null;
    if (!target) continue;
    const geometry = current.find(x => x.from === instance && x.rel === "hasGeometry" && x.to === "geometry")?.meta ?? DEFAULT_GEOMETRY;
    const style = current.find(x => x.from === instance && x.rel === "hasStyle" && x.to === "style")?.meta ?? {};
    const relations = current
      .filter(x => (x.from === target || x.to === target) && !CANVAS_VOCABULARY_RELS.has(x.rel))
      .map(x => ({ from: x.from, rel: x.rel, to: x.to }));
    instances.push({
      id: instance,
      thing: target,
      kind: kinds.get(target) ?? null,
      label: labelFor(target),
      x: geometry.x,
      y: geometry.y,
      w: geometry.w,
      h: geometry.h,
      style,
      context: contexts.get(target) ?? null,
      asset: assets[target] ?? null,
      attachedAssets: attachments.byTarget.get(target) ?? [],
      attachedTo: attachments.byAsset.get(target) ?? [],
      relations
    });
    if (!proxied.has(target)) proxied.set(target, []);
    proxied.get(target).push(instance);
  }
  instances.sort(byId("id"));

  const connectors = [];
  for (const r of current) {
    if (CANVAS_VOCABULARY_RELS.has(r.rel)) continue;
    if (!proxied.has(r.from) || !proxied.has(r.to)) continue;
    for (const fromInstance of proxied.get(r.from)) {
      for (const toInstance of proxied.get(r.to)) {
        if (fromInstance === toInstance) continue;
        connectors.push({ from: r.from, rel: r.rel, to: r.to, fromInstance, toInstance, witness: r.witness });
      }
    }
  }
  connectors.sort((a, b) =>
    `${a.from} ${a.rel} ${a.to} ${a.fromInstance} ${a.toInstance}`.localeCompare(`${b.from} ${b.rel} ${b.to} ${b.fromInstance} ${b.toInstance}`)
  );

  const availableThings = [];
  for (const id of projectors.things(witnesses)) {
    if (HIDDEN_THING_KINDS.has(kinds.get(id))) continue;
    availableThings.push({
      id,
      kind: kinds.get(id) ?? null,
      label: labelFor(id),
      context: contexts.get(id) ?? null,
      asset: assets[id] ?? null,
      attachedAssets: attachments.byTarget.get(id) ?? [],
      attachedTo: attachments.byAsset.get(id) ?? [],
      placed: proxied.get(id)?.length ?? 0
    });
  }
  availableThings.sort(byId("id"));

  const perspective = {
    id: perspectiveId,
    title: labelFor(perspectiveId),
    owner: owners.get(perspectiveId) ?? null,
    context: contexts.get(perspectiveId) ?? null,
    camera,
    grid
  };
  const spatial = buildSpatialCanvasView({ perspective, instances, connectors });
  return {
    perspective,
    instances,
    connectors,
    availableThings,
    spatial
  };
}

export function edenNeighborhoodProjection(witnesses, neighborhoodId, {
  actor = null
} = {}) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  if (kinds.get(neighborhoodId) !== "edenNeighborhood") return null;

  const labelFor = id => titles.get(id) ?? id;
  const contains = current.filter(row => row.from === neighborhoodId && row.rel === "contains" && kinds.get(row.to) === "edenSurface");
  const surfaceIds = new Set(contains.map(row => row.to));
  const surfaces = sortById(contains.map(row => ({
    id: row.to,
    title: row.meta?.title ?? labelFor(row.to),
    subtitle: row.meta?.subtitle ?? null,
    x: numberOr(row.meta?.x, 0),
    y: numberOr(row.meta?.y, 0),
    w: numberOr(row.meta?.w, 320),
    h: numberOr(row.meta?.h, 180),
    surfaceKind: row.meta?.surfaceKind ?? "panel",
    href: row.meta?.href ? String(row.meta.href) : null,
    src: row.meta?.src ? String(row.meta.src) : null,
    body: row.meta?.body ? String(row.meta.body) : null,
    cameraTargetId: row.meta?.cameraTargetId ? String(row.meta.cameraTargetId) : null,
    visibleRange: compileVisibleRange(row.meta ?? {}),
    district: stringOrNull(row.meta?.district),
    tags: stringList(row.meta?.tags),
    panelKind: stringOrNull(row.meta?.panelKind),
    pageId: stringOrNull(row.meta?.pageId),
    versionSoul: stringOrNull(row.meta?.versionSoul),
    publishedVersion: stringOrNull(row.meta?.publishedVersion),
    draftVersion: stringOrNull(row.meta?.draftVersion),
    chromeKind: row.meta?.chromeKind ? String(row.meta.chromeKind) : null,
    relief: {
      base: numberOr(row.meta?.reliefBase, 1),
      hover: numberOr(row.meta?.reliefHover, numberOr(row.meta?.reliefBase, 1)),
      focus: numberOr(row.meta?.reliefFocus, Math.max(numberOr(row.meta?.reliefBase, 1), 2))
    }
  })));

  const actionsBySurface = new Map();
  for (const row of current.filter(entry => surfaceIds.has(entry.from) && entry.rel === "edenAction")) {
    const action = {
      id: stringOrNull(row.meta?.id) ?? String(row.to),
      label: stringOrNull(row.meta?.label) ?? labelFor(row.to),
      description: stringOrNull(row.meta?.description),
      state: stringOrNull(row.meta?.state) ?? "preview",
      href: stringOrNull(row.meta?.href),
      cameraTargetId: stringOrNull(row.meta?.cameraTargetId),
      requires: stringOrNull(row.meta?.requires),
      visibleRange: compileVisibleRange(row.meta ?? {}),
      order: numberOr(row.meta?.order, 0)
    };
    if (!actionsBySurface.has(row.from)) actionsBySurface.set(row.from, []);
    actionsBySurface.get(row.from).push(action);
  }
  for (const surface of surfaces) {
    surface.actions = sortByOrder(actionsBySurface.get(surface.id) ?? []);
    if (stringOrNull(surface.panelKind) === "personalBox") {
      surface.runtime = {
        mode: "personalBox",
        actor,
        items: projectEdenPersonalBoxItems(witnesses, { actor, surfaceId: surface.id })
      };
    }
    if (stringOrNull(surface.panelKind) === "editPage") {
      const pageId = stringOrNull(surface.pageId) ?? "todo_app_widget";
      surface.runtime = {
        mode: "pageTheme",
        actor,
        pageId,
        pageTheme: projectEdenPageTheme(witnesses, { actor, pageId })
      };
    }
    if (stringOrNull(surface.panelKind) === "versions") {
      surface.runtime = projectEdenVersionState(witnesses, {
        surfaceId: surface.id,
        soul: surface.versionSoul,
        publishedVersion: surface.publishedVersion,
        draftVersion: surface.draftVersion
      });
    }
  }

  const prompts = sortById(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenPrompt")
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `prompt:${index}`,
      text: row.meta?.text ? String(row.meta.text) : labelFor(row.to),
      visibleRange: compileVisibleRange(row.meta ?? {})
    })));

  const cameraTargets = sortById(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenCameraTarget" && surfaceIds.has(row.to))
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `camera:${index}`,
      surfaceId: row.to,
      x: row.meta?.x == null ? null : numberOr(row.meta.x, 0),
      y: row.meta?.y == null ? null : numberOr(row.meta.y, 0),
      zoom: row.meta?.zoom == null ? null : numberOr(row.meta.zoom, 1)
    })));

  const checkpoints = sortByOrder(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenCheckpoint")
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `checkpoint:${index}`,
      title: stringOrNull(row.meta?.title) ?? labelFor(row.to),
      description: stringOrNull(row.meta?.description),
      statusText: stringOrNull(row.meta?.statusText),
      visibleRange: compileVisibleRange(row.meta ?? {}),
      focusSurfaceIds: stringList(row.meta?.focusSurfaceIds),
      unlocks: stringList(row.meta?.unlocks),
      order: numberOr(row.meta?.order, index)
    })));

  const connections = current
    .filter(row => EDEN_CONNECTION_RELS.has(row.rel) && surfaceIds.has(row.from) && surfaceIds.has(row.to))
    .map(row => ({
      id: `${row.from}:${row.rel}:${row.to}`,
      from: row.from,
      to: row.to,
      label: row.meta?.label ? String(row.meta.label) : "",
      visualType: EDEN_CONNECTION_RELS.get(row.rel)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const gotos = surfaces.filter(surface => surface.surfaceKind === "goto");
  const defaultCameraTargetId = current.find(row => row.from === neighborhoodId && row.rel === "edenDefaultCameraTarget")?.to ?? null;
  const spatial = {
    mode: "neighborhood",
    camera: null,
    surfaces,
    connections,
    gotos,
    prompts,
    cameraTargets,
    checkpoints
  };

  return {
    neighborhood: {
      id: neighborhoodId,
      title: labelFor(neighborhoodId),
      defaultSurfaceId: defaultCameraTargetId
    },
    surfaces,
    connections,
    gotos,
    prompts,
    cameraTargets,
    checkpoints,
    spatial
  };
}

export function thingDetails(witnesses, thingId) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  const contexts = objectContextsMap(current);
  const assets = assetIndex(witnesses, current, kinds, titles);
  const attachments = assetAttachmentMaps(current, assets);
  const relations = current
    .filter(r => (r.from === thingId || r.to === thingId) && !["hasGeometry", "hasStyle", "hasCamera"].includes(r.rel))
    .map(r => ({ from: r.from, rel: r.rel, to: r.to }));
  return {
    id: thingId,
    kind: kinds.get(thingId) ?? null,
    label: titles.get(thingId) ?? thingId,
    context: contexts.get(thingId) ?? null,
    asset: assets[thingId] ?? null,
    attachedAssets: attachments.byTarget.get(thingId) ?? [],
    attachedTo: attachments.byAsset.get(thingId) ?? [],
    relations
  };
}
