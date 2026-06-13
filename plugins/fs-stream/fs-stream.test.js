import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";
import {
  parseStreamFailureLimit,
  streamFileToFile,
  streamReadableToFile
} from "./stream-utils.js";

test("fs-stream plugin owns catalog, routes, manifest, and handler factory", async () => {
  assert.equal(bundleId, "bundle-fs-stream");
  assert.deepEqual(handlerCatalog.authorableHandlers, [
    "fs.stream.read",
    "fs.stream.write",
    "fs.stream.copy"
  ]);
  assert.deepEqual(handlerCatalog.dispatchHandlers, [
    "fs.stream.read",
    "fs.stream.write",
    "fs.stream.copy"
  ]);
  assert.deepEqual(surfaces, []);
  assert.equal(routes.some(route => route.method === "POST" && route.path === "/api/fs/streams/copy" && route.handler === "fs.stream.copy"), true);
  assert.equal(routes.some(route => route.method === "GET" && route.path === "/api/fs/streams/content" && route.handler === "fs.stream.read"), true);
  assert.equal(routes.some(route => route.method === "PUT" && route.path === "/api/fs/streams/content" && route.handler === "fs.stream.write"), true);
  assert.equal(typeof createHandlers, "function");

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dependsOnPlugins, ["plugin.fs-blob"]);
  assert.deepEqual(manifest.activatesBundles, ["bundle-fs-stream"]);
  assert.equal(manifest.runtime.entry, "./runtime.js");
  assert.deepEqual(manifest.contributes.capabilities, [{ id: "fs.stream" }]);
  assert.equal(manifest.contributes.routes.some(route => route.path === "/api/fs/streams/content"), true);
});

test("fs-stream transfer helpers write atomically, copy files, and parse failure limits", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stream-plugin-test-"));
  const source = Readable.from([Buffer.from("hello "), Buffer.from("stream")]);
  const targetPath = path.join(root, "target.bin");

  assert.equal(parseStreamFailureLimit("42"), 42);
  assert.equal(parseStreamFailureLimit("-1"), null);
  assert.equal(parseStreamFailureLimit("nope"), null);

  const written = await streamReadableToFile(source, targetPath);
  assert.equal(written.sizeBytes, 12);
  assert.equal(await fs.readFile(targetPath, "utf8"), "hello stream");

  const copiedPath = path.join(root, "copied.bin");
  const copied = await streamFileToFile(targetPath, copiedPath);
  assert.equal(copied.sizeBytes, 12);
  assert.equal(await fs.readFile(copiedPath, "utf8"), "hello stream");

  await assert.rejects(
    () => streamReadableToFile(Readable.from([Buffer.from("too much")]), path.join(root, "failed.bin"), { failAfterBytes: 3 }),
    /stream failure injected/
  );
  await assert.rejects(() => fs.stat(path.join(root, "failed.bin")));
});

test("fs-stream write handler gates capability and streams to blob storage", async () => {
  const observations = [];
  const responses = [];
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "fs-stream-handler-test-"));
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
    sendJson: (_res, status, body) => {
      responses.push({ status, body });
    },
    readJson: async () => ({}),
    requireBackendCapabilities: capabilities => capabilities.includes("fs.stream")
      ? { ok: true }
      : { ok: false, status: 403, reason: "missing capability", missing: capabilities },
    resolveBlobScope: () => ({ ok: true, scopeKind: "serverRunner", scopeId: "runner-1" }),
    loadBlobRecord: async () => ({ ok: false, status: 404, reason: "not used" }),
    blobStorageDirectoryFor: () => ({
      ok: true,
      path: "docs/report.txt",
      segments: ["docs", "report.txt"],
      directory: path.join(root, "server-runners", "runner-1", "docs", "report.txt")
    }),
    composeBlobFileRecord: async () => ({
      ok: true,
      record: {
        kind: "file",
        path: "docs/report.txt",
        sizeBytes: 11,
        storageKey: "server-runners/runner-1/docs/report.txt",
        blobRef: "blob:serverRunner:runner-1:docs/report.txt"
      }
    }),
    headerValue: value => String(value || ""),
    parseStreamFailureLimit,
    streamReadableToFile,
    streamFileToFile
  });

  await handlers["fs.stream.write"]({
    req: Object.assign(Readable.from([Buffer.from("hello world")]), {
      headers: { "content-type": "text/plain" }
    }),
    res: {},
    requestUrl: new URL("http://127.0.0.1/api/fs/streams/content?serverRunner=runner-1&path=docs/report.txt"),
    requestActor: "adam",
    appContext: { serverRunnerId: "runner-1" }
  });

  assert.equal(responses[0].status, 201);
  assert.equal(responses[0].body.item.path, "docs/report.txt");
  assert.equal(await fs.readFile(path.join(root, "server-runners", "runner-1", "docs", "report.txt", "blob"), "utf8"), "hello world");
  const meta = JSON.parse(await fs.readFile(path.join(root, "server-runners", "runner-1", "docs", "report.txt", "meta.json"), "utf8"));
  assert.equal(meta.mimeType, "text/plain");
  assert.equal(meta.sizeBytes, 11);
  assert.equal(observations.some(event => event.process === "fs.stream.write"), true);
});
