import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";
import { createFsBlobIoServices } from "./io-services.js";

function createIoServices({ blobsRoot }) {
  return createFsBlobIoServices({
    blobsRootFor: () => blobsRoot,
    canManageContext: (_actor, contextId) => contextId === "ctx.allowed"
      ? { ok: true, status: 200, reason: null }
      : { ok: false, status: 403, reason: "forbidden context" },
    canMutateTarget: (_actor, target) => target === "runner-1"
      ? { ok: true, status: 200, reason: null }
      : { ok: false, status: 403, reason: "forbidden runner" }
  });
}

test("fs-blob plugin owns catalog, routes, manifest, and handler factory", async () => {
  assert.equal(bundleId, "bundle-fs-blob");
  assert.deepEqual(handlerCatalog.authorableHandlers, [
    "fs.blob.list",
    "fs.blob.meta",
    "fs.blob.read",
    "fs.blob.write",
    "fs.blob.delete"
  ]);
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "fs.blob.list",
    "fs.blob.meta",
    "fs.blob.read",
    "fs.blob.write",
    "fs.blob.delete"
  ]);
  assert.deepEqual(surfaces, []);
  assert.equal(routes.some(route => route.method === "GET" && route.path === "/api/fs/blobs" && route.handler === "fs.blob.list"), true);
  assert.equal(routes.some(route => route.method === "PUT" && route.path === "/api/fs/blobs/content" && route.handler === "fs.blob.write"), true);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.activatesBundles, ["bundle-fs-blob"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.deepEqual(manifest.contributes.capabilities, [{ id: "fs.blob" }]);
  assert.equal(manifest.contributes.routes.some(route => route.path === "/api/fs/blobs"), true);
});

test("fs-blob io services resolve scope and load/list stored blob records", async () => {
  const blobsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "fs-blob-plugin-test-"));
  const services = createIoServices({ blobsRoot });
  const appContext = { runtimeRoot: blobsRoot };
  const recordDir = path.join(blobsRoot, "server-runners", "runner-1", "docs", "report.txt");
  await fs.mkdir(recordDir, { recursive: true });
  await fs.writeFile(path.join(recordDir, "blob"), "hello");
  await fs.writeFile(path.join(recordDir, "meta.json"), JSON.stringify({ mimeType: "text/plain", updatedAt: "2026-06-12T01:02:03.000Z" }));

  const scope = services.resolveBlobScope({
    requestActor: "adam",
    requestUrl: new URL("http://127.0.0.1/api/fs/blobs?serverRunner=current"),
    appContext: { serverRunnerId: "runner-1" }
  });
  assert.deepEqual(scope, { ok: true, scopeKind: "serverRunner", scopeId: "runner-1" });

  assert.deepEqual(services.normalizeBlobPath("docs/report.txt"), {
    ok: true,
    path: "docs/report.txt",
    segments: ["docs", "report.txt"]
  });

  const loaded = await services.loadBlobRecord({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    blobPath: "docs/report.txt"
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.record.kind, "file");
  assert.equal(loaded.record.mimeType, "text/plain");
  assert.equal(loaded.record.contentUrl, "/api/fs/blobs/content?serverRunner=runner-1&path=docs%2Freport.txt");

  const listed = await services.listBlobFolder({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    folderPath: "docs"
  });
  assert.equal(listed.ok, true);
  assert.equal(listed.items.length, 1);
  assert.equal(listed.items[0].path, "docs/report.txt");

  const composed = await services.composeBlobFileRecord({
    appContext,
    scopeKind: "serverRunner",
    scopeId: "runner-1",
    blobPath: "docs/report.txt",
    metadata: { mimeType: "text/plain" }
  });
  assert.equal(composed.ok, true);
  assert.equal(composed.record.storageKey, "server-runners/runner-1/docs/report.txt");
});

test("fs-blob list handler gates capability and emits successful list results", async () => {
  const observations = [];
  const responses = [];
  const handlers = createHandlers({
    world: {
      observe(event) {
        observations.push(event);
      },
      emit(event) {
        observations.push(event);
      }
    },
    backendHost: "backendHost",
    send: () => {
      throw new Error("send should not be called for list");
    },
    sendJson: (_res, status, body) => {
      responses.push({ status, body });
    },
    readBody: async () => Buffer.from(""),
    headerValue: value => String(value || ""),
    requireBackendCapabilities: capabilities => capabilities.includes("fs.blob")
      ? { ok: true }
      : { ok: false, status: 403, reason: "missing capability", missing: capabilities },
    resolveBlobScope: () => ({ ok: true, scopeKind: "serverRunner", scopeId: "runner-1" }),
    listBlobFolder: async () => ({
      ok: true,
      folder: { kind: "folder", scopeKind: "serverRunner", scopeId: "runner-1", path: "docs", name: "docs", childCount: 1 },
      items: [{ kind: "file", path: "docs/report.txt", name: "report.txt" }]
    }),
    loadBlobRecord: async () => ({ ok: false, status: 404, reason: "not used" }),
    blobStorageDirectoryFor: () => ({ ok: false, reason: "not used" }),
    composeBlobFileRecord: async () => ({ ok: false, reason: "not used" }),
    normalizeBlobPath: () => ({ ok: false, reason: "not used" })
  });

  await handlers["fs.blob.list"]({
    res: {},
    requestUrl: new URL("http://127.0.0.1/api/fs/blobs?serverRunner=runner-1&path=docs"),
    requestActor: "adam",
    appContext: { serverRunnerId: "runner-1" }
  });

  assert.equal(responses[0].status, 200);
  assert.equal(responses[0].body.scopeKind, "serverRunner");
  assert.equal(responses[0].body.folder.path, "docs");
  assert.equal(responses[0].body.items[0].path, "docs/report.txt");
  assert.equal(observations.some(event => event.process === "fs.blob.list"), true);
});
