import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureWorldHomeLayout, startBlankRuntime } from "../src/runtime-local-launcher.js";
import { resolveRuntimeOperatorPaths } from "../src/runtime-operator-contract.js";

async function exists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

test("shared blank runtime launcher starts a desktop runtime against a named world home", async () => {
  const worldHome = await fs.mkdtemp(path.join(os.tmpdir(), "witness-desktop-runtime-"));
  const launched = await startBlankRuntime({
    startupMode: "desktop",
    worldHome,
    port: 0
  });

  assert.equal(launched.server.ok, true);

  try {
    const bootstrap = await fetch(`${launched.server.url}/_bootstrap`);
    const diagnostics = await fetch(`${launched.server.url}/api/runtime/diagnostics`).then(response => response.json());
    const state = await fetch(`${launched.server.url}/api/bootstrap-state`).then(response => response.json());

    assert.equal(bootstrap.status, 200);
    assert.deepEqual(diagnostics.shells.activeShellIds, ["desktop"]);
    assert.equal(diagnostics.shells.shells.some(shell => shell.id === "desktop" && shell.active === true), true);
    assert.equal(diagnostics.shells.shells.some(shell => shell.id === "browser" && shell.active === true), false);
    assert.equal(diagnostics.operator.layout, "world-home-v1");
    assert.equal(diagnostics.operator.worldHome, path.resolve(worldHome));
    assert.equal(state.operator.contract.layout, "world-home-v1");
    assert.equal(state.operator.contract.worldHome, path.resolve(worldHome));
  } finally {
    await launched.server.close();
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});

test("world-home layout initialization creates the operator-owned directory structure", async () => {
  const worldHome = path.join(os.tmpdir(), `witness-desktop-layout-${Date.now()}`);
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "desktop",
    cwd: process.cwd(),
    env: { WORLD_HOME: worldHome }
  });

  try {
    await ensureWorldHomeLayout(operatorContract);
    assert.equal(await exists(path.join(worldHome, "logs")), true);
    assert.equal(await exists(path.join(worldHome, "runtime")), true);
    assert.equal(await exists(path.join(worldHome, "backups")), true);
    assert.equal(await exists(path.join(worldHome, "exports")), true);
    assert.equal(await exists(path.join(worldHome, "imports")), true);
  } finally {
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});
