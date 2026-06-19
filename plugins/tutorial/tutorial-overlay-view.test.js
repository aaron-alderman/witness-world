import test from "node:test";
import assert from "node:assert/strict";
import {
  publishTutorialRuntimeState,
  renderTutorialConceptList,
  renderTutorialDisabledScopesPanel,
  renderTutorialOverlayView,
  renderTutorialOverlayViewFactory
} from "./tutorial-overlay-view.js";

function createFakeElement(tagName, { id = "" } = {}) {
  return {
    tagName: String(tagName).toUpperCase(),
    id,
    className: "",
    textContent: "",
    hidden: false,
    disabled: false,
    innerHTML: "",
    style: {},
    children: [],
    attributes: new Map(),
    append(...nodes) {
      for (const node of nodes) {
        if (!node) continue;
        this.children.push(node);
      }
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    scrollIntoView(options) {
      this.scrollOptions = options;
    }
  };
}

function createFakeDocument(ids = []) {
  const nodes = new Map(ids.map(id => [id, createFakeElement("div", { id })]));
  return {
    nodes,
    createElement(tagName) {
      return createFakeElement(tagName);
    },
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };
}

test("tutorial overlay view helpers render concept and disabled-scope view state through shared helpers", () => {
  const document = createFakeDocument(["tutorial-disabled-scopes-list"]);
  const conceptsRoot = createFakeElement("div", { id: "tutorial-overlay-concepts" });

  renderTutorialConceptList({
    root: conceptsRoot,
    concepts: [{ label: "Concept", summary: "Summary" }],
    emptyText: "Unused",
    document
  });
  assert.equal(conceptsRoot.children.length, 1);
  assert.equal(conceptsRoot.children[0].children[0].textContent, "Concept");
  assert.equal(conceptsRoot.children[0].children[1].textContent, "Summary");

  const disabledScopesToggle = createFakeElement("button");
  const disabledScopesPanel = createFakeElement("aside");
  const rowsCalls = [];
  const open = renderTutorialDisabledScopesPanel({
    progress: { stepId: "step-1" },
    disabledScopesToggle,
    disabledScopesPanel,
    disabledScopesOpen: true,
    tutorialDisabledGuidanceRowsFn: () => [{ scopeKey: "page:app" }],
    currentSurfacePage: "app",
    tutorialPageLabel: page => page,
    renderTutorialDisabledScopeRowsFn: payload => {
      rowsCalls.push(payload.rows);
    },
    document
  });

  assert.equal(open, true);
  assert.equal(disabledScopesToggle.hidden, false);
  assert.equal(disabledScopesPanel.hidden, false);
  assert.deepEqual(rowsCalls, [[{ scopeKey: "page:app" }]]);
});

test("tutorial overlay view helper renders offpage and active overlay branches through the shared seam", () => {
  const document = createFakeDocument([
    "tutorial-disable-context",
    "tutorial-overlay-meta",
    "tutorial-overlay-title",
    "tutorial-overlay-body",
    "tutorial-overlay-concepts",
    "tutorial-next",
    "tutorial-back",
    "tutorial-restart-chapter",
    "tutorial-restart-step",
    "tutorial-show-current-control"
  ]);
  const overlay = createFakeElement("aside");
  const dimmer = createFakeElement("div");
  const resumeButton = createFakeElement("button");
  const disabledScopesToggle = createFakeElement("button");
  const disabledScopesPanel = createFakeElement("aside");
  const target = createFakeElement("button");
  const scope = createFakeElement("section");
  const disabledPanelCalls = [];

  const offpageState = renderTutorialOverlayView({
    progress: { stepId: "step-1" },
    currentStep: () => ({ id: "step-1", page: "bootstrap" }),
    tutorialSurfaceState: () => ({ kind: "offpage", page: "bootstrap" }),
    tutorialPageLabel: page => page === "bootstrap" ? "Bootstrap" : page,
    clearHighlightFn: () => {},
    overlay,
    dimmer,
    resumeButton,
    disabledScopesToggle,
    disabledScopesPanel,
    disabledScopesOpen: true,
    renderTutorialDisabledScopesPanelFn: payload => {
      disabledPanelCalls.push(payload.progress.stepId);
      return false;
    },
    document
  });

  assert.equal(resumeButton.hidden, true);
  assert.equal(resumeButton.textContent, "Continue On Bootstrap");
  assert.equal(offpageState.disabledScopesOpen, false);
  assert.equal(document.getElementById("tutorial-disable-context").hidden, true);

  const activeState = renderTutorialOverlayView({
    progress: { stepId: "step-2" },
    currentStep: () => ({
      id: "step-2",
      chapterId: "chapter-a",
      title: "Create todo",
      body: "Fill the form",
      nextLabel: "Save",
      target: "todo-form"
    }),
    tutorialSurfaceState: () => ({ kind: "active", page: "app" }),
    tutorialReplayScopeKeyFn: () => "section:todo",
    tutorialStepConceptsFn: () => [{ id: "concept-1", label: "Todo", summary: "Create a todo" }],
    previousStep: () => ({ id: "step-1" }),
    firstStepInChapter: () => ({ id: "step-2" }),
    currentSurfaceContext: "ctx.todo",
    byTarget: () => target,
    focusScopeFor: () => scope,
    clearHighlightFn: () => {
      overlay.cleared = true;
    },
    positionFn: positionedTarget => {
      overlay.positionedTarget = positionedTarget;
    },
    lastRenderedStepId: null,
    overlay,
    dimmer,
    resumeButton,
    disabledScopesToggle,
    disabledScopesPanel,
    disabledScopesOpen: false,
    renderTutorialDisabledScopesPanelFn: () => true,
    document
  });

  assert.equal(overlay.cleared, true);
  assert.equal(dimmer.hidden, false);
  assert.equal(overlay.hidden, false);
  assert.equal(document.getElementById("tutorial-overlay-meta").textContent, "CHAPTER-A");
  assert.equal(document.getElementById("tutorial-overlay-title").textContent, "Create todo");
  assert.equal(document.getElementById("tutorial-overlay-body").textContent, "Fill the form Replaying this scope does not roll back app state.");
  assert.equal(document.getElementById("tutorial-next").textContent, "Save");
  assert.equal(document.getElementById("tutorial-back").disabled, false);
  assert.equal(document.getElementById("tutorial-show-current-control").disabled, false);
  assert.equal(document.getElementById("tutorial-disable-context").hidden, false);
  assert.equal(document.getElementById("tutorial-overlay-concepts").children.length, 1);
  assert.equal(target.attributes.get("data-tutorial-current"), "true");
  assert.equal(scope.attributes.get("data-tutorial-focus-scope"), "true");
  assert.deepEqual(target.scrollOptions, { block: "center", behavior: "smooth" });
  assert.equal(overlay.positionedTarget, target);
  assert.equal(activeState.lastRenderedStepId, "step-2");
  assert.equal(activeState.activeHighlightTarget, target);
  assert.equal(activeState.activeFocusScope, scope);
  assert.equal(activeState.disabledScopesOpen, true);
  assert.deepEqual(disabledPanelCalls, ["step-1"]);
});

test("tutorial overlay runtime publisher exposes the shared witness getters", () => {
  let progress = {
    stepId: "step-1",
    chapterId: "chapter-a",
    completedAt: null,
    hidden: false
  };
  const windowTarget = {};

  const witness = publishTutorialRuntimeState({
    windowTarget,
    getProgress: () => progress,
    currentStep: () => ({ id: "step-1", page: "app" }),
    tutorialStepScopeFn: () => ({ key: "section:todo" }),
    tutorialStepConceptsFn: () => [{ id: "concept-1" }],
    tutorialRevealedConceptsFn: () => [{ id: "concept-1" }, { id: "concept-2" }],
    tutorialReplayScopeKeyFn: () => "section:todo",
    tutorialReplayStepIdFn: () => "step-1",
    tutorialDisabledScopeKeysFn: () => ["page:app"],
    tutorialDisabledContextIdsFn: () => ["ctx.todo"],
    tutorialDisabledPagesFn: () => ["app"],
    getDisabledScopesOpen: () => true,
    currentSurfacePage: "app",
    currentSurfaceContext: "ctx.todo",
    currentSurfaceRouteId: "route.todo",
    currentSurfaceRootWidgetId: "widget.root",
    currentSurfaceProgramId: "program.todo",
    tutorialSurfaceStateFn: () => ({ kind: "active" })
  });

  assert.equal(windowTarget.__witnessTutorialApp, witness);
  assert.equal(witness.currentStepId, "step-1");
  assert.equal(witness.currentChapterId, "chapter-a");
  assert.equal(witness.currentPage, "app");
  assert.equal(witness.currentScopeKey, "section:todo");
  assert.deepEqual(witness.currentConceptIds, ["concept-1"]);
  assert.deepEqual(witness.revealedConceptIds, ["concept-1", "concept-2"]);
  assert.deepEqual(witness.disabledScopeKeys, ["page:app"]);
  assert.deepEqual(witness.disabledContextIds, ["ctx.todo"]);
  assert.deepEqual(witness.disabledPages, ["app"]);
  assert.equal(witness.disabledScopesOpen, true);
  assert.equal(witness.surfaceRouteId, "route.todo");
  assert.equal(witness.surfaceRootWidgetId, "widget.root");
  assert.equal(witness.surfaceProgramId, "program.todo");
  assert.equal(witness.surfaceStatus, "active");

  progress = { ...progress, hidden: true };
  assert.equal(witness.hidden, true);
});

test("tutorial overlay view factory exposes the shared browser helpers", () => {
  const factory = renderTutorialOverlayViewFactory();
  assert.equal(factory.includes("const renderTutorialOverlayView ="), true);
  assert.equal(factory.includes("const publishTutorialRuntimeState ="), true);
});
