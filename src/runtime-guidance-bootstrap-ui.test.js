import test from "node:test";
import assert from "node:assert/strict";
import {
  renderBootstrapGuidanceCard,
  renderBootstrapGuidanceOverlay,
  renderBootstrapGuidanceStyles
} from "./runtime-guidance-bootstrap-ui.js";

test("bootstrap guidance styles no longer re-own shared tutorial selector families", () => {
  const css = renderBootstrapGuidanceStyles();

  assert.equal(css.includes(".tutorial-overlay"), false);
  assert.equal(css.includes(".tutorial-concept"), false);
  assert.equal(css.includes(".tutorial-suggestion"), false);
  assert.equal(css.includes(".tutorial-disabled-item"), false);
  assert.equal(css.includes(".tutorial-hidden"), false);
});

test("bootstrap guidance card consumes shared surface primitives instead of raw presentation classes", () => {
  const html = renderBootstrapGuidanceCard({
    title: "Bootstrap Guidance",
    bootstrapCardBadge: "Guidance",
    summary: "Use the real authored surface."
  });

  assert.match(html, /surface-card surface-stack/);
  assert.match(html, /surface-badge/);
  assert.match(html, /surface-grid-2/);
  assert.match(html, /surface-kicker/);
  assert.match(html, /surface-actions/);
  assert.match(html, /surface-button-secondary/);
  assert.match(html, /surface-status/);
  assert.doesNotMatch(html, /class="card"/);
  assert.doesNotMatch(html, /class="badge"/);
  assert.doesNotMatch(html, /class="grid two"/);
  assert.doesNotMatch(html, /class="actions"/);
  assert.doesNotMatch(html, /class="secondary"/);
  assert.doesNotMatch(html, /class="status"/);
  assert.doesNotMatch(html, /class="kicker"/);
});

test("bootstrap guidance overlay consumes shared tutorial and surface primitive classes", () => {
  const html = renderBootstrapGuidanceOverlay();

  assert.match(html, /class="tutorial-dimmer tutorial-hidden"/);
  assert.match(html, /class="tutorial-overlay tutorial-hidden"/);
  assert.match(html, /class="tutorial-overlay-handle"/);
  assert.match(html, /class="tutorial-overlay-meta"/);
  assert.match(html, /class="surface-actions"/);
  assert.match(html, /surface-button-secondary/);
  assert.doesNotMatch(html, /class="secondary"/);
  assert.doesNotMatch(html, /class="actions"/);
  assert.doesNotMatch(html, /class="tutorial-meta"/);
});
