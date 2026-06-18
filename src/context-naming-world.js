import {
  CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES,
  moduleProjectors
} from "./modules.js";

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function cloneRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => structuredClone(row));
}

function uniqueSortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function matchesSelector(row, selector) {
  if (!selector) return true;
  return Object.values(row ?? {}).some(value => {
    if (Array.isArray(value)) return value.map(String).includes(selector);
    return typeof value === "string" && value === selector;
  });
}

function filterRows(rows, {
  selector = null,
  context = null,
  name = null,
  target = null
} = {}) {
  const wantedSelector = trimString(selector);
  const wantedContext = trimString(context);
  const wantedName = trimString(name);
  const wantedTarget = trimString(target);
  return cloneRows(rows).filter(row => {
    if (wantedContext && row.context !== wantedContext && row.sourceContext !== wantedContext) return false;
    if (wantedName && row.name !== wantedName && row.exportName !== wantedName) return false;
    if (wantedTarget && row.target !== wantedTarget && row.id !== wantedTarget) return false;
    return matchesSelector(row, wantedSelector);
  });
}

export function explainProjectedContextualName(state, {
  context,
  name
}) {
  const wantedContext = trimString(context);
  const wantedName = trimString(name);
  if (!wantedContext || !wantedName) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "invalid",
      target: null,
      targets: [],
      rows: [],
      reason: "context and name are required for contextual resolution"
    };
  }
  const row = (state?.contextNameResolutions ?? [])
    .find(entry => entry.context === wantedContext && entry.name === wantedName) ?? null;
  if (!row) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "missing",
      target: null,
      targets: [],
      rows: [],
      reason: `name not visible in context: ${wantedName}`
    };
  }
  if (row.resolution !== "resolved" || !row.target) {
    return {
      ok: false,
      context: wantedContext,
      name: wantedName,
      resolution: "ambiguous",
      target: null,
      targets: [...(row.targets ?? [])],
      rows: cloneRows(row.rows ?? []),
      reason: `name resolves ambiguously in context: ${wantedName}`
    };
  }
  return {
    ok: true,
    context: wantedContext,
    name: wantedName,
    resolution: (row.sourceKinds ?? []).includes("local") ? "local" : "import",
    target: row.target,
    targets: [...(row.targets ?? [])],
    rows: cloneRows(row.rows ?? []),
    reason: ((row.sourceKinds ?? []).includes("local")
      ? "name resolves through a local binding in context: "
      : "name resolves through an imported binding in context: ") + wantedName
  };
}

export function explainProjectedTargetVisibility(state, {
  context,
  target
}) {
  const wantedContext = trimString(context);
  const wantedTarget = trimString(target);
  if (!wantedContext || !wantedTarget) {
    return {
      ok: false,
      context: wantedContext,
      target: wantedTarget,
      visible: false,
      visibility: "invalid",
      targetContext: null,
      names: [],
      rows: [],
      reason: "context and target are required for visibility explanation"
    };
  }
  const rows = cloneRows(state?.contextScopes ?? [])
    .filter(row => row.context === wantedContext && row.target === wantedTarget);
  const names = uniqueSortedStrings(rows.map(row => row.name));
  const contextualTarget = (state?.contextualTargets ?? [])
    .find(row => row.id === wantedTarget) ?? null;
  if (!contextualTarget && rows.length) {
    return {
      ok: true,
      context: wantedContext,
      target: wantedTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "import") ? "import" : "local",
      targetContext: null,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "import")
        ? `target is visible in context ${wantedContext} through explicit import or binding`
        : `target is locally bound in context ${wantedContext}`
    };
  }
  if (!contextualTarget) {
    return {
      ok: true,
      context: wantedContext,
      target: wantedTarget,
      visible: true,
      visibility: "unscoped",
      targetContext: null,
      names,
      rows,
      reason: `target is unscoped and remains canonically visible in context ${wantedContext}`
    };
  }
  if (contextualTarget.context === wantedContext) {
    return {
      ok: true,
      context: wantedContext,
      target: wantedTarget,
      visible: true,
      visibility: rows.some(row => row.sourceKind === "local") ? "local" : "same-context",
      targetContext: contextualTarget.context,
      names,
      rows,
      reason: rows.some(row => row.sourceKind === "local")
        ? `target is locally bound in context ${wantedContext}`
        : `target belongs to authoring context ${wantedContext}`
    };
  }
  if (rows.length) {
    return {
      ok: true,
      context: wantedContext,
      target: wantedTarget,
      visible: true,
      visibility: "import",
      targetContext: contextualTarget.context,
      names,
      rows,
      reason: `target is visible in context ${wantedContext} through explicit import or binding`
    };
  }
  return {
    ok: false,
    context: wantedContext,
    target: wantedTarget,
    visible: false,
    visibility: "hidden",
    targetContext: contextualTarget.context,
    names,
    rows,
    reason: `target ${wantedTarget} belongs to context ${contextualTarget.context} and is not visible in authoring context ${wantedContext}`
  };
}

export function classifyProjectedCanonicalIdPolicy(state, {
  context,
  target
}) {
  const wantedContext = trimString(context);
  const wantedTarget = trimString(target);
  if (!wantedContext || !wantedTarget) {
    return {
      ok: false,
      policyClass: null,
      reason: "context and target are required for canonical-id policy classification"
    };
  }
  const visibility = explainProjectedTargetVisibility(state, {
    context: wantedContext,
    target: wantedTarget
  });
  if (!visibility.ok) {
    return {
      ok: false,
      policyClass: null,
      reason: visibility.reason,
      visibility
    };
  }
  if (visibility.targetContext === wantedContext) {
    return {
      ok: true,
      policyClass: "same-context-convenience",
      visibility
    };
  }
  if (visibility.targetContext) {
    return {
      ok: true,
      policyClass: "imported-target-reference",
      visibility
    };
  }
  if (visibility.visibility === "unscoped") {
    return {
      ok: true,
      policyClass: "legacy-only-path",
      visibility
    };
  }
  return {
    ok: true,
    policyClass: null,
    visibility
  };
}

export function contextNamingStateFromProject(project, {
  id = null,
  context = null,
  name = null,
  target = null
} = {}) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const state = {
    contextBindings: project(moduleProjectors.contextBindings) ?? [],
    contextExports: project(moduleProjectors.contextExports) ?? [],
    contextImports: project(moduleProjectors.contextImports) ?? [],
    contextScopes: project(moduleProjectors.contextScopes) ?? [],
    contextualTargets: project(moduleProjectors.contextualTargets) ?? [],
    contextNameResolutions: project(moduleProjectors.contextNameResolutions) ?? [],
    contextNameConflicts: project(moduleProjectors.contextNameConflicts) ?? []
  };
  const selector = trimString(id);
  const scoped = {
    contextBindings: filterRows(state.contextBindings, { selector, context, name }),
    contextExports: filterRows(state.contextExports, { selector, context, name }),
    contextImports: filterRows(state.contextImports, { selector, context, name }),
    contextScopes: filterRows(state.contextScopes, { selector, context, name }),
    contextualTargets: filterRows(state.contextualTargets, { selector, context, target }),
    contextNameResolutions: filterRows(state.contextNameResolutions, { selector, context, name }),
    contextNameConflicts: filterRows(state.contextNameConflicts, { selector, context, name })
  };
  return {
    ...scoped,
    canonicalIdPolicyClasses: [...CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES],
    nameExplanation: trimString(context) && trimString(name)
      ? explainProjectedContextualName(state, { context, name })
      : null,
    targetVisibility: trimString(context) && trimString(target)
      ? explainProjectedTargetVisibility(state, { context, target })
      : null,
    canonicalIdPolicy: trimString(context) && trimString(target)
      ? classifyProjectedCanonicalIdPolicy(state, { context, target })
      : null
  };
}
