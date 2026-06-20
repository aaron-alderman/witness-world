const COMPATIBILITY_BRIDGE_CATALOG = Object.freeze([
  Object.freeze({
    id: "compatibilityBridge:legacyCapabilityRelation.contextCapability",
    title: "Legacy Context Capability Relation",
    bridgeClass: "legacy-capability-relation",
    owner: "capability.install",
    activationMode: "observed",
    policyStatus: "migration-required",
    migrationTarget: "Use first-class capability installs with targetKind=context.",
    notes: "Older worlds can still express context installs through contextCapability relations.",
    surfaces: Object.freeze([
      "src/modules.js",
      "plugins/inspect/world-graph.js",
      "plugins/eden/eden-capability-install.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:legacyCapabilityRelation.hostCapability",
    title: "Legacy Host Capability Relation",
    bridgeClass: "legacy-capability-relation",
    owner: "capability.install",
    activationMode: "observed",
    policyStatus: "migration-required",
    migrationTarget: "Use first-class capability installs with targetKind=host.",
    notes: "Older host composition can still surface through hostCapability relations.",
    surfaces: Object.freeze([
      "src/modules.js",
      "src/runtime-host-utils.js",
      "plugins/inspect/world-graph.js",
      "plugins/eden/eden-capability-install.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:placeholderCapabilitySynthesis.dslContextCapabilities",
    title: "DSL Context Capabilities Placeholder Synthesis",
    bridgeClass: "placeholder-capability-synthesis",
    owner: "capability.definition",
    activationMode: "observed",
    policyStatus: "migration-required",
    migrationTarget: "Author real capability objects plus explicit installs instead of synthesizing from context.capabilities.",
    notes: "Legacy context.capabilities DSL still synthesizes capability definitions as a bridge.",
    surfaces: Object.freeze([
      "src/desire/apply.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:placeholderCapabilitySynthesis.hostDeclareDefaults",
    title: "Host Declare Default Capability Synthesis",
    bridgeClass: "placeholder-capability-synthesis",
    owner: "runtime.hosts",
    activationMode: "observed",
    policyStatus: "migration-required",
    migrationTarget: "Provide first-class capability definitions before host declaration installs them.",
    notes: "Host declaration still synthesizes missing capability definitions for default host capabilities.",
    surfaces: Object.freeze([
      "src/runtime-host-utils.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:placeholderCapabilitySynthesis.serverStartDefaults",
    title: "Server Start Default Host Capability Synthesis",
    bridgeClass: "placeholder-capability-synthesis",
    owner: "runtime.startup",
    activationMode: "observed",
    policyStatus: "migration-required",
    migrationTarget: "Start from authored capability definitions and explicit install intent instead of runtime synthesis.",
    notes: "Server startup still synthesizes missing default host capability definitions before install.",
    surfaces: Object.freeze([
      "src/runtime-server.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:canonicalIdSugar.sameContextVisibleTarget",
    title: "Canonical Id Sugar For Same-Context Targets",
    bridgeClass: "canonical-id-sugar",
    owner: "context.naming",
    activationMode: "policy",
    policyStatus: "allowed-transitional",
    migrationTarget: "Prefer contextual *Ref authoring on covered surfaces.",
    notes: "Covered authoring flows still accept canonical ids when the target is local to the same visible context.",
    surfaces: Object.freeze([
      "src/modules.js",
      "plugins/authoring-core/authoring-core-processes.js",
      "plugins/program-authoring/program-processes.js",
      "plugins/server-runner-authoring/server-runner-processes.js",
      "plugins/mcp-authoring/mcp-processes.js",
      "plugins/mcp-authoring/desire-runtime.js",
      "src/desire/apply.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:canonicalIdSugar.importedVisibleTarget",
    title: "Canonical Id Sugar For Imported Visible Targets",
    bridgeClass: "canonical-id-sugar",
    owner: "context.naming",
    activationMode: "policy",
    policyStatus: "allowed-transitional",
    migrationTarget: "Prefer contextual imports and *Ref authoring instead of direct canonical ids.",
    notes: "Covered authoring flows still allow canonical ids for foreign targets that are already explicitly visible through bindings or imports.",
    surfaces: Object.freeze([
      "src/modules.js",
      "plugins/authoring-core/authoring-core-processes.js",
      "plugins/program-authoring/program-processes.js",
      "plugins/server-runner-authoring/server-runner-processes.js",
      "plugins/mcp-authoring/mcp-processes.js",
      "plugins/mcp-authoring/desire-runtime.js",
      "src/desire/apply.js"
    ])
  }),
  Object.freeze({
    id: "compatibilityBridge:canonicalIdSugar.unscopedLegacyTarget",
    title: "Canonical Id Sugar For Unscoped Legacy Targets",
    bridgeClass: "canonical-id-sugar",
    owner: "context.naming",
    activationMode: "policy",
    policyStatus: "migration-required",
    migrationTarget: "Migrate unscoped legacy objects onto explicit contexts and contextual refs.",
    notes: "Historical diagnostics may still classify legacy unscoped targets, but covered authoring now rejects them until they move onto explicit contexts and contextual refs.",
    surfaces: Object.freeze([
      "src/modules.js",
      "plugins/authoring-core/authoring-core-processes.js",
      "plugins/program-authoring/program-processes.js",
      "plugins/server-runner-authoring/server-runner-processes.js",
      "plugins/mcp-authoring/mcp-processes.js",
      "plugins/mcp-authoring/desire-runtime.js",
      "src/desire/apply.js"
    ])
  }),
]);

const BRIDGE_BY_ID = new Map(COMPATIBILITY_BRIDGE_CATALOG.map(bridge => [bridge.id, bridge]));

function observeBridge(observed, bridgeId, {
  count = 1,
  sampleTarget = null,
  sampleSource = null
} = {}) {
  const bridge = BRIDGE_BY_ID.get(String(bridgeId || ""));
  if (!bridge) throw new Error(`Unregistered compatibility bridge emitted: ${bridgeId}`);
  const entry = observed.get(bridge.id) ?? {
    count: 0,
    sampleTargets: [],
    sampleSources: []
  };
  entry.count += Math.max(0, Number(count) || 0);
  if (sampleTarget && !entry.sampleTargets.includes(sampleTarget) && entry.sampleTargets.length < 12) {
    entry.sampleTargets.push(sampleTarget);
  }
  if (sampleSource && !entry.sampleSources.includes(sampleSource) && entry.sampleSources.length < 12) {
    entry.sampleSources.push(sampleSource);
  }
  observed.set(bridge.id, entry);
}

function sampleCapabilityTarget(capability) {
  return typeof capability?.id === "string" && capability.id.trim()
    ? capability.id.trim()
    : null;
}

function sampleInstallTarget(install) {
  const target = typeof install?.target === "string" ? install.target.trim() : "";
  const capability = typeof install?.capability === "string" ? install.capability.trim() : "";
  if (!target && !capability) return null;
  if (!target) return capability;
  if (!capability) return target;
  return `${target} -> ${capability}`;
}

function sortRows(rows = []) {
  return [...rows].sort((left, right) =>
    String(left.bridgeClass || "").localeCompare(String(right.bridgeClass || ""))
    || String(left.title || "").localeCompare(String(right.title || ""))
    || String(left.id || "").localeCompare(String(right.id || ""))
  );
}

export function compatibilityBridgeCatalog() {
  return COMPATIBILITY_BRIDGE_CATALOG.map(bridge => ({
    ...bridge,
    surfaces: [...bridge.surfaces]
  }));
}

export function buildCompatibilityBridgeLedger({
  capabilities = [],
  capabilityInstalls = [],
  additionalObservedBridges = []
} = {}) {
  const observed = new Map();

  for (const install of Array.isArray(capabilityInstalls) ? capabilityInstalls : []) {
    if (install?.source === "legacy-context") {
      observeBridge(observed, "compatibilityBridge:legacyCapabilityRelation.contextCapability", {
        sampleTarget: sampleInstallTarget(install),
        sampleSource: install.source
      });
    }
    if (install?.source === "legacy-host") {
      observeBridge(observed, "compatibilityBridge:legacyCapabilityRelation.hostCapability", {
        sampleTarget: sampleInstallTarget(install),
        sampleSource: install.source
      });
    }
  }

  for (const capability of Array.isArray(capabilities) ? capabilities : []) {
    const provenanceSource = typeof capability?.provenance?.source === "string"
      ? capability.provenance.source.trim()
      : "";
    if (!provenanceSource) continue;
    if (provenanceSource === "dsl.context.capabilities") {
      observeBridge(observed, "compatibilityBridge:placeholderCapabilitySynthesis.dslContextCapabilities", {
        sampleTarget: sampleCapabilityTarget(capability),
        sampleSource: provenanceSource
      });
      continue;
    }
    if (provenanceSource.startsWith("host.declare.")) {
      observeBridge(observed, "compatibilityBridge:placeholderCapabilitySynthesis.hostDeclareDefaults", {
        sampleTarget: sampleCapabilityTarget(capability),
        sampleSource: provenanceSource
      });
      continue;
    }
    if (provenanceSource === "server.start.defaultHostCapabilities") {
      observeBridge(observed, "compatibilityBridge:placeholderCapabilitySynthesis.serverStartDefaults", {
        sampleTarget: sampleCapabilityTarget(capability),
        sampleSource: provenanceSource
      });
    }
  }

  for (const row of Array.isArray(additionalObservedBridges) ? additionalObservedBridges : []) {
    observeBridge(observed, row?.bridgeId ?? row?.id, {
      count: row?.count ?? 1,
      sampleTarget: row?.sampleTarget ?? null,
      sampleSource: row?.sampleSource ?? null
    });
  }

  return sortRows(COMPATIBILITY_BRIDGE_CATALOG.map(bridge => {
    const observation = observed.get(bridge.id) ?? null;
    const activeCount = observation?.count ?? 0;
    return {
      ...bridge,
      surfaces: [...bridge.surfaces],
      activeCount,
      active: bridge.activationMode === "policy" ? null : activeCount > 0,
      status: bridge.activationMode === "policy"
        ? "policy"
        : (activeCount > 0 ? "active" : "dormant"),
      sampleTargets: observation ? [...observation.sampleTargets] : [],
      sampleSources: observation ? [...observation.sampleSources] : []
    };
  }));
}
