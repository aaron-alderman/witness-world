import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { canvasProcessHandlers } from "./canvas-processes.js";
import { canvasProjection, perspectivesProjection } from "./canvas-projection.js";
import { renderCanvasPage } from "./canvas-page.js";
import { compensationClaims, undoState } from "./canvas-undo.js";
import { renderCanvasCorePrelude } from "./canvas-core.js";

test("canvas plugin exposes canvas bundle handlers", async () => {
  const source = await readFile(new URL("./runtime.js", import.meta.url), "utf8");
  assert.equal(source.includes('bundleId = "bundle-canvas"'), true);
  assert.equal(source.includes('"canvas.read"'), true);
  assert.equal(source.includes("export function createHandlers"), true);
});

test("canvas plugin owns process, projection, page, undo, and core helpers", () => {
  assert.equal(typeof canvasProcessHandlers["canvas.createThing"], "function");
  assert.equal(typeof canvasProcessHandlers["canvas.move"], "function");
  assert.equal(typeof canvasProjection, "function");
  assert.equal(typeof perspectivesProjection, "function");
  assert.equal(typeof renderCanvasPage, "function");
  assert.equal(typeof compensationClaims, "function");
  assert.equal(typeof undoState, "function");
  assert.equal(renderCanvasCorePrelude().includes("const __canvasCore = (() => {"), true);
});

test("canvas runtime ownership is not implemented in core compatibility files", async () => {
  for (const file of [
    "../../src/canvas-core.js",
    "../../src/canvas-processes.js",
    "../../src/canvas-projection.js",
    "../../src/canvas-page.js",
    "../../src/canvas-undo.js"
  ]) {
    await assert.rejects(readFile(new URL(file, import.meta.url), "utf8"));
  }

  const runtimeServerSource = await readFile(new URL("../../src/runtime-server.js", import.meta.url), "utf8");
  const routeHandlersSource = await readFile(new URL("../../src/runtime-route-handlers.js", import.meta.url), "utf8");
  const proposalExecutorSource = await readFile(new URL("../proposals/proposal-executor.js", import.meta.url), "utf8");

  assert.equal(runtimeServerSource.includes('["canvas-core.js", path.join(canvasDir, "canvas-core.js")]'), true);
  assert.equal(runtimeServerSource.includes('["canvas-projection.js", path.join(canvasDir, "canvas-projection.js")]'), true);
  assert.equal(routeHandlersSource.includes("../plugins/canvas/canvas-processes.js"), true);
  assert.equal(routeHandlersSource.includes("./canvas-processes.js"), false);
  assert.equal(proposalExecutorSource.includes("../canvas/canvas-processes.js"), true);
  assert.equal(proposalExecutorSource.includes("../../src/canvas-processes.js"), false);
});
