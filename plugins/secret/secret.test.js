import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createThing, createWorld, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { withRegisteredPluginProjectors } from "../../test/plugin-test-utils.js";
import { createSecretStoreRuntime } from "./support-services.js";
import { bundleId, handlerCatalog, providers } from "./runtime.js";

test("secret plugin exposes the runner-scoped secret store bundle", () => {
  assert.equal(bundleId, "bundle-secret");
  assert.equal(handlerCatalog.dispatchHandlers.includes("secret.store.create"), true);
  assert.equal(handlerCatalog.dispatchHandlers.includes("secret.store.write"), true);
});

test("secret plugin keeps metadata in world state and values in runner-local storage", async () => {
  await withRegisteredPluginProjectors(providers, async () => {
    const world = createWorld();
    createThing(world, { actor: "system", id: "secret.pg" });
    world.emit({
      process: "secret.store.create",
      actor: "system",
      claims: [
        relation("secret.pg", "hasModuleKind", "secret"),
        relation("secret.pg", "hasTitle", "Postgres Password")
      ],
      body: {
        id: "secret.pg",
        serverRunner: "runner.demo",
        provider: "local-json",
        status: "ready",
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
        hasValue: false,
        lastError: null
      }
    });

    const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), "secret-runtime-"));
    const secretStore = createSecretStoreRuntime({
      project: projector => world.project(projector),
      runtimeRoot,
      serverRunnerId: "runner.demo"
    });

    try {
      assert.deepEqual(world.project(moduleProjectors.secrets), [{
        id: "secret.pg",
        title: "Postgres Password",
        owner: "system",
        context: null,
        serverRunner: "runner.demo",
        provider: "local-json",
        status: "ready",
        createdAt: "2026-06-17T00:00:00.000Z",
        updatedAt: "2026-06-17T00:00:00.000Z",
        hasValue: false,
        lastError: null
      }]);

      await secretStore.writeSecretValue("secret.pg", "super-secret");
      const metadata = await secretStore.metadata("secret.pg");
      assert.equal(metadata.hasValue, true);
      assert.deepEqual(await secretStore.resolveSecretValue("secret.pg"), { ok: true, value: "super-secret" });
      assert.equal(JSON.stringify(world.allWitnesses()).includes("super-secret"), false);

      await secretStore.deleteSecretValue("secret.pg");
      assert.equal(await secretStore.hasValue("secret.pg"), false);
    } finally {
      secretStore.close();
      await fs.rm(runtimeRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});
