import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { moduleProjectors } from "../src/modules.js";
import {
  createDbSqlRuntime,
} from "../plugins/sql/provider-runtime.js";
import { createInProcessJobQueue } from "../plugins/jobs/provider-runtime.js";
import { jobs, jobIndex } from "../plugins/jobs/projections.js";
import { createSearchIndexRuntime } from "../plugins/search/provider-runtime.js";

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

test("runtime provider runtimes require witness-core sqlite capability and fail closed outside host.js", async () => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "runtime-provider-db-"));
  const datasources = [{
    id: "sqlite.main",
    serverRunner: "runner-1",
    provider: "sqlite",
    datasourceName: "main",
    path: "db/main.sqlite",
    migrationTable: "witness_sql_migrations"
  }];
  const datasourceIndex = {
    rows: datasources,
    byId: { "sqlite.main": datasources[0] }
  };
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) return datasources;
      if (projector === moduleProjectors.sqlDatasourceIndex) return datasourceIndex;
      return [];
    },
    runtimeRoot,
    serverRunnerId: "runner-1",
    getAppContext: () => ({ secretStore: null })
  });

  try {
    const listed = runtime.listDatasources();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].provider, "sqlite");
    assert.equal(listed[0].adapterStatus, "witness-core-required");
    assert.equal(listed[0].boundaryOwner, "witness-core");
    assert.equal(listed[0].boundaryAuthority, "rust-owned");
    assert.equal(listed[0].boundaryTransport, "capability.db.sqlite");
    assert.equal(listed[0].boundaryScope, "canonical-runtime");
    assert.equal(listed[0].canonicalBoundary, true);
    assert.equal(listed[0].boundaryFallbackAllowed, false);

    const migrated = await runtime.migrate({
      datasourceId: "sqlite.main",
      migrations: [
        { id: "001_create_items", sql: "create table items (id integer primary key, title text not null)" }
      ]
    });
    assert.equal(migrated.ok, false);
    assert.equal(migrated.status, 503);
    assert.match(migrated.reason, /witness-core sqlite capability required/i);

    const inserted = await runtime.command({
      datasourceId: "sqlite.main",
      sql: "insert into items(title) values (?)",
      params: ["first"]
    });
    assert.equal(inserted.ok, false);
    assert.equal(inserted.status, 503);
    assert.match(inserted.reason, /witness-core sqlite capability required/i);

    const rolledBack = await runtime.transaction({
      datasourceId: "sqlite.main",
      steps: [
        { kind: "command", sql: "insert into items(title) values (?)", params: ["rolled-back"] },
        { kind: "command", sql: "insert into missing_table(title) values (?)", params: ["boom"] }
      ]
    });
    assert.equal(rolledBack.ok, false);
    assert.equal(rolledBack.status, 503);
    assert.match(rolledBack.reason, /witness-core sqlite capability required/i);

    const queried = await runtime.query({ datasourceId: "sqlite.main", sql: "select title from items order by id" });
    assert.equal(queried.ok, false);
    assert.equal(queried.status, 503);
    assert.match(queried.reason, /witness-core sqlite capability required/i);
  } finally {
    runtime.close();
    await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
  }
});

test("runtime provider runtimes resolve postgres credentials through secret.store and keep datasource selection explicit", async () => {
  const seenConfigs = [];
  const runtime = createDbSqlRuntime({
    project(projector) {
      if (projector === moduleProjectors.sqlDatasources) {
        return [{
          id: "pg.main",
          serverRunner: "runner-1",
          provider: "postgres",
          datasourceName: "main",
          host: "127.0.0.1",
          port: 5432,
          database: "engentus",
          user: "pipeline_user",
          passwordSecretId: "secret.pg",
          ssl: true
        }];
      }
      if (projector === moduleProjectors.sqlDatasourceIndex) {
        return {
          rows: [{
            id: "pg.main",
            serverRunner: "runner-1",
            provider: "postgres",
            datasourceName: "main",
            host: "127.0.0.1",
            port: 5432,
            database: "engentus",
            user: "pipeline_user",
            passwordSecretId: "secret.pg",
            ssl: true
          }],
          byId: {
            "pg.main": {
              id: "pg.main",
              serverRunner: "runner-1",
              provider: "postgres",
              datasourceName: "main",
              host: "127.0.0.1",
              port: 5432,
              database: "engentus",
              user: "pipeline_user",
              passwordSecretId: "secret.pg",
              ssl: true
            }
          }
        };
      }
      return [];
    },
    runtimeRoot: process.cwd(),
    serverRunnerId: "runner-1",
    getAppContext: () => ({
      secretStore: {
        resolveSecretValue(secretId) {
          return Promise.resolve(secretId === "secret.pg"
            ? { ok: true, value: "super-secret" }
            : { ok: false, status: 404, reason: "secret not found" });
        }
      }
    }),
    postgresAdapter: {
      Client: class {
        constructor(config) {
          seenConfigs.push(config);
        }
        async connect() {}
        async query(sql) {
          assert.equal(sql, "select 1 as ok");
        }
        async end() {}
      }
    }
  });

  try {
    const tested = await runtime.testConnection({ datasourceId: "pg.main" });
    assert.equal(tested.ok, true);
    assert.equal(seenConfigs.length, 1);
    assert.equal(seenConfigs[0].password, "super-secret");
    assert.deepEqual(seenConfigs[0].ssl, { rejectUnauthorized: false });

    const missing = await runtime.testConnection({ datasourceId: "missing" });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 404);
  } finally {
    runtime.close();
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
    project(projector) {
      if (projector === moduleProjectors.jobs) return jobs(emitted);
      if (projector === moduleProjectors.jobIndex) return jobIndex(emitted);
      return [];
    },
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
