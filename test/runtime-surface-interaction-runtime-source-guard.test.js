import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const interactionRuntimeSource = readFileSync(new URL("../src/runtime-surface-interaction-runtime.js", import.meta.url), "utf8");
const surfacePageSource = readFileSync(new URL("../src/runtime-surface-page.js", import.meta.url), "utf8");

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
