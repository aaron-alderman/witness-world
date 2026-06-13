import test from "node:test";
import assert from "node:assert/strict";
import {
  bindTutorialProgressObservation,
  bootTutorialProgressRuntime,
  clearTutorialReplayForInteraction,
  createTutorialProgressRuntime,
  renderTutorialProgressRuntimeFactory
} from "./tutorial-progress-runtime.js";

test("tutorial progress runtime advances queued app steps through the shared lifecycle seam", async () => {
  const tutorial = {
    steps: [
      { id: "step-1", chapterId: "chapter-1", page: "app" },
      { id: "step-2", chapterId: "chapter-1", page: "app" }
    ]
  };
  let progress = { stepId: "step-1", chapterId: "chapter-1", hidden: false, completedAt: null };
  const calls = [];

  const runtime = createTutorialProgressRuntime({
    tutorial,
    getProgress: () => progress,
    setProgress: value => {
      progress = value;
    },
    currentStep: () => tutorial.steps.find(step => step.id === progress?.stepId) || null,
    currentStepIndex: () => tutorial.steps.findIndex(step => step.id === progress?.stepId),
    tutorialReplayStepIdFn: () => null,
    saveProgress: async next => {
      progress = next;
      calls.push(["save", next.stepId || null, next.chapterStatus || null]);
    },
    render: () => calls.push("render"),
    isComplete: async step => step.id === "step-1"
  });

  await runtime.requestMaybeAdvance();

  assert.equal(progress.stepId, "step-2");
  assert.deepEqual(calls, [
    ["save", "step-2", "in_progress"],
    "render"
  ]);
});

test("tutorial progress runtime clears replay on matching interaction and boots through the shared sequence", async () => {
  let progress = { stepId: "step-1", replayScopeKey: "section:todo" };
  const target = {
    contains(node) {
      return node === this.child;
    }
  };
  const child = {
    nodeType: 1,
    parentElement: null,
    closest(selector) {
      return selector.includes("todo-form") ? this : null;
    }
  };
  target.child = child;

  const cleared = await clearTutorialReplayForInteraction({
    eventTarget: child,
    getProgress: () => progress,
    setProgress: value => {
      progress = value;
    },
    currentStep: () => ({ id: "step-1", target: "todo-form" }),
    tutorialReplayStepIdFn: current => current.stepId,
    byTarget: () => target,
    normalizeProgressFn: value => ({ ...value, normalized: true }),
    api: async (method, body) => {
      assert.equal(method, "PUT");
      assert.equal(body.replayScopeKey, null);
    }
  });
  assert.equal(cleared, true);
  assert.equal(progress.normalized, true);

  const calls = [];
  await bootTutorialProgressRuntime({
    api: async method => {
      assert.equal(method, "GET");
      return { progress: { stepId: "step-boot" } };
    },
    normalizeProgressFn: value => ({ ...value, normalized: true }),
    setProgress: value => calls.push(["set", value.stepId, value.normalized]),
    alignProgressToAppPageFn: async () => calls.push("align"),
    render: () => calls.push("render"),
    requestMaybeAdvanceFn: async () => calls.push("request"),
    publishRuntimeState: () => calls.push("publish")
  });
  assert.deepEqual(calls, [
    ["set", "step-boot", true],
    "align",
    "render",
    "request",
    "render",
    "publish"
  ]);
});

test("tutorial progress runtime binds replay-clear and auto-advance observation through the shared seam", () => {
  const docListeners = new Map();
  const winListeners = new Map();
  const delayed = [];
  const recurring = [];
  const calls = [];

  const binding = bindTutorialProgressObservation({
    documentTarget: {
      addEventListener(type, handler) {
        docListeners.set(type, handler);
      }
    },
    windowTarget: {
      addEventListener(type, handler, options) {
        winListeners.set(type, { handler, options });
      }
    },
    clearReplayForInteractionFn: async target => {
      calls.push(["clear", target]);
    },
    requestMaybeAdvanceFn: async () => {
      calls.push("request");
    },
    render: () => {
      calls.push("render");
    },
    scheduleDelayed(fn, ms) {
      delayed.push(ms);
      fn();
    },
    scheduleRecurring(fn, ms) {
      recurring.push(ms);
      return 7;
    }
  });

  docListeners.get("click")({ target: "click-target" });
  docListeners.get("submit")({ target: "submit-target" });
  winListeners.get("resize").handler();
  winListeners.get("scroll").handler();

  assert.equal(binding.intervalId, 7);
  assert.deepEqual(delayed, [150, 150]);
  assert.deepEqual(recurring, [1200]);
  assert.deepEqual(calls, [
    ["clear", "click-target"],
    "request",
    ["clear", "submit-target"],
    "request",
    "render",
    "render"
  ]);
});

test("tutorial progress runtime factory exposes the shared browser helpers", () => {
  const factory = renderTutorialProgressRuntimeFactory();
  assert.equal(factory.includes("const createTutorialProgressRuntime ="), true);
  assert.equal(factory.includes("const bindTutorialProgressObservation ="), true);
});
