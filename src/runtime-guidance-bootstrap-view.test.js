import test from "node:test";
import assert from "node:assert/strict";
import {
  renderBootstrapGuidanceConceptList,
  renderBootstrapGuidanceDisabledRows,
  renderBootstrapGuidanceSuggestionList
} from "./runtime-guidance-bootstrap-view.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "").toUpperCase();
    this.className = "";
    this.textContent = "";
    this.dataset = {};
    this.children = [];
    this.type = "";
    this._innerHTML = "";
  }

  append(...children) {
    this.children.push(...children);
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    }
  };
}

test("bootstrap guidance concept list view renders empty and populated concept rows", () => {
  const document = createFakeDocument();
  const root = new FakeElement("div");

  renderBootstrapGuidanceConceptList({
    root,
    concepts: [],
    emptyText: "Nothing yet.",
    document
  });
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].className, "tutorial-concept");
  assert.equal(root.children[0].children[0].textContent, "Nothing yet.");

  renderBootstrapGuidanceConceptList({
    root,
    concepts: [{ label: "App Boundary", summary: "Real app runtime." }],
    emptyText: "ignored",
    document
  });
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].children[0].tagName, "STRONG");
  assert.equal(root.children[0].children[0].textContent, "App Boundary");
  assert.equal(root.children[0].children[1].textContent, "Real app runtime.");
});

test("bootstrap guidance suggestion list view renders shared surface action rows", () => {
  const document = createFakeDocument();
  const root = new FakeElement("div");

  renderBootstrapGuidanceSuggestionList({
    root,
    suggestions: [{
      id: "open-live-app",
      title: "Open The Live App",
      body: "Use the real page.",
      buttonLabel: "Open"
    }],
    document
  });

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].className, "tutorial-suggestion");
  assert.equal(root.children[0].children[2].className, "surface-actions");
  assert.equal(root.children[0].children[2].children[0].className, "surface-button-secondary");
  assert.equal(root.children[0].children[2].children[0].dataset.suggestionId, "open-live-app");
});

test("bootstrap guidance disabled rows view renders shared action buttons and stateful data attrs", () => {
  const document = createFakeDocument();
  const root = new FakeElement("div");

  renderBootstrapGuidanceDisabledRows({
    root,
    rows: [{
      type: "scope",
      status: "muted",
      scopeKey: "page:app",
      page: "app",
      pageLabel: "App",
      label: "App",
      currentStepTitle: null,
      isCurrentSurface: false,
      target: "todo-form"
    }],
    document
  });

  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].className, "tutorial-disabled-item");
  assert.equal(root.children[0].children[3].className, "surface-actions");
  assert.equal(root.children[0].children[3].children[0].dataset.disabledFocus, "todo-form");
  assert.equal(root.children[0].children[3].children[1].dataset.disabledScope, "page:app");
  assert.equal(root.children[0].children[3].children[1].dataset.disabledEnable, "app");
  assert.equal(root.children[0].children[3].children[2].dataset.disabledOpen, "app");
  assert.equal(root.children[0].children[3].children[0].className, "surface-button-secondary");
});
