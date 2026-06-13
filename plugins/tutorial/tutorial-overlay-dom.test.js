import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialOverlayDom,
  renderTutorialOverlayDomFactory
} from "./tutorial-overlay-dom.js";

function createFakeElement(tagName) {
  return {
    tagName: String(tagName).toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    hidden: false,
    style: {},
    children: [],
    attributes: new Map(),
    parentElement: null,
    append(...nodes) {
      for (const node of nodes) {
        if (!node) continue;
        node.parentElement = this;
        this.children.push(node);
      }
    },
    appendChild(node) {
      this.append(node);
      return node;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  };
}

function createFakeDocument() {
  const body = createFakeElement("body");
  return {
    body,
    createElement(tagName) {
      return createFakeElement(tagName);
    }
  };
}

test("tutorial overlay DOM helper builds the overlay skeleton without innerHTML injection", () => {
  const document = createFakeDocument();
  const dom = createTutorialOverlayDom({ document });

  assert.equal(document.body.children.length, 5);
  assert.equal(dom.dimmer.className, "tutorial-dimmer");
  assert.equal(dom.overlay.tagName, "ASIDE");
  assert.equal(dom.overlay.className, "tutorial-overlay");
  assert.equal(dom.overlay.children[0].id, "tutorial-overlay-handle");
  assert.equal(dom.overlay.children[1].id, "tutorial-overlay-title");
  assert.equal(dom.overlay.children[2].id, "tutorial-overlay-body");
  assert.equal(dom.overlay.children[3].id, "tutorial-overlay-concepts");
  assert.equal(dom.overlay.children[4].children.length, 9);
  assert.equal(dom.resumeButton.id, "tutorial-resume-page");
  assert.equal(dom.disabledScopesToggle.id, "tutorial-disabled-scopes-toggle");
  assert.equal(dom.disabledScopesToggle.style.bottom, "72px");
  assert.equal(dom.disabledScopesPanel.id, "tutorial-disabled-scopes-panel");
  assert.equal(dom.disabledScopesPanel.children[1].id, "tutorial-disabled-scopes-list");
});

test("tutorial overlay DOM factory exposes the shared browser helper", () => {
  const factory = renderTutorialOverlayDomFactory();
  assert.equal(factory.includes("const createTutorialOverlayDom ="), true);
});
