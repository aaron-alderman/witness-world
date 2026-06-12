import assert from "node:assert/strict";
import test from "node:test";
import { renderBootstrapPage } from "../src/bootstrap-shell.js";

test("bootstrap shell renders the desktop ownership card and explicit desktop actions", () => {
  const html = renderBootstrapPage();

  assert.match(html, /<h2>Local World Ownership<\/h2>/);
  assert.match(html, /id="desktop-summary"/);
  assert.match(html, /id="desktop-open-world"/);
  assert.match(html, /id="desktop-create-world"/);
  assert.match(html, /id="desktop-reveal-world"/);
  assert.match(html, /Desktop shell unavailable in this session\./);
});
