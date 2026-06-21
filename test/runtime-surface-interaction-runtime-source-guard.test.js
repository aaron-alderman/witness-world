import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const interactionRuntimeSource = readFileSync(new URL("../src/runtime-surface-interaction-runtime.js", import.meta.url), "utf8");
const surfacePageSource = readFileSync(new URL("../src/runtime-surface-page.js", import.meta.url), "utf8");
const browserRuntimeModuleSource = readFileSync(new URL("../src/runtime-surface-browser-runtime-module.js", import.meta.url), "utf8");

test("runtime-surface-interaction-runtime no longer owns extracted live-path helper families", () => {
  const forbiddenLocalHelpers = [
    "function activeRouteTargetForPath",
    "function routeStateBindingForProcess",
    "function loadRouteSurfacePage",
    "function bootSurfaceCapabilities",
    "function ensureSurfaceCapabilityAssets",
    "function createSurfaceRuntimeIssueLedger",
    "function createSurfaceRuntimeProbe",
    "function browserHelpersSource",
    "renderSurfaceInteractionRuntimeModule("
  ];

  for (const marker of forbiddenLocalHelpers) {
    assert.equal(
      interactionRuntimeSource.includes(marker),
      false,
      `expected interaction runtime to exclude ${marker}`
    );
  }
});

test("runtime-surface-page sources the browser runtime module from the dedicated emitter", () => {
  assert.match(
    surfacePageSource,
    /runtime-surface-browser-runtime-module\.js/
  );
});

test("browser surface runtime emits event helper dependencies before interaction runtime", () => {
  const eventValuesIndex = browserRuntimeModuleSource.indexOf("eventValuesFromDomEvent.toString()");
  const eventPayloadIndex = browserRuntimeModuleSource.indexOf("eventPayloadFromDomEvent.toString()");
  const runtimeValueIndex = browserRuntimeModuleSource.indexOf("runtimeValueFromSpec.toString()");
  const manifestSyncIndex = browserRuntimeModuleSource.indexOf("syncSurfaceRuntimeManifestScript.toString()");
  const interactionRuntimeIndex = browserRuntimeModuleSource.indexOf("createSurfaceInteractionRuntime.toString()");

  assert.notEqual(eventValuesIndex, -1);
  assert.notEqual(eventPayloadIndex, -1);
  assert.notEqual(runtimeValueIndex, -1);
  assert.notEqual(manifestSyncIndex, -1);
  assert.equal(eventValuesIndex < eventPayloadIndex, true);
  assert.equal(eventPayloadIndex < runtimeValueIndex, true);
  assert.equal(eventValuesIndex < interactionRuntimeIndex, true);
  assert.equal(eventPayloadIndex < interactionRuntimeIndex, true);
  assert.equal(runtimeValueIndex < interactionRuntimeIndex, true);
  assert.equal(manifestSyncIndex < interactionRuntimeIndex, true);
});
