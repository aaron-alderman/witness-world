import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTutorialDisabledScopesActions,
  renderTutorialDisabledScopesActionsFactory,
  runTutorialDisabledScopesPanelAction
} from "./tutorial-disabled-scopes-actions.js";

function createButton(matchSelector, attrs = {}) {
  return {
    closest(selector) {
      return selector === matchSelector ? this : null;
    },
    getAttribute(name) {
      return attrs[name] || "";
    }
  };
}

test("tutorial disabled-scope action helper routes focus, enable, context-enable, and open actions", async () => {
  const calls = [];
  const rows = [{ scopeKey: "", target: "todo-form" }];

  const makeEvent = target => ({
    target,
    preventDefault() {
      calls.push("preventDefault");
    }
  });

  const focused = await runTutorialDisabledScopesPanelAction({
    event: makeEvent(createButton('[data-disabled-scope-focus]', {
      'data-disabled-scope-focus': 'section:app:todo_form'
    })),
    progress: { disabledScopeKeys: [] },
    tutorialDisabledGuidanceRowsFn: () => rows,
    focusTutorialScopeTargetFn: scopeKey => calls.push(["focus-scope", scopeKey])
  });
  assert.equal(focused, true);

  const enabledContext = await runTutorialDisabledScopesPanelAction({
    event: makeEvent(createButton('[data-disabled-context-enable]', {
      'data-disabled-context-enable': 'ctx.todo'
    })),
    progress: { disabledContextIds: ["ctx.todo"] },
    clearTutorialContextDisabledFn: (progress, contextId) => ({ ...progress, clearedContext: contextId }),
    saveProgress: async next => {
      calls.push(["save-context", next.clearedContext]);
    },
    render: () => calls.push("render-context")
  });
  assert.equal(enabledContext, true);

  const enabledScope = await runTutorialDisabledScopesPanelAction({
    event: makeEvent(createButton('[data-disabled-scope-enable]', {
      'data-disabled-scope-enable': 'section:app:todo_form'
    })),
    progress: { disabledScopeKeys: ["section:app:todo_form"] },
    clearTutorialScopeDisabledFn: (progress, scopeKey) => ({ ...progress, clearedScope: scopeKey }),
    saveProgress: async next => {
      calls.push(["save-scope", next.clearedScope]);
    },
    render: () => calls.push("render-scope")
  });
  assert.equal(enabledScope, true);

  const opened = await runTutorialDisabledScopesPanelAction({
    event: makeEvent(createButton('[data-disabled-scope-open]', {
      'data-disabled-scope-open': 'bootstrap'
    })),
    continueTutorialOnPage: async page => {
      calls.push(["open-page", page]);
    }
  });
  assert.equal(opened, true);

  assert.deepEqual(calls, [
    "preventDefault",
    ["focus-scope", "section:app:todo_form"],
    "preventDefault",
    ["save-context", "ctx.todo"],
    "render-context",
    "preventDefault",
    ["save-scope", "section:app:todo_form"],
    "render-scope",
    "preventDefault",
    ["open-page", "bootstrap"]
  ]);
});

test("tutorial disabled-scope action binder wires toggle, close, and delegated panel clicks", async () => {
  const listeners = new Map();
  let disabledScopesOpen = false;
  const calls = [];
  bindTutorialDisabledScopesActions({
    disabledScopesToggle: {
      addEventListener(type, handler) {
        listeners.set("toggle:" + type, handler);
      }
    },
    disabledScopesClose: {
      addEventListener(type, handler) {
        listeners.set("close:" + type, handler);
      }
    },
    disabledScopesPanel: {
      addEventListener(type, handler) {
        listeners.set("panel:" + type, handler);
      }
    },
    getDisabledScopesOpen: () => disabledScopesOpen,
    setDisabledScopesOpen: value => {
      disabledScopesOpen = value;
      calls.push(["set-open", value]);
    },
    renderDisabledScopes: () => calls.push("render-disabled"),
    getProgress: () => ({ disabledScopeKeys: ["section:app:todo_form"] }),
    clearTutorialScopeDisabledFn: (progress, scopeKey) => ({ ...progress, clearedScope: scopeKey }),
    saveProgress: async next => {
      calls.push(["save", next.clearedScope]);
    },
    render: () => calls.push("render"),
    continueTutorialOnPage: async page => calls.push(["open-page", page])
  });

  listeners.get("toggle:click")();
  listeners.get("close:click")();
  await listeners.get("panel:click")({
    target: createButton('[data-disabled-scope-enable]', {
      'data-disabled-scope-enable': 'section:app:todo_form'
    }),
    preventDefault() {
      calls.push("preventDefault");
    }
  });

  assert.deepEqual(calls, [
    ["set-open", true],
    "render-disabled",
    ["set-open", false],
    "render-disabled",
    "preventDefault",
    ["save", "section:app:todo_form"],
    "render"
  ]);
});

test("tutorial disabled-scope actions factory exposes the shared browser helpers", () => {
  const factory = renderTutorialDisabledScopesActionsFactory();
  assert.equal(factory.includes("const runTutorialDisabledScopesPanelAction ="), true);
  assert.equal(factory.includes("const bindTutorialDisabledScopesActions ="), true);
});
