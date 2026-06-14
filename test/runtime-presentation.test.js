import test from "node:test";
import assert from "node:assert/strict";

import {
  PAGE_PRESENTATION_REGION_CLASSNAMES,
  SHARED_SURFACE_KIT_CSS,
  renderPagePresentationChromeCss,
  renderPagePresentationCssVars,
  resolvePagePresentationTheme
} from "../src/runtime-presentation.js";
import { renderBootstrapShellHead } from "../plugins/bootstrap/bootstrap-shell-head.js";
import { renderWidgetPageHead } from "../plugins/inspect/widget-page-head.js";

test("page presentation theme resolution and css vars are stable across consumers", () => {
  const pageTheme = resolvePagePresentationTheme({
    themeId: "moss",
    material: "stone",
    typography: "mono"
  });
  const cssVars = renderPagePresentationCssVars(pageTheme);

  assert.equal(pageTheme.themeId, "moss");
  assert.equal(pageTheme.material, "stone");
  assert.equal(pageTheme.typography, "mono");
  assert.match(cssVars, /--page-bg: linear-gradient\(180deg, #edf2e6 0%, #dde7d4 100%\)/);
  assert.match(cssVars, /--surface-shadow: 0 16px 34px rgba\(45, 45, 45, 0.12\)/);
  assert.match(cssVars, /--body-font: ui-monospace/);
  assert.match(cssVars, /--button-ink: #25301f/);
  assert.match(cssVars, /--state-failed: #a34b42/);
  assert.match(cssVars, /--space-4: 16px/);
  assert.match(cssVars, /--radius-pill: 999px/);
  assert.match(cssVars, /--elevation-overlay: 0 20px 46px rgba\(38, 38, 38, 0.22\)/);
  assert.match(cssVars, /--motion-medium: 180ms ease/);
});

test("bootstrap and inspect heads both consume the shared presentation contract", () => {
  const pageTheme = resolvePagePresentationTheme({ themeId: "straw", material: "wood", typography: "serif" });
  const bootstrapHead = renderBootstrapShellHead();
  const widgetHead = renderWidgetPageHead("Inspect", pageTheme);

  assert.equal(bootstrapHead.includes(SHARED_SURFACE_KIT_CSS.trim()), true);
  assert.equal(widgetHead.includes(SHARED_SURFACE_KIT_CSS.trim()), true);
  assert.equal(widgetHead.includes(renderPagePresentationCssVars(pageTheme).trim()), true);
  assert.equal(bootstrapHead.includes(renderPagePresentationChromeCss().trim()), true);
  assert.equal(bootstrapHead.includes(PAGE_PRESENTATION_REGION_CLASSNAMES.header), true);
  assert.match(bootstrapHead, /--surface-bg: #fffdf8/);
  assert.match(bootstrapHead, /--state-done: #4d7b3a/);
  assert.match(widgetHead, /--surface-bg: #fbf5e6/);
});
