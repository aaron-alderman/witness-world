import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import { loadAppProject } from "../src/app-project.js";
import {
  CELL_MEMORY_LAYOUT,
  CELL_FLAGS,
  clearCellBuffer,
  createCellBuffer,
  putCell,
  readCellBufferHeader,
  readRowText
} from "../examples/operator/browser/operator-framebuffer.js";
import {
  collectGlyphCodepoints,
  resolveCanvasCellMetrics
} from "../examples/operator/browser/operator-glyph-atlas.js";
import { parseOperatorWorkbenchRvm } from "../examples/operator/browser/operator-rvm.js";
import { createOperatorExampleState } from "../examples/operator/browser/operator-sample-state.js";
import {
  composeViewportToBuffer,
  layoutViewport
} from "../examples/operator/browser/operator-runtime.js";

const exampleRoot = path.resolve("examples", "operator");

async function loadBrowserExampleModel() {
  const source = await fs.readFile(path.join(exampleRoot, "browser", "operator.workbench.rvm"), "utf8");
  return parseOperatorWorkbenchRvm(source);
}

function readAllRows(buffer) {
  return Array.from({ length: buffer.height }, (_row, index) => readRowText(buffer, index));
}

test("operator example current app project authoring loads through the existing workbench plugin seam", async () => {
  const appProject = await loadAppProject(exampleRoot, {
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  assert.equal(appProject.operatorWorkbench.defaultScreen, "operator_trace");
  assert.equal(appProject.operatorWorkbench.defaultLeftScreen, "operator_left");
  assert.equal(appProject.operatorWorkbench.shortcuts.get("F5"), "operator_trace");
});

test("operator example prototype RVM parses themes, surfaces, overlays, and bindings", async () => {
  const model = await loadBrowserExampleModel();
  assert.equal(model.themes.length, 1);
  assert.equal(model.surfaces.length, 6);
  assert.equal(model.viewports.length, 1);
  const viewport = model.viewportById.get("default");
  assert.deepEqual(viewport.center, {
    kind: "split",
    orientation: "horizontal",
    leftWeight: 28,
    rightWeight: 72,
    leftSurfaceId: "nav_tree",
    rightSurfaceId: "session_reader"
  });
  assert.deepEqual(viewport.overlays, ["help_overlay", "context_menu"]);
  assert.equal(viewport.bindings.some(binding => binding.trigger === "F1" && binding.target === "help_overlay"), true);
  assert.equal(model.surfaceById.get("help_overlay")?.width, 56);
  assert.equal(model.surfaceById.get("context_menu")?.height, 8);
});

test("operator example layout emits deterministic split handles and pane bounds", async () => {
  const model = await loadBrowserExampleModel();
  const layout = layoutViewport(model, createOperatorExampleState());
  assert.equal(layout.bounds.width, 80);
  assert.equal(layout.bounds.height, 30);
  assert.equal(layout.left.width < layout.right.width, true);
  assert.equal(layout.handles.vertical.width, 1);
  assert.equal(layout.handles.top.height, 1);
  assert.equal(layout.handles.bottom.height, 1);
});

test("operator example composition lowers authored surfaces into a cell buffer and centers overlays", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  state.overlays = ["context_menu"];
  const { buffer } = composeViewportToBuffer(model, state);
  const rows = readAllRows(buffer);
  assert.equal(rows.some(line => line.includes("Session")), true);
  assert.equal(rows.some(line => line.includes("Change Color")), true);
  const menuRow = rows.findIndex(line => line.includes("Change Color"));
  assert.equal(menuRow > 8 && menuRow < 22, true);
});

test("operator example text reader scrolling shifts horizontal content instead of clipping the pane model", async () => {
  const model = await loadBrowserExampleModel();
  const state = createOperatorExampleState();
  let composed = composeViewportToBuffer(model, state);
  const baselineRow = readAllRows(composed.buffer).find(line => line.includes("Selection, aliases")) || "";
  state.scrollBySurfaceId.session_reader.x = 8;
  composed = composeViewportToBuffer(model, state);
  const shiftedRow = readAllRows(composed.buffer).find(line => line.includes("aliases, notes")) || "";
  assert.equal(baselineRow.includes("Session :: Selection"), true);
  assert.equal(shiftedRow.includes("aliases, notes"), true);
});

test("operator example frame rows preserve corners and keep pane titles inside the box model", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const rows = readAllRows(buffer);
  assert.match(rows[0], /^┌.*┐$/u);
  assert.match(rows[3], /^┌.*║┌.*┐$/u);
  assert.match(rows[25], /^└.*┘║└.*┘$/u);
  assert.match(rows[29], /^└.*┘$/u);
  assert.equal(rows[0].includes("Status"), true);
  assert.equal(rows[3].includes("Tree"), true);
  assert.equal(rows[3].includes("Session"), true);
  assert.equal(rows[3].includes("x:0 y:0"), true);
});

test("operator example visual snapshot keeps the expected pane scaffold", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const rows = readAllRows(buffer);
  assert.deepEqual(rows.slice(0, 6), [
    "┌─ Status ─────────────────────────────────────────────────────────────────────┐",
    "│ viewport:default | theme:ansi16 | surface:session_reader                     │",
    "════════════════════════════════════════╪═══════════════════════════════════════",
    "┌─ Tree ─────────────┐║┌─ Session ─────────────────────────────────── x:0 y:0 ─┐",
    "│ Session      Selec │║│ Session :: Selection, aliases, notes, preview sessio… │",
    "│ World        Conte │║│ This text reader is intentionally long so horizontal… │"
  ]);
});

test("operator example framebuffer seam uses a contiguous cell memory map with stable metadata flags", () => {
  const buffer = clearCellBuffer(createCellBuffer(8, 2));
  putCell(buffer, 2, 1, { ch: "X", fg: 10, bg: 1, flags: CELL_FLAGS.handle, linkId: 7, hitId: 9 });
  const index = (1 * buffer.width) + 2;
  const header = readCellBufferHeader(buffer);
  assert.equal(String.fromCodePoint(buffer.glyphs[index]), "X");
  assert.equal(buffer.fg[index], 10);
  assert.equal(buffer.bg[index], 1);
  assert.equal(buffer.flags[index], CELL_FLAGS.handle);
  assert.equal(buffer.linkIds[index], 7);
  assert.equal(buffer.hitIds[index], 9);
  assert.equal(buffer.glyphs.buffer, buffer.memory);
  assert.equal(buffer.fg.buffer, buffer.memory);
  assert.equal(buffer.header.buffer, buffer.memory);
  assert.equal(header.width, 8);
  assert.equal(header.height, 2);
  assert.equal(header.glyphOffset, CELL_MEMORY_LAYOUT.headerBytes);
  assert.equal(header.hitOffset, buffer.offsets.hitIds);
});

test("operator example glyph atlas helpers resolve deterministic cell metrics and unique glyph sets", async () => {
  const model = await loadBrowserExampleModel();
  const { buffer } = composeViewportToBuffer(model, createOperatorExampleState());
  const metrics = resolveCanvasCellMetrics({
    cssWidth: 1600,
    cssHeight: 900,
    gridWidth: buffer.width,
    gridHeight: buffer.height
  });
  const glyphs = collectGlyphCodepoints(buffer);
  assert.equal(metrics.cellSize, 20);
  assert.equal(metrics.width, 1600);
  assert.equal(metrics.height, 600);
  assert.equal(glyphs.includes("S".codePointAt(0)), true);
  assert.equal(glyphs.includes("│".codePointAt(0)), true);
  assert.equal(glyphs.includes(" ".codePointAt(0)), false);
});
