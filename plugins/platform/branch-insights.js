export const PLATFORM_BRANCH_LIFECYCLE_LANES = Object.freeze(["draft", "validate", "review", "apply", "push", "ship"]);

const DOC_REQUIREMENTS = Object.freeze({
  "plugin.platform": Object.freeze(["docs/CAPABILITIES.md"]),
  "surface.platform": Object.freeze(["docs/CAPABILITIES.md"]),
  "plugin.mcp": Object.freeze(["docs/CAPABILITIES.md"]),
  "runtime.profile": Object.freeze(["docs/RUNTIME-STACK-MAP.md"]),
  "runtime.core": Object.freeze(["docs/RUNTIME-AUDIT-INVENTORY.md"])
});

const TELEMETRY_IMPACT_RULES = Object.freeze({
  "plugin.platform": Object.freeze({
    id: "platform.self",
    label: "Platform self surface",
    reason: "Touches platform console, platform model, or platform route ownership code."
  }),
  "surface.platform": Object.freeze({
    id: "platform.self",
    label: "Platform self surface",
    reason: "Touches authored /platform page sources or styling that shape the platform console surface."
  }),
  "plugin.mcp": Object.freeze({
    id: "mcp.availability",
    label: "MCP tool availability",
    reason: "Touches MCP tool declarations, routing, or platform capability gates."
  }),
  "runtime.profile": Object.freeze({
    id: "runtime.profile.exposure",
    label: "Runtime profile exposure",
    reason: "Touches runtime profile seeds or profile-gated platform exposure."
  }),
  "runtime.core": Object.freeze({
    id: "runtime.behavior",
    label: "Runtime behavior",
    reason: "Touches core runtime or snapshot behavior used by active requests."
  }),
  "verification.tests": Object.freeze({
    id: "verification.gates",
    label: "Verification gates",
    reason: "Touches tests that prove platform or runtime invariants."
  }),
  docs: Object.freeze({
    id: "governance.docs",
    label: "Governed docs",
    reason: "Touches governed documentation that explains platform behavior or operator expectations."
  })
});

function uniqueSorted(values = []) {
  return [...new Set(values.map(String).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function rootSegment(path) {
  return String(path || "").split("/")[0] || "workspace";
}

export function summarizePlatformPathSystem(path) {
  const value = String(path || "");
  if (
    value === "plugins/platform/platform-page.js"
    || value === "plugins/platform/platform-console.rvm"
    || value === "plugins/platform/platform-console.wcss"
    || value === "plugins/platform/platform-style.js"
  ) {
    return { id: "surface.platform", label: "Platform surface", kind: "surface" };
  }
  if (value.startsWith("plugins/platform/")) {
    return { id: "plugin.platform", label: "Platform plugin", kind: "plugin" };
  }
  if (value.startsWith("plugins/mcp/")) {
    return { id: "plugin.mcp", label: "MCP plugin", kind: "plugin" };
  }
  if (value.startsWith("plugins/") && value.split("/").length > 1) {
    const segment = value.split("/")[1];
    return { id: `plugin.${segment}`, label: `Plugin ${segment}`, kind: "plugin" };
  }
  if (value === "store/seeds/runtime-profiles.json") {
    return { id: "runtime.profile", label: "Runtime profiles", kind: "config" };
  }
  if (value === "store/seeds/first-party-plugin-catalog.json") {
    return { id: "plugin.catalog", label: "Plugin catalog", kind: "config" };
  }
  if (value === "src/app-snapshot-manager.js" || value.startsWith("src/runtime-") || value === "src/runtime-server.js") {
    return { id: "runtime.core", label: "Runtime core", kind: "runtime" };
  }
  if (value.startsWith("test/") || value.endsWith(".test.js")) {
    return { id: "verification.tests", label: "Verification tests", kind: "test" };
  }
  if (value.startsWith("docs/")) {
    return { id: "docs", label: "Governed docs", kind: "doc" };
  }
  const segment = rootSegment(value);
  return { id: segment, label: segment, kind: "workspace" };
}

function platformPathInsights(paths = []) {
  const normalizedPaths = uniqueSorted(paths);
  const systems = new Map();
  const touchedDocs = normalizedPaths.filter(path => path.startsWith("docs/"));
  for (const path of normalizedPaths) {
    const system = summarizePlatformPathSystem(path);
    const current = systems.get(system.id) ?? { ...system, pathCount: 0, paths: [] };
    current.pathCount += 1;
    current.paths.push(path);
    systems.set(system.id, current);
  }
  const affectedSystems = [...systems.values()]
    .map(system => ({
      ...system,
      paths: uniqueSorted(system.paths)
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const affectedSystemSummaries = affectedSystems.map(system => ({
    system: system.id,
    label: system.label,
    kind: system.kind,
    pathCount: system.pathCount,
    paths: system.paths
  }));

  const telemetryImpacts = uniqueSorted(affectedSystems.map(system => TELEMETRY_IMPACT_RULES[system.id]?.id))
    .map(id => {
      const rule = Object.values(TELEMETRY_IMPACT_RULES).find(entry => entry.id === id);
      return rule ? { ...rule } : null;
    })
    .filter(Boolean);

  const requiredDocs = uniqueSorted(affectedSystems.flatMap(system => DOC_REQUIREMENTS[system.id] ?? []));
  const missingDocs = requiredDocs.filter(doc => !touchedDocs.includes(doc));
  const docsFreshness = {
    status: requiredDocs.length === 0 ? "not-needed" : (missingDocs.length ? "stale" : "fresh"),
    requiredDocs,
    touchedDocs: uniqueSorted(touchedDocs),
    missingDocs,
    summary: requiredDocs.length === 0
      ? "No governed doc update is required for the currently affected systems."
      : (missingDocs.length
        ? `Missing governed doc updates for ${missingDocs.join(", ")}.`
        : "Required governed docs are updated in this branch.")
  };

  return {
    changedPaths: normalizedPaths,
    affectedSystemSummaries,
    telemetryImpactSummaries: telemetryImpacts,
    docsFreshness
  };
}

export function platformBranchLifecycle(branch, {
  changeSets = [],
  proposals = []
} = {}) {
  const branchId = String(branch?.id || "");
  const branchChangeSets = Array.isArray(changeSets) ? changeSets : [];
  const changeSetIds = new Set(branchChangeSets.map(row => String(row?.id || "")).filter(Boolean));
  const reviewProposalIds = Array.isArray(proposals)
    ? proposals
      .filter(proposal => {
        if (String(proposal?.status || "") !== "open") return false;
        const targetKind = String(proposal?.targetKind || "");
        const targetId = String(proposal?.targetId || "");
        if (targetKind === "branch") return targetId === branchId;
        if (targetKind === "changeSet") return changeSetIds.has(targetId);
        return false;
      })
      .map(proposal => String(proposal.id))
      .sort()
    : [];
  const status = String(branch?.status || "open");
  let lifecycleLane = "draft";
  if (status === "shipped" || status === "closed") {
    lifecycleLane = "ship";
  } else if (status === "pushed" || status === "merged" || branchChangeSets.some(row => String(row?.status || "") === "applied")) {
    lifecycleLane = "push";
  } else if (reviewProposalIds.length) {
    lifecycleLane = "review";
  } else if (status === "valid" || branchChangeSets.some(row => String(row?.status || "") === "valid")) {
    lifecycleLane = "apply";
  } else if (
    status === "blocked"
    || branchChangeSets.some(row => ["draft", "validating", "invalid"].includes(String(row?.status || "")))
  ) {
    lifecycleLane = "validate";
  }
  return { lifecycleLane, reviewProposalIds };
}

export function platformBranchInsights(branch, {
  changeSets = [],
  edits = [],
  proposals = []
} = {}) {
  const lifecycle = platformBranchLifecycle(branch, { changeSets, proposals });
  const insights = platformPathInsights((Array.isArray(edits) ? edits : []).map(edit => edit?.path));

  return {
    ...lifecycle,
    ...insights
  };
}

export function platformChangeSetInsights(_changeSet, {
  edits = []
} = {}) {
  return platformPathInsights((Array.isArray(edits) ? edits : []).map(edit => edit?.path));
}
