import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureSurfaceInspectorOverlayRoot,
  renderSurfaceInspectorOverlayView,
  renderSurfaceInspectorOverlayViewFactory
} from "./surface-inspector-overlay-view.js";

test("surface inspector overlay root helper reuses or creates the overlay root", () => {
  const appended = [];
  const existing = { id: "surface-inspector-root" };
  const existingDocument = {
    getElementById(id) {
      return id === "surface-inspector-root" ? existing : null;
    }
  };
  assert.equal(ensureSurfaceInspectorOverlayRoot({ documentTarget: existingDocument }), existing);

  const createdDocument = {
    body: {
      appendChild(node) {
        appended.push(node);
      }
    },
    getElementById() {
      return null;
    },
    createElement(tag) {
      return { tag, id: "" };
    }
  };
  const created = ensureSurfaceInspectorOverlayRoot({ documentTarget: createdDocument });
  assert.equal(created.id, "surface-inspector-root");
  assert.deepEqual(appended, [created]);
});

test("surface inspector overlay view renders the shared overlay shell", () => {
  const html = renderSurfaceInspectorOverlayView({
    surfaceCommandOpen: true,
    surfaceInspectorOpen: false,
    commandPalette: "<section>Commands</section>",
    inspectorPanel: "<aside>Inspector</aside>",
    inspectorMenu: "<div>Menu</div>"
  });

  assert.equal(html.includes("Close Search"), true);
  assert.equal(html.includes("Inspect Page"), true);
  assert.equal(html.includes("<section>Commands</section>"), true);
  assert.equal(html.includes("<div>Menu</div>"), true);
});

test("surface inspector overlay view factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceInspectorOverlayViewFactory();
  assert.equal(factory.includes("const ensureSurfaceInspectorOverlayRoot ="), true);
  assert.equal(factory.includes("const renderSurfaceInspectorOverlayView ="), true);
});
