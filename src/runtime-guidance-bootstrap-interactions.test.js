import test from "node:test";
import assert from "node:assert/strict";
import { createBootstrapGuidanceInteractionRuntime } from "./runtime-guidance-bootstrap-interactions.js";

class FakeClassList {
  constructor(node) {
    this.node = node;
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
    this.node.className = [...this.values].join(" ");
  }

  remove(value) {
    this.values.delete(value);
    this.node.className = [...this.values].join(" ");
  }
}

class FakeNode {
  constructor(tagName = "div", { id = "", className = "" } = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.className = className;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.style = {};
    this.dataset = {};
    this.type = "";
    this.value = "";
    this.checked = false;
    this.offsetWidth = 160;
    this.offsetHeight = 120;
    this.isConnected = true;
    this.classList = new FakeClassList(this);
    if (className) {
      for (const token of className.split(/\s+/).filter(Boolean)) this.classList.add(token);
    }
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  matches(selector) {
    return selector.split(",").map(part => part.trim()).some(part => {
      if (part === "form") return this.tagName === "FORM";
      if (part === "details") return this.tagName === "DETAILS";
      if (part === ".card") return this.className.split(/\s+/).includes("card");
      if (part === ".surface-card") return this.className.split(/\s+/).includes("surface-card");
      if (part === "input") return this.tagName === "INPUT";
      if (part === "select") return this.tagName === "SELECT";
      if (part === "textarea") return this.tagName === "TEXTAREA";
      if (part === "button") return this.tagName === "BUTTON";
      if (part === "a") return this.tagName === "A";
      if (part === "summary") return this.tagName === "SUMMARY";
      if (part === "[tabindex]") return this.attributes.has("tabindex");
      return false;
    });
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  querySelector(selector) {
    const queue = [...this.children];
    while (queue.length) {
      const node = queue.shift();
      if (node.matches(selector)) return node;
      queue.push(...node.children);
    }
    return null;
  }

  scrollIntoView() {
    this.didScroll = true;
  }

  focus() {
    this.didFocus = true;
  }

  getBoundingClientRect() {
    return { left: 100, right: 220, top: 60, bottom: 120, width: 120, height: 60 };
  }
}

function createFakeDocument(rootNodes = []) {
  const body = new FakeNode("body");
  body.append(...rootNodes);
  return {
    body,
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    querySelectorAll(selector) {
      const results = [];
      const queue = [body];
      while (queue.length) {
        const node = queue.shift();
        if (selector === "[data-tutorial-current]" && node.attributes.has("data-tutorial-current")) results.push(node);
        if (selector === "[data-tutorial-focus-scope]" && node.attributes.has("data-tutorial-focus-scope")) results.push(node);
        queue.push(...node.children);
      }
      return results;
    }
  };
}

test("bootstrap guidance interactions fill forms and pulse fields through the extracted helper", () => {
  const form = new FakeNode("form");
  const input = new FakeNode("input");
  const checkbox = new FakeNode("input");
  checkbox.type = "checkbox";
  form.append(input, checkbox);
  const document = createFakeDocument([form]);

  const interactions = createBootstrapGuidanceInteractionRuntime({
    document,
    window: { innerWidth: 1200, innerHeight: 800 },
    byId: () => null,
    byTarget: () => null,
    formField(_form, key) {
      return key === "name" ? input : (key === "attach" ? checkbox : null);
    },
    revealTarget() {}
  });

  interactions.fillForm(form, { name: "todo_app", attach: true });
  assert.equal(input.value, "todo_app");
  assert.equal(checkbox.checked, true);
  assert.equal(input.getAttribute("data-tutorial-changed"), "true");
});

test("bootstrap guidance interactions focus scope targets and disabled guidance roots", () => {
  const target = new FakeNode("input");
  const card = new FakeNode("div", { className: "surface-card" });
  card.append(target);
  const disabledRoot = new FakeNode("div", { id: "tutorial-disabled-pages" });
  const button = new FakeNode("button");
  disabledRoot.append(button);
  const document = createFakeDocument([card, disabledRoot]);

  const interactions = createBootstrapGuidanceInteractionRuntime({
    document,
    window: { innerWidth: 1200, innerHeight: 800 },
    byId(id) {
      return id === "tutorial-disabled-pages" ? disabledRoot : null;
    },
    byTarget(name) {
      return name === "todo-form" ? target : null;
    },
    formField() { return null; },
    revealTarget() {}
  });

  assert.equal(interactions.focusTutorialScopeTarget("todo-form"), true);
  assert.equal(card.getAttribute("data-tutorial-focus-scope"), "true");
  assert.equal(target.didScroll, true);
  assert.equal(interactions.focusDisabledGuidance(), true);
  assert.equal(disabledRoot.getAttribute("data-tutorial-focus-scope"), "true");
  assert.equal(button.didFocus, true);
});

test("bootstrap guidance interactions position the overlay and mark the active tutorial step target", () => {
  const overlay = new FakeNode("aside", { id: "tutorial-overlay" });
  overlay.offsetWidth = 200;
  overlay.offsetHeight = 100;
  const target = new FakeNode("button");
  const wrapper = new FakeNode("div", { className: "surface-card" });
  wrapper.append(target);
  const document = createFakeDocument([overlay, wrapper]);

  const interactions = createBootstrapGuidanceInteractionRuntime({
    document,
    window: { innerWidth: 600, innerHeight: 400 },
    byId(id) {
      return id === "tutorial-overlay" ? overlay : null;
    },
    byTarget() { return null; },
    formField() { return null; },
    revealTarget() {}
  });

  interactions.positionOverlay(target);
  assert.equal(typeof overlay.style.left, "string");
  assert.equal(typeof overlay.style.top, "string");
  interactions.setActiveTutorialStepTarget(target);
  assert.equal(target.getAttribute("data-tutorial-current"), "true");
  assert.equal(wrapper.getAttribute("data-tutorial-focus-scope"), "true");
  interactions.clearTutorialHighlight();
  assert.equal(target.getAttribute("data-tutorial-current"), null);
});
