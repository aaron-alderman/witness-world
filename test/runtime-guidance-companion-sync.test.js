import assert from "node:assert/strict";
import test from "node:test";

import { getOrCreateSourceryCompanionShell } from "../src/runtime-guidance-companion-shell.js";
import {
  bindSourceryCompanionSuggestionActions,
  syncSourceryCompanionShell
} from "../src/runtime-guidance-companion-sync.js";

function createFakeDocument() {
  const nodes = new Map();
  const body = {
    appendChild(node) {
      if (node.id) nodes.set(node.id, node);
    }
  };
  const head = { appendChild() {} };
  return {
    createElement(tag) {
      const listeners = new Map();
      const node = {
        tagName: tag.toUpperCase(),
        id: "",
        hidden: false,
        className: "",
        textContent: "",
        innerHTML: "",
        addEventListener(name, fn) {
          listeners.set(name, fn);
        },
        dispatchClick(event) {
          return listeners.get("click")?.(event);
        },
        append(...children) {
          node._children = children;
        },
        get children() { return node._children || []; }
      };
      return node;
    },
    getElementById(id) {
      return nodes.get(id) || null;
    },
    body,
    head
  };
}

test("syncSourceryCompanionShell surfaces guidance suggestions and recovery state on the companion fab", () => {
  const document = createFakeDocument();
  const window = {};
  getOrCreateSourceryCompanionShell({ document, window, enabled: true });

  syncSourceryCompanionShell({
    windowTarget: window,
    guidanceSuggestions: [{
      id: "resume-tutorial",
      title: "Resume Tutorial",
      body: "Paused step remains available.",
      buttonLabel: "Resume",
      action: { kind: "resumeTutorial" }
    }],
    guidanceState: { visible: true, label: "Resume Tutorial", onResume: () => {} }
  });

  const shell = window.__sourceryCompanionShell;
  assert.equal(shell.root.hidden, false);
  assert.equal(shell.fab.textContent, "Resume Tutorial");
  assert.equal(shell.suggestions.innerHTML.includes("Resume Tutorial"), true);
});

test("bindSourceryCompanionSuggestionActions routes companion suggestion clicks through the registered runner", async () => {
  const document = createFakeDocument();
  const window = {};
  getOrCreateSourceryCompanionShell({ document, window, enabled: true });
  syncSourceryCompanionShell({
    windowTarget: window,
    guidanceSuggestions: [{
      id: "focus-target",
      title: "Show Control",
      body: "Use the highlighted control.",
      buttonLabel: "Show",
      action: { kind: "focusTarget", target: "demo-target" }
    }]
  });

  const seen = [];
  bindSourceryCompanionSuggestionActions({
    windowTarget: window,
    runSuggestion: async suggestion => {
      seen.push(suggestion.id);
    }
  });

  const suggestions = window.__sourceryCompanionShell.suggestions;
  await suggestions.dispatchClick({
    target: {
      closest(selector) {
        if (selector !== "[data-companion-suggestion-action]") return null;
        return { getAttribute: () => "focus-target" };
      }
    }
  });

  assert.deepEqual(seen, ["focus-target"]);
});