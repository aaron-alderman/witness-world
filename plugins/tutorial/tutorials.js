import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const todoStarterBlueprintDocument = JSON.parse(
  fs.readFileSync(path.join(__dirname, "todo-starter-blueprint.json"), "utf8")
);

export const TODO_TUTORIAL_ID = "todo-from-scratch";

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).map(value => value.trim()).filter(Boolean))];
}

function tutorialPageLabel(page) {
  return page === "app" ? "App" : (page === "bootstrap" ? "Bootstrap" : (page === "world" ? "World" : String(page || "")));
}

export function tutorialPageScopeKey(page) {
  const normalized = typeof page === "string" ? page.trim() : "";
  return normalized ? `page:${normalized}` : null;
}

export function tutorialChapterScopeKey(chapterId) {
  const normalized = typeof chapterId === "string" ? chapterId.trim() : "";
  return normalized ? `chapter:${normalized}` : null;
}

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
        scopeLabel: label || tutorialPageLabel(scopePage)
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
    const target = typeof row?.tutorialTarget === "string" ? row.tutorialTarget.trim() : "";
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

export function todoStarterBlueprint() {
  return JSON.parse(JSON.stringify(todoStarterBlueprintDocument));
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
  const blueprint = todoStarterBlueprint();
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
    concepts,
    scopes,
    steps
  };
}

export function tutorialDefinition(id) {
  return id === TODO_TUTORIAL_ID ? todoTutorialDefinition() : null;
}

export function tutorialPages(tutorial) {
  const pages = [];
  for (const step of tutorial?.steps ?? []) {
    if (typeof step?.page !== "string" || !step.page.trim() || pages.includes(step.page)) continue;
    pages.push(step.page);
  }
  return pages;
}

export function normalizeTutorialDisabledPages(tutorial, disabledPages = []) {
  const knownPages = new Set(tutorialPages(tutorial));
  return uniqueStrings(disabledPages).filter(page => knownPages.has(page));
}

export function tutorialStepPage(tutorial, stepId) {
  return tutorialStep(tutorial, stepId)?.page ?? null;
}

export function normalizeTutorialReplayStep(tutorial, replayStepId) {
  const id = typeof replayStepId === "string" ? replayStepId : "";
  return tutorialStep(tutorial, id)?.id ?? null;
}

function tutorialScopeRecordInfo(record) {
  if (!record || typeof record !== "object") return null;
  const scopeKey = typeof record.scopeKey === "string" && record.scopeKey.trim()
    ? record.scopeKey.trim()
    : (record.page === "world" ? "world" : tutorialPageScopeKey(record.page));
  if (!scopeKey) return null;
  const scopeKind = typeof record.scopeKind === "string" && record.scopeKind.trim()
    ? record.scopeKind.trim()
    : (scopeKey === "world"
        ? "world"
        : (scopeKey.startsWith("section:")
            ? "section"
            : (scopeKey.startsWith("widget:")
                ? "widget"
                : (scopeKey.startsWith("chapter:")
                    ? "chapter"
                    : "page"))));
  const scopePage = typeof record.scopePage === "string" && record.scopePage.trim()
    ? record.scopePage.trim()
    : (scopeKind === "world" ? "world" : (typeof record.page === "string" && record.page.trim() ? record.page.trim() : null));
  return normalizeScopeFields({
    key: scopeKey,
    kind: scopeKind,
    page: scopePage,
    label: typeof record.scopeLabel === "string" && record.scopeLabel.trim() ? record.scopeLabel.trim() : (record.title || null),
    chapterId: record.chapterId || null,
    sectionId: typeof record.scopeSectionId === "string" && record.scopeSectionId.trim() ? record.scopeSectionId.trim() : null,
    widgetId: typeof record.scopeWidgetId === "string" && record.scopeWidgetId.trim() ? record.scopeWidgetId.trim() : null,
    target: typeof record.target === "string" && record.target.trim() ? record.target.trim() : null
  });
}

function tutorialStepScopeInfo(step) {
  return tutorialScopeRecordInfo(step);
}

function tutorialStepSurfaceContextInfo(step) {
  if (!step || typeof step !== "object") return null;
  const contextId = typeof step.surfaceContextId === "string" && step.surfaceContextId.trim()
    ? step.surfaceContextId.trim()
    : null;
  if (!contextId) return null;
  return normalizeScopeFields({
    id: contextId,
    label: typeof step.surfaceContextLabel === "string" && step.surfaceContextLabel.trim()
      ? step.surfaceContextLabel.trim()
      : tutorialContextLabel(contextId)
  });
}

function addTutorialScopeInfo(map, info) {
  if (!info?.key) return;
  const existing = map.get(info.key);
  if (!existing) {
    map.set(info.key, { ...info });
    return;
  }
  map.set(info.key, {
    ...existing,
    ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ""))
  });
}

export function tutorialScopeCatalog(tutorial) {
  const scopes = new Map();
  for (const page of tutorialPages(tutorial)) {
    addTutorialScopeInfo(scopes, {
      key: tutorialPageScopeKey(page),
      kind: "page",
      page,
      label: tutorialPageLabel(page)
    });
    if (page === "world") addTutorialScopeInfo(scopes, { key: "world", kind: "world", page: "world", label: "World surface" });
  }
  for (const scope of tutorial?.scopes ?? []) addTutorialScopeInfo(scopes, tutorialScopeRecordInfo(scope));
  for (const step of tutorial?.steps ?? []) {
    addTutorialScopeInfo(scopes, tutorialStepScopeInfo(step));
    addTutorialScopeInfo(scopes, {
      key: tutorialChapterScopeKey(step.chapterId),
      kind: "chapter",
      chapterId: step.chapterId || null,
      label: step.chapterId || null
    });
  }
  return scopes;
}

export function tutorialContextCatalog(tutorial) {
  const contexts = new Map();
  for (const step of tutorial?.steps ?? []) {
    const surfaceContext = tutorialStepSurfaceContextInfo(step);
    if (!surfaceContext?.id || contexts.has(surfaceContext.id)) continue;
    contexts.set(surfaceContext.id, { ...surfaceContext });
  }
  return contexts;
}

export function tutorialContextInfo(tutorial, contextId) {
  const id = typeof contextId === "string" ? contextId.trim() : "";
  if (!id) return null;
  return tutorialContextCatalog(tutorial).get(id) ?? null;
}

export function tutorialScopeInfo(tutorial, scopeKey) {
  const key = typeof scopeKey === "string" ? scopeKey.trim() : "";
  if (!key) return null;
  return tutorialScopeCatalog(tutorial).get(key) ?? null;
}

export function tutorialStepScope(tutorial, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? tutorialStep(tutorial, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const scoped = tutorialStepScopeInfo(step);
  if (!scoped?.key) return null;
  return tutorialScopeInfo(tutorial, scoped.key) || scoped;
}

export function tutorialStepSurfaceContext(tutorial, stepIdOrStep) {
  const step = typeof stepIdOrStep === "string" ? tutorialStep(tutorial, stepIdOrStep) : stepIdOrStep;
  if (!step) return null;
  const surfaceContext = tutorialStepSurfaceContextInfo(step);
  if (!surfaceContext?.id) return null;
  return tutorialContextInfo(tutorial, surfaceContext.id) || surfaceContext;
}

export function tutorialDisabledPagesFromScopeKeys(tutorial, disabledScopeKeys = []) {
  const pages = [];
  for (const key of uniqueStrings(disabledScopeKeys)) {
    const scope = tutorialScopeInfo(tutorial, key);
    if (!scope) continue;
    if (scope.kind === "page" && scope.page) pages.push(scope.page);
    if (scope.kind === "world") pages.push("world");
  }
  return normalizeTutorialDisabledPages(tutorial, pages);
}

export function normalizeTutorialDisabledScopeKeys(tutorial, disabledScopeKeys = [], disabledPages = []) {
  const candidates = [];
  for (const key of uniqueStrings(disabledScopeKeys)) candidates.push(key);
  for (const page of normalizeTutorialDisabledPages(tutorial, disabledPages)) {
    const pageKey = tutorialPageScopeKey(page);
    if (pageKey) candidates.push(pageKey);
    if (page === "world") candidates.push("world");
  }
  return uniqueStrings(candidates).filter(key => tutorialScopeInfo(tutorial, key));
}

export function normalizeTutorialDisabledContextIds(tutorial, disabledContextIds = []) {
  return uniqueStrings(disabledContextIds).filter(contextId => tutorialContextInfo(tutorial, contextId));
}

function tutorialReplayScopeKeyCandidate(tutorial, progress) {
  const step = tutorialStep(tutorial, progress?.stepId);
  if (!step) return null;
  const currentScope = tutorialStepScope(tutorial, step);
  const chapterScopeKey = tutorialChapterScopeKey(step.chapterId);
  const explicitKey = typeof progress?.replayScopeKey === "string" ? progress.replayScopeKey.trim() : "";
  if (explicitKey) {
    const explicitScope = tutorialScopeInfo(tutorial, explicitKey);
    if (explicitScope && (explicitScope.key === currentScope?.key || explicitScope.key === chapterScopeKey)) return explicitScope.key;
  }
  const legacyReplayStepId = normalizeTutorialReplayStep(tutorial, progress?.replayStepId);
  if (legacyReplayStepId && legacyReplayStepId === step.id) return currentScope?.key || null;
  return null;
}

export function tutorialReplayScopeKey(tutorial, progress) {
  return tutorialReplayScopeKeyCandidate(tutorial, progress);
}

function tutorialScopeAncestors(tutorial, scopeKey) {
  const scope = tutorialScopeInfo(tutorial, scopeKey);
  if (!scope?.key) return [];
  const keys = [scope.key];
  if (scope.kind === "widget" || scope.kind === "section") {
    const pageKey = tutorialPageScopeKey(scope.page);
    if (pageKey) keys.push(pageKey);
    if (scope.page === "world") keys.push("world");
  } else if (scope.kind === "page" && scope.page === "world") {
    keys.push("world");
  } else if (scope.kind === "world") {
    const pageKey = tutorialPageScopeKey("world");
    if (pageKey) keys.push(pageKey);
  }
  return uniqueStrings(keys);
}

export function tutorialDisabledScopeKeys(tutorial, progress) {
  return normalizeTutorialDisabledScopeKeys(tutorial, progress?.disabledScopeKeys, progress?.disabledPages);
}

export function tutorialDisabledContextIds(tutorial, progress) {
  return normalizeTutorialDisabledContextIds(tutorial, progress?.disabledContextIds);
}

export function isTutorialScopeDisabled(tutorial, progress, scopeKey) {
  if (!progress) return false;
  const disabled = new Set(tutorialDisabledScopeKeys(tutorial, progress));
  return tutorialScopeAncestors(tutorial, scopeKey).some(key => disabled.has(key));
}

export function isTutorialContextDisabled(tutorial, progress, contextId) {
  if (!progress) return false;
  return tutorialDisabledContextIds(tutorial, progress).includes(typeof contextId === "string" ? contextId.trim() : "");
}

export function normalizeTutorialProgress(tutorial, progress) {
  if (!progress || typeof progress !== "object") return null;
  const fallbackStep = tutorial?.steps?.[0] ?? null;
  const step = tutorialStep(tutorial, progress.stepId) ?? fallbackStep;
  const stepId = step?.id ?? null;
  const replayScopeKey = tutorialReplayScopeKeyCandidate(tutorial, { ...progress, stepId });
  const disabledScopeKeys = normalizeTutorialDisabledScopeKeys(tutorial, progress.disabledScopeKeys, progress.disabledPages);
  const disabledContextIds = normalizeTutorialDisabledContextIds(tutorial, progress.disabledContextIds);
  return {
    tutorialId: tutorial?.id || TODO_TUTORIAL_ID,
    chapterId: step?.chapterId || null,
    stepId,
    chapterStatus: typeof progress.chapterStatus === "string" ? progress.chapterStatus : (step ? "in_progress" : "idle"),
    draftInputs: progress.draftInputs && typeof progress.draftInputs === "object" ? progress.draftInputs : {},
    completedAt: typeof progress.completedAt === "string" ? progress.completedAt : null,
    hidden: progress.hidden === true,
    disabledScopeKeys,
    disabledContextIds,
    replayScopeKey,
    disabledPages: tutorialDisabledPagesFromScopeKeys(tutorial, disabledScopeKeys),
    replayStepId: replayScopeKey && stepId ? stepId : null
  };
}

export function createTutorialProgress(tutorial, stepId = tutorial?.steps?.[0]?.id || null) {
  const step = tutorialStep(tutorial, stepId) ?? tutorial?.steps?.[0] ?? null;
  return normalizeTutorialProgress(tutorial, {
    tutorialId: tutorial?.id || TODO_TUTORIAL_ID,
    chapterId: step?.chapterId || null,
    stepId: step?.id || null,
    chapterStatus: step ? "in_progress" : "idle",
    draftInputs: {},
    completedAt: null,
    hidden: false,
    disabledScopeKeys: [],
    disabledContextIds: [],
    replayScopeKey: null
  });
}

export function tutorialStepConcepts(tutorial, stepId) {
  const concepts = new Map((tutorial?.concepts ?? []).map(concept => [concept.id, concept]));
  return [...new Set((tutorialStep(tutorial, stepId)?.concepts ?? []).map(String))]
    .map(id => concepts.get(id))
    .filter(Boolean);
}

export function tutorialRevealedConcepts(tutorial, progressOrStepId) {
  const stepId = typeof progressOrStepId === "string" ? progressOrStepId : progressOrStepId?.stepId;
  const currentIndex = progressOrStepId?.completedAt
    ? ((tutorial?.steps?.length ?? 1) - 1)
    : tutorialStepIndex(tutorial, stepId);
  if (currentIndex < 0) return [];
  const concepts = new Map((tutorial?.concepts ?? []).map(concept => [concept.id, concept]));
  const revealedIds = [];
  for (const step of tutorial?.steps?.slice(0, currentIndex + 1) ?? []) {
    for (const conceptId of [...new Set((step?.concepts ?? []).map(String))]) {
      if (!revealedIds.includes(conceptId) && concepts.has(conceptId)) revealedIds.push(conceptId);
    }
  }
  return revealedIds.map(id => concepts.get(id)).filter(Boolean);
}

export function isTutorialPageDisabled(tutorial, progress, page) {
  if (!(typeof page === "string" && page.trim())) return false;
  return isTutorialScopeDisabled(tutorial, progress, tutorialPageScopeKey(page));
}

export function setTutorialPageDisabled(tutorial, progress, page, disabled = true) {
  return setTutorialScopeDisabled(tutorial, progress, tutorialPageScopeKey(page), disabled);
}

export function setTutorialScopeDisabled(tutorial, progress, scopeKey, disabled = true) {
  if (!progress) return null;
  const current = normalizeTutorialProgress(tutorial, progress);
  const targetScope = tutorialScopeInfo(tutorial, scopeKey);
  if (!current || !targetScope?.key) return current;
  const disabledScopeKeys = new Set(tutorialDisabledScopeKeys(tutorial, current));
  if (disabled) disabledScopeKeys.add(targetScope.key);
  else disabledScopeKeys.delete(targetScope.key);
  return normalizeTutorialProgress(tutorial, {
    ...current,
    disabledScopeKeys: [...disabledScopeKeys]
  });
}

export function setTutorialContextDisabled(tutorial, progress, contextId, disabled = true) {
  if (!progress) return null;
  const current = normalizeTutorialProgress(tutorial, progress);
  const targetContext = tutorialContextInfo(tutorial, contextId);
  if (!current || !targetContext?.id) return current;
  const disabledContextIds = new Set(tutorialDisabledContextIds(tutorial, current));
  if (disabled) disabledContextIds.add(targetContext.id);
  else disabledContextIds.delete(targetContext.id);
  return normalizeTutorialProgress(tutorial, {
    ...current,
    disabledContextIds: [...disabledContextIds]
  });
}

export function restartTutorialFromScope(tutorial, progress, scopeKey, stepId = progress?.stepId) {
  const current = tutorialStep(tutorial, stepId);
  if (!current) return createTutorialProgress(tutorial);
  const replayScope = tutorialScopeInfo(tutorial, scopeKey);
  return normalizeTutorialProgress(tutorial, {
    ...(progress ?? createTutorialProgress(tutorial, current.id)),
    chapterId: current.chapterId,
    stepId: current.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: replayScope?.key || tutorialStepScope(tutorial, current)?.key || null
  });
}

export function restartTutorialFromHere(tutorial, progress, stepId = progress?.stepId) {
  const current = tutorialStep(tutorial, stepId);
  return restartTutorialFromScope(tutorial, progress, tutorialStepScope(tutorial, current)?.key, current?.id);
}

export function tutorialStepIndex(tutorial, stepId) {
  return tutorial?.steps?.findIndex(step => step.id === stepId) ?? -1;
}

export function tutorialStep(tutorial, stepId) {
  return tutorial?.steps?.find(step => step.id === stepId) ?? null;
}

export function nextTutorialStep(tutorial, stepId) {
  const index = tutorialStepIndex(tutorial, stepId);
  if (index < 0) return tutorial?.steps?.[0] ?? null;
  return tutorial.steps[index + 1] ?? null;
}

export function previousTutorialStep(tutorial, stepId) {
  const index = tutorialStepIndex(tutorial, stepId);
  if (index <= 0) return null;
  return tutorial.steps[index - 1] ?? null;
}

export function firstTutorialStepInChapter(tutorial, chapterId) {
  if (!tutorial?.steps?.length || !chapterId) return null;
  return tutorial.steps.find(step => step.chapterId === chapterId) ?? null;
}

export function skipTutorialChapter(tutorial, progress) {
  const current = tutorialStep(tutorial, progress?.stepId);
  if (!current) return createTutorialProgress(tutorial);
  const next = tutorial.steps.find(step => step.chapterId !== current.chapterId && tutorialStepIndex(tutorial, step.id) > tutorialStepIndex(tutorial, current.id));
  if (!next) {
    return normalizeTutorialProgress(tutorial, { ...progress, chapterStatus: "completed", completedAt: progress.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeTutorialProgress(tutorial, { ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: "in_progress", replayScopeKey: null });
}

export function advanceTutorialProgress(tutorial, progress) {
  const next = nextTutorialStep(tutorial, progress?.stepId);
  if (!next) {
    return normalizeTutorialProgress(tutorial, { ...progress, chapterStatus: "completed", completedAt: progress?.completedAt || new Date().toISOString(), replayScopeKey: null });
  }
  return normalizeTutorialProgress(tutorial, {
    ...progress,
    chapterId: next.chapterId,
    stepId: next.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function retreatTutorialProgress(tutorial, progress) {
  const previous = previousTutorialStep(tutorial, progress?.stepId);
  if (!previous) return progress;
  return normalizeTutorialProgress(tutorial, {
    ...progress,
    chapterId: previous.chapterId,
    stepId: previous.id,
    chapterStatus: "in_progress",
    completedAt: null,
    replayScopeKey: null
  });
}

export function restartTutorialChapter(tutorial, progress, chapterId = progress?.chapterId) {
  const first = firstTutorialStepInChapter(tutorial, chapterId);
  if (!first) return createTutorialProgress(tutorial);
  return normalizeTutorialProgress(tutorial, {
    ...(progress ?? createTutorialProgress(tutorial, first.id)),
    chapterId: first.chapterId,
    stepId: first.id,
    chapterStatus: "in_progress",
    completedAt: null,
    hidden: false,
    draftInputs: {},
    replayScopeKey: null
  });
}

export function mergeTutorialProgress(tutorial, localProgress, remoteProgress) {
  if (localProgress?.completedAt && !remoteProgress?.completedAt) return normalizeTutorialProgress(tutorial, localProgress);
  if (remoteProgress?.completedAt && !localProgress?.completedAt) return normalizeTutorialProgress(tutorial, remoteProgress);
  const localIndex = tutorialStepIndex(tutorial, localProgress?.stepId);
  const remoteIndex = tutorialStepIndex(tutorial, remoteProgress?.stepId);
  if (remoteIndex > localIndex) return normalizeTutorialProgress(tutorial, remoteProgress);
  if (localIndex > remoteIndex) return normalizeTutorialProgress(tutorial, localProgress);
  if (!localProgress) return normalizeTutorialProgress(tutorial, remoteProgress) ?? null;
  if (!remoteProgress) return normalizeTutorialProgress(tutorial, localProgress) ?? null;
  const localNormalized = normalizeTutorialProgress(tutorial, localProgress);
  const remoteNormalized = normalizeTutorialProgress(tutorial, remoteProgress);
  if (localProgress.hidden === false && remoteProgress.hidden === true) {
    return localNormalized;
  }
  if (remoteProgress.hidden === false && localProgress.hidden === true) {
    return remoteNormalized;
  }
  return normalizeTutorialProgress(tutorial, {
    ...remoteNormalized,
    hidden: remoteNormalized.hidden,
    disabledScopeKeys: [...new Set([...tutorialDisabledScopeKeys(tutorial, remoteNormalized), ...tutorialDisabledScopeKeys(tutorial, localNormalized)])],
    disabledContextIds: [...new Set([...tutorialDisabledContextIds(tutorial, remoteNormalized), ...tutorialDisabledContextIds(tutorial, localNormalized)])],
    replayScopeKey: tutorialReplayScopeKey(tutorial, localNormalized) || tutorialReplayScopeKey(tutorial, remoteNormalized) || null
  });
}

