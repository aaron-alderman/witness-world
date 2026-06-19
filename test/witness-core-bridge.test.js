import test from "node:test";
import assert from "node:assert/strict";

import {
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
    if (String(url).endsWith("/health")) {
      return {
        ok: true,
        async json() {
          return {
            ok: true,
            service: "witness-core",
            process: {
              command: "npm run engentus",
              workingDir: ".",
              running: true,
              pid: 4242,
              restartCount: 1
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
    "http://127.0.0.1:8788/generations",
    "http://127.0.0.1:8788/health"
  ]);
  assert.equal(latestWitnessCoreGeneration(status)?.id, "gen_green");
  assert.equal(latestWitnessCoreState(status), "green_local");
  assert.equal(store.getLatestState(), "green_local");
  assert.equal(store.getProcessState()?.pid, 4242);
  assert.equal(status?.process?.running, true);
  assert.equal(status?.service, "witness-core");
  assert.equal(status?.ok, true);
});
