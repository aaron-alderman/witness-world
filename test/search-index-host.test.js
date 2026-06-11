import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "../src/host.js";
import { applyWitnessToml } from "../src/dsl.js";

const asAdam = { "x-witness-actor": "adam", "content-type": "application/json" };

async function startSearchServer(extra = "", runtimeConfig = `"search.index.maxTextBytes" = 4096`) {
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

test("search.index reindexes asset-backed text after stored asset bytes change", async () => {
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
    const assetPath = path.join(diagnostics.storage.assetsRoot, encodeURIComponent(uploadedBody.asset.id), "blob");
    await fs.writeFile(assetPath, "beta keyword only", "utf8");

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
