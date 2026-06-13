import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTutorialOverlayDrag,
  createTutorialOverlayDragState,
  positionTutorialOverlay,
  renderTutorialOverlayDragFactory,
  setTutorialOverlayPosition
} from "./tutorial-overlay-drag.js";

test("tutorial overlay drag helpers clamp and position the overlay", () => {
  const overlay = {
    offsetWidth: 120,
    offsetHeight: 80,
    style: {}
  };
  const overlayDrag = createTutorialOverlayDragState();

  setTutorialOverlayPosition({
    overlay,
    overlayDrag,
    left: 1000,
    top: -20,
    manual: true,
    innerWidth: 300,
    innerHeight: 200
  });
  assert.equal(overlay.style.left, "168px");
  assert.equal(overlay.style.top, "12px");
  assert.equal(overlay.style.right, "auto");
  assert.equal(overlayDrag.left, 168);
  assert.equal(overlayDrag.top, 12);
  assert.equal(overlayDrag.manual, true);

  const target = {
    getBoundingClientRect() {
      return { left: 20, right: 90, bottom: 40 };
    }
  };
  overlayDrag.manual = false;
  positionTutorialOverlay({
    overlay,
    overlayDrag,
    target,
    innerWidth: 300,
    innerHeight: 200
  });
  assert.equal(overlay.style.left, "20px");
  assert.equal(overlay.style.top, "52px");
});

test("tutorial overlay drag binder wires pointerdown, move, and up through the shared seam", () => {
  const listeners = new Map();
  const handle = {
    addEventListener(type, handler) {
      listeners.set("handle:" + type, handler);
    }
  };
  const bodyCalls = [];
  const body = {
    classList: {
      add(value) {
        bodyCalls.push(["add", value]);
      },
      remove(value) {
        bodyCalls.push(["remove", value]);
      }
    }
  };
  const overlay = {
    hidden: false,
    offsetWidth: 120,
    offsetHeight: 80,
    style: {},
    getBoundingClientRect() {
      return { left: 16, top: 16 };
    }
  };
  const overlayDrag = createTutorialOverlayDragState();
  bindTutorialOverlayDrag({
    handle,
    overlay,
    overlayDrag,
    body,
    addWindowListener(type, handler) {
      listeners.set("window:" + type, handler);
    },
    setTutorialOverlayPositionFn: payload => setTutorialOverlayPosition({
      ...payload,
      innerWidth: 300,
      innerHeight: 200
    })
  });

  listeners.get("handle:pointerdown")({
    clientX: 20,
    clientY: 28,
    preventDefault() {
      bodyCalls.push("preventDefault");
    }
  });
  listeners.get("window:pointermove")({
    clientX: 90,
    clientY: 100
  });
  listeners.get("window:pointerup")();

  assert.equal(overlayDrag.manual, true);
  assert.equal(overlayDrag.active, false);
  assert.equal(overlay.style.left, "86px");
  assert.equal(overlay.style.top, "88px");
  assert.deepEqual(bodyCalls, [
    ["add", "tutorial-dragging"],
    "preventDefault",
    ["remove", "tutorial-dragging"]
  ]);
});

test("tutorial overlay drag factory exposes the shared browser helpers", () => {
  const factory = renderTutorialOverlayDragFactory();
  assert.equal(factory.includes("const bindTutorialOverlayDrag ="), true);
  assert.equal(factory.includes("const positionTutorialOverlay ="), true);
});
