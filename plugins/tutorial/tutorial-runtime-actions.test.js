import test from "node:test";
import assert from "node:assert/strict";
import {
  continueTutorialOnPage,
  createTutorialRuntimeActions,
  isTutorialStepComplete,
  readTutorialNotes,
  readTutorialTodos,
  renderTutorialRuntimeActionsFactory,
  restartTutorialChapter,
  restartTutorialFromHere,
  submitTutorialTargetForm
} from "./tutorial-runtime-actions.js";

test("tutorial runtime actions navigate, submit, and restart through the shared seam", async () => {
  const navigations = [];
  let reloads = 0;
  const windowTarget = {
    location: {
      href: "https://example.test/",
      pathname: "/",
      assign(url) {
        navigations.push(url);
      },
      reload() {
        reloads += 1;
      }
    }
  };

  assert.equal(await continueTutorialOnPage({ page: "bootstrap", windowTarget }), true);
  assert.equal(navigations[0], "https://example.test/_bootstrap");
  assert.equal(await continueTutorialOnPage({ page: "world", windowTarget }), false);
  assert.equal(reloads, 0);

  const submitter = {
    clicks: 0,
    click() {
      this.clicks += 1;
    }
  };
  const form = {
    matches(selector) {
      return selector === "form";
    },
    querySelector(selector) {
      return selector.includes("submit") ? submitter : null;
    }
  };
  const waits = [];
  const flashes = [];
  assert.equal(await submitTutorialTargetForm({
    target: form,
    flashAutoClickFn: node => flashes.push(node),
    wait: async ms => {
      waits.push(ms);
    }
  }), true);
  assert.deepEqual(waits, [120]);
  assert.deepEqual(flashes, [submitter]);
  assert.equal(submitter.clicks, 1);

  const saved = [];
  const renders = [];
  assert.equal(await restartTutorialChapter({
    getProgress: () => ({ chapterId: "chapter-a", stepId: "step-2" }),
    currentStep: () => ({ chapterId: "chapter-a" }),
    firstStepInChapter: chapterId => ({ chapterId, id: "step-1" }),
    saveProgress: async next => {
      saved.push(next);
    },
    render: () => renders.push("chapter")
  }), true);
  assert.equal(saved[0].stepId, "step-1");
  assert.equal(saved[0].replayScopeKey, null);
  assert.deepEqual(renders, ["chapter"]);

  assert.equal(await restartTutorialFromHere({
    getProgress: () => ({ chapterId: "chapter-a", stepId: "step-1" }),
    currentStep: () => ({ chapterId: "chapter-b", id: "step-9" }),
    tutorialStepScopeFn: () => ({ key: "section:app:todo-form" }),
    saveProgress: async next => {
      saved.push(next);
    },
    render: () => renders.push("step")
  }), true);
  assert.equal(saved[1].stepId, "step-9");
  assert.equal(saved[1].replayScopeKey, "section:app:todo-form");
  assert.deepEqual(renders, ["chapter", "step"]);
});

test("tutorial runtime actions read completion state through the shared seam", async () => {
  const fetchCalls = [];
  const fetchFn = async url => {
    fetchCalls.push(url);
    return {
      json: async () => url.includes("todos")
        ? { todos: [{ title: "Ship", done: true }] }
        : { notes: [{ text: "Remember me" }] }
    };
  };

  assert.deepEqual(await readTutorialTodos({ fetchFn }), { todos: [{ title: "Ship", done: true }] });
  assert.deepEqual(await readTutorialNotes({ fetchFn }), { notes: [{ text: "Remember me" }] });
  assert.deepEqual(fetchCalls, ["/api/todos", "/api/private-notes"]);

  assert.equal(await isTutorialStepComplete({
    step: { completeWhen: { kind: "manualAdvance" } }
  }), false);
  assert.equal(await isTutorialStepComplete({
    step: { completeWhen: { kind: "todoExists", title: "Ship" } },
    readTodosFn: async () => ({ todos: [{ title: "Ship", done: false }] })
  }), true);
  assert.equal(await isTutorialStepComplete({
    step: { completeWhen: { kind: "todoDone", title: "Ship" } },
    readTodosFn: async () => ({ todos: [{ title: "Ship", done: true }] })
  }), true);
  assert.equal(await isTutorialStepComplete({
    step: { completeWhen: { kind: "todoMissing", title: "Ship" } },
    readTodosFn: async () => ({ todos: [] })
  }), true);
  assert.equal(await isTutorialStepComplete({
    step: { completeWhen: { kind: "noteExists", text: "Remember me" } },
    readNotesFn: async () => ({ notes: [{ text: "Remember me" }] })
  }), true);
});

test("tutorial runtime actions factory binds shared navigation, submit, restart, and completion helpers", async () => {
  const navigations = [];
  const saves = [];
  const windowTarget = {
    location: {
      href: "https://example.test/",
      pathname: "/",
      assign(url) {
        navigations.push(url);
      },
      reload() {}
    }
  };
  const submitter = {
    clicks: 0,
    click() {
      this.clicks += 1;
    }
  };
  const form = {
    matches(selector) {
      return selector === "form";
    },
    querySelector(selector) {
      return selector.includes("submit") ? submitter : null;
    }
  };
  const tutorialRuntimeActions = createTutorialRuntimeActions({
    windowTarget,
    fetchFn: async url => ({
      json: async () => url.includes("todos")
        ? { todos: [{ title: "Ship", done: true }] }
        : { notes: [] }
    }),
    getProgress: () => ({ chapterId: "chapter-a", stepId: "step-1" }),
    currentStep: () => ({ chapterId: "chapter-a", id: "step-1", completeWhen: { kind: "todoDone", title: "Ship" } }),
    firstStepInChapter: chapterId => ({ chapterId, id: "step-1" }),
    tutorialStepScopeFn: () => ({ key: "section:app:todo-form" }),
    saveProgress: async next => {
      saves.push(next);
    },
    render: () => {},
    flashAutoClickFn: () => {},
    wait: async () => {}
  });

  assert.equal(await tutorialRuntimeActions.continueTutorialOnPage("app"), true);
  assert.equal(navigations[0], "https://example.test/");
  assert.equal(await tutorialRuntimeActions.submitTutorialForm(form), true);
  assert.equal(submitter.clicks, 1);
  assert.equal(await tutorialRuntimeActions.restartCurrentChapter(), true);
  assert.equal(await tutorialRuntimeActions.restartFromHere(), true);
  assert.equal(await tutorialRuntimeActions.isComplete({ completeWhen: { kind: "todoDone", title: "Ship" } }), true);
  assert.equal(saves.length, 2);
});

test("tutorial runtime actions factory exposes the shared browser helpers", () => {
  const factory = renderTutorialRuntimeActionsFactory();
  assert.equal(factory.includes("const createTutorialRuntimeActions ="), true);
  assert.equal(factory.includes("const isTutorialStepComplete ="), true);
});
