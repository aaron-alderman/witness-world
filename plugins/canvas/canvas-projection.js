import { projectors } from "./projectors-core.js";

const DEFAULT_GEOMETRY = { x: 40, y: 40, w: 160, h: 56 };
const CANVAS_VOCABULARY_RELS = new Set(["contains", "proxies", "cloneOf", "hasGeometry", "hasStyle", "hasCamera", "hasGrid", "hasModuleKind", "hasTitle", "hasDone"]);
const HIDDEN_THING_KINDS = new Set(["projectionInstance", "perspective", "widget", "widgetVersion", "widgetVersionTransition", "frontendProgram", "route", "description", "compiledArtifact", "context"]);
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
const objectList = value => Array.isArray(value)
  ? value.filter(entry => entry && typeof entry === "object")
  : [];

function indexCurrentRelations(witnesses) {
  const current = projectors.currentRelations(witnesses);
  const kinds = new Map();
  const titles = new Map();
  for (const r of current) {
    if (r.rel === "hasModuleKind") kinds.set(r.from, r.to);
    if (r.rel === "hasTitle") titles.set(r.from, r.to);
  }
  for (const witness of witnesses) {
    if (witness.process !== "defineContext" || !witness.body?.id) continue;
    if (titles.has(witness.body.id)) continue;
    if (typeof witness.body.label === "string" && witness.body.label.trim()) {
      titles.set(witness.body.id, witness.body.label.trim());
    }
  }
  return { current, kinds, titles };
}

function objectContextsMap(current) {
  return new Map(current.filter(row => row.rel === "inContext").map(row => [row.from, row.to]));
}

function thingReferenceRow(id, { titles, kinds, contexts }) {
  const contextId = contexts.get(id) ?? null;
  return {
    id,
    title: titles.get(id) ?? id,
    kind: kinds.get(id) ?? null,
    context: contextId,
    contextTitle: contextId ? (titles.get(contextId) ?? contextId) : null
  };
}

function assetAttachmentMaps(current, assetRows, { titles, kinds, contexts }) {
  const assetById = new Map(Object.values(assetRows).map(row => [row.id, row]));
  const byTarget = new Map();
  const byAsset = new Map();
  const byAssetRows = new Map();
  for (const row of current) {
    if (row.rel !== "attachedAsset") continue;
    const asset = assetById.get(row.to);
    if (!asset) continue;
    if (!byTarget.has(row.from)) byTarget.set(row.from, []);
    byTarget.get(row.from).push(asset);
    if (!byAsset.has(row.to)) byAsset.set(row.to, []);
    byAsset.get(row.to).push(row.from);
    if (!byAssetRows.has(row.to)) byAssetRows.set(row.to, []);
    byAssetRows.get(row.to).push(thingReferenceRow(row.from, { titles, kinds, contexts }));
  }
  for (const rows of byTarget.values()) rows.sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  for (const rows of byAsset.values()) rows.sort((a, b) => String(a).localeCompare(String(b)));
  for (const rows of byAssetRows.values()) rows.sort((a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id)));
  return { byTarget, byAsset, byAssetRows };
}

function assetIngestRetryUrl(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/ingest/retry`;
}

function assetSearchReindexUrl(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/search/reindex`;
}

function assetCanRetryIngest(row) {
  const status = String(row?.processingStatus || "");
  return status === "dead-letter" || status === "enqueue-failed";
}

function assetCanRefreshSearch(row) {
  if (String(row?.searchStatus || "") === "manual") return true;
  return typeof row?.searchError === "string" && row.searchError.trim().length > 0;
}

function assetIndex(witnesses, current, kinds, titles) {
  const assetDownloadUrl = contentUrl => {
    if (typeof contentUrl !== "string" || !contentUrl) return null;
    return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
  };
  const assetTextUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/text`;
  const owners = projectors.owners(witnesses);
  const contexts = objectContextsMap(current);
  const rows = Object.create(null);
  const defaultRow = id => ({
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    mimeType: null,
    sizeBytes: null,
    storageKey: null,
    visibility: "private",
    context: contexts.get(id) ?? null,
    contextTitle: null,
    contentUrl: null,
    downloadUrl: null,
    textUrl: null,
    originalName: null,
    processingStatus: null,
    processingJobId: null,
    processingAttempt: 0,
    processingUpdatedAt: null,
    processingError: null,
    derivedMetadata: null,
    textStatus: null,
    textBytes: null,
    textRef: null,
    textExtractor: null,
    thumbnailStatus: null,
    thumbnailRef: null,
    thumbnailUrl: null,
    imageWidth: null,
    imageHeight: null,
    searchStatus: null,
    searchError: null,
    searchPolicy: null,
    reindexedIndexId: null,
    canRetryIngest: false,
    ingestRetryUrl: null,
    canRefreshSearch: false,
    searchReindexUrl: null,
    attachedTo: [],
    attachedToRows: [],
    attachmentCount: 0
  });

  for (const [id, kind] of kinds) {
    if (kind !== "asset") continue;
    rows[id] = defaultRow(id);
  }

  for (const witness of witnesses) {
    if (witness.process !== "asset.upload" || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows[id] ?? defaultRow(id);
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

  const jobsByAsset = new Map();
  const assetIdByJobId = new Map();
  for (const witness of witnesses) {
    if (!witness.process.startsWith("jobs.queue.") || !witness.body?.id) continue;
    if (witness.body.handler !== "asset.ingest.process") continue;
    const jobId = String(witness.body.id);
    const assetId = typeof witness.body.payload?.assetId === "string" ? witness.body.payload.assetId : assetIdByJobId.get(jobId) || "";
    if (!assetId) continue;
    assetIdByJobId.set(jobId, assetId);
    const row = jobsByAsset.get(assetId) ?? {
      assetId,
      id: jobId,
      status: "queued",
      attempt: 0,
      createdAt: null,
      availableAt: null,
      completedAt: null,
      lastError: null
    };
    row.id = jobId;
    if (Number.isFinite(witness.body.attempt)) row.attempt = witness.body.attempt;
    if (typeof witness.body.createdAt === "string") row.createdAt = witness.body.createdAt;
    if (typeof witness.body.availableAt === "string") row.availableAt = witness.body.availableAt;
    if (typeof witness.body.nextAvailableAt === "string") row.availableAt = witness.body.nextAvailableAt;
    if (typeof witness.body.completedAt === "string") row.completedAt = witness.body.completedAt;
    if (typeof witness.body.reason === "string") row.lastError = witness.body.reason;
    if (witness.process === "jobs.queue.enqueue") row.status = "queued";
    if (witness.process === "jobs.queue.start") row.status = "running";
    if (witness.process === "jobs.queue.retry") row.status = "queued";
    if (witness.process === "jobs.queue.succeeded") row.status = "succeeded";
    if (witness.process === "jobs.queue.deadLetter") row.status = "dead-letter";
    jobsByAsset.set(assetId, row);
  }

  for (const witness of witnesses) {
    if (!witness.body?.id) continue;
    if (![
      "asset.ingest.enqueue",
      "asset.ingest.enqueue.failed",
      "asset.ingest.start",
      "asset.ingest.succeeded",
      "asset.ingest.failed",
      "asset.search.reindex",
      "asset.search.reindex.failed"
    ].includes(witness.process)) continue;
    const id = String(witness.body.id);
    const row = rows[id] ?? defaultRow(id);
    if (witness.process === "asset.ingest.enqueue") {
      row.processingStatus = "queued";
      row.processingJobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.processingJobId;
    }
    if (witness.process === "asset.ingest.enqueue.failed") {
      row.processingStatus = "enqueue-failed";
      row.processingError = typeof witness.body.reason === "string" ? witness.body.reason : row.processingError;
    }
    if (witness.process === "asset.ingest.start") {
      row.processingStatus = "running";
      row.processingJobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.processingJobId;
      row.processingAttempt = Number.isFinite(witness.body.attempt) ? witness.body.attempt : row.processingAttempt;
    }
    if (witness.process === "asset.ingest.succeeded") {
      row.processingStatus = "succeeded";
      row.processingJobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.processingJobId;
      row.processingAttempt = Number.isFinite(witness.body.attempt) ? witness.body.attempt : row.processingAttempt;
      row.processingUpdatedAt = typeof witness.body.completedAt === "string" ? witness.body.completedAt : row.processingUpdatedAt;
      row.processingError = null;
      row.derivedMetadata = witness.body.derivedMetadata && typeof witness.body.derivedMetadata === "object" && !Array.isArray(witness.body.derivedMetadata)
        ? witness.body.derivedMetadata
        : row.derivedMetadata;
      row.textStatus = typeof witness.body.textStatus === "string" ? witness.body.textStatus : row.textStatus;
      row.textBytes = Number.isFinite(witness.body.textBytes) ? witness.body.textBytes : row.textBytes;
      row.textRef = typeof witness.body.textRef === "string" ? witness.body.textRef : row.textRef;
      row.textUrl = row.textRef ? assetTextUrl(id) : row.textUrl;
      row.textExtractor = typeof witness.body.textExtractor === "string" ? witness.body.textExtractor : row.textExtractor;
      row.thumbnailStatus = typeof witness.body.thumbnailStatus === "string" ? witness.body.thumbnailStatus : row.thumbnailStatus;
      row.thumbnailRef = typeof witness.body.thumbnailRef === "string" ? witness.body.thumbnailRef : row.thumbnailRef;
      row.thumbnailUrl = typeof witness.body.thumbnailUrl === "string" ? witness.body.thumbnailUrl : row.thumbnailUrl;
      row.imageWidth = Number.isFinite(witness.body.imageWidth) ? witness.body.imageWidth : row.imageWidth;
      row.imageHeight = Number.isFinite(witness.body.imageHeight) ? witness.body.imageHeight : row.imageHeight;
      row.searchStatus = typeof witness.body.searchStatus === "string" ? witness.body.searchStatus : row.searchStatus;
      row.searchPolicy = typeof witness.body.searchPolicy === "string" ? witness.body.searchPolicy : row.searchPolicy;
      row.reindexedIndexId = typeof witness.body.reindexedIndexId === "string" ? witness.body.reindexedIndexId : row.reindexedIndexId;
      row.searchError = null;
    }
    if (witness.process === "asset.ingest.failed") {
      row.processingJobId = typeof witness.body.jobId === "string" ? witness.body.jobId : row.processingJobId;
      row.processingAttempt = Number.isFinite(witness.body.attempt) ? witness.body.attempt : row.processingAttempt;
      row.processingError = typeof witness.body.reason === "string" ? witness.body.reason : row.processingError;
    }
    if (witness.process === "asset.search.reindex") {
      row.searchStatus = typeof witness.body.searchStatus === "string" ? witness.body.searchStatus : "reindexed";
      row.searchPolicy = typeof witness.body.searchPolicy === "string" ? witness.body.searchPolicy : row.searchPolicy;
      row.reindexedIndexId = typeof witness.body.reindexedIndexId === "string" ? witness.body.reindexedIndexId : row.reindexedIndexId;
      row.searchError = null;
    }
    if (witness.process === "asset.search.reindex.failed") {
      row.searchError = typeof witness.body.reason === "string" ? witness.body.reason : row.searchError;
    }
    rows[id] = row;
  }

  for (const [assetId, job] of jobsByAsset) {
    const row = rows[assetId] ?? defaultRow(assetId);
    row.processingJobId = job.id;
    row.processingStatus = job.status;
    row.processingAttempt = Number.isFinite(job.attempt) ? job.attempt : row.processingAttempt;
    row.processingUpdatedAt = job.completedAt ?? job.availableAt ?? job.createdAt ?? row.processingUpdatedAt;
    if (job.status === "succeeded") row.processingError = null;
    else if (typeof job.lastError === "string") row.processingError = job.lastError;
    rows[assetId] = row;
  }

  for (const row of Object.values(rows)) {
    if (!row.downloadUrl) row.downloadUrl = assetDownloadUrl(row.contentUrl);
    if (!row.textUrl && row.textRef) row.textUrl = assetTextUrl(row.id);
    row.canRetryIngest = assetCanRetryIngest(row);
    row.ingestRetryUrl = row.canRetryIngest ? assetIngestRetryUrl(row.id) : null;
    row.canRefreshSearch = assetCanRefreshSearch(row);
    row.searchReindexUrl = row.canRefreshSearch ? assetSearchReindexUrl(row.id) : null;
    row.contextTitle = row.context ? (titles.get(row.context) ?? row.context) : null;
  }

  const attachments = assetAttachmentMaps(current, rows, { titles, kinds, contexts });
  for (const row of Object.values(rows)) {
    row.attachedTo = attachments.byAsset.get(row.id) ?? [];
    row.attachedToRows = attachments.byAssetRows.get(row.id) ?? [];
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
  const attachments = assetAttachmentMaps(current, assets, { titles, kinds, contexts });

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
      contextTitle: contexts.get(target) ? labelFor(contexts.get(target)) : null,
      asset: assets[target] ?? null,
      attachedAssets: attachments.byTarget.get(target) ?? [],
      attachedTo: attachments.byAsset.get(target) ?? [],
      attachedToRows: attachments.byAssetRows.get(target) ?? [],
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
      contextTitle: contexts.get(id) ? labelFor(contexts.get(id)) : null,
      asset: assets[id] ?? null,
      attachedAssets: attachments.byTarget.get(id) ?? [],
      attachedTo: attachments.byAsset.get(id) ?? [],
      attachedToRows: attachments.byAssetRows.get(id) ?? [],
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

export function thingDetails(witnesses, thingId) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  const contexts = objectContextsMap(current);
  const assets = assetIndex(witnesses, current, kinds, titles);
  const attachments = assetAttachmentMaps(current, assets, { titles, kinds, contexts });
  const relations = current
    .filter(r => (r.from === thingId || r.to === thingId) && !["hasGeometry", "hasStyle", "hasCamera"].includes(r.rel))
    .map(r => ({ from: r.from, rel: r.rel, to: r.to }));
  return {
    id: thingId,
    kind: kinds.get(thingId) ?? null,
    label: titles.get(thingId) ?? thingId,
    context: contexts.get(thingId) ?? null,
    contextTitle: contexts.get(thingId) ? (titles.get(contexts.get(thingId)) ?? contexts.get(thingId)) : null,
    asset: assets[thingId] ?? null,
    attachedAssets: attachments.byTarget.get(thingId) ?? [],
    attachedTo: attachments.byAsset.get(thingId) ?? [],
    attachedToRows: attachments.byAssetRows.get(thingId) ?? [],
    relations
  };
}
