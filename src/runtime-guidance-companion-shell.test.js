import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWitnessCoreSuggestions,
  getOrCreateSourceryCompanionShell,
  renderSourceryCompanionShellFactory
} from "./runtime-guidance-companion-shell.js";

class FakeElement {
  constructor(ownerDocument, tagName = "div") {
    this.ownerDocument = ownerDocument;
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.className = "";
    this.textContent = "";
    this.innerHTML = "";
    this.type = "";
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this._id = "";
    this.download = "";
    this.href = "";
  }

  set id(value) {
    this._id = String(value || "");
  }

  get id() {
    return this._id;
  }

  append(...children) {
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  addEventListener(type, handler) {
    const rows = this.listeners.get(type) || [];
    rows.push(handler);
    this.listeners.set(type, rows);
  }

  async click() {
    this.clicked = true;
    const handlers = this.listeners.get("click") || [];
    for (const handler of handlers) {
      await handler({ target: this });
    }
  }
}

function walkById(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = walkById(child, id);
    if (found) return found;
  }
  return null;
}

function createFakeDocument() {
  const document = {
    head: new FakeElement(null, "head"),
    body: new FakeElement(null, "body"),
    createElement(tagName) {
      return new FakeElement(document, tagName);
    },
    getElementById(id) {
      return walkById(document.head, id) || walkById(document.body, id);
    }
  };
  document.head.ownerDocument = document;
  document.body.ownerDocument = document;
  return document;
}

test("sourcery companion downloads inspection JSON and copies active issues only", async () => {
  const document = createFakeDocument();
  const blobParts = [];
  const objectUrls = [];
  const clipboardWrites = [];
  class FakeBlob {
    constructor(parts, options = {}) {
      this.parts = parts;
      this.type = options.type || "";
      blobParts.push(...parts);
    }
  }
  const window = {
    location: { pathname: "/engentus/app" },
    navigator: {
      clipboard: {
        async writeText(value) {
          clipboardWrites.push(value);
        }
      }
    },
    Blob: FakeBlob,
    URL: {
      createObjectURL(blob) {
        objectUrls.push(blob);
        return "blob:test";
      },
      revokeObjectURL() {}
    }
  };
  const inspection = {
    activeSurfaceId: "goodman-chart",
    inspect() {
      return { surface: "goodman-chart", ok: true };
    }
  };
  const issueLedger = {
    list() {
      return [
        { id: "resolved-1", message: "Old", status: "resolved", severity: "warning" },
        { id: "active-1", message: "Current", status: "active", severity: "error" }
      ];
    },
    subscribe() {
      return () => {};
    }
  };

  getOrCreateSourceryCompanionShell({ document, window, enabled: true, inspection, issueLedger });

  const downloadButton = document.getElementById("sourcery-companion-download-json-action");
  const copyIssuesButton = document.getElementById("sourcery-companion-copy-issues-action");
  assert.equal(downloadButton?.textContent, "Download JSON");
  assert.equal(copyIssuesButton?.textContent, "Copy Issues");
  assert.equal(copyIssuesButton?.hidden, false);

  await downloadButton.click();
  assert.equal(objectUrls.length, 1);
  assert.equal(String(blobParts[0]).includes("\"surface\": \"goodman-chart\""), true);

  await copyIssuesButton.click();
  assert.equal(clipboardWrites.length, 1);
  const copied = JSON.parse(clipboardWrites[0]);
  assert.equal(copied.activeOnly, true);
  assert.equal(copied.issueCount, 1);
  assert.equal(copied.issues[0].id, "active-1");
});

test("sourcery companion hides copy issues when the issue list is empty", () => {
  const document = createFakeDocument();
  const window = {};
  const shell = getOrCreateSourceryCompanionShell({
    document,
    window,
    enabled: true,
    inspection: { inspect() { return {}; } },
    issueLedger: {
      list() {
        return [];
      },
      subscribe() {
        return () => {};
      }
    }
  });

  const copyIssuesButton = document.getElementById("sourcery-companion-copy-issues-action");
  assert.equal(copyIssuesButton?.hidden, true);
  shell.destroy();
});

test("sourcery companion renders witness core status independently of issues", () => {
  const document = createFakeDocument();
  const window = {};
  const shell = getOrCreateSourceryCompanionShell({
    document,
    window,
    enabled: true,
    inspection: { inspect() { return {}; } },
    issueLedger: {
      list() {
        return [];
      },
      subscribe() {
        return () => {};
      }
    }
  });

  shell.setCoreStatusSuggestions([
    {
      id: "witness-core-status",
      title: "Witness Core Live",
      body: "latest: gen_a / green_local\nstable: gen_stable",
      severity: "info",
      buttonLabel: "Open Core",
      action: { kind: "openWitnessCore", url: "http://127.0.0.1:8788/generations" }
    }
  ]);

  const suggestions = document.getElementById("sourcery-companion-suggestions");
  assert.equal(suggestions?.hidden, false);
  assert.match(suggestions?.innerHTML ?? "", /Witness Core Live/);
  assert.match(suggestions?.innerHTML ?? "", /gen_a \/ green_local/);
  shell.destroy();
});

test("witness core suggestions expose promote and rollback actions from status aliases", () => {
  const rows = buildWitnessCoreSuggestions({
    aliases: {
      current_stable: "gen_stable",
      current_green_local: "gen_green",
      last_good: "gen_stable"
    },
    process: {
      command: "npm run engentus",
      workingDir: ".",
      running: true,
      pid: 1234,
      restartCount: 2,
      lastExitCode: 1,
      lastError: "process wait failed"
    },
    generations: [
      { id: "gen_stable", state: "stable" },
      { id: "gen_failed", state: "proof_failed" }
    ]
  }, "http://127.0.0.1:8788");

  assert.equal(rows.length, 6);
  assert.equal(rows[0].id, "witness-core-status");
  assert.equal(rows[1].id, "witness-core-process");
  assert.match(rows[1].body, /restarts: 2/);
  assert.equal(rows[1].action.url, "http://127.0.0.1:8788/processes");
  assert.equal(rows[2].action.kind, "restartWitnessCoreProcess");
  assert.equal(rows[2].action.url, "http://127.0.0.1:8788/processes/restart");
  assert.equal(rows[3].action.kind, "promoteWitnessCoreGeneration");
  assert.equal(rows[3].action.url, "http://127.0.0.1:8788/generations/gen_green/promote");
  assert.equal(rows[4].action.kind, "rollbackWitnessCoreGeneration");
  assert.equal(rows[4].action.url, "http://127.0.0.1:8788/generations/gen_stable/rollback");
  assert.equal(rows[5].action.kind, "stopWitnessCoreProcess");
  assert.equal(rows[5].action.url, "http://127.0.0.1:8788/processes/stop");
});

test("sourcery companion browser factory includes guidance suggestion action runtime", () => {
  const source = renderSourceryCompanionShellFactory();
  assert.match(source, /const runGuidanceSuggestionAction = /);
});
