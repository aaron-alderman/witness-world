import assert from "node:assert/strict";
import test from "node:test";
import { renderBootstrapShellHead } from "./bootstrap-shell-head.js";
import { PAGE_PRESENTATION_REGION_CLASSNAMES } from "../../src/runtime-presentation.js";

test("bootstrap shell head renders the shared token/style shell with injected extension styles", () => {
  const html = renderBootstrapShellHead({
    extensionStyles: ".tutorial-overlay { outline: 0; }"
  });

  assert.equal(html.includes("<title>Witness Bootstrap</title>"), true);
  assert.equal(html.includes("SHARED_SURFACE_KIT_CSS"), false);
  assert.equal(html.includes(".tutorial-overlay { outline: 0; }"), true);
  assert.equal(html.includes("--page-bg: linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%);"), true);
  assert.equal(html.includes("--button-ink: #fffdf8;"), true);
  assert.equal(html.includes("#identity-form input"), false);
  assert.equal(html.includes("#bootstrap-summary"), false);
  assert.equal(html.includes(PAGE_PRESENTATION_REGION_CLASSNAMES.header), true);
});
