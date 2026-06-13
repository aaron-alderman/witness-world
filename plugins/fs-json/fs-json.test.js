import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bundleId, createHandlers, handlerCatalog, routes, surfaces } from "./runtime.js";

test("fs-json plugin owns JSON file host capability declarations", async () => {
  assert.equal(bundleId, "bundle-fs-json");
  assert.deepEqual(handlerCatalog.dispatchHandlers, []);
  assert.deepEqual(routes, []);
  assert.deepEqual(surfaces, []);
  assert.deepEqual(createHandlers(), {});

  const manifest = JSON.parse(await readFile(new URL("./plugin.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.activatesBundles, ["bundle-fs-json"]);
  assert.deepEqual(manifest.contributes.capabilities, [
    { id: "fs.json.read" },
    { id: "fs.json.write" }
  ]);
});
