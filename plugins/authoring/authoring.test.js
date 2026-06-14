import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("authoring plugin is a pure meta package over extracted authoring child plugins", async () => {
  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));

  assert.equal(manifest.runtime, undefined);
  assert.equal(manifest.activatesBundles, undefined);
  assert.deepEqual(manifest.dependsOnPlugins, ["plugin.bootstrap", "plugin.authoring-core", "plugin.capability-authoring", "plugin.program-authoring", "plugin.server-runner-authoring", "plugin.mcp-authoring", "plugin.proposals"]);
});
