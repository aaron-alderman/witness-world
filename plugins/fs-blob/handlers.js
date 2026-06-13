import fs from "node:fs/promises";
import path from "node:path";

export function createFsBlobHandlers({
  world,
  backendHost,
  send,
  sendJson,
  readBody,
  headerValue,
  requireBackendCapabilities,
  resolveBlobScope,
  listBlobFolder,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  normalizeBlobPath
}) {
  return {
    "fs.blob.list": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const folderPath = requestUrl.searchParams.get("path") || "";
      const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath });
      if (!listed.ok) {
        world.observe({ process: "fs.blob.list.failed", actor: requestActor, claims: [], body: { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: folderPath } });
        sendJson(res, listed.status || 404, { error: listed.reason });
        return;
      }
      world.observe({
        process: "fs.blob.list",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: listed.folder.path, count: listed.items.length }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, folder: listed.folder, items: listed.items });
    },

    "fs.blob.meta": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      if (!blobPath) {
        const listed = await listBlobFolder({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, folderPath: "" });
        world.observe({
          process: listed.ok ? "fs.blob.meta" : "fs.blob.meta.failed",
          actor: requestActor,
          claims: [],
          body: listed.ok
            ? { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "", kind: "folder", childCount: listed.folder.childCount }
            : { reason: listed.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" }
        });
        if (!listed.ok) {
          sendJson(res, listed.status || 404, { error: listed.reason });
          return;
        }
        sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: listed.folder });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok) {
        world.observe({ process: "fs.blob.meta.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      world.observe({
        process: "fs.blob.meta",
        actor: requestActor,
        claims: [],
        body: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: record.record.path, kind: record.record.kind }
      });
      sendJson(res, 200, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.record });
    },

    "fs.blob.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.blob.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.blob.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      const bytes = await fs.readFile(record.contentPath);
      world.observe({
        process: "fs.blob.read",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: record.record.path,
          sizeBytes: record.record.sizeBytes,
          blobRef: record.record.blobRef
        }
      });
      send(res, 200, record.record.mimeType || "application/octet-stream", bytes, {
        "cache-control": "no-store",
        "content-length": String(bytes.length)
      });
    },

    "fs.blob.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.blob.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const bytes = await readBody(req);
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const contentPath = path.join(resolvedDir.directory, "blob");
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      const updatedAt = new Date().toISOString();
      try {
        await fs.mkdir(resolvedDir.directory, { recursive: true });
        await fs.writeFile(contentPath, bytes);
        await fs.writeFile(metaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          updatedAt
        }, null, 2));
      } catch (error) {
        world.emit({
          process: "fs.blob.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage write failed" });
        return;
      }
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.blob.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          mimeType,
          sizeBytes: bytes.length,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.blob.delete": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.blob"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const normalized = normalizeBlobPath(blobPath);
      if (!normalized.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: normalized.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, normalized.status || 400, { error: normalized.reason });
        return;
      }
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: normalized.path });
      if (!record.ok) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: record.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, record.status || 404, { error: record.reason });
        return;
      }
      if (record.record.kind === "folder" && record.record.path === "") {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "cannot delete blob scope root", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: "" } });
        sendJson(res, 409, { error: "cannot delete blob scope root" });
        return;
      }
      const recursive = requestUrl.searchParams.get("recursive") === "true";
      if (record.record.kind === "folder" && !recursive && record.record.childCount > 0) {
        world.emit({ process: "fs.blob.delete.failed", actor: requestActor, claims: [], body: { reason: "blob folder delete requires recursive=true", scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path } });
        sendJson(res, 409, { error: "blob folder delete requires recursive=true" });
        return;
      }
      const targetPath = record.directory || blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, normalized.path).directory;
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
      } catch (error) {
        world.emit({
          process: "fs.blob.delete.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: "blob storage delete failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: normalized.path,
            message: error instanceof Error ? error.message : String(error)
          }
        });
        sendJson(res, 500, { error: "blob storage delete failed" });
        return;
      }
      world.emit({
        process: "fs.blob.delete",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: normalized.path,
          kind: record.record.kind
        }
      });
      sendJson(res, 200, { ok: true, deleted: { scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: normalized.path, kind: record.record.kind } });
    }
  };
}
