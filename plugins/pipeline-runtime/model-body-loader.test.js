import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { burstFitModelBody } from "./burst-fit-kernels.js";
import { createBurstFitInIrHandler } from "./burst-fit-kernels.js";
import { clipModelBody } from "./clip-kernels.js";
import { createClipDetectInIrHandler } from "./clip-kernels.js";
import { healthModelBody } from "./health-kernels.js";
import { createHealthClassifyInIrHandler } from "./health-kernels.js";
import { kalmanModelBody } from "./kalman-kernels.js";
import { createKalmanInIrHandler } from "./kalman-kernels.js";

const CASES = [
  { name: "burst-fit", loadModelBody: burstFitModelBody, suffix: "burst-fit.rvm" },
  { name: "clip", loadModelBody: clipModelBody, suffix: "clip.rvm" },
  { name: "health", loadModelBody: healthModelBody, suffix: "health.rvm" },
  { name: "kalman", loadModelBody: kalmanModelBody, suffix: "kalman.rvm" }
];

const HANDLER_CASES = [
  {
    name: "burst-fit",
    createHandler: () => createBurstFitInIrHandler({
      sampleSource: () => ({ g: [1, 1, 1], dt: 1, n_valid_pkgs: 1 })
    }),
    request: { burst_start: "2026-01-01T00:00:00Z" }
  },
  {
    name: "health",
    createHandler: () => createHealthClassifyInIrHandler({
      sampleSource: () => ([{}])
    }),
    request: { hour_start: "2026-01-01T00:00:00Z" }
  },
  {
    name: "clip",
    createHandler: () => createClipDetectInIrHandler({
      sampleSource: () => ([{ burst_id: "b", channel: "x1", sample_idx: 0, raw: 0 }])
    }),
    request: { burst_start: "2026-01-01T00:00:00Z" }
  },
  {
    name: "kalman",
    createHandler: () => createKalmanInIrHandler({
      sampleSource: () => ({
        tS: [0],
        boltAccelG: [0],
        txAccelG: [0],
        boltGyroDps: [0],
        txGyroDps: [0]
      })
    }),
    request: { burst_start: "2026-01-01T00:00:00Z" }
  }
];

for (const { name, loadModelBody, suffix } of CASES) {
  test(`${name} pipeline model loader can use an injected read capability instead of local fs ownership`, async () => {
    const calls = [];
    const body = await loadModelBody({
      async readFile(target, encoding) {
        calls.push({ target, encoding });
        return await fs.readFile(target, encoding);
      }
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].encoding, "utf8");
    assert.match(calls[0].target, new RegExp(`${suffix.replace(".", "\\.")}$`));
    assert.equal(typeof body, "object");
    assert.ok(body);
  });

  test(`${name} pipeline model loader fails closed when injected read capability is required but unavailable`, async () => {
    await assert.rejects(
      loadModelBody({ requireReadCapability: true }),
      error => error?.code === "WITNESS_CORE_REQUIRED" && error?.status === 503
    );
  });
}

for (const { name, createHandler, request } of HANDLER_CASES) {
  test(`${name} pipeline in-IR handler fails closed by default when no injected model reader is supplied`, async () => {
    const handler = createHandler();
    await assert.rejects(
      handler(request, { host_operation: `pipeline.${name}` }),
      error => error?.code === "WITNESS_CORE_REQUIRED" && error?.status === 503
    );
  });
}
