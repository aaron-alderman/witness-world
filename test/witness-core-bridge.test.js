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
              command: "npm run app:engentus",
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
    "http://127.0.0.1:8788/generations",
    "http://127.0.0.1:8788/health",
    "http://127.0.0.1:8788/serving"
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

test("createWitnessCoreBridge source capability helpers serialize requests", async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      async json() {
        if (String(url).includes("/stat")) {
          return { path: "app/content.wtoml", exists: true, hash: "sha256:abc", size: 12 };
        }
        return { path: "app/content.wtoml", content: "hello", hash: "sha256:abc", size: 5 };
      }
    };
  };
  const bridge = createWitnessCoreBridge({
    coreUrl: "http://127.0.0.1:8788/",
    fetchImpl
  });

  assert.equal((await bridge.readSource({ path: "app/content.wtoml" })).content, "hello");
  assert.equal((await bridge.statSource({ path: "app/content.wtoml" })).exists, true);
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

  assert.equal(requests[0].url, "http://127.0.0.1:8788/capabilities/fs/read?path=app%2Fcontent.wtoml");
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[1].url, "http://127.0.0.1:8788/capabilities/fs/stat?path=app%2Fcontent.wtoml");
  assert.equal(requests[2].url, "http://127.0.0.1:8788/capabilities/fs/patch");
  assert.equal(requests[2].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[2].options.body), {
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
