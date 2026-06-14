import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  renderInactiveBackendSeamsPage,
  renderInactiveRuntimeWidgetPage
} from "../src/runtime-page-fallbacks.js";

test("shared runtime fallback pages escape titles and preserve inactive copy", () => {
  const widgetHtml = renderInactiveRuntimeWidgetPage({ rootWidget: "<DemoWidget>" });
  const backendHtml = renderInactiveBackendSeamsPage();

  assert.match(widgetHtml, /<title>&lt;DemoWidget&gt;<\/title>/);
  assert.match(widgetHtml, /<h1>&lt;DemoWidget&gt;<\/h1>/);
  assert.match(widgetHtml, /Widget rendering is not active in this runtime composition\./);
  assert.doesNotMatch(widgetHtml, /<title><DemoWidget><\/title>/);
  assert.match(backendHtml, /<title>Backend Seams<\/title>/);
  assert.match(backendHtml, /Backend seams plugin is inactive\./);
});

test("runtime handlers consume the shared fallback-page helpers instead of inline stub html", async () => {
  const coreSource = await readFile(new URL("../src/runtime-core-handlers.js", import.meta.url), "utf8");
  const routeSource = await readFile(new URL("../src/runtime-route-handlers.js", import.meta.url), "utf8");

  assert.equal(coreSource.includes('renderInactiveRuntimeWidgetPage'), true);
  assert.equal(coreSource.includes('Widget rendering is not active in this runtime composition.'), false);
  assert.equal(routeSource.includes('renderInactiveBackendSeamsPage'), true);
  assert.equal(routeSource.includes('Backend seams plugin is inactive.'), false);
});
