import fs from "node:fs/promises";
import path from "node:path";

export function createFsBlobIoServices({
  blobsRootFor,
  canManageContext,
  canMutateTarget
}) {
  const normalizeBlobPath = (raw, { allowEmpty = false } = {}) => {
    const value = String(raw || "").replaceAll("\\", "/");
    const segments = value.split("/").filter(Boolean);
    if (!segments.length) {
      if (allowEmpty) return { ok: true, path: "", segments: [] };
      return { ok: false, status: 400, reason: "missing blob path" };
    }
    for (const segment of segments) {
      if (segment === "." || segment === "..") {
        return { ok: false, status: 400, reason: "blob path traversal is not allowed" };
      }
      if (segment.includes("\0")) {
        return { ok: false, status: 400, reason: "blob path contains invalid characters" };
      }
    }
    return { ok: true, path: segments.join("/"), segments };
  };

  const resolveBlobScope = ({ requestActor, requestUrl, appContext }) => {
    if (!requestActor) return { ok: false, status: 401, reason: "sign in first" };
    const contextId = requestUrl.searchParams.get("context") || "";
    const serverRunnerInput = requestUrl.searchParams.get("serverRunner") || "";
    if (contextId && serverRunnerInput) return { ok: false, status: 400, reason: "choose either context or serverRunner scope" };
    if (!contextId && !serverRunnerInput) return { ok: false, status: 400, reason: "missing blob scope" };
    if (contextId) {
      const gate = canManageContext(requestActor, contextId);
      if (!gate.ok) return gate;
      return { ok: true, scopeKind: "context", scopeId: contextId };
    }
    const serverRunnerId = serverRunnerInput === "current" ? (appContext?.serverRunnerId || "") : serverRunnerInput;
    if (!serverRunnerId) return { ok: false, status: 400, reason: "unknown server runner scope" };
    const gate = canMutateTarget(requestActor, serverRunnerId);
    if (!gate.ok) return gate;
    return { ok: true, scopeKind: "serverRunner", scopeId: serverRunnerId };
  };

  const blobScopeDirectoryFor = (appContext, scopeKind, scopeId) => path.join(
    blobsRootFor(appContext),
    scopeKind === "context" ? "contexts" : "server-runners",
    encodeURIComponent(scopeId)
  );

  const blobStorageDirectoryFor = (appContext, scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      directory: path.join(blobScopeDirectoryFor(appContext, scopeKind, scopeId), ...normalized.segments.map(segment => encodeURIComponent(segment)))
    };
  };

  const blobStorageKeyFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    const prefix = scopeKind === "context" ? "contexts" : "server-runners";
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      storageKey: `${prefix}/${encodeURIComponent(scopeId)}/${normalized.segments.map(segment => encodeURIComponent(segment)).join("/")}`
    };
  };

  const blobRefFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      blobRef: `blob:${scopeKind}:${encodeURIComponent(scopeId)}:${normalized.segments.map(segment => encodeURIComponent(segment)).join("/")}`
    };
  };

  const blobContentUrlFor = (scopeKind, scopeId, blobPath) => {
    const normalized = normalizeBlobPath(blobPath);
    if (!normalized.ok) return normalized;
    const params = new URLSearchParams({
      ...(scopeKind === "context" ? { context: scopeId } : { serverRunner: scopeId }),
      path: normalized.path
    });
    return {
      ok: true,
      path: normalized.path,
      segments: normalized.segments,
      contentUrl: `/api/fs/blobs/content?${params.toString()}`
    };
  };

  const blobMetaPathFor = (appContext, scopeKind, scopeId, blobPath) => {
    const resolved = blobStorageDirectoryFor(appContext, scopeKind, scopeId, blobPath);
    if (!resolved.ok) return resolved;
    return { ...resolved, metaPath: path.join(resolved.directory, "meta.json") };
  };

  const blobContentPathFor = (appContext, scopeKind, scopeId, blobPath) => {
    const resolved = blobStorageDirectoryFor(appContext, scopeKind, scopeId, blobPath);
    if (!resolved.ok) return resolved;
    return { ...resolved, contentPath: path.join(resolved.directory, "blob") };
  };

  const composeBlobFileRecord = async ({ appContext, scopeKind, scopeId, blobPath, metadata = null }) => {
    const storageKey = blobStorageKeyFor(scopeKind, scopeId, blobPath);
    const blobRef = blobRefFor(scopeKind, scopeId, blobPath);
    const contentUrl = blobContentUrlFor(scopeKind, scopeId, blobPath);
    const contentPath = blobContentPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!storageKey.ok) return storageKey;
    if (!blobRef.ok) return blobRef;
    if (!contentUrl.ok) return contentUrl;
    if (!contentPath.ok) return contentPath;
    let stat = null;
    try {
      stat = await fs.stat(contentPath.contentPath);
    } catch {
      return { ok: false, status: 404, reason: "blob not found" };
    }
    const record = metadata ?? {};
    return {
      ok: true,
      record: {
        kind: "file",
        scopeKind,
        scopeId,
        path: contentPath.path,
        name: contentPath.segments.at(-1) || "",
        sizeBytes: stat.size,
        mimeType: record.mimeType || "application/octet-stream",
        storageKey: storageKey.storageKey,
        blobRef: blobRef.blobRef,
        contentUrl: contentUrl.contentUrl,
        updatedAt: record.updatedAt || stat.mtime.toISOString()
      },
      contentPath: contentPath.contentPath
    };
  };

  const loadBlobRecord = async ({ appContext, scopeKind, scopeId, blobPath }) => {
    const metaPath = blobMetaPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!metaPath.ok) return metaPath;
    const contentPath = blobContentPathFor(appContext, scopeKind, scopeId, blobPath);
    if (!contentPath.ok) return contentPath;
    let metadata = null;
    try {
      metadata = JSON.parse(await fs.readFile(metaPath.metaPath, "utf8"));
    } catch {
      metadata = null;
    }
    const fileRecord = await composeBlobFileRecord({ appContext, scopeKind, scopeId, blobPath, metadata });
    if (fileRecord.ok) return fileRecord;
    try {
      const stat = await fs.stat(contentPath.directory);
      if (!stat.isDirectory()) return { ok: false, status: 404, reason: "blob not found" };
      const entries = await fs.readdir(contentPath.directory);
      return {
        ok: true,
        record: {
          kind: "folder",
          scopeKind,
          scopeId,
          path: contentPath.path,
          name: contentPath.segments.at(-1) || "",
          childCount: entries.filter(entry => entry !== "blob" && entry !== "meta.json").length,
          updatedAt: stat.mtime.toISOString()
        },
        directory: contentPath.directory
      };
    } catch {
      return { ok: false, status: 404, reason: "blob not found" };
    }
  };

  const listBlobFolder = async ({ appContext, scopeKind, scopeId, folderPath }) => {
    const normalized = normalizeBlobPath(folderPath, { allowEmpty: true });
    if (!normalized.ok) return normalized;
    const directory = path.join(blobScopeDirectoryFor(appContext, scopeKind, scopeId), ...normalized.segments.map(segment => encodeURIComponent(segment)));
    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const logicalName = decodeURIComponent(entry.name);
        const childPath = normalized.path ? `${normalized.path}/${logicalName}` : logicalName;
        const child = await loadBlobRecord({ appContext, scopeKind, scopeId, blobPath: childPath });
        if (child.ok) items.push(child.record);
      }
      items.sort((a, b) => a.path.localeCompare(b.path));
      return {
        ok: true,
        folder: {
          kind: "folder",
          scopeKind,
          scopeId,
          path: normalized.path,
          name: normalized.segments.at(-1) || "",
          childCount: items.length
        },
        items
      };
    } catch {
      if (!normalized.path) {
        return {
          ok: true,
          folder: { kind: "folder", scopeKind, scopeId, path: "", name: "", childCount: 0 },
          items: []
        };
      }
      return { ok: false, status: 404, reason: "blob folder not found" };
    }
  };

  return {
    resolveBlobScope,
    listBlobFolder,
    loadBlobRecord,
    blobStorageDirectoryFor,
    composeBlobFileRecord,
    normalizeBlobPath
  };
}
