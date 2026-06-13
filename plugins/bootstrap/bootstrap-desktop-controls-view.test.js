import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBootstrapDesktopControlsView,
  buildBootstrapDesktopControlsView,
  renderBootstrapDesktopControlsViewFactory
} from "./bootstrap-desktop-controls-view.js";

test("desktop controls view disables desktop actions when shell state is unavailable", () => {
  assert.deepEqual(buildBootstrapDesktopControlsView({ desktopShell: null }), {
    desktopButtonsDisabled: true
  });
  assert.deepEqual(buildBootstrapDesktopControlsView({ desktopShell: { shellId: "desktop" } }), {
    desktopButtonsDisabled: false
  });
});

test("desktop controls view applies disabled state to all desktop buttons", () => {
  const buttons = new Map([
    ["desktop-open-world", { disabled: false }],
    ["desktop-create-world", { disabled: false }],
    ["desktop-reveal-world", { disabled: false }]
  ]);

  applyBootstrapDesktopControlsView({
    view: { desktopButtonsDisabled: true },
    byId: id => buttons.get(id) || null
  });
  assert.equal(buttons.get("desktop-open-world").disabled, true);
  assert.equal(buttons.get("desktop-create-world").disabled, true);
  assert.equal(buttons.get("desktop-reveal-world").disabled, true);

  applyBootstrapDesktopControlsView({
    view: { desktopButtonsDisabled: false },
    byId: id => buttons.get(id) || null
  });
  assert.equal(buttons.get("desktop-open-world").disabled, false);
  assert.equal(buttons.get("desktop-create-world").disabled, false);
  assert.equal(buttons.get("desktop-reveal-world").disabled, false);
});

test("desktop controls view factory exposes the shared browser seam", () => {
  const factory = renderBootstrapDesktopControlsViewFactory();

  assert.equal(factory.includes("const buildBootstrapDesktopControlsView ="), true);
  assert.equal(factory.includes("const applyBootstrapDesktopControlsView ="), true);
  assert.equal(factory.includes('"desktop-open-world"'), true);
});
