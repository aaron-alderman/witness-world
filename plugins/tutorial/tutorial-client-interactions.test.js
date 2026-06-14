import test from "node:test";
import assert from "node:assert/strict";
import {
  createTutorialClientInteractions,
  renderTutorialClientInteractionsFactory
} from "./tutorial-client-interactions.js";

test("tutorial client interactions adapter owns target lookup, highlight, focus, and position wrappers", () => {
  const calls = [];
  let activeHighlightTarget = "todo_form";
  let activeFocusScope = "scope.a";
  const node = { id: "todo_form" };
  const documentTarget = {
    querySelector(selector) {
      calls.push(["query", selector]);
      return node;
    }
  };
  const interactions = createTutorialClientInteractions({
    documentTarget,
    windowTarget: { innerWidth: 1000, innerHeight: 800 },
    overlay: { id: "overlay" },
    overlayDrag: { manual: false },
    tutorialScopeTargetNameFn: scopeKey => scopeKey === "scope.a" ? "todo_form" : "",
    getActiveHighlightTarget: () => activeHighlightTarget,
    setActiveHighlightTarget: value => {
      activeHighlightTarget = value;
      calls.push(["highlight", value]);
    },
    getActiveFocusScope: () => activeFocusScope,
    setActiveFocusScope: value => {
      activeFocusScope = value;
      calls.push(["focus-scope", value]);
    },
    clearTutorialOverlayHighlightFn: payload => {
      calls.push(["clear", payload.activeHighlightTarget, payload.activeFocusScope]);
      return { activeHighlightTarget: null, activeFocusScope: null };
    },
    pulseTutorialNodeFn: payload => {
      calls.push(["pulse", payload.node.id, payload.duration]);
      return payload.node;
    },
    flashTutorialAutoClickFn: payload => {
      calls.push(["flash", payload.node.id]);
      return payload.node;
    },
    fillTutorialFormFn: payload => {
      calls.push(["fill", payload.target.id, payload.payload.title]);
      return payload.target;
    },
    focusTutorialOverlayTargetFn: payload => {
      calls.push(["focus-target", payload.targetName]);
      return { focused: true, activeHighlightTarget: "todo_form", activeFocusScope: "scope.todo" };
    },
    focusTutorialOverlayScopeTargetFn: payload => {
      calls.push(["focus-scope-target", payload.scopeKey]);
      return { focused: true, activeFocusScope: "scope.todo" };
    },
    setTutorialOverlayPositionFn: payload => {
      calls.push(["set-position", payload.left, payload.top, payload.manual]);
      return payload;
    },
    positionTutorialOverlayFn: payload => {
      calls.push(["position", payload.target.id]);
      return payload.target;
    }
  });

  assert.equal(interactions.byTarget("todo_form"), node);
  interactions.clearHighlight();
  interactions.pulseNode(node, 900);
  interactions.flashAutoClick(node);
  interactions.fillForm(node, { title: "Buy milk" });
  assert.equal(interactions.focusTutorialTarget("todo_form"), true);
  assert.equal(interactions.focusTutorialScopeTarget("scope.a"), true);
  interactions.setOverlayPosition(40, 50, true);
  interactions.position(node);

  assert.equal(activeHighlightTarget, "todo_form");
  assert.equal(activeFocusScope, "scope.todo");
  assert.deepEqual(calls, [
    ["query", '[data-guidance-target="todo_form"], [data-tutorial-target="todo_form"]'],
    ["clear", "todo_form", "scope.a"],
    ["highlight", null],
    ["focus-scope", null],
    ["pulse", "todo_form", 900],
    ["flash", "todo_form"],
    ["fill", "todo_form", "Buy milk"],
    ["focus-target", "todo_form"],
    ["highlight", "todo_form"],
    ["focus-scope", "scope.todo"],
    ["focus-scope-target", "scope.a"],
    ["focus-scope", "scope.todo"],
    ["set-position", 40, 50, true],
    ["position", "todo_form"]
  ]);
});

test("tutorial client interactions factory exposes the shared browser helpers", () => {
  const factory = renderTutorialClientInteractionsFactory();
  assert.equal(factory.includes("const createTutorialClientInteractions ="), true);
});
