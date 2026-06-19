export const GUIDANCE_SUGGESTION_ACTION_KINDS = Object.freeze([
  "startTutorial",
  "resumeTutorial",
  "enableCurrentPage",
  "enableContext",
  "enablePage",
  "continueSurface",
  "openApp",
  "focusDisabledScopes",
  "focusTarget",
  "openRuntimeIssues",
  "focusRuntimeTarget",
  "rerunRuntimeProbe",
  "copyRuntimeInspection"
]);

export const GUIDANCE_OVERLAY_ACTION_IDS = Object.freeze([
  "tutorial-resume-page",
  "tutorial-next",
  "tutorial-back",
  "tutorial-restart-chapter",
  "tutorial-restart-step",
  "tutorial-show-current-control",
  "tutorial-disable-page",
  "tutorial-disable-context",
  "tutorial-exit",
  "tutorial-reset"
]);

export const GUIDANCE_DISABLED_SCOPE_ACTION_ATTRS = Object.freeze([
  "data-disabled-scope-focus",
  "data-disabled-context-enable",
  "data-disabled-scope-enable",
  "data-disabled-scope-open"
]);

export const GUIDANCE_BOOTSTRAP_DISABLED_ACTION_ATTRS = Object.freeze([
  "data-disabled-focus",
  "data-disabled-enable",
  "data-disabled-open",
  "data-disabled-context",
  "data-disabled-scope"
]);

export const GUIDANCE_WORLD_ACTION_ATTRS = Object.freeze([
  "data-world-tutorial-focus-target",
  "data-world-tutorial-focus-scope-target",
  "data-world-tutorial-show-disabled",
  "data-world-tutorial-resume",
  "data-world-tutorial-next",
  "data-world-tutorial-back",
  "data-world-tutorial-restart-chapter",
  "data-world-tutorial-restart-step",
  "data-world-tutorial-enable-scope",
  "data-world-tutorial-enable-context",
  "data-world-tutorial-open-scope",
  "data-world-tutorial-disable",
  "data-world-tutorial-disable-context",
  "data-world-tutorial-exit",
  "data-world-tutorial-reset"
]);

export const GUIDANCE_RUNTIME_ACTIONS = Object.freeze([
  "continueTutorialOnPage",
  "submitTutorialTargetForm",
  "restartTutorialChapter",
  "restartTutorialFromHere",
  "readTutorialTodos",
  "readTutorialNotes",
  "isTutorialStepComplete"
]);

export const GUIDANCE_SUGGESTION_FOCUS_TARGETS = Object.freeze([
  "identity-form",
  "session-form",
  "create-todo-starter",
  "authored-state"
]);

export const GUIDANCE_ACTION_REGISTRY = Object.freeze([
  {
    id: "suggestion.startTutorial",
    kind: "startTutorial",
    surfaces: ["bootstrap"],
    resolver: "click:#tutorial-start",
    hiddenBehavior: false
  },
  {
    id: "suggestion.resumeTutorial",
    kind: "resumeTutorial",
    surfaces: ["bootstrap"],
    resolver: "click:#tutorial-resume",
    hiddenBehavior: false
  },
  {
    id: "suggestion.enableCurrentPage",
    kind: "enableCurrentPage",
    surfaces: ["bootstrap"],
    resolver: "clearTutorialScopeDisabled(progress, scopeKey)",
    hiddenBehavior: false
  },
  {
    id: "suggestion.enableContext",
    kind: "enableContext",
    surfaces: ["bootstrap"],
    resolver: "clearTutorialContextDisabled(progress, contextId)",
    hiddenBehavior: false
  },
  {
    id: "suggestion.enablePage",
    kind: "enablePage",
    surfaces: ["bootstrap"],
    resolver: "clearTutorialScopeDisabled(progress, scopeKey)",
    hiddenBehavior: false
  },
  {
    id: "suggestion.continueSurface",
    kind: "continueSurface",
    surfaces: ["bootstrap", "app", "world"],
    resolver: "continueTutorialOnPage(page)",
    hiddenBehavior: false
  },
  {
    id: "suggestion.openApp",
    kind: "openApp",
    surfaces: ["bootstrap"],
    resolver: "click:#open-app-link",
    hiddenBehavior: false
  },
  {
    id: "suggestion.focusDisabledScopes",
    kind: "focusDisabledScopes",
    surfaces: ["bootstrap", "app", "world"],
    resolver: "focus:#tutorial-disabled-pages|#tutorial-disabled-scopes-panel|[data-world-tutorial-disabled-list]",
    hiddenBehavior: false
  },
  {
    id: "suggestion.focusTarget",
    kind: "focusTarget",
    surfaces: ["bootstrap"],
    resolver: "focus:[data-guidance-target],[data-tutorial-target]",
    hiddenBehavior: false
  },
  {
    id: "suggestion.openRuntimeIssues",
    kind: "openRuntimeIssues",
    surfaces: ["app", "world", "bootstrap", "page.surface"],
    resolver: "open:#sourcery-companion-panel issues section",
    hiddenBehavior: false
  },
  {
    id: "suggestion.focusRuntimeTarget",
    kind: "focusRuntimeTarget",
    surfaces: ["app", "world", "bootstrap", "page.surface"],
    resolver: "focus:#targetId from runtime issue suggestion",
    hiddenBehavior: false
  },
  {
    id: "suggestion.rerunRuntimeProbe",
    kind: "rerunRuntimeProbe",
    surfaces: ["app", "world", "bootstrap", "page.surface"],
    resolver: "click:#sourcery-companion-panel rerun probe action",
    hiddenBehavior: false
  },
  {
    id: "suggestion.copyRuntimeInspection",
    kind: "copyRuntimeInspection",
    surfaces: ["app", "world", "bootstrap", "page.surface"],
    resolver: "click:#sourcery-companion-panel download json action",
    hiddenBehavior: false
  },
  {
    id: "overlay.resumePage",
    kind: "overlay",
    surfaces: ["app", "world"],
    resolver: "click:#sourcery-companion-guidance-action|#tutorial-resume-page|data-world-tutorial-resume",
    hiddenBehavior: false
  },
  {
    id: "overlay.next",
    kind: "overlay",
    surfaces: ["app", "world"],
    resolver: "click:#tutorial-next|data-world-tutorial-next",
    hiddenBehavior: false
  },
  {
    id: "overlay.back",
    kind: "overlay",
    surfaces: ["app", "world"],
    resolver: "click:#tutorial-back|data-world-tutorial-back",
    hiddenBehavior: false
  },
  {
    id: "overlay.restartChapter",
    kind: "overlay",
    surfaces: ["app", "world", "bootstrap"],
    resolver: "restartTutorialChapter(progress)",
    hiddenBehavior: false
  },
  {
    id: "overlay.restartStep",
    kind: "overlay",
    surfaces: ["app", "world", "bootstrap"],
    resolver: "restartTutorialFromHere(progress)",
    hiddenBehavior: false
  },
  {
    id: "overlay.showCurrentControl",
    kind: "overlay",
    surfaces: ["app", "world"],
    resolver: "focus:[data-guidance-target],[data-tutorial-target]",
    hiddenBehavior: false
  },
  {
    id: "overlay.disablePage",
    kind: "overlay",
    surfaces: ["app", "world", "bootstrap"],
    resolver: "setTutorialScopeDisabled(progress, currentScopeKey)",
    hiddenBehavior: false
  },
  {
    id: "overlay.disableContext",
    kind: "overlay",
    surfaces: ["app", "world"],
    resolver: "setTutorialContextDisabled(progress, contextId)",
    hiddenBehavior: false
  },
  {
    id: "overlay.exit",
    kind: "overlay",
    surfaces: ["app", "world", "bootstrap"],
    resolver: "persist progress.hidden=true",
    hiddenBehavior: false
  },
  {
    id: "overlay.reset",
    kind: "overlay",
    surfaces: ["app", "world", "bootstrap"],
    resolver: "clear persisted tutorial progress",
    hiddenBehavior: false
  },
  {
    id: "disabled.focusScope",
    kind: "disabledScope",
    surfaces: ["app", "world"],
    resolver: "focus:[data-guidance-target],[data-tutorial-target] via scope target name",
    hiddenBehavior: false
  },
  {
    id: "disabled.enableScope",
    kind: "disabledScope",
    surfaces: ["bootstrap", "app", "world"],
    resolver: "clearTutorialScopeDisabled(progress, scopeKey)",
    hiddenBehavior: false
  },
  {
    id: "disabled.enableContext",
    kind: "disabledScope",
    surfaces: ["bootstrap", "app", "world"],
    resolver: "clearTutorialContextDisabled(progress, contextId)",
    hiddenBehavior: false
  },
  {
    id: "disabled.openSurface",
    kind: "disabledScope",
    surfaces: ["bootstrap", "app", "world"],
    resolver: "continueTutorialOnPage(page)|location.assign(href)",
    hiddenBehavior: false
  },
  {
    id: "runtime.submitTargetForm",
    kind: "runtime",
    surfaces: ["bootstrap", "app"],
    resolver: "click real form submitter for tutorial step target",
    hiddenBehavior: false
  }
]);

export function guidanceActionRegistryKinds() {
  return GUIDANCE_ACTION_REGISTRY.map(entry => entry.kind);
}

export function guidanceActionRegistryEntries() {
  return GUIDANCE_ACTION_REGISTRY.map(entry => ({ ...entry }));
}

export function validateGuidanceActionRegistry() {
  const issues = [];
  const ids = new Set();
  for (const entry of GUIDANCE_ACTION_REGISTRY) {
    if (!entry.id) issues.push("missing id");
    if (ids.has(entry.id)) issues.push("duplicate id:" + entry.id);
    ids.add(entry.id);
    if (!entry.resolver) issues.push("missing resolver:" + entry.id);
    if (entry.hiddenBehavior) issues.push("hidden behavior:" + entry.id);
  }
  for (const kind of GUIDANCE_SUGGESTION_ACTION_KINDS) {
    if (!GUIDANCE_ACTION_REGISTRY.some(entry => entry.kind === kind)) {
      issues.push("unregistered suggestion kind:" + kind);
    }
  }
  return { ok: issues.length === 0, issues };
}
