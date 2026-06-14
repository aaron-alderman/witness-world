import test from "node:test";
import assert from "node:assert/strict";
import {
  injectRuntimePageMarkupBeforeProgram,
  renderRuntimePageInitialStateScript,
  serializeRuntimePageJson
} from "../src/runtime-page-state.js";

test("runtime page state helper safely serializes embedded json for script tags", () => {
  const text = serializeRuntimePageJson({
    html: "<main>",
    attr: 'value "quoted"',
    amp: "fish & chips"
  });

  assert.equal(text.includes("<main>"), false);
  assert.equal(text.includes("& chips"), false);
  assert.match(text, /\\u003cmain\\u003e/);
  assert.match(text, /\\u0026 chips/);
});

test("runtime page state helper renders a named initial-state script", () => {
  const html = renderRuntimePageInitialStateScript("demo-state", { ok: true });

  assert.match(html, /^<script type="application\/json" id="demo-state">/);
  assert.match(html, /{"ok":true}/);
  assert.match(html, /<\/script>$/);
});

test("runtime page state helper injects markup ahead of the frontend program script when present", () => {
  const html = injectRuntimePageMarkupBeforeProgram(
    "<body>\n<script type=\"application/json\" id=\"witness-frontend-program\">{}</script>\n</body>",
    "<script id=\"state\">1</script>"
  );

  assert.match(html, /<script id="state">1<\/script>\s*<script type="application\/json" id="witness-frontend-program">/);
});

test("runtime page state helper falls back to body-close injection when no frontend program script exists", () => {
  const html = injectRuntimePageMarkupBeforeProgram(
    "<body><main>demo</main></body>",
    "<script id=\"state\">1</script>"
  );

  assert.equal(html, "<body><main>demo</main><script id=\"state\">1</script>\n</body>");
});
