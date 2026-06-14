import test from "node:test";
import assert from "node:assert/strict";
import {
  renderWorldGraphShell,
  renderWorldShellViewFactory
} from "./world-shell-view.js";

test("world shell view renders the graph shell from shared segments", () => {
  const html = renderWorldGraphShell({
    tutorialPanel: "<section>Tutorial</section>",
    inspector: "<div>Inspector</div>",
    modeMenu: "<nav>Modes</nav>",
    commandPalette: "<section>Commands</section>",
    canvas: "<div>Canvas</div>"
  });

  assert.equal(html.includes('class="surface-shell-2 world-graph-shell"'), true);
  assert.equal(html.includes('class="surface-pane surface-stack world-graph-inspector"'), true);
  assert.equal(html.includes('data-world-inspector'), true);
  assert.equal(html.includes("<section>Tutorial</section>"), true);
  assert.equal(html.includes("<div>Canvas</div>"), true);
});

test("world shell view factory exposes the shared browser helpers", () => {
  const factory = renderWorldShellViewFactory();
  assert.equal(factory.includes("const renderWorldGraphShell ="), true);
});
