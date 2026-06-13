import test from "node:test";
import assert from "node:assert/strict";
import {
  bindWorldTutorialActions,
  renderWorldTutorialActionsFactory
} from "./world-tutorial-actions.js";

function createNode(attributes = {}) {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    listener(type) {
      return listeners.get(type);
    }
  };
}

test("world tutorial actions binder routes tutorial focus, progress, scope, and navigation actions through the shared seam", async () => {
  const focusTarget = createNode({ "data-world-tutorial-focus-target": "world-command-toggle" });
  const focusScopeTarget = createNode({ "data-world-tutorial-focus-scope-target": "scope-1" });
  const showDisabled = createNode();
  const resume = createNode();
  const next = createNode();
  const back = createNode();
  const restartChapter = createNode();
  const restartStep = createNode();
  const enableScope = createNode({ "data-world-tutorial-enable-scope": "scope-1" });
  const enableContext = createNode({ "data-world-tutorial-enable-context": "ctx.todo" });
  const openScope = createNode({ "data-world-tutorial-open-scope": "/world?scope=todo" });
  const disable = createNode();
  const disableContext = createNode();
  const exit = createNode();
  const reset = createNode();
  const root = {
    querySelectorAll(selector) {
      switch (selector) {
        case "[data-world-tutorial-focus-target]": return [focusTarget];
        case "[data-world-tutorial-focus-scope-target]": return [focusScopeTarget];
        case "[data-world-tutorial-show-disabled]": return [showDisabled];
        case "[data-world-tutorial-resume]": return [resume];
        case "[data-world-tutorial-next]": return [next];
        case "[data-world-tutorial-back]": return [back];
        case "[data-world-tutorial-restart-chapter]": return [restartChapter];
        case "[data-world-tutorial-restart-step]": return [restartStep];
        case "[data-world-tutorial-enable-scope]": return [enableScope];
        case "[data-world-tutorial-enable-context]": return [enableContext];
        case "[data-world-tutorial-open-scope]": return [openScope];
        case "[data-world-tutorial-disable]": return [disable];
        case "[data-world-tutorial-disable-context]": return [disableContext];
        case "[data-world-tutorial-exit]": return [exit];
        case "[data-world-tutorial-reset]": return [reset];
        default: return [];
      }
    }
  };
  const calls = [];
  const state = {
    worldTutorialProgress: { scopeKey: "scope-0", hidden: false, replayScopeKey: "scope-0" }
  };

  bindWorldTutorialActions({
    root,
    state,
    draw: () => calls.push("draw"),
    focusWorldTutorialTarget: target => calls.push(["focus-target", target]),
    focusWorldTutorialScopeTarget: target => calls.push(["focus-scope", target]),
    focusWorldTutorialDisabledList: () => calls.push("show-disabled"),
    resumeWorldTutorial: async () => calls.push("resume"),
    advanceWorldTutorial: async () => calls.push("next"),
    backWorldTutorial: async () => calls.push("back"),
    restartWorldTutorialChapter: async () => calls.push("restart-chapter"),
    restartWorldTutorialFromHere: async () => calls.push("restart-step"),
    persistWorldTutorialProgress: async progress => calls.push(["persist", progress]),
    clearWorldTutorialScopeDisabled: (progress, scopeKey) => ({ ...progress, scopeKey }),
    clearWorldTutorialContextDisabled: (progress, contextId) => ({ ...progress, contextId }),
    disableWorldTutorialOnCurrentScope: progress => ({ ...progress, disabledScope: true }),
    disableWorldTutorialOnCurrentContext: progress => ({ ...progress, disabledContext: true }),
    clearWorldTutorialProgress: async () => calls.push("reset"),
    currentSurfaceContext: "ctx.default",
    windowTarget: {
      location: {
        assign(url) {
          calls.push(["assign", url]);
        }
      }
    }
  });

  const clickEvent = () => ({ prevented: false, preventDefault() { this.prevented = true; } });

  focusTarget.listener("click")(clickEvent());
  focusScopeTarget.listener("click")(clickEvent());
  showDisabled.listener("click")(clickEvent());
  await resume.listener("click")(clickEvent());
  await next.listener("click")(clickEvent());
  await back.listener("click")(clickEvent());
  await restartChapter.listener("click")(clickEvent());
  await restartStep.listener("click")(clickEvent());
  await enableScope.listener("click")(clickEvent());
  await enableContext.listener("click")(clickEvent());
  openScope.listener("click")(clickEvent());
  await disable.listener("click")(clickEvent());
  await disableContext.listener("click")(clickEvent());
  await exit.listener("click")(clickEvent());
  await reset.listener("click")(clickEvent());

  assert.deepEqual(calls, [
    ["focus-target", "world-command-toggle"],
    ["focus-scope", "scope-1"],
    "show-disabled",
    "resume",
    "draw",
    "next",
    "draw",
    "back",
    "draw",
    "restart-chapter",
    "draw",
    "restart-step",
    "draw",
    ["persist", { scopeKey: "scope-1", hidden: false, replayScopeKey: "scope-0" }],
    "draw",
    ["persist", { scopeKey: "scope-0", hidden: false, replayScopeKey: "scope-0", contextId: "ctx.todo" }],
    "draw",
    ["assign", "/world?scope=todo"],
    ["persist", { scopeKey: "scope-0", hidden: false, replayScopeKey: "scope-0", disabledScope: true }],
    "draw",
    ["persist", { scopeKey: "scope-0", hidden: false, replayScopeKey: "scope-0", disabledContext: true }],
    "draw",
    ["persist", { scopeKey: "scope-0", hidden: true, replayScopeKey: null }],
    "draw",
    "reset",
    "draw"
  ]);
});

test("world tutorial actions factory exposes the shared browser helpers", () => {
  const factory = renderWorldTutorialActionsFactory();
  assert.equal(factory.includes("const bindWorldTutorialActions ="), true);
});
