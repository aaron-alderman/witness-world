import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

export function createFsStreamHandlers({
  world,
  backendHost,
  sendJson,
  readJson,
  requireBackendCapabilities,
  resolveBlobScope,
  loadBlobRecord,
  blobStorageDirectoryFor,
  composeBlobFileRecord,
  headerValue,
  parseStreamFailureLimit,
  streamReadableToFile,
  streamFileToFile
}) {
  return {
    "fs.stream.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.observe({ process: "fs.stream.read.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const record = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath });
      if (!record.ok || record.record.kind !== "file") {
        const reason = record.ok ? "blob path is a folder" : record.reason;
        world.observe({ process: "fs.stream.read.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, record.ok ? 409 : (record.status || 404), { error: reason });
        return;
      }
      world.observe({
        process: "fs.stream.read",
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
      res.writeHead(200, {
        "content-type": record.record.mimeType || "application/octet-stream",
        "content-length": String(record.record.sizeBytes),
        "cache-control": "no-store"
      });
      const stream = createReadStream(record.contentPath);
      stream.on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "stream read failed" });
        else res.destroy();
      });
      stream.pipe(res);
    },

    "fs.stream.write": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const blobPath = requestUrl.searchParams.get("path") || "";
      const resolvedDir = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, blobPath);
      if (!resolvedDir.ok) {
        world.emit({ process: "fs.stream.write.failed", actor: requestActor, claims: [], body: { reason: resolvedDir.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, path: blobPath } });
        sendJson(res, resolvedDir.status || 400, { error: resolvedDir.reason });
        return;
      }
      const contentPath = path.join(resolvedDir.directory, "blob");
      const metaPath = path.join(resolvedDir.directory, "meta.json");
      const mimeType = headerValue(req.headers["content-type"]).split(";")[0].trim() || "application/octet-stream";
      const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
      let existed = true;
      try {
        await fs.stat(contentPath);
      } catch {
        existed = false;
      }
      let streamed = null;
      try {
        streamed = await streamReadableToFile(req, contentPath, { failAfterBytes });
      } catch (error) {
        if (!existed) {
          await fs.rm(resolvedDir.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.write.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream write failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            path: resolvedDir.path
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream write failed" });
        return;
      }
      const updatedAt = new Date().toISOString();
      await fs.writeFile(metaPath, JSON.stringify({
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        path: resolvedDir.path,
        mimeType,
        sizeBytes: streamed.sizeBytes,
        updatedAt
      }, null, 2));
      const record = await composeBlobFileRecord({
        appContext,
        scopeKind: scope.scopeKind,
        scopeId: scope.scopeId,
        blobPath: resolvedDir.path,
        metadata: { mimeType, updatedAt }
      });
      world.emit({
        process: "fs.stream.write",
        actor: requestActor,
        claims: [],
        body: {
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: resolvedDir.path,
          sizeBytes: streamed.sizeBytes,
          chunkCount: streamed.chunkCount,
          maxChunkBytes: streamed.maxChunkBytes,
          drainCount: streamed.drainCount,
          writeHighWaterMarkBytes: streamed.writeHighWaterMarkBytes,
          storageKey: record.ok ? record.record.storageKey : null,
          blobRef: record.ok ? record.record.blobRef : null
        }
      });
      sendJson(res, existed ? 200 : 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
    },

    "fs.stream.copy": async ({ req, res, requestUrl, requestActor, appContext }) => {
      const capabilityGate = requireBackendCapabilities(["fs.stream"]);
      if (!capabilityGate.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: capabilityGate.reason, missing: capabilityGate.missing } });
        sendJson(res, capabilityGate.status, { error: capabilityGate.reason, missing: capabilityGate.missing });
        return;
      }
      const scope = resolveBlobScope({ requestActor, requestUrl, appContext });
      if (!scope.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor || backendHost, claims: [], body: { reason: scope.reason } });
        sendJson(res, scope.status || 400, { error: scope.reason });
        return;
      }
      const body = await readJson(req);
      const fromPath = typeof body.fromPath === "string" ? body.fromPath : "";
      const toPath = typeof body.toPath === "string" ? body.toPath : "";
      const source = await loadBlobRecord({ appContext, scopeKind: scope.scopeKind, scopeId: scope.scopeId, blobPath: fromPath });
      if (!source.ok || source.record.kind !== "file") {
        const reason = source.ok ? "source path is a folder" : source.reason;
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, source.ok ? 409 : (source.status || 404), { error: reason });
        return;
      }
      const target = blobStorageDirectoryFor(appContext, scope.scopeKind, scope.scopeId, toPath);
      if (!target.ok) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: target.reason, scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, target.status || 400, { error: target.reason });
        return;
      }
      if (source.record.path === target.path) {
        world.emit({ process: "fs.stream.copy.failed", actor: requestActor, claims: [], body: { reason: "source and target path must differ", scopeKind: scope.scopeKind, scopeId: scope.scopeId, fromPath, toPath } });
        sendJson(res, 409, { error: "source and target path must differ" });
        return;
      }
      const targetContentPath = path.join(target.directory, "blob");
      const targetMetaPath = path.join(target.directory, "meta.json");
      let targetExisted = true;
      try {
        await fs.stat(targetContentPath);
      } catch {
        targetExisted = false;
      }
      try {
        const failAfterBytes = parseStreamFailureLimit(req.headers["x-witness-stream-fail-after-bytes"]);
        const copied = await streamFileToFile(source.contentPath, targetContentPath, { failAfterBytes });
        const updatedAt = new Date().toISOString();
        await fs.writeFile(targetMetaPath, JSON.stringify({
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          path: target.path,
          mimeType: source.record.mimeType,
          sizeBytes: copied.sizeBytes,
          updatedAt
        }, null, 2));
        const record = await composeBlobFileRecord({
          appContext,
          scopeKind: scope.scopeKind,
          scopeId: scope.scopeId,
          blobPath: target.path,
          metadata: { mimeType: source.record.mimeType, updatedAt }
        });
        world.emit({
          process: "fs.stream.copy",
          actor: requestActor,
          claims: [],
          body: {
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath: source.record.path,
            toPath: target.path,
            sizeBytes: copied.sizeBytes,
            chunkCount: copied.chunkCount,
            maxChunkBytes: copied.maxChunkBytes,
            drainCount: copied.drainCount,
            writeHighWaterMarkBytes: copied.writeHighWaterMarkBytes
          }
        });
        sendJson(res, 201, { scopeKind: scope.scopeKind, scopeId: scope.scopeId, item: record.ok ? record.record : null });
      } catch (error) {
        if (!targetExisted) {
          await fs.rm(target.directory, { recursive: true, force: true }).catch(() => {});
        }
        world.emit({
          process: "fs.stream.copy.failed",
          actor: requestActor,
          claims: [],
          body: {
            reason: error instanceof Error ? error.message : "stream copy failed",
            scopeKind: scope.scopeKind,
            scopeId: scope.scopeId,
            fromPath,
            toPath
          }
        });
        sendJson(res, 500, { error: error instanceof Error ? error.message : "stream copy failed" });
      }
    }
  };
}
