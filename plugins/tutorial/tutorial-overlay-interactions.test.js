import test from "node:test";
import assert from "node:assert/strict";
import {
  clearTutorialOverlayHighlight,
  fillTutorialForm,
  flashTutorialAutoClick,
  focusTutorialOverlayScopeTarget,
  focusTutorialOverlayTarget,
  pulseTutorialNode,
  renderTutorialOverlayInteractionsFactory
} from "./tutorial-overlay-interactions.js";

function createFakeClassList() {
  const names = new Set();
  return {
    add(name) {
      names.add(name);
    },
    remove(name) {
      names.delete(name);
    },
    has(name) {
      return names.has(name);
    }
  };
}

function createFakeNode(tagName = "div") {
  const node = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    style: {},
    attributes: new Map(),
    classList: createFakeClassList(),
    isConnected: true,
    value: "",
    checked: false,
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    append(...children) {
      this.children.push(...children);
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    focus(options) {
      this.focusOptions = options;
    },
    scrollIntoView(options) {
      this.scrollOptions = options;
    },
    remove() {
      this.removed = true;
    },
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 30, height: 40 };
    },
    matches(selector) {
      return selector === "form" ? this.tagName === "FORM" : false;
    },
    closest() {
      return null;
    },
    querySelector() {
      return null;
    }
  };
  return node;
}

test("tutorial overlay interaction helpers clear highlight, pulse nodes, and flash autoclicks through the shared seam", () => {
  const currentNode = createFakeNode();
  currentNode.setAttribute("data-tutorial-current", "true");
  const scopeNode = createFakeNode();
  scopeNode.setAttribute("data-tutorial-focus-scope", "true");
  const queryCurrent = createFakeNode();
  queryCurrent.setAttribute("data-tutorial-current", "true");
  const queryScope = createFakeNode();
  queryScope.setAttribute("data-tutorial-focus-scope", "true");
  const pulseRemovals = [];
  const document = {
    body: createFakeNode("body"),
    createElement() {
      return createFakeNode();
    },
    querySelectorAll(selector) {
      if (selector === "[data-tutorial-current]") return [queryCurrent];
      if (selector === "[data-tutorial-focus-scope]") return [queryScope];
      return [];
    }
  };

  const cleared = clearTutorialOverlayHighlight({
    activeHighlightTarget: currentNode,
    activeFocusScope: scopeNode,
    document
  });
  assert.deepEqual(cleared, { activeHighlightTarget: null, activeFocusScope: null });
  assert.equal(currentNode.attributes.has("data-tutorial-current"), false);
  assert.equal(scopeNode.attributes.has("data-tutorial-focus-scope"), false);
  assert.equal(queryCurrent.attributes.has("data-tutorial-current"), false);
  assert.equal(queryScope.attributes.has("data-tutorial-focus-scope"), false);

  const pulseNodeTarget = createFakeNode();
  const timers = new WeakMap();
  const pulsed = pulseTutorialNode({
    node: pulseNodeTarget,
    duration: 10,
    pulseTimers: timers,
    scheduleTimeout(fn, ms) {
      pulseRemovals.push(ms);
      fn();
      return { id: ms };
    }
  });
  assert.equal(pulsed, true);
  assert.deepEqual(pulseRemovals, [10]);
  assert.equal(pulseNodeTarget.attributes.has("data-tutorial-changed"), false);

  const clickNode = createFakeNode("button");
  const flashDelays = [];
  const flashed = flashTutorialAutoClick({
    node: clickNode,
    pulseTutorialNodeFn: payload => pulseTutorialNode({
      ...payload,
      pulseTimers: new WeakMap(),
      scheduleTimeout(fn) {
        fn();
        return { id: "pulse" };
      }
    }),
    document,
    scheduleTimeout(fn, ms) {
      flashDelays.push(ms);
      fn();
      return { id: ms };
    }
  });
  assert.equal(flashed, true);
  assert.deepEqual(flashDelays, [520, 620]);
  assert.equal(document.body.children.length, 1);
  assert.equal(document.body.children[0].removed, true);
});

test("tutorial overlay interaction helpers fill forms and focus targets through the shared seam", () => {
  const titleField = createFakeNode("input");
  titleField.type = "text";
  const doneField = createFakeNode("input");
  doneField.type = "checkbox";
  const form = createFakeNode("form");
  form.elements = {
    namedItem(name) {
      if (name === "title") return titleField;
      if (name === "done") return doneField;
      return null;
    }
  };

  const pulseCalls = [];
  const filled = fillTutorialForm({
    target: form,
    payload: { title: "Ship", done: true },
    pulseTutorialNodeFn: ({ node, duration }) => {
      pulseCalls.push([node, duration]);
    }
  });
  assert.equal(filled, true);
  assert.equal(titleField.value, "Ship");
  assert.equal(doneField.checked, true);
  assert.deepEqual(pulseCalls, [[titleField, 900], [doneField, 900]]);

  const target = createFakeNode("button");
  target.matches = selector => selector === "input,button,select,textarea,a[href]";
  const scope = createFakeNode("section");
  let cleared = false;
  const focused = focusTutorialOverlayTarget({
    targetName: "todo-form",
    byTarget: name => name === "todo-form" ? target : null,
    clearHighlightFn: () => {
      cleared = true;
      return { activeHighlightTarget: null, activeFocusScope: null };
    },
    focusScopeFor: () => scope,
    pulseTutorialNodeFn: () => {}
  });
  assert.equal(focused.focused, true);
  assert.equal(cleared, true);
  assert.equal(focused.activeHighlightTarget, target);
  assert.equal(focused.activeFocusScope, scope);
  assert.equal(target.attributes.get("data-tutorial-current"), "true");
  assert.equal(scope.attributes.get("data-tutorial-focus-scope"), "true");
  assert.deepEqual(target.scrollOptions, { block: "center", behavior: "smooth" });
  assert.deepEqual(target.focusOptions, { preventScroll: true });

  const staleScope = createFakeNode("section");
  staleScope.setAttribute("data-tutorial-focus-scope", "true");
  const queryScope = createFakeNode("section");
  queryScope.setAttribute("data-tutorial-focus-scope", "true");
  const scopeTarget = createFakeNode("button");
  scopeTarget.matches = selector => selector === "input,button,select,textarea,a[href]";
  const focusDocument = {
    querySelectorAll(selector) {
      return selector === "[data-tutorial-focus-scope]" ? [queryScope] : [];
    }
  };
  const scoped = focusTutorialOverlayScopeTarget({
    scopeKey: "section:todo",
    tutorialScopeTargetNameFn: key => key === "section:todo" ? "todo-button" : null,
    byTarget: name => name === "todo-button" ? scopeTarget : null,
    activeFocusScope: staleScope,
    focusScopeFor: () => scope,
    pulseTutorialNodeFn: () => {},
    document: focusDocument
  });
  assert.equal(scoped.focused, true);
  assert.equal(staleScope.attributes.has("data-tutorial-focus-scope"), false);
  assert.equal(queryScope.attributes.has("data-tutorial-focus-scope"), false);
  assert.equal(scope.attributes.get("data-tutorial-focus-scope"), "true");
  assert.equal(scoped.activeFocusScope, scope);
});

test("tutorial overlay interactions factory exposes the shared browser helpers", () => {
  const factory = renderTutorialOverlayInteractionsFactory();
  assert.equal(factory.includes("const clearTutorialOverlayHighlight ="), true);
  assert.equal(factory.includes("const focusTutorialOverlayTarget ="), true);
});
