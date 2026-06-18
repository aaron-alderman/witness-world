import assert from "node:assert/strict";
import test from "node:test";

import {
  buildGuidanceScopeInventoryRows,
  guidanceScopeInventoryStatus
} from "../src/runtime-guidance-scope-inventory.js";
import {
  createTutorialProgress,
  setTutorialScopeDisabled,
  todoTutorialDefinition,
  tutorialStepScope
} from "../plugins/tutorial/tutorials.js";

test("scope inventory marks active, muted, and completed scopes truthfully", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "app:intro");
  const muted = setTutorialScopeDisabled(tutorial, progress, "section:app:todo_form", true);

  const rows = buildGuidanceScopeInventoryRows(tutorial, muted, { currentSurfacePage: "app" });
  const active = rows.find(row => row.scopeKey === tutorialStepScope(tutorial, "app:intro")?.key);
  const mutedRow = rows.find(row => row.scopeKey === "section:app:todo_form");
  const pageRow = rows.find(row => row.scopeKey === "page:app");

  assert.equal(mutedRow?.status, "muted");
  assert.equal(active?.status, "active");
  assert.equal(pageRow?.status, "available");
});

test("scope inventory includes bootstrap operator anchors", () => {
  const tutorial = todoTutorialDefinition();
  const progress = createTutorialProgress(tutorial, "identity:create");

  const rows = buildGuidanceScopeInventoryRows(tutorial, progress, { currentSurfacePage: "bootstrap" });
  const capability = rows.find(row => row.scopeKey === "section:bootstrap:capability-form");
  const identityWidget = rows.find(row => row.scopeKey === "widget:bootstrap_identity_id_input");

  assert.deepEqual(capability, {
    type: "scope",
    status: "available",
    scopeKey: "section:bootstrap:capability-form",
    kind: "section",
    page: "bootstrap",
    label: "Capability form",
    pageLabel: "Bootstrap",
    currentStepTitle: null,
    isCurrentSurface: true,
    target: "capability-form"
  });
  assert.equal(identityWidget?.target, "identity-id");
});

test("guidanceScopeInventoryStatus prefers muted over active", () => {
  assert.equal(guidanceScopeInventoryStatus({
    progress: { stepId: "app:intro" },
    scopeKey: "section:app:todo_form",
    currentScopeKey: "section:app:todo_form",
    progressIndex: 1,
    maxStepIndexByScope: new Map([["section:app:todo_form", 2]]),
    isScopeDisabled: () => true
  }), "muted");
});