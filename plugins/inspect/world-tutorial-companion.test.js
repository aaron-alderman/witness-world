import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWorldTutorialCompanionGuidanceState,
  renderWorldTutorialCompanionFactory,
  syncWorldTutorialCompanionShell
} from "./world-tutorial-companion.js";
import { getOrCreateSourceryCompanionShell } from "../../src/runtime-guidance-companion-shell.js";

function createFakeDocument() {
  const nodes = new Map();
  const body = {
    appendChild(node) {
      if (node.id) nodes.set(node.id, node);
    }
  };
  const head = { appendChild() {} };
  return {
    createElement() {
      return {
        id: "",
        hidden: false,
        className: "",
        textContent: "",
        innerHTML: "",
        addEventListener() {},
        append() {}
      };
    },
    getElementById(id) {
      return nodes.get(id) || null;
    },
    body,
    head
  };
}

test("buildWorldTutorialCompanionGuidanceState exposes recovery affordance for offpage world guidance", () => {
  const state = buildWorldTutorialCompanionGuidanceState({
    progress: { stepId: "app:intro", completedAt: null },
    tutorialSurfaceState: () => ({ kind: "offpage", page: "app" }),
    tutorialPageLabel: page => (page === "app" ? "App" : page),
    onResume: () => {}
  });

  assert.equal(state.visible, true);
  assert.equal(state.label, "Continue On App");
  assert.equal(typeof state.onResume, "function");
});

test("syncWorldTutorialCompanionShell ranks live guidance suggestions on the companion shell", () => {
  const document = createFakeDocument();
  const window = {};
  getOrCreateSourceryCompanionShell({ document, window, enabled: true });

  syncWorldTutorialCompanionShell({
    windowTarget: window,
    progress: { stepId: "world:inspect", completedAt: null, hidden: false },
    currentStep: () => ({ id: "world:inspect", page: "world", title: "Inspect", target: "world-command-toggle" }),
    tutorialSurfaceState: () => ({ kind: "active", page: "world" }),
    tutorialPageLabel: page => page,
    tutorialStepScope: () => ({ key: "world" }),
    tutorialStepSurfaceContext: () => null,
    tutorialContextInfo: () => null,
    isTutorialContextDisabled: () => false,
    isTutorialScopeDisabled: () => false,
    scopeInventoryRowsFn: () => [],
    onResume: () => {}
  });

  const shell = window.__sourceryCompanionShell;
  assert.equal(shell.root.hidden, false);
  assert.equal(shell.suggestions.innerHTML.includes("Show Current Control"), true);
});

test("world tutorial companion factory exposes browser helpers", () => {
  const factory = renderWorldTutorialCompanionFactory();
  assert.equal(factory.includes("const syncWorldTutorialCompanionShell ="), true);
  assert.equal(factory.includes("const buildLiveGuidanceSuggestions ="), true);
  assert.equal(factory.includes("const getOrCreateSourceryCompanionShell ="), true);
});