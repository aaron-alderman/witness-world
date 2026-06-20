import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { BuildWorkerError, runBuildWorker } from "../src/witness-core-build-worker.js";

const LIVE_CORE_FIXTURE_ROOT = path.join(process.cwd(), "test", "fixtures", "live-core-app");

async function copyFixtureWorkspace() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-build-worker-"));
  const appRoot = path.join(tempRoot, "live-core-app");
  await fs.cp(LIVE_CORE_FIXTURE_ROOT, appRoot, { recursive: true });
  return {
    tempRoot,
    appRoot,
    manifestPath: path.join(appRoot, "app.wtoml"),
    computeModulePath: path.join(appRoot, "app", "modules", "health-classify", "assembly", "index.ts")
  };
}

test("witness-core build worker compiles compute modules and stages wasm artifacts under the candidate workspace", async () => {
  const workspace = await copyFixtureWorkspace();
  try {
    const result = await runBuildWorker({
      manifestPath: workspace.manifestPath,
      runtimeProfile: "authoring",
      workspaceRoot: workspace.tempRoot
    });
    assert.equal(result.ok, true);
    assert.equal(result.computeModuleCount, 1);
    assert.equal(result.computeModules.length, 1);
    const computeModule = result.computeModules[0];
    assert.equal(computeModule.id, "engentus.health.classify");
    assert.equal(computeModule.hostOperation, "engentus.health.classify");
    assert.equal(computeModule.success, true);
    assert.match(String(computeModule.artifactPath ?? ""), /\.witness-core\/compute-modules\/.+\.wasm$/);
    assert.match(String(computeModule.artifactHash ?? ""), /^sha256:/);
    const stagedArtifactPath = path.join(workspace.tempRoot, computeModule.artifactPath);
    const artifactStat = await fs.stat(stagedArtifactPath);
    assert.equal(artifactStat.isFile(), true);
  } finally {
    await fs.rm(workspace.tempRoot, { recursive: true, force: true });
  }
});

test("witness-core build worker returns structured compute module failures when a single AssemblyScript module fails to compile", async () => {
  const workspace = await copyFixtureWorkspace();
  try {
    await fs.writeFile(workspace.computeModulePath, "export function invoke(): i32 { return ; }\n", "utf8");
    await assert.rejects(
      runBuildWorker({
        manifestPath: workspace.manifestPath,
        runtimeProfile: "authoring",
        workspaceRoot: workspace.tempRoot
      }),
      error => {
        assert.equal(error instanceof BuildWorkerError, true);
        assert.equal(error.result?.ok, false);
        assert.equal(error.result?.computeModuleCount, 1);
        assert.equal(error.result?.computeModules?.length, 1);
        assert.equal(error.result?.computeModules?.[0]?.id, "engentus.health.classify");
        assert.equal(error.result?.computeModules?.[0]?.success, false);
        assert.match(String(error.result?.computeModules?.[0]?.error ?? ""), /compile|expected|error/i);
        return true;
      }
    );
  } finally {
    await fs.rm(workspace.tempRoot, { recursive: true, force: true });
  }
});
