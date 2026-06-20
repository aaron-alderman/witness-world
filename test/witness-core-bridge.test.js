import test from "node:test";
import assert from "node:assert/strict";

import {
  createWitnessCoreBridge,
  createWitnessCoreStatusStore,
  latestWitnessCoreGeneration,
  latestWitnessCoreState,
  normalizeWitnessCoreUrl,
  previewGenerationContentHash
} from "../src/witness-core-bridge.js";

test("normalizeWitnessCoreUrl trims and removes trailing slash", () => {
  assert.equal(normalizeWitnessCoreUrl(" http://127.0.0.1:8788/ "), "http://127.0.0.1:8788");
  assert.equal(normalizeWitnessCoreUrl(""), "");
  assert.equal(normalizeWitnessCoreUrl(null), "");
});

test("previewGenerationContentHash is stable across object key order", () => {
  const left = previewGenerationContentHash({
    sessionId: "preview-1",
    baseAppRevision: 3,
    previewRevision: 4,
    overlaySources: new Map([
      ["b.rvm", "beta"],
      ["a.rvm", "alpha"]
    ]),
    candidates: [{ z: 1, a: 2 }]
  });
  const right = previewGenerationContentHash({
    sessionId: "preview-1",
    baseAppRevision: 3,
    previewRevision: 4,
    overlaySources: new Map([
      ["a.rvm", "alpha"],
      ["b.rvm", "beta"]
    ]),
    candidates: [{ a: 2, z: 1 }]
  });
  assert.equal(left, right);
});

test("createWitnessCoreStatusStore merges generation and health process state", async () => {
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url);
    if (String(url).endsWith("/generations")) {
      return {
        ok: true,
        async json() {
          return {
            aliases: {
              current_stable: "gen_stable",
              current_green_local: "gen_green",
              last_good: "gen_stable"
            },
            generations: [
              { id: "gen_stable", state: "stable" },
              { id: "gen_green", state: "green_local" }
            ]
          };
        }
      };
    }
    if (String(url).endsWith("/serving")) {
      return {
        ok: true,
        async json() {
          return {
            requestedMode: "stable",
            effectiveMode: "stable",
            reason: "requested-stable",
            updatedAt: "now",
            currentStable: "gen_stable",
            currentGreenLocal: "gen_green",
            lastGood: "gen_stable",
            latestGenerationId: "gen_green",
            latestGenerationState: "green_local"
          };
        }
      };
    }
    if (String(url).endsWith("/health")) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            service: "witness-core",
            process: {
              command: "node src/cli.js utility-serve examples/engentus --server engentus_server --port {runtime_port} --runtime-profile full --startup-telemetry",
              workingDir: ".",
              running: true,
              pid: 4242,
              restartCount: 1
            },
            soak: {
              currentSession: null,
              lastSession: {
                id: "soak-1",
                status: "completed",
                sampleCount: 6
              }
            }
          };
        }
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const store = createWitnessCoreStatusStore({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl,
    pollMs: 60_000
  });
  assert.ok(store);
  const status = await store.refresh();
  store.close();

  assert.deepEqual(requests, [
    "http://127.0.0.1:8788/generations",
    "http://127.0.0.1:8788/health",
    "http://127.0.0.1:8788/serving",
    "http://127.0.0.1:8788/events"
  ]);
  assert.equal(latestWitnessCoreGeneration(status)?.id, "gen_green");
  assert.equal(latestWitnessCoreState(status), "green_local");
  assert.equal(store.getLatestState(), "green_local");
  assert.equal(store.getProcessState()?.pid, 4242);
  assert.equal(status?.process?.running, true);
  assert.equal(status?.serving?.effectiveMode, "stable");
  assert.equal(status?.serving?.reason, "requested-stable");
  assert.equal(status?.soak?.lastSession?.id, "soak-1");
  assert.equal(status?.service, "witness-core");
  assert.equal(status?.ok, true);
});

test("createWitnessCoreStatusStore consumes witness-core SSE events and publishes subscriptions", async () => {
  const requests = [];
  const encoder = new TextEncoder();
  let generationReads = 0;
  const fetchImpl = async url => {
    requests.push(String(url));
    if (String(url).endsWith("/events")) {
      return {
        ok: true,
        body: new ReadableStream({
          start(controller) {
            setTimeout(() => {
              controller.enqueue(encoder.encode("event: core.connected\ndata: {\"ok\":true}\n\n"));
              controller.enqueue(encoder.encode("event: generation.green_local\ndata: {\"kind\":\"generation.green_local\",\"generationId\":\"gen_live_2\",\"generation\":{\"id\":\"gen_live_2\",\"state\":\"green_local\",\"sourcePaths\":[\"app/content.wtoml\"]}}\n\n"));
              controller.close();
            }, 5);
          }
        })
      };
    }
    if (String(url).endsWith("/generations")) {
      generationReads += 1;
      return {
        ok: true,
        async json() {
          return {
            aliases: {
              current_stable: null,
              current_green_local: generationReads > 1 ? "gen_live_2" : "gen_live_1",
              last_good: null
            },
            generations: [
              generationReads > 1
                ? { id: "gen_live_2", state: "green_local", sourcePaths: ["app/content.wtoml"] }
                : { id: "gen_live_1", state: "green_local", sourcePaths: ["app/previous.wtoml"] }
            ]
          };
        }
      };
    }
    if (String(url).endsWith("/serving")) {
      return {
        ok: true,
        async json() {
          return {
            requestedMode: "live",
            effectiveMode: "live",
            reason: "latest-green-local",
            updatedAt: "now",
            currentStable: null,
            currentGreenLocal: "gen_live_2",
            lastGood: null,
            latestGenerationId: "gen_live_2",
            latestGenerationState: "green_local"
          };
        }
      };
    }
    if (String(url).endsWith("/health")) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            service: "witness-core",
            process: {
              running: true,
              pid: 4242
            }
          };
        }
      };
    }
    throw new Error(`unexpected url ${url}`);
  };

  const store = createWitnessCoreStatusStore({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl,
    pollMs: 60_000
  });
  assert.ok(store);
  const seen = [];
  const unsubscribe = store.subscribe(event => {
    seen.push(event);
  });

  await new Promise(resolve => setTimeout(resolve, 50));
  unsubscribe();
  store.close();

  assert.equal(seen.some(event => event?.kind === "core.connected"), true);
  assert.equal(seen.some(event => event?.kind === "generation.green_local"), true);
  assert.equal(store.getLatestState(), "green_local");
  assert.equal(latestWitnessCoreGeneration(store.getStatus())?.id, "gen_live_2");
  assert.equal(requests.includes("http://127.0.0.1:8788/events"), true);
});

test("createWitnessCoreBridge source capability helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).includes("/list")) {
          return {
            path: "plugins",
            exists: true,
            entries: [{ name: "inspect", isFile: false, isDirectory: true }]
          };
        }
        if (String(url).includes("/stat")) {
          return {
            path: "app/content.wtoml",
            exists: true,
            isFile: true,
            isDirectory: false,
            hash: "sha256:abc",
            size: 12
          };
        }
        return { path: "app/content.wtoml", content: "hello", hash: "sha256:abc", size: 5 };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  const listing = await bridge.listSourceDirectory({ path: "plugins" });
  const stat = await bridge.statSource({ path: "app/content.wtoml" });
  assert.equal((await bridge.readSource({ path: "app/content.wtoml" })).content, "hello");
  assert.equal((await bridge.readSource({ path: "app/content.wtoml", encoding: "base64" })).content, "hello");
  assert.equal(listing.entries[0].name, "inspect");
  assert.equal(stat.exists, true);
  assert.equal(stat.isFile, true);
  await bridge.patchSource({
    path: "app/content.wtoml",
    content: "preview",
    expectedHash: "sha256:baseline",
    reason: "preview.overlay.patch",
    previewOnly: true,
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "tester"
    }
  });

  assert.equal(requests[0].url, "http://127.0.0.1:8788/capabilities/fs/list?path=plugins");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[1].url, "http://127.0.0.1:8788/capabilities/fs/stat?path=app%2Fcontent.wtoml");
  assert.equal(requests[2].url, "http://127.0.0.1:8788/capabilities/fs/read?path=app%2Fcontent.wtoml");
  assert.equal(requests[3].url, "http://127.0.0.1:8788/capabilities/fs/read?path=app%2Fcontent.wtoml&encoding=base64");
  assert.equal(requests[4].url, "http://127.0.0.1:8788/capabilities/fs/patch");
  assert.equal(requests[4].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[4].options.body), {
    path: "app/content.wtoml",
    content: "preview",
    expectedHash: "sha256:baseline",
    reason: "preview.overlay.patch",
    previewOnly: true,
    sessionId: "session-1",
    surfaceId: "surface-1",
    actor: "tester"
  });
});

test("createWitnessCoreBridge sqlite capability helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true, rows: [{ title: "first" }], rowCount: 1, changes: 1, lastInsertRowid: 1, applied: ["001"], skipped: [], results: [] };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  await bridge.sqliteTestConnection({ path: "app/db/main.sqlite", migrationTable: "witness_sql_migrations" });
  await bridge.sqliteMigrate({
    path: "app/db/main.sqlite",
    migrationTable: "witness_sql_migrations",
    migrations: [{ id: "001", sql: "create table items (id integer primary key, title text not null)" }]
  });
  await bridge.sqliteQuery({ path: "app/db/main.sqlite", sql: "select title from items", params: ["first"] });
  await bridge.sqliteCommand({ path: "app/db/main.sqlite", sql: "insert into items(title) values (?)", params: ["first"] });
  await bridge.sqliteTransaction({
    path: "app/db/main.sqlite",
    steps: [{ kind: "command", sql: "insert into items(title) values (?)", params: ["first"], name: "insert" }]
  });

  assert.deepEqual(requests.map(entry => [entry.url, entry.options.method ?? "GET"]), [
    ["http://127.0.0.1:8788/capabilities/db/sqlite", "POST"],
    ["http://127.0.0.1:8788/capabilities/db/sqlite", "POST"],
    ["http://127.0.0.1:8788/capabilities/db/sqlite", "POST"],
    ["http://127.0.0.1:8788/capabilities/db/sqlite", "POST"],
    ["http://127.0.0.1:8788/capabilities/db/sqlite", "POST"]
  ]);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    operation: "testConnection",
    path: "app/db/main.sqlite",
    migrationTable: "witness_sql_migrations"
  });
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    operation: "migrate",
    path: "app/db/main.sqlite",
    migrationTable: "witness_sql_migrations",
    migrations: [{ id: "001", sql: "create table items (id integer primary key, title text not null)" }]
  });
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    operation: "query",
    path: "app/db/main.sqlite",
    sql: "select title from items",
    params: ["first"]
  });
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    operation: "command",
    path: "app/db/main.sqlite",
    sql: "insert into items(title) values (?)",
    params: ["first"]
  });
  assert.deepEqual(JSON.parse(requests[4].options.body), {
    operation: "transaction",
    path: "app/db/main.sqlite",
    steps: [{ kind: "command", sql: "insert into items(title) values (?)", params: ["first"], name: "insert" }]
  });
});

test("createWitnessCoreBridge verification persistence helper serializes requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { verificationPolicies: [], testRuns: [] };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  const payload = await bridge.verificationPersistenceRequest({
    operation: "readModelRows",
    verificationRoot: "C:/runtime/verification",
    artifactRoot: "C:/runtime/verification/artifacts",
    cacheRoot: "C:/runtime/verification/cache"
  });

  assert.deepEqual(payload, { verificationPolicies: [], testRuns: [] });
  assert.deepEqual(requests.map(entry => [entry.url, entry.options.method ?? "GET"]), [
    ["http://127.0.0.1:8788/verification-persistence", "POST"]
  ]);
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    operation: "readModelRows",
    verificationRoot: "C:/runtime/verification",
    artifactRoot: "C:/runtime/verification/artifacts",
    cacheRoot: "C:/runtime/verification/cache"
  });
});

test("createWitnessCoreBridge http outbound helper serializes requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          transport: "network",
          status: 202,
          headers: { "content-type": "application/json" },
          bodyText: "{\"ok\":true}"
        };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  const response = await bridge.executeHttpOutbound({
    url: "http://127.0.0.1:4010/outbound",
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1500,
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "tester"
    }
  });

  assert.equal(response.status, 202);
  assert.equal(requests[0].url, "http://127.0.0.1:8788/capabilities/network/http-outbound");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    url: "http://127.0.0.1:4010/outbound",
    method: "POST",
    headers: {
      authorization: "Bearer token",
      "content-type": "application/json"
    },
    bodyText: "{\"ok\":true}",
    timeoutMs: 1500,
    sessionId: "session-1",
    surfaceId: "surface-1",
    actor: "tester"
  });
});

test("createWitnessCoreBridge maps source conflicts and unavailability into typed errors", async () => {
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl: async (url, options = {}) => {
      if ((options.method ?? "GET") === "PUT") {
        return {
          ok: false,
          status: 409,
          async json() {
            return {
              error: "source baseline hash mismatch",
              code: "WITNESS_CORE_SOURCE_CONFLICT",
              path: "app/content.wtoml",
              expectedHash: "sha256:expected",
              actualHash: "sha256:actual",
              size: 25,
              modifiedAt: "1234",
              exists: true
            };
          }
        };
      }
      throw new Error("connect ECONNREFUSED");
    }
  });

  await assert.rejects(
    bridge.writeSource({
      path: "app/content.wtoml",
      content: "next",
      expectedHash: "sha256:expected"
    }),
    error =>
      error?.status === 409
      && error?.code === "WITNESS_CORE_SOURCE_CONFLICT"
      && error?.actualHash === "sha256:actual"
  );

  await assert.rejects(
    bridge.statSource({ path: "app/content.wtoml" }),
    error => error?.status === 503 && error?.code === "WITNESS_CORE_UNAVAILABLE"
  );
});

test("createWitnessCoreBridge serving and generation control helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { ok: true };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  await bridge.promoteGeneration({ id: "gen-green" });
  await bridge.rollbackGeneration({ id: "gen-stable" });
  await bridge.shadowInvokeComputeModule({
    hostOperation: "engentus.pipeline.health.classify",
    inputJson: "{\"hostOperation\":\"engentus.pipeline.health.classify\",\"request\":{\"hour_start\":\"2026-01-01T00:00:00Z\"}}",
    jsResultJson: "{\"status\":\"success\",\"payload\":{\"hour_start\":\"2026-01-01T00:00:00Z\",\"n_valid_channels\":5,\"n_bolts_evaluated\":3}}"
  });
  await bridge.requestServeLive();
  await bridge.requestServeStable();
  await bridge.readServing();

  assert.deepEqual(requests.map(entry => [entry.url, entry.options.method ?? "GET"]), [
    ["http://127.0.0.1:8788/generations/gen-green/promote", "POST"],
    ["http://127.0.0.1:8788/generations/gen-stable/rollback", "POST"],
    ["http://127.0.0.1:8788/compute-modules/shadow-invoke", "POST"],
    ["http://127.0.0.1:8788/serving/live", "POST"],
    ["http://127.0.0.1:8788/serving/stable", "POST"],
    ["http://127.0.0.1:8788/serving", "GET"]
  ]);
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    hostOperation: "engentus.pipeline.health.classify",
    inputJson: "{\"hostOperation\":\"engentus.pipeline.health.classify\",\"request\":{\"hour_start\":\"2026-01-01T00:00:00Z\"}}",
    jsResultJson: "{\"status\":\"success\",\"payload\":{\"hour_start\":\"2026-01-01T00:00:00Z\",\"n_valid_channels\":5,\"n_bolts_evaluated\":3}}"
  });
});

test("createWitnessCoreBridge soak helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          currentSession: null,
          lastSession: { id: "soak-1", status: "completed" }
        };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  assert.equal((await bridge.readSoak())?.lastSession?.id, "soak-1");
  await bridge.startSoakSession({ id: "soak-1", scenario: "fixture-soak" });
  await bridge.markSoakSession({ sessionId: "soak-1", phase: "warmup", message: "ready" });
  await bridge.recordSoakSample({
    sessionId: "soak-1",
    sample: {
      phase: "warmup",
      status: "healthy",
      ready: true,
      rss: 10
    }
  });
  await bridge.completeSoakSession({ sessionId: "soak-1", message: "done" });
  await bridge.failSoakSession({ sessionId: "soak-1", message: "failed" });

  assert.deepEqual(requests.map(entry => [entry.url, entry.options.method ?? "GET"]), [
    ["http://127.0.0.1:8788/soak", "GET"],
    ["http://127.0.0.1:8788/soak/start", "POST"],
    ["http://127.0.0.1:8788/soak/mark", "POST"],
    ["http://127.0.0.1:8788/soak/sample", "POST"],
    ["http://127.0.0.1:8788/soak/complete", "POST"],
    ["http://127.0.0.1:8788/soak/fail", "POST"]
  ]);
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    id: "soak-1",
    scenario: "fixture-soak"
  });
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    sessionId: "soak-1",
    phase: "warmup",
    message: "ready"
  });
  assert.deepEqual(JSON.parse(requests[3].options.body), {
    sessionId: "soak-1",
    phase: "warmup",
    status: "healthy",
    ready: true,
    rss: 10
  });
});

test("createWitnessCoreBridge preview session helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (options.method === "DELETE") {
      return {
        ok: true,
        status: 200,
        async json() {
          return { ok: true };
        }
      };
    }
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "preview-1",
          baseAppRevision: 7,
          previewRevision: 1
        };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  const session = {
    id: "preview-1",
    baseAppRevision: 7,
    previewRevision: 1,
    overlaySources: [{ file: "C:/tmp/app/content.wtoml", content: "text = \"Preview\"" }]
  };
  await bridge.createPreviewSession({ session });
  assert.equal((await bridge.readPreviewSession({ id: "preview-1" }))?.id, "preview-1");
  await bridge.writePreviewSession({ id: "preview-1", session });
  assert.equal(await bridge.deletePreviewSession({ id: "preview-1" }), true);

  assert.deepEqual(requests.map(entry => [entry.url, entry.options.method ?? "GET"]), [
    ["http://127.0.0.1:8788/preview-sessions", "POST"],
    ["http://127.0.0.1:8788/preview-sessions/preview-1", "GET"],
    ["http://127.0.0.1:8788/preview-sessions/preview-1", "PUT"],
    ["http://127.0.0.1:8788/preview-sessions/preview-1", "DELETE"]
  ]);
  assert.deepEqual(JSON.parse(requests[0].options.body), session);
  assert.deepEqual(JSON.parse(requests[2].options.body), session);
});

test("createWitnessCoreBridge returns null without a usable core URL", () => {
  assert.equal(createWitnessCoreBridge({ coreUrl: "" }), null);
  assert.equal(createWitnessCoreBridge({ coreUrl: null }), null);
});
