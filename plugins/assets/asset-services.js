import path from "node:path";
import { Readable } from "node:stream";
import { moduleProjectors } from "../../src/modules.js";

export function assetDerivedTextPathForAppContext(appContext, assetId) {
  const assetsRoot = appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  return path.join(assetsRoot, encodeURIComponent(assetId), "derived", "text.txt");
}

export function assetDerivedThumbnailPathForAppContext(appContext, assetId) {
  const assetsRoot = appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
  return path.join(assetsRoot, encodeURIComponent(assetId), "derived", "thumbnail.svg");
}

export function assetDerivedTextStorageKey(assetId) {
  return `${assetId}/derived/text.txt`;
}

export function assetDerivedThumbnailStorageKey(assetId) {
  return `${assetId}/derived/thumbnail.svg`;
}

export function assetContentUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/content`;
}

export function assetTextUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/text`;
}

export function assetThumbnailUrlForId(assetId) {
  return `/api/assets/${encodeURIComponent(assetId)}/thumbnail`;
}

function assetUploadFieldValue(formData, name) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function multipartFileFromFormData(formData) {
  const preferred = formData.get("file");
  if (preferred && typeof preferred === "object" && typeof preferred.stream === "function") return preferred;
  for (const value of formData.values()) {
    if (value && typeof value === "object" && typeof value.stream === "function") return value;
  }
  return null;
}

function defaultAssetsRootFor(appContext) {
  return appContext?.storage?.assetsRoot || path.resolve(appContext?.runtimeRoot || process.cwd(), "assets");
}

export function createPracticalBackendAssetServices({
  world,
  backendHost,
  runtimeConfigLookup,
  headerValue,
  assetsRootFor = defaultAssetsRootFor,
  canCreateInContext,
  canMutateTarget,
  currentPerspectiveById,
  defineContext
}) {
  const parseMultipartAssetUpload = async req => {
    const contentType = headerValue(req.headers["content-type"]);
    const request = new Request("http://local.test/api/assets", {
      method: "POST",
      headers: { "content-type": contentType },
      body: req,
      duplex: "half"
    });
    let formData = null;
    try {
      formData = await request.formData();
    } catch {
      return { ok: false, status: 400, reason: "invalid multipart upload body" };
    }
    const file = multipartFileFromFormData(formData);
    if (!file) {
      return { ok: false, status: 400, reason: "multipart upload requires a file part" };
    }
    return {
      ok: true,
      uploadKind: "multipart",
      source: Readable.fromWeb(file.stream()),
      originalName: typeof file.name === "string" ? file.name.trim() : "",
      mimeType: typeof file.type === "string" && file.type.trim() ? file.type.trim() : "application/octet-stream",
      declaredSizeBytes: Number.isFinite(file.size) ? file.size : null,
      perspectiveId: assetUploadFieldValue(formData, "perspective"),
      explicitContextId: assetUploadFieldValue(formData, "dropContext"),
      visibilityRaw: assetUploadFieldValue(formData, "visibility")
    };
  };

  const parseRawAssetUpload = (req, requestUrl) => {
    const rawDeclaredSize = Number.parseInt(headerValue(req.headers["x-witness-file-size"]).trim(), 10);
    return {
      ok: true,
      uploadKind: "raw",
      source: req,
      originalName: headerValue(req.headers["x-witness-file-name"]).trim(),
      mimeType: headerValue(req.headers["content-type"]).split(";")[0].trim(),
      declaredSizeBytes: Number.isFinite(rawDeclaredSize) && rawDeclaredSize >= 0 ? rawDeclaredSize : null,
      perspectiveId: requestUrl.searchParams.get("perspective") || "",
      explicitContextId: headerValue(req.headers["x-witness-drop-context"]).trim(),
      visibilityRaw: headerValue(req.headers["x-witness-visibility"]).trim()
    };
  };

  const assetDownloadUrl = contentUrl => {
    if (typeof contentUrl !== "string" || !contentUrl) return null;
    return contentUrl.includes("?") ? `${contentUrl}&download=1` : `${contentUrl}?download=1`;
  };

  const assetContentUrl = assetId => assetContentUrlForId(assetId);
  const assetTextUrl = assetId => assetTextUrlForId(assetId);
  const assetThumbnailUrl = assetId => assetThumbnailUrlForId(assetId);
  const assetStorageKey = assetId => `${assetId}/blob`;
  const assetPathFor = (appContext, assetId) => path.join(assetsRootFor(appContext), encodeURIComponent(assetId), "blob");
  const assetTextPathFor = (appContext, assetId) => assetDerivedTextPathForAppContext(appContext, assetId);
  const assetThumbnailPathFor = (appContext, assetId) => assetDerivedThumbnailPathForAppContext(appContext, assetId);
  const filesContextIdFor = homeContext => `context:${homeContext}:files`;
  const currentAssetById = (assetId, appContext = null) => {
    const project = appContext?.project ?? (projector => world.project(projector));
    return project(moduleProjectors.assetIndex).byId[assetId] ?? null;
  };
  const ensureReadableAssetAccess = (asset, requestActor) => {
    const isPublic = asset?.visibility === "public";
    if (isPublic) return { ok: true, status: 200, isPublic: true };
    if (!requestActor) return { ok: false, status: 401, reason: "sign in first", observeActor: backendHost, isPublic: false };
    const gate = canMutateTarget(requestActor, asset.id);
    if (!gate.ok) return { ok: false, status: gate.status || 403, reason: gate.reason || "forbidden", observeActor: requestActor, isPublic: false };
    return { ok: true, status: 200, isPublic: false };
  };
  const normalizeAssetVisibility = (raw, runtimeConfig = {}) => {
    const value = String(raw || "").trim().toLowerCase();
    if (!value || value === "private") return { ok: true, value: "private" };
    if (value === "public") {
      const enabledRaw = runtimeConfigLookup(runtimeConfig, "upload.asset.publicEnabled");
      const enabled = enabledRaw === true || String(enabledRaw || "").trim().toLowerCase() === "true";
      if (enabled) return { ok: true, value: "public" };
      return { ok: false, reason: "public asset hosting is not enabled for this runner" };
    }
    return { ok: false, reason: "invalid asset visibility" };
  };
  const ensureFilesContext = ({ actor, homeContext }) => {
    if (!homeContext) {
      return { ok: false, status: 409, reason: "actor has no homeContext for file drops" };
    }
    const homeGate = canCreateInContext(actor, homeContext);
    if (!homeGate.ok) return homeGate;
    const contextId = filesContextIdFor(homeContext);
    const existing = world.project(moduleProjectors.contexts).find(row => row.id === contextId) ?? null;
    if (existing) {
      const filesGate = canCreateInContext(actor, contextId);
      if (!filesGate.ok) return filesGate;
      return { ok: true, status: 200, contextId, created: false, context: existing };
    }
    defineContext({
      actor,
      id: contextId,
      label: "Files",
      parent: homeContext,
      owner: actor
    });
    const created = world.project(moduleProjectors.contexts).find(row => row.id === contextId) ?? null;
    return { ok: true, status: 201, contextId, created: true, context: created };
  };
  const resolveAssetDropContext = ({ actor, perspectiveId, requestSession, explicitContextId = null }) => {
    const perspective = currentPerspectiveById(perspectiveId);
    if (!perspective) {
      return { ok: false, status: 404, reason: "unknown perspective", perspectiveId };
    }
    if (explicitContextId && perspective.context && explicitContextId !== perspective.context) {
      return { ok: false, status: 409, reason: "drop context does not match perspective context", perspectiveId, explicitContextId, perspectiveContext: perspective.context };
    }
    if (perspective.context) {
      const gate = canCreateInContext(actor, perspective.context);
      if (!gate.ok) return gate;
      return { ok: true, status: 200, perspective, contextId: perspective.context, source: "perspective" };
    }
    const ensured = ensureFilesContext({ actor, homeContext: requestSession?.homeContext ?? null });
    if (!ensured.ok) return ensured;
    return { ok: true, status: ensured.status, perspective, contextId: ensured.contextId, source: "files", filesContextCreated: ensured.created === true };
  };

  return {
    parseMultipartAssetUpload,
    parseRawAssetUpload,
    assetDownloadUrl,
    assetContentUrl,
    assetTextUrl,
    assetThumbnailUrl,
    assetStorageKey,
    assetPathFor,
    assetTextPathFor,
    assetThumbnailPathFor,
    currentAssetById,
    ensureReadableAssetAccess,
    normalizeAssetVisibility,
    resolveAssetDropContext
  };
}
