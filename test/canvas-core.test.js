import assert from "node:assert/strict";
import test from "node:test";
import {
  cameraToFocusRect,
  clampZoom,
  connectorKey,
  layoutConnector,
  screenToWorld,
  selectionBounds,
  worldToScreen,
  zoomCameraAt
} from "../src/canvas-core.js";

test("camera transforms round-trip between world and screen coordinates", () => {
  const camera = { x: 120, y: 80, zoom: 1.5 };
  const screen = worldToScreen(camera, 40, 60);
  assert.deepEqual(screenToWorld(camera, screen.x, screen.y), { x: 40, y: 60 });
});

test("zoomCameraAt preserves the pointer anchor", () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const anchorBefore = screenToWorld(camera, 300, 240);
  const next = zoomCameraAt(camera, 300, 240, 1.1);
  const anchorAfter = screenToWorld(next, 300, 240);
  assert.ok(Math.abs(anchorAfter.x - anchorBefore.x) < 1e-9);
  assert.ok(Math.abs(anchorAfter.y - anchorBefore.y) < 1e-9);
});

test("selectionBounds returns the envelope of multiple rectangles", () => {
  assert.deepEqual(selectionBounds([
    { x: 10, y: 10, w: 30, h: 20 },
    { x: 40, y: 25, w: 12, h: 10 }
  ]), { x: 10, y: 10, w: 42, h: 25 });
});

test("layoutConnector returns edge points instead of center points", () => {
  const from = { x: 0, y: 0, w: 100, h: 60 };
  const to = { x: 220, y: 20, w: 100, h: 60 };
  const { start, end } = layoutConnector(from, to);
  assert.equal(start.x, 100);
  assert.equal(end.x, 220);
});

test("cameraToFocusRect centers a rectangle in the viewport", () => {
  const camera = cameraToFocusRect({ x: 100, y: 200, w: 300, h: 200 }, { width: 1200, height: 900 }, { zoom: 1 });
  const center = worldToScreen(camera, 250, 300);
  assert.deepEqual(center, { x: 600, y: 450 });
});

test("connectorKey stays stable for shared spatial rendering", () => {
  assert.equal(
    connectorKey({ from: "a", rel: "references", to: "b", fromInstance: "x", toInstance: "y" }),
    "a references b x y"
  );
});

test("clampZoom enforces the shared zoom envelope", () => {
  assert.equal(clampZoom(0.01), 0.2);
  assert.equal(clampZoom(9), 4);
});
