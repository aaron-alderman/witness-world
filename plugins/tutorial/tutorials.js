import {
  advanceTutorialProgress,
  createTutorialProgress,
  firstTutorialStepInChapter,
  guidanceChapterScopeKey,
  guidanceContextCatalog,
  guidanceContextInfo,
  guidanceDisabledContextIds,
  guidanceDisabledPagesFromScopeKeys,
  guidanceDisabledScopeKeys,
  guidancePageScopeKey,
  guidancePages,
  guidanceReplayScopeKey,
  guidanceRevealedConcepts,
  guidanceScopeCatalog,
  guidanceScopeInfo,
  guidanceStep,
  guidanceStepConcepts,
  guidanceStepIndex,
  guidanceStepScope,
  guidanceStepSurfaceContext,
  isGuidanceContextDisabled,
  isGuidanceScopeDisabled,
  mergeTutorialProgress,
  nextTutorialStep,
  normalizeGuidanceDisabledContextIds,
  normalizeGuidanceDisabledPages,
  normalizeGuidanceDisabledScopeKeys,
  normalizeGuidanceProgress,
  normalizeGuidanceReplayStep,
  previousTutorialStep,
  restartGuidanceChapter,
  restartGuidanceFromHere,
  restartGuidanceFromScope,
  retreatGuidanceProgress,
  setGuidanceContextDisabled,
  setGuidancePageDisabled,
  setGuidanceScopeDisabled,
  skipGuidanceChapter,
  tutorialChapterScopeKey,
  tutorialContextCatalog,
  tutorialContextInfo,
  tutorialDisabledContextIds,
  tutorialDisabledPagesFromScopeKeys,
  tutorialDisabledScopeKeys,
  tutorialPageScopeKey,
  tutorialPages,
  tutorialReplayScopeKey,
  tutorialRevealedConcepts,
  tutorialScopeCatalog,
  tutorialScopeInfo,
  tutorialStep,
  tutorialStepConcepts,
  tutorialStepIndex,
  tutorialStepScope,
  tutorialStepSurfaceContext,
  isTutorialContextDisabled,
  isTutorialScopeDisabled,
  normalizeTutorialDisabledContextIds,
  normalizeTutorialDisabledPages,
  normalizeTutorialDisabledScopeKeys,
  normalizeTutorialProgress,
  normalizeTutorialReplayStep,
  restartTutorialChapter,
  restartTutorialFromHere,
  restartTutorialFromScope,
  setTutorialContextDisabled,
  setTutorialPageDisabled,
  setTutorialScopeDisabled,
  skipTutorialChapter
} from "../../src/runtime-guidance-model.js";
import { todoTutorialSeed } from "./todo-tutorial-seed.js";

export const TODO_TUTORIAL_ID = "todo-from-scratch";

function normalizeScopeFields(scope = {}) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value != null && value !== ""));
}

function tutorialContextLabel(contextId) {
  const normalized = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + " context";
}

function pageScope(page, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  return scopePage
    ? normalizeScopeFields({
        scopeKey: tutorialPageScopeKey(scopePage),
        scopeKind: "page",
        scopePage,
        scopeLabel: label || (page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : "World"))
      })
    : {};
}

function worldScope(label = null) {
  return normalizeScopeFields({
    scopeKey: "world",
    scopeKind: "world",
    scopePage: "world",
    scopeLabel: label || "World"
  });
}

function sectionScope(page, sectionId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedSectionId = typeof sectionId === "string" ? sectionId.trim() : "";
  return scopePage && normalizedSectionId
    ? normalizeScopeFields({
        scopeKey: `section:${scopePage}:${normalizedSectionId}`,
        scopeKind: "section",
        scopePage,
        scopeSectionId: normalizedSectionId,
        scopeLabel: label || normalizedSectionId
      })
    : {};
}

function widgetScope(page, widgetId, label = null) {
  const scopePage = typeof page === "string" ? page.trim() : "";
  const normalizedWidgetId = typeof widgetId === "string" ? widgetId.trim() : "";
  return normalizedWidgetId
    ? normalizeScopeFields({
        scopeKey: `widget:${normalizedWidgetId}`,
        scopeKind: "widget",
        scopePage: scopePage || null,
        scopeWidgetId: normalizedWidgetId,
        scopeLabel: label || normalizedWidgetId
      })
    : {};
}

function withStepScope(step, scope = null) {
  const scoped = scope && typeof scope === "object" ? { ...scope } : null;
  if (!scoped) return step;
  if (!scoped.scopeLabel && step?.title) scoped.scopeLabel = step.title;
  return { ...step, ...normalizeScopeFields(scoped) };
}

function withStepSurfaceContext(step, contextId = null, label = null) {
  const normalizedContextId = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalizedContextId) return step;
  return {
    ...step,
    surfaceContextId: normalizedContextId,
    surfaceContextLabel: typeof label === "string" && label.trim() ? label.trim() : tutorialContextLabel(normalizedContextId)
  };
}

function scopeAnchor(scope = null, target = null) {
  const scoped = scope && typeof scope === "object" ? { ...scope } : {};
  const normalizedTarget = typeof target === "string" && target.trim() ? target.trim() : "";
  return normalizedTarget ? { ...scoped, target: normalizedTarget } : scoped;
}

function tutorialConcept(id, label, summary) {
  return { id, label, summary };
}

function humanizeIdentifier(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function plainTutorialLabel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.includes("${")) return "";
  return normalized;
}

function tutorialScopeLabelFromWidget(widget, childrenByParent = new Map()) {
  if (!widget || typeof widget !== "object") return "";
  const directCandidates = [
    widget.title,
    widget.label,
    widget.text,
    widget.placeholder,
    widget.role && humanizeIdentifier(widget.role),
    widget.name && humanizeIdentifier(widget.name),
    widget.id && humanizeIdentifier(widget.id)
  ];
  for (const candidate of directCandidates) {
    const label = plainTutorialLabel(candidate);
    if (label) return label;
  }
  for (const child of childrenByParent.get(widget.id) || []) {
    const label = tutorialScopeLabelFromWidget(child, childrenByParent);
    if (label) return label;
  }
  return widget.id ? humanizeIdentifier(widget.id) : "";
}

function tutorialScopeAnchorsFromWidgets(page, widgets = []) {
  const normalizedPage = typeof page === "string" ? page.trim() : "";
  if (!normalizedPage) return [];
  const rows = Array.isArray(widgets) ? widgets : [];
  const childrenByParent = new Map();
  for (const row of rows) {
    if (!row?.parent) continue;
    if (!childrenByParent.has(row.parent)) childrenByParent.set(row.parent, []);
    childrenByParent.get(row.parent).push(row);
  }
  for (const children of childrenByParent.values()) {
    children.sort((left, right) => Number(left?.order ?? 0) - Number(right?.order ?? 0));
  }
  const anchors = [];
  for (const row of rows) {
    const target = typeof row?.guidanceTarget === "string" && row.guidanceTarget.trim()
      ? row.guidanceTarget.trim()
      : (typeof row?.tutorialTarget === "string" ? row.tutorialTarget.trim() : "");
    if (!row?.id || !target) continue;
    const label = tutorialScopeLabelFromWidget(row, childrenByParent) || row.id;
    const isSection = row.kind === "Box" || row.kind === "Section" || row.kind === "Form";
    anchors.push(scopeAnchor(
      isSection
        ? sectionScope(normalizedPage, row.id, label)
        : widgetScope(normalizedPage, row.id, label),
      target
    ));
  }
  return anchors;
}

function tutorialStepWithConcepts(step, concepts) {
  return { ...step, concepts: Array.isArray(concepts) ? [...concepts] : [] };
}

function tutorialStepsWithConcepts(steps, concepts) {
  return steps.map(step => tutorialStepWithConcepts(step, concepts));
}

function bootstrapStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepScope({ id, chapterId, page: "bootstrap", title, body, target, payload, completeWhen, nextLabel }, scope || pageScope("bootstrap"));
}

function appStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepSurfaceContext(
    withStepScope({ id, chapterId, page: "app", title, body, target, payload, completeWhen, nextLabel }, scope || pageScope("app")),
    "frontend"
  );
}

function worldStep(id, chapterId, title, body, target, payload, completeWhen, nextLabel = "Next", scope = null) {
  return withStepSurfaceContext(
    withStepScope({ id, chapterId, page: "world", title, body, target, payload, completeWhen, nextLabel }, scope || worldScope("World surface")),
    "frontend"
  );
}

export function todoTutorialDefinition() {
  const blueprint = todoTutorialSeed();
  const bootstrapIdentityScope = sectionScope("bootstrap", "identity-form", "Identity form");
  const bootstrapSessionScope = sectionScope("bootstrap", "session-form", "Session form");
  const bootstrapRunnerScope = sectionScope("bootstrap", "runner-form", "Runtime runner form");
  const bootstrapWidgetScope = sectionScope("bootstrap", "widget-form", "Widget builder");
  const bootstrapProgramScope = sectionScope("bootstrap", "program-form", "Frontend program builder");
  const bootstrapStepScope = sectionScope("bootstrap", "step-form", "Frontend step builder");
  const bootstrapRouteScope = sectionScope("bootstrap", "route-form", "Route builder");
  const bootstrapServeScope = sectionScope("bootstrap", "serve-form", "Serve mount builder");
  const bootstrapOpenAppScope = sectionScope("bootstrap", "open-app-link", "Open app link");
  const concepts = [
    tutorialConcept("identity-principal", "Identity And Principal", "Real work runs as an identity-backed actor, not anonymous edits."),
    tutorialConcept("session-auth", "Session Gate", "After identities exist, writes go through the same authenticated session path as the app."),
    tutorialConcept("runtime-wiring", "Runtime Wiring", "A server runner binds handler logic to backend and frontend hosts so routes can execute."),
    tutorialConcept("widget-tree", "Widget Tree", "The visible page is explicit authored widget structure rather than hidden templates."),
    tutorialConcept("frontend-program", "Frontend Program", "UI behavior comes from authored frontend steps wired to events."),
    tutorialConcept("route-mounts", "Routes And Mounts", "Routes define surfaces and serve mounts attach them to a concrete runner."),
    tutorialConcept("app-boundary", "App Boundary", "Crossing into the live route means using the exact app you assembled through bootstrap."),
    tutorialConcept("witnessed-app-state", "Witnessed App State", "Todo actions operate through real requests and witnessed state changes."),
    tutorialConcept("perspective-data", "Perspective Data", "Private notes belong to the signed-in perspective rather than the shared app view."),
    tutorialConcept("operating-surface", "Operating Surface", "The world page is a real surface for inspecting authored objects, witnessed execution, and hidden modes without leaving the product.")
  ];
  const scopes = [
    ...tutorialScopeAnchorsFromWidgets("app", blueprint.widgets),
    ...tutorialScopeAnchorsFromWidgets("world", blueprint.operatingWidgets)
  ];
  const widgetSteps = tutorialStepsWithConcepts(blueprint.widgets.map(definition => bootstrapStep(
    `widgets:${definition.id}`,
    "widgets",
    "Create the widget tree",
    `Create \`${definition.id}\` as part of the visible todo app structure.`,
    "widget-form",
    { ...definition },
    { kind: "widgetExists", id: definition.id },
    "Next",
    bootstrapWidgetScope
  )), ["widget-tree"]);
  const programSteps = [
    tutorialStepWithConcepts(bootstrapStep(
      "program:create",
      "program",
      "Create the frontend program",
      "Create the program that drives the live todo page.",
      "program-form",
      { ...blueprint.program },
      { kind: "programExists", id: blueprint.program.id },
      "Next",
      bootstrapProgramScope
    ), ["frontend-program"]),
    ...tutorialStepsWithConcepts(blueprint.steps.map(definition => bootstrapStep(
      `program-step:${definition.event}:${definition.order}:${definition.op}`,
      "program",
      "Add program behavior",
      `Add the \`${definition.event}\` / \`${definition.op}\` step so the page behaves like a real app.`,
      "step-form",
      { ...definition },
      { kind: "frontendStepExists", program: definition.program, event: definition.event, op: definition.op, order: definition.order },
      "Next",
      bootstrapStepScope
    )), ["frontend-program"])
  ];
  const routeSteps = [
    ...tutorialStepsWithConcepts(blueprint.routes.map(definition => bootstrapStep(
      `route:${definition.id}`,
      "routes",
      "Define routes",
      `Create the \`${definition.path}\` route.`,
      "route-form",
      { ...definition },
      { kind: "routeExists", id: definition.id },
      "Next",
      bootstrapRouteScope
    )), ["route-mounts"]),
    ...tutorialStepsWithConcepts(blueprint.serves.map(definition => bootstrapStep(
      `serve:${definition.route}`,
      "routes",
      "Mount routes",
      `Mount \`${definition.route}\` onto the active server runner.`,
      "serve-form",
      { ...definition },
      { kind: "serveExists", serverRunner: definition.serverRunner, route: definition.route },
      "Next",
      bootstrapServeScope
    )), ["route-mounts"])
  ];
  const steps = [
    tutorialStepWithConcepts(bootstrapStep(
      "identity:create",
      "identity",
      "Create the first identity",
      "Start with a real identity. This becomes the execution principal for the app you are about to assemble.",
      "identity-form",
      { id: "identity.aaron", actor: "aaron", label: "Aaron", username: "aaron", password: "aaron", homePerspective: "aaron:personal" },
      { kind: "identityExists", id: "identity.aaron" },
      "Next",
      bootstrapIdentityScope
    ), ["identity-principal"]),
    tutorialStepWithConcepts(bootstrapStep(
      "session:signin",
      "session",
      "Sign in to keep authoring",
      "Once identities exist, bootstrap writes go through the normal session path. Sign in with the identity you just created.",
      "session-form",
      { username: "aaron", password: "aaron" },
      { kind: "sessionAuthenticated", actor: "aaron" },
      "Next",
      bootstrapSessionScope
    ), ["session-auth"]),
    tutorialStepWithConcepts(bootstrapStep(
      "runner:create",
      "runner",
      "Create the runtime wiring",
      "Create the server runner that binds the demo handler set to the backend and frontend hosts.",
      "runner-form",
      { ...blueprint.runner },
      { kind: "serverRunnerExists", id: blueprint.runner.id },
      "Next",
      bootstrapRunnerScope
    ), ["runtime-wiring"]),
    ...widgetSteps,
    ...programSteps,
    ...routeSteps,
    tutorialStepWithConcepts(bootstrapStep(
      "open-app",
      "verify",
      "Open the app you just wired",
      "The app boundary is now reachable. Open `/` and continue the tutorial on the live app.",
      "open-app-link",
      null,
      { kind: "manualAdvance" },
      "Open App",
      bootstrapOpenAppScope
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:intro",
      "use-app",
      "You are now using the real app",
      "This is the live page you assembled through the bootstrap seam. Click Next to exercise the app behavior.",
      "app-title",
      null,
      { kind: "manualAdvance" },
      "Next",
      widgetScope("app", "todo_title", "App title")
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:create-todo",
      "use-app",
      "Create a todo",
      "Prefill the todo form, then click the real Add button.",
      "todo-form",
      { title: "Tutorial todo" },
      { kind: "todoExists", title: "Tutorial todo" },
      "Next",
      sectionScope("app", "todo_form", "Todo form")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:toggle-todo",
      "use-app",
      "Toggle the todo",
      "Use the real row action to mark the tutorial todo as done.",
      "todo-toggle",
      null,
      { kind: "todoDone", title: "Tutorial todo" },
      "Next",
      widgetScope("app", "todo_item_toggle_template", "Todo toggle action")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:delete-todo",
      "use-app",
      "Delete the todo",
      "Now delete the tutorial todo using the real row action.",
      "todo-delete",
      null,
      { kind: "todoMissing", title: "Tutorial todo" },
      "Next",
      widgetScope("app", "todo_item_delete_template", "Todo delete action")
    ), ["witnessed-app-state"]),
    tutorialStepWithConcepts(appStep(
      "app:create-note",
      "use-app",
      "Create a private note",
      "Private notes are perspective-bound. Prefill the real note form and save one now.",
      "note-form",
      { text: "Tutorial private note" },
      { kind: "noteExists", text: "Tutorial private note" },
      "Next",
      sectionScope("app", "todo_private_notes", "Private notes")
    ), ["perspective-data"]),
    tutorialStepWithConcepts(worldStep(
      "world:inspect",
      "inspect-world",
      "Inspect the world surface",
      "Open `/world` and use the operating surface to inspect the app as authored objects, witnesses, and real product handoffs. Click Finish when you are ready to keep exploring on your own.",
      "world-command-toggle",
      null,
      { kind: "manualAdvance" },
      "Finish",
      widgetScope("world", "world-command-toggle", "World command entry")
    ), ["app-boundary", "witnessed-app-state", "perspective-data", "operating-surface"])
  ];
  return {
    id: TODO_TUTORIAL_ID,
    title: "Build The Todo App From Scratch",
    bootstrapCardBadge: "Guided Tutorial",
    summary: "This tutorial uses the real bootstrap builders and the real runtime. It teaches identities, runner wiring, widgets, programs, routes, mounts, and then continues into the live app to exercise real behavior.",
    concepts,
    scopes,
    steps
  };
}

export function tutorialDefinition(id) {
  return id === TODO_TUTORIAL_ID ? todoTutorialDefinition() : null;
}

export {
  advanceTutorialProgress,
  createTutorialProgress,
  firstTutorialStepInChapter,
  guidanceChapterScopeKey,
  guidanceContextCatalog,
  guidanceContextInfo,
  guidanceDisabledContextIds,
  guidanceDisabledPagesFromScopeKeys,
  guidanceDisabledScopeKeys,
  guidancePageScopeKey,
  guidancePages,
  guidanceReplayScopeKey,
  guidanceRevealedConcepts,
  guidanceScopeCatalog,
  guidanceScopeInfo,
  guidanceStep,
  guidanceStepConcepts,
  guidanceStepIndex,
  guidanceStepScope,
  guidanceStepSurfaceContext,
  isGuidanceContextDisabled,
  isGuidanceScopeDisabled,
  mergeTutorialProgress,
  nextTutorialStep,
  normalizeGuidanceDisabledContextIds,
  normalizeGuidanceDisabledPages,
  normalizeGuidanceDisabledScopeKeys,
  normalizeGuidanceProgress,
  normalizeGuidanceReplayStep,
  previousTutorialStep,
  restartGuidanceChapter,
  restartGuidanceFromHere,
  restartGuidanceFromScope,
  retreatGuidanceProgress,
  setGuidanceContextDisabled,
  setGuidancePageDisabled,
  setGuidanceScopeDisabled,
  skipGuidanceChapter,
  tutorialChapterScopeKey,
  tutorialContextCatalog,
  tutorialContextInfo,
  tutorialDisabledContextIds,
  tutorialDisabledPagesFromScopeKeys,
  tutorialDisabledScopeKeys,
  tutorialPageScopeKey,
  tutorialPages,
  tutorialReplayScopeKey,
  tutorialRevealedConcepts,
  tutorialScopeCatalog,
  tutorialScopeInfo,
  tutorialStep,
  tutorialStepConcepts,
  tutorialStepIndex,
  tutorialStepScope,
  tutorialStepSurfaceContext,
  isTutorialContextDisabled,
  isTutorialScopeDisabled,
  normalizeTutorialDisabledContextIds,
  normalizeTutorialDisabledPages,
  normalizeTutorialDisabledScopeKeys,
  normalizeTutorialProgress,
  normalizeTutorialReplayStep,
  restartTutorialChapter,
  restartTutorialFromHere,
  restartTutorialFromScope,
  setTutorialContextDisabled,
  setTutorialPageDisabled,
  setTutorialScopeDisabled,
  skipTutorialChapter
};
