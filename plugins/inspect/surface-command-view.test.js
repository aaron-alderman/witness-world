import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSurfaceCommandPaletteView,
  renderSurfaceCommandViewFactory,
  renderSurfaceWhoamiResultView
} from "./surface-command-view.js";

test("surface command whoami view renders identity details and inline editor affordances", () => {
  const html = renderSurfaceWhoamiResultView({
    whoami: {
      title: "Callan",
      subtitle: "Signed in",
      rows: [["actor", "callan"]],
      note: "Inspect current identity",
      identity: "identity.callan",
      authenticated: true,
      editorReady: true,
      username: "callan",
      homeContextValue: "todo",
      homePerspectiveValue: "app",
      contextOptions: ["todo"]
    },
    escapeHtml: value => String(value)
  });

  assert.equal(html.includes('data-surface-command-identity-form'), true);
  assert.equal(html.includes('class="surface-form"'), true);
  assert.equal(html.includes('class="surface-field"'), true);
  assert.equal(html.includes("Save Identity Here"), true);
  assert.equal(html.includes("Open User"), true);
});

test("surface command palette view renders selection, loading/error notice, and command results", () => {
  const html = renderSurfaceCommandPaletteView({
    liveSurfaceInspectable: true,
    surfaceCommandOpen: true,
    query: "whoami",
    items: [{ title: "Who Am I", type: "identity", subtitle: "current user" }],
    graphLoaded: false,
    currentSelectionId: "todo_form",
    whoami: null,
    escapeHtml: value => String(value)
  });

  assert.equal(html.includes('data-surface-command-palette'), true);
  assert.equal(html.includes("Selected widget / todo_form"), true);
  assert.equal(html.includes("Loading world graph metadata"), true);
  assert.equal(html.includes('data-surface-command-run="0"'), true);
});

test("surface command view factory exposes the shared browser helpers", () => {
  const factory = renderSurfaceCommandViewFactory();
  assert.equal(factory.includes("const renderSurfaceWhoamiResultView ="), true);
  assert.equal(factory.includes("const renderSurfaceCommandPaletteView ="), true);
});
