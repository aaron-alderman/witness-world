import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";
import { moduleProjectors } from "../src/modules.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 2000, intervalMs = 15 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

async function startSearchServer(extra = "", runtimeConfig = `"search.index.maxTextBytes" = 4096, "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`) {
  const world = createWorld();
  declareBackendHost(world, { actor: "adam", id: "backendHost" });
  declareFrontendHost(world, { actor: "adam", id: "frontendHost" });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "world-search-index-"));
  const searchRoot = path.join(tempRoot, "search").replace(/\\/g, "/");
  const assetsRoot = path.join(tempRoot, "assets").replace(/\\/g, "/");
  applyWitnessToml(world, `
[[serverRunner]]
actor = "adam"
id = "search_server"
backendHost = "backendHost"
frontendHost = "frontendHost"
handlerSet = "demo"
allowActorHeader = true
storage = { searchRoot = "${searchRoot}", assetsRoot = "${assetsRoot}" }
runtimeConfig = { ${runtimeConfig} }
${extra}
`);
  const server = await startServer(world, {
    actor: "adam",
    serverRunnerId: "search_server"
  });
  return { world, server, tempRoot };
}

function inspectIndex(server, headers = { "x-witness-actor": "adam" }) {
  return fetch(`${server.url}/api/search/index`, { headers });
}

function buildIndex(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/search/index/build`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function reindex(server, headers = asAdam) {
  return fetch(`${server.url}/api/search/index/reindex`, {
    method: "POST",
    headers,
    body: JSON.stringify({})
  });
}

function queryIndex(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/search/index/query`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function enqueueJob(server, body, headers = asAdam) {
  return fetch(`${server.url}/api/jobs`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function uploadAsset(server, { perspective, actor = "aaron", name, contentType, body }) {
  return fetch(`${server.url}/api/assets?perspective=${encodeURIComponent(perspective)}`, {
    method: "POST",
    headers: {
      "x-witness-actor": actor,
      "x-witness-file-name": name,
      "content-type": contentType
    },
    body
  });
}

function retryAssetIngest(server, assetId, actor = "aaron") {
  return fetch(`${server.url}/api/assets/${encodeURIComponent(assetId)}/ingest/retry`, {
    method: "POST",
    headers: { "x-witness-actor": actor }
  });
}

function reindexAssetSearch(server, assetId, actor = "adam") {
  return fetch(`${server.url}/api/assets/${encodeURIComponent(assetId)}/search/reindex`, {
    method: "POST",
    headers: { "x-witness-actor": actor }
  });
}

function buildPdfBytes(text) {
  const content = Buffer.from(`BT\n/F1 24 Tf\n72 72 Td\n(${text}) Tj\nET\n`, "utf8");
  const compressed = deflateSync(content);
  const header = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${compressed.length} /Filter /FlateDecode >>
stream
`, "latin1");
  const footer = Buffer.from(`
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
`, "latin1");
  return Buffer.concat([header, compressed, footer]);
}

test("search.index builds from explicit documents, answers queries, and exposes diagnostics", async () => {
  const { world, server } = await startSearchServer();
  try {
    const built = await buildIndex(server, {
      documents: [
        { id: "doc-1", title: "Alpha Plan", text: "alpha beta roadmap" },
        { id: "doc-2", title: "Banana Notes", text: "banana split beta" }
      ]
    });
    assert.equal(built.status, 200);
    const builtBody = await built.json();
    assert.equal(builtBody.index.documentCount, 2);
    assert.equal(builtBody.index.sourceCount, 2);

    const inspected = await inspectIndex(server);
    assert.equal(inspected.status, 200);
    const inspectedBody = await inspected.json();
    assert.equal(inspectedBody.index.status, "ready");
    assert.equal(inspectedBody.index.documentCount, 2);

    const queried = await queryIndex(server, { q: "banana", limit: 5 });
    assert.equal(queried.status, 200);
    const queriedBody = await queried.json();
    assert.equal(queriedBody.hits.length, 1);
    assert.equal(queriedBody.hits[0].id, "doc-2");
    assert.match(queriedBody.hits[0].snippet.toLowerCase(), /banana/);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.search.indexCount, 1);
    assert.equal(diagnosticsBody.search.queryCount, 1);
    assert.equal(diagnosticsBody.failures.searchIndexFailed.length, 0);

    assert(world.allWitnesses().some(witness => witness.process === "search.index.build"));
    assert(world.allWitnesses().some(witness => witness.process === "search.index.query"));
  } finally {
    await server.close();
  }
});

test("search.index reindexes asset-backed text after derived ingestion output changes", async () => {
  const { world, server } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "note.txt",
      contentType: "text/plain",
      body: "alpha keyword only"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    const built = await buildIndex(server, {
      assetIds: [uploadedBody.asset.id]
    });
    assert.equal(built.status, 200);
    assert.equal((await built.json()).index.assetCount, 1);

    const alphaQuery = await queryIndex(server, { q: "alpha" });
    assert.equal(alphaQuery.status, 200);
    const alphaBody = await alphaQuery.json();
    assert.equal(alphaBody.hits.length, 1);
    assert.equal(alphaBody.hits[0].assetId, uploadedBody.asset.id);
    assert.equal(alphaBody.hits[0].contentUrl, uploadedBody.asset.contentUrl);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    const derivedPath = path.join(diagnostics.storage.assetsRoot, encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    await fs.writeFile(derivedPath, "beta keyword only", "utf8");

    const staleQuery = await queryIndex(server, { q: "beta" });
    assert.equal(staleQuery.status, 200);
    assert.equal((await staleQuery.json()).hits.length, 0);

    const rebuilt = await reindex(server);
    assert.equal(rebuilt.status, 200);
    const rebuiltBody = await rebuilt.json();
    assert.equal(rebuiltBody.index.assetCount, 1);

    const betaQuery = await queryIndex(server, { q: "beta" });
    assert.equal(betaQuery.status, 200);
    const betaBody = await betaQuery.json();
    assert.equal(betaBody.hits.length, 1);
    assert.equal(betaBody.hits[0].assetId, uploadedBody.asset.id);

    const alphaAfterReindex = await queryIndex(server, { q: "alpha" });
    assert.equal(alphaAfterReindex.status, 200);
    assert.equal((await alphaAfterReindex.json()).hits.length, 0);

    assert(world.allWitnesses().some(witness => witness.process === "search.index.reindex"));
  } finally {
    await server.close();
  }
});

test("asset upload queues ingestion and projects derived text processing state", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "brief.txt",
      contentType: "text/plain",
      body: "alpha beta gamma"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();
    assert.equal(uploadedBody.processing.status, "queued");
    assert.equal(typeof uploadedBody.processing.jobId, "string");

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textStatus, "extracted");
    assert.equal(asset.searchStatus, "not-built");
    assert.equal(typeof asset.textRef, "string");
    const derivedTextPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    assert.equal(await fs.readFile(derivedTextPath, "utf8"), "alpha beta gamma");
    assert(world.allWitnesses().some(witness => witness.process === "asset.ingest.enqueue" && witness.body?.id === uploadedBody.asset.id));
    assert(world.allWitnesses().some(witness => witness.process === "asset.ingest.succeeded" && witness.body?.id === uploadedBody.asset.id));
  } finally {
    await server.close();
  }
});

test("asset ingestion uses structured extraction for json assets", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "launch.json",
      contentType: "application/json",
      body: JSON.stringify({ title: "Launch Plan", tags: ["alpha", "beta"], meta: { owner: "aaron" } })
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "json");
    const derivedTextPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    const derived = await fs.readFile(derivedTextPath, "utf8");
    assert.match(derived, /title Launch Plan/);
    assert.match(derived, /tags\.0 alpha/);
    assert.match(derived, /meta\.owner aaron/);
  } finally {
    await server.close();
  }
});

test("asset ingestion uses extension-aware structured extraction for yaml assets", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "deploy.yaml",
      contentType: "text/plain",
      body: `service:
  name: launch-api
  env:
    region: ap-southeast-2
features:
  - uploads
  - search
`
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "yaml");
    assert.equal(asset.derivedMetadata?.kind, "yaml");
    assert.equal(asset.derivedMetadata?.topLevelKeyCount, 2);
    assert.deepEqual(asset.derivedMetadata?.topLevelKeys, ["service", "features"]);
    assert.equal(asset.derivedMetadata?.listCount, 2);

    const derivedTextPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    const derived = await fs.readFile(derivedTextPath, "utf8");
    assert.match(derived, /service\.name launch-api/);
    assert.match(derived, /service\.env\.region ap-southeast-2/);
    assert.match(derived, /features uploads/);
  } finally {
    await server.close();
  }
});

test("asset ingestion uses extension-aware structured extraction for toml assets", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "runtime.toml",
      contentType: "application/octet-stream",
      body: `title = "Launch Runtime"
mode = "dev"

[server]
port = 8787
host = "127.0.0.1"

[[workers]]
name = "ingest"
`
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "toml");
    assert.equal(asset.derivedMetadata?.kind, "toml");
    assert.equal(asset.derivedMetadata?.topLevelKeyCount, 2);
    assert.deepEqual(asset.derivedMetadata?.topLevelKeys, ["title", "mode"]);
    assert.equal(asset.derivedMetadata?.sectionCount, 2);
    assert.deepEqual(asset.derivedMetadata?.sections, ["server", "workers"]);
    assert.equal(asset.derivedMetadata?.arrayTableCount, 1);

    const derivedTextPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    const derived = await fs.readFile(derivedTextPath, "utf8");
    assert.match(derived, /title Launch Runtime/);
    assert.match(derived, /server\.port 8787/);
    assert.match(derived, /workers\.name ingest/);
  } finally {
    await server.close();
  }
});

test("asset ingestion extracts searchable text from pdf assets", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "brief.pdf",
      contentType: "application/pdf",
      body: buildPdfBytes("Launch PDF Alpha")
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    const asset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    assert.equal(asset.textExtractor, "pdf");
    assert.equal(asset.textStatus, "extracted");
    const derivedTextPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt");
    const derived = await fs.readFile(derivedTextPath, "utf8");
    assert.match(derived, /Launch PDF Alpha/);

    const built = await buildIndex(server, {
      assetIds: [uploadedBody.asset.id]
    });
    assert.equal(built.status, 200);

    const queried = await queryIndex(server, { q: "launch alpha" });
    assert.equal(queried.status, 200);
    const queryBody = await queried.json();
    assert.equal(queryBody.hits.length, 1);
    assert.equal(queryBody.hits[0].assetId, uploadedBody.asset.id);
  } finally {
    await server.close();
  }
});

test("queued asset ingestion reindexes an indexed asset after the stored file changes", async () => {
  const { world, server } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "note.txt",
      contentType: "text/plain",
      body: "alpha keyword only"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    const built = await buildIndex(server, {
      assetIds: [uploadedBody.asset.id]
    });
    assert.equal(built.status, 200);

    const alphaQuery = await queryIndex(server, { q: "alpha" });
    assert.equal(alphaQuery.status, 200);
    assert.equal((await alphaQuery.json()).hits.length, 1);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    const assetPath = path.join(diagnostics.storage.assetsRoot, encodeURIComponent(uploadedBody.asset.id), "blob");
    await fs.writeFile(assetPath, "beta keyword only", "utf8");

    const queued = await enqueueJob(server, {
      handler: "asset.ingest.process",
      payload: { assetId: uploadedBody.asset.id }
    });
    assert.equal(queued.status, 201);
    const queuedBody = await queued.json();

    await waitFor(async () => {
      const response = await fetch(`${server.url}/api/jobs/${encodeURIComponent(queuedBody.job.id)}`, { headers: { "x-witness-actor": "adam" } });
      const body = await response.json();
      return body.job?.status === "succeeded" ? body.job : null;
    });

    const betaQuery = await queryIndex(server, { q: "beta" });
    assert.equal(betaQuery.status, 200);
    const betaBody = await betaQuery.json();
    assert.equal(betaBody.hits.length, 1);
    assert.equal(betaBody.hits[0].assetId, uploadedBody.asset.id);

    const alphaAfterReindex = await queryIndex(server, { q: "alpha" });
    assert.equal(alphaAfterReindex.status, 200);
    assert.equal((await alphaAfterReindex.json()).hits.length, 0);

    const asset = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id];
    assert.equal(asset.searchStatus, "reindexed");
    assert(world.allWitnesses().some(witness => witness.process === "search.index.reindex"));
  } finally {
    await server.close();
  }
});

test("asset ingestion honors manual search refresh policy", async () => {
  const { world, server } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`, `"search.index.maxTextBytes" = 4096, "search.index.assetRefreshPolicy" = "manual", "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "note.txt",
      contentType: "text/plain",
      body: "alpha keyword only"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    const built = await buildIndex(server, {
      assetIds: [uploadedBody.asset.id]
    });
    assert.equal(built.status, 200);

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    const assetPath = path.join(diagnostics.storage.assetsRoot, encodeURIComponent(uploadedBody.asset.id), "blob");
    await fs.writeFile(assetPath, "beta keyword only", "utf8");

    const queued = await enqueueJob(server, {
      handler: "asset.ingest.process",
      payload: { assetId: uploadedBody.asset.id }
    });
    assert.equal(queued.status, 201);
    const queuedBody = await queued.json();
    await waitFor(async () => {
      const response = await fetch(`${server.url}/api/jobs/${encodeURIComponent(queuedBody.job.id)}`, { headers: { "x-witness-actor": "adam" } });
      const body = await response.json();
      return body.job?.status === "succeeded" ? body.job : null;
    });

    const betaQuery = await queryIndex(server, { q: "beta" });
    assert.equal(betaQuery.status, 200);
    assert.equal((await betaQuery.json()).hits.length, 0);

    const asset = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id];
    assert.equal(asset.searchStatus, "manual");
    assert.equal(asset.searchPolicy, "manual");
  } finally {
    await server.close();
  }
});

test("asset ingest retry requeues a dead-letter asset and clears the repair queue once it succeeds", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`, `"search.index.maxTextBytes" = 4096, "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 1`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "retry-note.txt",
      contentType: "text/plain",
      body: "alpha keyword only"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    const assetPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "blob");
    await fs.rm(assetPath, { force: true });

    const failedRetry = await retryAssetIngest(server, uploadedBody.asset.id);
    assert.equal(failedRetry.status, 201);

    const failedAsset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "dead-letter" ? row : null;
    }, { timeoutMs: 4000 });
    assert.match(failedAsset.processingError || "", /no such file|ENOENT|asset/i);

    const diagnosticsBefore = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    assert.equal(diagnosticsBefore.assets.ingestRetryableCount, 1);
    assert.equal(diagnosticsBefore.repairs.ingestRetryable[0].id, uploadedBody.asset.id);

    await fs.writeFile(assetPath, "restored beta keyword", "utf8");

    const retried = await retryAssetIngest(server, uploadedBody.asset.id);
    assert.equal(retried.status, 201);
    const retriedBody = await retried.json();
    assert.equal(retriedBody.job.handler, "asset.ingest.process");

    const recoveredAsset = await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" && row?.textStatus === "extracted" ? row : null;
    }, { timeoutMs: 4000 });
    assert.equal(recoveredAsset.processingError, null);
    assert.equal(await fs.readFile(path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "derived", "text.txt"), "utf8"), "restored beta keyword");

    const diagnosticsAfter = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    assert.equal(diagnosticsAfter.assets.ingestRetryableCount, 0);

    assert(world.allWitnesses().some(witness => witness.process === "asset.ingest.retry" && witness.body?.id === uploadedBody.asset.id));
    assert(world.allWitnesses().some(witness => witness.process === "jobs.queue.deadLetter" && witness.body?.handler === "asset.ingest.process"));
  } finally {
    await server.close();
  }
});

test("asset search reindex repairs a stale indexed asset and surfaces the operator action on backend seams", async () => {
  const { world, server, tempRoot } = await startSearchServer(`
[[context]]
actor = "aaron"
id = "ctx.docs"
label = "Docs"

[[perspective]]
actor = "aaron"
id = "docs.board"
title = "Docs Board"
context = "ctx.docs"
`, `"search.index.maxTextBytes" = 4096, "search.index.assetRefreshPolicy" = "manual", "jobs.queue.pollMs" = 10, "jobs.queue.retryDelayMs" = 20, "jobs.queue.maxAttempts" = 3`);
  try {
    const uploaded = await uploadAsset(server, {
      perspective: "docs.board",
      name: "manual-note.txt",
      contentType: "text/plain",
      body: "alpha keyword only"
    });
    assert.equal(uploaded.status, 201);
    const uploadedBody = await uploaded.json();

    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" ? row : null;
    });

    const built = await buildIndex(server, { assetIds: [uploadedBody.asset.id] });
    assert.equal(built.status, 200);

    const assetPath = path.join(tempRoot, "assets", encodeURIComponent(uploadedBody.asset.id), "blob");
    await fs.writeFile(assetPath, "beta keyword only", "utf8");

    const retried = await retryAssetIngest(server, uploadedBody.asset.id);
    assert.equal(retried.status, 201);
    await waitFor(() => {
      const row = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id] ?? null;
      return row?.processingStatus === "succeeded" && row?.searchStatus === "manual" ? row : null;
    }, { timeoutMs: 4000 });

    const staleQuery = await queryIndex(server, { q: "beta" });
    assert.equal(staleQuery.status, 200);
    assert.equal((await staleQuery.json()).hits.length, 0);

    const diagnosticsBefore = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    assert.equal(diagnosticsBefore.assets.searchRefreshableCount, 1);
    assert.equal(diagnosticsBefore.repairs.searchRefreshable[0].id, uploadedBody.asset.id);
    assert.match(diagnosticsBefore.repairs.searchRefreshable[0].reindexUrl, /\/api\/assets\/.*\/search\/reindex$/);

    const backendPage = await fetch(`${server.url}/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(backendPage.status, 200);
    const backendHtml = await backendPage.text();
    assert.match(backendHtml, /Refresh asset search/);
    assert.match(backendHtml, new RegExp(`/api/assets/${encodeURIComponent(uploadedBody.asset.id)}/search/reindex`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const repaired = await reindexAssetSearch(server, uploadedBody.asset.id);
    assert.equal(repaired.status, 200);
    const repairedBody = await repaired.json();
    assert.equal(repairedBody.asset.searchStatus, "reindexed");

    const betaQuery = await queryIndex(server, { q: "beta" });
    assert.equal(betaQuery.status, 200);
    const betaBody = await betaQuery.json();
    assert.equal(betaBody.hits.length, 1);
    assert.equal(betaBody.hits[0].assetId, uploadedBody.asset.id);

    const asset = world.project(moduleProjectors.assetIndex).byId[uploadedBody.asset.id];
    assert.equal(asset.searchStatus, "reindexed");
    assert.equal(asset.searchError, null);

    const diagnosticsAfter = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } }).then(response => response.json());
    assert.equal(diagnosticsAfter.assets.searchRefreshableCount, 0);

    assert(world.allWitnesses().some(witness => witness.process === "asset.search.reindex" && witness.body?.id === uploadedBody.asset.id));
    assert(world.allWitnesses().some(witness => witness.process === "search.index.reindex"));
  } finally {
    await server.close();
  }
});

test("search.index query fails clearly before any index is built and surfaces diagnostics", async () => {
  const { world, server } = await startSearchServer();
  try {
    const queried = await queryIndex(server, { q: "missing" });
    assert.equal(queried.status, 404);
    assert.equal((await queried.json()).error, "search index not built");

    const diagnostics = await fetch(`${server.url}/api/backend-seams`, { headers: { "x-witness-actor": "adam" } });
    assert.equal(diagnostics.status, 200);
    const diagnosticsBody = await diagnostics.json();
    assert.equal(diagnosticsBody.failures.searchIndexFailed.length, 1);
    assert.equal(diagnosticsBody.failures.searchIndexFailed[0].body.reason, "search index not built");

    assert(world.allWitnesses().some(witness => witness.process === "search.index.query.failed" && witness.body?.reason === "search index not built"));
  } finally {
    await server.close();
  }
});
