import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function currentRelations(witnesses) {
  return projectors.currentRelations(witnesses);
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
  const assetById = new Map(assetRows.map(row => [row.id, row]));
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

export function assets(witnesses, options = {}) {
  const assetDownloadUrl = contentUrl => {
    if (typeof contentUrl !== "string" || !contentUrl) return null;
    return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
  };
  const assetTextUrl = assetId => `/api/assets/${encodeURIComponent(assetId)}/text`;
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = new Map(
    currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
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

  for (const [id, kind] of modules) {
    if (kind !== "asset") continue;
    rows.set(id, defaultRow(id));
  }

  for (const witness of witnesses) {
    if (witness.process !== "asset.upload" || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultRow(id);
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
    rows.set(id, row);
  }

  const jobsByAsset = new Map();
  const assetIdByJobId = new Map();
  for (const witness of witnesses) {
    if (!witness.process.startsWith("jobs.queue.") || !witness.body?.id) continue;
    if (witness.body.handler !== "asset.ingest.process") continue;
    const jobId = String(witness.body.id);
    const assetId = typeof witness.body.payload?.assetId === "string"
      ? witness.body.payload.assetId
      : assetIdByJobId.get(jobId) || "";
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
    const row = rows.get(id) ?? defaultRow(id);
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
    rows.set(id, row);
  }

  for (const [assetId, job] of jobsByAsset) {
    const row = rows.get(assetId) ?? defaultRow(assetId);
    row.processingJobId = job.id;
    row.processingStatus = job.status;
    row.processingAttempt = Number.isFinite(job.attempt) ? job.attempt : row.processingAttempt;
    row.processingUpdatedAt = job.completedAt ?? job.availableAt ?? job.createdAt ?? row.processingUpdatedAt;
    if (job.status === "succeeded") row.processingError = null;
    else if (typeof job.lastError === "string") row.processingError = job.lastError;
    rows.set(assetId, row);
  }

  for (const row of rows.values()) {
    if (!row.downloadUrl) row.downloadUrl = assetDownloadUrl(row.contentUrl);
    if (!row.textUrl && row.textRef) row.textUrl = assetTextUrl(row.id);
    row.canRetryIngest = assetCanRetryIngest(row);
    row.ingestRetryUrl = row.canRetryIngest ? assetIngestRetryUrl(row.id) : null;
    row.canRefreshSearch = assetCanRefreshSearch(row);
    row.searchReindexUrl = row.canRefreshSearch ? assetSearchReindexUrl(row.id) : null;
    row.contextTitle = row.context ? (titles.get(row.context) ?? row.context) : null;
  }

  const assetRows = [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const attachments = assetAttachmentMaps(currentRelations(witnesses), assetRows, { titles, kinds: modules, contexts });
  for (const row of assetRows) {
    row.attachedTo = attachments.byAsset.get(row.id) ?? [];
    row.attachedToRows = attachments.byAssetRows.get(row.id) ?? [];
    row.attachmentCount = row.attachedTo.length;
  }
  return assetRows;
}

export function assetIndex(witnesses, options = {}) {
  const rows = assets(witnesses, options);
  const byId = Object.create(null);
  for (const row of rows) byId[row.id] = row;
  return { rows, byId };
}

export const assetModuleProjectors = Object.freeze({
  assets,
  assetIndex
});
