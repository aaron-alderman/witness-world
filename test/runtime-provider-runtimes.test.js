import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import {
  createDbSqlRuntime,
  createInProcessJobQueue,
  createSearchIndexRuntime
} from "../src/runtime-provider-runtimes.js";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(check, { timeoutMs = 1500, intervalMs = 10 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await sleep(intervalMs);
  }
  throw new Error("timed out waiting for condition");
}

test("runtime provider runtimes keep sqlite migration, query, command, and rollback behavior outside host.js", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-provider-db-"));
  const runtime = createDbSqlRuntime({
    runtimeConfig: {
      "db.sql.provider": "sqlite",
      "db.sql.sqlite.path": "db/main.sqlite"
    },
    runtimeRoot,
    serverRunnerId: "runner-1"
  });

  try {
    const inspected = runtime.inspect();
    assert.equal(inspected.ok, true);
    assert.equal(inspected.datasource.provider, "sqlite");
    assert.equal(inspected.datasource.path, path.join(runtimeRoot, "db", "main.sqlite"));

    const migrated = await runtime.migrate({
      migrations: [
        { id: "001_create_items", sql: "create table items (id integer primary key, title text not null)" }
      ]
    });
    assert.deepEqual(migrated.applied, ["001_create_items"]);

    const inserted = await runtime.command({
      sql: "insert into items(title) values (?)",
      params: ["first"]
    });
    assert.equal(inserted.ok, true);
    assert.equal(inserted.changes, 1);

    const rolledBack = await runtime.transaction({
      steps: [
        { kind: "command", sql: "insert into items(title) values (?)", params: ["rolled-back"] },
        { kind: "command", sql: "insert into missing_table(title) values (?)", params: ["boom"] }
      ]
    });
    assert.equal(rolledBack.ok, false);
    assert.match(rolledBack.reason, /missing_table/i);

    const queried = await runtime.query({ sql: "select title from items order by id" });
    assert.equal(queried.ok, true);
    assert.deepEqual(queried.rows.map(row => row.title), ["first"]);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("runtime provider runtimes keep search index state and asset refresh behavior outside host.js", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-provider-search-"));
  const assetsRoot = path.join(runtimeRoot, "assets");
  const searchRoot = path.join(runtimeRoot, "search");
  const assetId = "asset-1";
  const assetDir = path.join(assetsRoot, assetId, "derived");
  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(path.join(assetDir, "text.txt"), "alpha beta", "utf8");

  const assetState = {
    id: assetId,
    title: "Notes",
    mimeType: "text/plain",
    context: "docs",
    textRef: `${assetId}/derived/text.txt`,
    processingUpdatedAt: "2026-06-12T00:00:00.000Z"
  };
  const world = {
    project(projector) {
      if (projector === moduleProjectors.assetIndex) {
        return { byId: { [assetId]: assetState } };
      }
      return { byId: {} };
    }
  };

  const runtime = createSearchIndexRuntime({
    world,
    runtimeConfig: { "search.index.maxTextBytes": 4096 },
    runtimeRoot,
    serverRunnerId: "runner-1",
    storage: { assetsRoot, searchRoot }
  });

  try {
    const built = await runtime.build({
      documents: [{ id: "doc-1", title: "Gamma", text: "gamma plan" }],
      assetIds: [assetId]
    });
    assert.equal(built.ok, true);
    assert.equal(built.index.assetCount, 1);
    assert.equal(built.index.documentCount, 2);

    const firstQuery = await runtime.query({ q: "alpha" });
    assert.equal(firstQuery.ok, true);
    assert.equal(firstQuery.hits.length, 1);
    assert.equal(firstQuery.hits[0].assetId, assetId);

    assetState.processingUpdatedAt = "2099-01-01T00:00:00.000Z";
    await fs.writeFile(path.join(assetDir, "text.txt"), "delta beta", "utf8");

    const refreshed = await runtime.refreshAsset(assetId);
    assert.equal(refreshed.ok, true);
    assert.equal(refreshed.changed, true);
    assert.equal(refreshed.disposition, "reindexed");

    const refreshedQuery = await runtime.query({ q: "delta" });
    assert.equal(refreshedQuery.ok, true);
    assert.equal(refreshedQuery.hits.length, 1);
    assert.equal(refreshedQuery.hits[0].assetId, assetId);

    const repaired = await runtime.inspectAsset(assetId);
    assert.equal(repaired.ok, true);
    assert.equal(repaired.indexed, true);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("runtime provider runtimes keep in-process queue retry and idempotency behavior outside host.js", async () => {
  const emitted = [];
  const world = {
    emit(entry) {
      const witness = { id: `w${emitted.length + 1}`, ...entry };
      emitted.push(witness);
      return witness;
    },
    allWitnesses() {
      return emitted;
    }
  };

  let attempts = 0;
  const queue = createInProcessJobQueue({
    world,
    serverRunnerId: "runner-1",
    runtimeConfig: {
      "jobs.queue.pollMs": 5,
      "jobs.queue.retryDelayMs": 10,
      "jobs.queue.maxAttempts": 3
    },
    jobHandlers: {
      "demo.failOnce": async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("retry me once");
      }
    },
    getAppContext: () => ({ ok: true })
  });

  try {
    const first = queue.enqueue({
      actor: "adam",
      handler: "demo.failOnce",
      idempotencyKey: "job:1"
    });
    assert.equal(first.ok, true);
    assert.equal(first.created, true);

    const duplicate = queue.enqueue({
      actor: "adam",
      handler: "demo.failOnce",
      idempotencyKey: "job:1"
    });
    assert.equal(duplicate.ok, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.job.id, first.job.id);

    const job = await waitFor(() => {
      const current = queue.get(first.job.id);
      return current?.status === "succeeded" ? current : null;
    });

    assert.equal(job.attempt, 2);
    assert.equal(emitted.filter(entry => entry.process === "jobs.queue.start" && entry.body?.id === job.id).length, 2);
    assert.equal(emitted.filter(entry => entry.process === "jobs.queue.retry" && entry.body?.id === job.id).length, 1);
    assert.equal(emitted.some(entry => entry.process === "jobs.queue.succeeded" && entry.body?.id === job.id), true);
  } finally {
    queue.close();
  }
});
