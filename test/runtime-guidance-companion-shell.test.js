import assert from "node:assert/strict";
import test from "node:test";

import { createSurfaceRuntimeIssueLedger } from "../src/runtime-surface-diagnostics.js";
import { getOrCreateSourceryCompanionShell } from "../src/runtime-guidance-companion-shell.js";

function createFakeDocument() {
  const nodes = new Map();
  const body = {
    appendChild(node) {
      if (node.id) nodes.set(node.id, node);
    },
    children: []
  };
  const head = { appendChild() {} };
  return {
    createElement(tag) {
      const attrs = {};
      const listeners = new Map();
      const node = {
        tagName: tag.toUpperCase(),
        id: "",
        hidden: false,
        className: "",
        textContent: "",
        innerHTML: "",
        style: {},
        setAttribute() {},
        append(...children) {
          node._children = children;
        },
        addEventListener(name, fn) {
          listeners.set(name, fn);
        },
        click() {
          listeners.get("click")?.();
        },
        get children() { return node._children || []; },
        set children(value) { node._children = value; }
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

test("companion shell shows unified fab and issue suggestions when runtime issues exist", () => {
  const document = createFakeDocument();
  const window = {};
  const issueLedger = createSurfaceRuntimeIssueLedger();
  const inspection = {
    activeSurfaceId: "home",
    latestProbe: { currentProcessRefs: ["app.process"] },
    inspect: () => ({ issues: issueLedger.list() }),
    clearIssues: () => issueLedger.clear(),
    rerunProbe: async () => null
  };

  const shell = getOrCreateSourceryCompanionShell({
    document,
    window,
    enabled: true,
    inspection,
    issueLedger
  });

  issueLedger.upsert({
    id: "runtime:test",
    severity: "error",
    message: "Example runtime issue",
    status: "active"
  });
  shell.render();

  assert.equal(shell.root.hidden, false);
  assert.equal(shell.fab.textContent, "Issues 1");
  assert.match(shell.fab.className, /error/);
  assert.equal(shell.suggestions.innerHTML.includes("Example runtime issue"), true);

  issueLedger.clear();
  shell.render();
  assert.equal(shell.root.hidden, true);
});