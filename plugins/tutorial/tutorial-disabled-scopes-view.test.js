import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialDisabledScopeCard,
  renderTutorialDisabledScopeRows,
  renderTutorialDisabledScopesViewFactory,
  tutorialDisabledScopeDescription
} from "./tutorial-disabled-scopes-view.js";

function createFakeElement(tagName) {
  return {
    tagName: String(tagName).toUpperCase(),
    className: "",
    textContent: "",
    style: {},
    children: [],
    parentElement: null,
    attributes: new Map(),
    append(...nodes) {
      for (const node of nodes) {
        if (!node) continue;
        node.parentElement = this;
        this.children.push(node);
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  };
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return createFakeElement(tagName);
    }
  };
}

test("tutorial disabled-scope view helper renders cards with preserved action hooks", () => {
  const document = createFakeDocument();
  const list = createFakeElement("div");

  renderTutorialDisabledScopeRows({
    list,
    rows: [{
      scopeKey: "section:app:todo_form",
      focusScopeKey: "section:app:todo_form",
      label: "Todo form",
      target: "todo-form",
      page: "app",
      type: "scope"
    }, {
      contextId: "ctx.todo",
      label: "Todo context",
      page: "bootstrap",
      type: "context"
    }],
    currentSurfacePage: "app",
    tutorialPageLabel: page => page === "bootstrap" ? "Bootstrap" : page,
    document
  });

  assert.equal(list.children.length, 2);
  const scopeCard = list.children[0];
  assert.equal(scopeCard.children[0].textContent, "Todo form");
  assert.equal(scopeCard.children[2].children[0].attributes.get("data-disabled-scope-focus"), "section:app:todo_form");
  assert.equal(scopeCard.children[2].children[1].attributes.get("data-disabled-scope-enable"), "section:app:todo_form");

  const contextCard = list.children[1];
  assert.equal(contextCard.children[1].textContent, "Sourcery is disabled for this context, but you can re-enable it without losing progress.");
  assert.equal(contextCard.children[2].children[0].attributes.get("data-disabled-context-enable"), "ctx.todo");
  assert.equal(contextCard.children[2].children[1].attributes.get("data-disabled-scope-open"), "bootstrap");
  assert.equal(contextCard.children[2].children[1].textContent, "Open Bootstrap");
});

test("tutorial disabled-scope view helper exposes row description and factory contracts", () => {
  assert.equal(tutorialDisabledScopeDescription({
    row: { currentStepTitle: "Add Widget" }
  }), "Current step there: Add Widget.");
  const factory = renderTutorialDisabledScopesViewFactory();
  assert.equal(factory.includes("const renderTutorialDisabledScopeRows ="), true);
  const document = createFakeDocument();
  const card = createTutorialDisabledScopeCard({
    row: { label: "Add Widget", scopeKey: "widget:todo_widget_editor_button", page: "bootstrap", type: "scope" },
    currentSurfacePage: "app",
    tutorialPageLabel: page => page,
    document
  });
  assert.equal(card.children[2].children[0].attributes.get("data-disabled-scope-enable"), "widget:todo_widget_editor_button");
});
