import test from "node:test";
import assert from "node:assert/strict";
import { renderBootstrapAuthoredPageMain } from "./bootstrap-page-main.js";

test("bootstrap authored page main renders shell structure and replaces authored slots", () => {
  const html = renderBootstrapAuthoredPageMain({
    "bootstrap-top-cards-slot": "<section id=\"injected-top-cards\"></section>",
    "bootstrap-widgets-slot": "<section id=\"injected-widgets\"></section>",
    "bootstrap-starter-controls-slot": "<section id=\"injected-starter\"></section>"
  });

  assert.match(html, /<main[^>]*>/);
  assert.match(html, /class="presentation-column column"/);
  assert.match(html, /Contexts, Stewardship, And Proposals/);
  assert.match(html, /Focused Builders/);
  assert.match(html, /Current World/);
  assert.match(html, /surface-card surface-stack/);
  assert.match(html, /surface-badge/);
  assert.match(html, /surface-state-list/);
  assert.match(html, /id="runtime-plugin-review-runner"/);
  assert.match(html, /witness-bootstrap-page-main-program/);
  assert.match(html, /witness:bootstrap-runtime-plugin-review-sync/);
  assert.match(html, /id="mcp-server-inventory"/);
  assert.match(html, /id="state-contexts"/);
  assert.match(html, /id="state-packages"/);
  assert.match(html, /id="state-package-convergence"/);
  assert.match(html, /id="state-package-apply-previews"/);
  assert.match(html, /id="injected-top-cards"/);
  assert.match(html, /id="injected-widgets"/);
  assert.match(html, /id="injected-starter"/);
});
