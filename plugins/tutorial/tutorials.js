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
  skipTutorialChapter,
  guidanceScopeAncestors
} from "../../src/runtime-guidance-model.js";
import { buildGuidanceScopeInventoryRows } from "../../src/runtime-guidance-scope-inventory.js";
import {
  guidancePageScopeRecord,
  guidanceScopeAnchor,
  guidanceScopeAnchorsFromBootstrapSections,
  guidanceScopeAnchorsFromSurfaces,
  guidanceScopeAnchorsFromWidgets,
  guidanceSectionScopeRecord,
  guidanceWidgetScopeRecord,
  guidanceWorldScopeRecord
} from "../../src/runtime-guidance-scope-anchors.js";
import { todoStarterBlueprint } from "../starter/starter-blueprints.js";

export const TODO_TUTORIAL_ID = "todo-from-scratch";

function normalizeScopeFields(scope = {}) {
  return Object.fromEntries(Object.entries(scope).filter(([, value]) => value != null && value !== ""));
}

function tutorialContextLabel(contextId) {
  const normalized = typeof contextId === "string" ? contextId.trim() : "";
  if (!normalized) return null;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1) + " context";
}

const pageScope = guidancePageScopeRecord;
const worldScope = guidanceWorldScopeRecord;
const sectionScope = guidanceSectionScopeRecord;
const widgetScope = guidanceWidgetScopeRecord;

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

const scopeAnchor = guidanceScopeAnchor;

function tutorialConcept(id, label, summary) {
  return { id, label, summary };
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

export function todoTutorialDefinition() {
  const blueprint = todoStarterBlueprint();
  const homeRoute = blueprint.routes.find(route => route.id === "home_page_route") || blueprint.routes[0] || null;
  const bootstrapIdentityScope = sectionScope("bootstrap", "identity-form", "Identity form");
  const bootstrapSessionScope = sectionScope("bootstrap", "session-form", "Session form");
  const bootstrapRunnerScope = sectionScope("bootstrap", "runner-form", "Runtime runner form");
  const bootstrapStarterScope = sectionScope("bootstrap", "starter-controls", "Native starter");
  const bootstrapOpenAppScope = sectionScope("bootstrap", "open-app-link", "Open app link");
  const concepts = [
    tutorialConcept("identity-principal", "Identity And Principal", "Real work runs as an identity-backed actor, not anonymous edits."),
    tutorialConcept("session-auth", "Session Gate", "After identities exist, writes go through the same authenticated session path as the app."),
    tutorialConcept("runtime-wiring", "Runtime Wiring", "A server runner binds handler logic to backend and frontend hosts so routes can execute."),
    tutorialConcept("native-page-surface", "Native Page Surface", "Canonical app hosting now lands directly on page.surface nouns instead of widget plus frontendProgram bridges."),
    tutorialConcept("native-process-graph", "Native Process Graph", "Interactive behavior now runs through authored process, message, boundary, and policy semantics."),
    tutorialConcept("app-boundary", "App Boundary", "Crossing into the live route means using the exact app you assembled through bootstrap."),
    tutorialConcept("native-collection", "Native Collection", "Repeated list content now comes from authored collection and surface repeat semantics.")
  ];
  const bootstrapOperatorScopes = guidanceScopeAnchorsFromBootstrapSections([
    { sectionId: "context-form", label: "Context form", target: "context-form" },
    { sectionId: "capability-form", label: "Capability form", target: "capability-form" },
    { sectionId: "capability-install-form", label: "Capability install form", target: "capability-install-form" },
    { sectionId: "backend-program-form", label: "Backend program form", target: "backend-program-form" },
    { sectionId: "backend-program-version-form", label: "Backend program version form", target: "backend-program-version-form" },
    { sectionId: "backend-step-form", label: "Backend step form", target: "backend-step-form" },
    { sectionId: "runtime-plugin-install-form", label: "Runtime plugin install form", target: "runtime-plugin-install-form" },
    { sectionId: "mcp-server-form", label: "MCP server form", target: "mcp-server-form" },
    { sectionId: "mcp-tool-install-form", label: "MCP tool install form", target: "mcp-tool-install-form" },
    { sectionId: "perspective-form", label: "Perspective form", target: "perspective-form" },
    { widgetId: "bootstrap_identity_id_input", label: "Identity id", target: "identity-id" },
    { widgetId: "bootstrap_identity_submit_button", label: "Identity submit", target: "identity-submit" }
  ]);
  const scopes = [
    ...bootstrapOperatorScopes,
    scopeAnchor(bootstrapStarterScope, "create-todo-starter"),
    ...guidanceScopeAnchorsFromSurfaces("app", blueprint.surfaces),
    ...guidanceScopeAnchorsFromWidgets("app", blueprint.widgets)
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
    tutorialStepWithConcepts(bootstrapStep(
      "native:create-app",
      "native-app",
      "Author the native todo app",
      "Use the native starter control to author the maintained todo app directly through canonical surface, process, message, collection, boundary, policy, and page.surface route nouns.",
      "create-todo-starter",
      null,
      {
        kind: "authoredRowsExist",
        collections: blueprint.collections.map(row => row.id),
        surfaces: blueprint.surfaces.map(row => row.id),
        processes: blueprint.processes.map(row => row.id),
        messages: blueprint.messages.map(row => row.id),
        projections: blueprint.projections.map(row => row.id),
        boundaries: blueprint.boundaries.map(row => row.id),
        policies: blueprint.policies.map(row => row.id),
        routes: homeRoute ? [homeRoute.id] : [],
        servedRoutes: homeRoute ? blueprint.serves.filter(row => row.route === homeRoute.id).map(row => ({ serverRunner: row.serverRunner, route: row.route })) : []
      },
      "Next",
      bootstrapStarterScope
    ), ["native-page-surface", "native-process-graph"]),
    tutorialStepWithConcepts(bootstrapStep(
      "open-app",
      "verify",
      "Open the app you just wired",
      "The native page.surface route is now reachable. Open `/` and continue the tutorial on the live app.",
      "open-app-link",
      null,
      { kind: "manualAdvance" },
      "Open App",
      bootstrapOpenAppScope
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:intro",
      "use-app",
      "You are now using the native app",
      "This live route is backed by authored page.surface nouns, not a legacy widget-program bridge. Click Next to exercise the native flow.",
      "app-title",
      null,
      { kind: "manualAdvance" },
      "Next",
      widgetScope("app", "native_todo_title", "App title")
    ), ["app-boundary"]),
    tutorialStepWithConcepts(appStep(
      "app:create-todo",
      "use-app",
      "Create a todo",
      "Prefill the native todo form, then click the real Add button.",
      "todo-form",
      { title: "Tutorial todo" },
      { kind: "todoExists", title: "Tutorial todo" },
      "Next",
      sectionScope("app", "native_todo_form", "Todo form")
    ), ["native-process-graph"]),
    tutorialStepWithConcepts(appStep(
      "app:review-collection",
      "use-app",
      "Review the native list",
      "The new todo now appears through native collection repeat rendering on page.surface. Click Next after you confirm it is present.",
      "todo-list-panel",
      null,
      { kind: "manualAdvance" },
      "Finish",
      sectionScope("app", "native_todo_list_panel", "Todo list")
    ), ["native-collection"])
  ];
  return {
    id: TODO_TUTORIAL_ID,
    title: "Build The Todo App From Scratch",
    bootstrapCardBadge: "Guided Tutorial",
    summary: "This tutorial uses the real bootstrap seam and the real runtime. It teaches identity, runtime wiring, native page.surface authoring through the maintained starter control, and then continues into the live app to inspect the authored result.",
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
  skipTutorialChapter,
  guidanceScopeAncestors as tutorialScopeAncestors,
  buildGuidanceScopeInventoryRows
};
