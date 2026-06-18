import {
  defineCapability,
  installCapability,
  moduleProjectors,
  updateCapability
} from "./modules.js";

const PLACEHOLDER_PROVENANCE_SOURCES = new Set([
  "dsl.context.capabilities",
  "host.declare.backend",
  "host.declare.frontend",
  "server.start.defaultHostCapabilities"
]);

function migratedProvenance(provenance, bridgeSource) {
  const base = provenance && typeof provenance === "object" ? structuredClone(provenance) : {};
  return {
    ...base,
    source: "migration.legacyCapabilityBridge",
    migratedFrom: bridgeSource
  };
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String).filter(Boolean))];
}

export function legacyCapabilityCompatibilityMode(world) {
  const preview = previewLegacyCapabilityMigration(world);
  return {
    mode: preview.pending.length ? "bridge-active" : "first-class-only",
    pendingCount: preview.pending.length,
    bridgeSources: [...new Set(preview.pending.map(row => row.bridgeSource))]
  };
}

export function previewLegacyCapabilityMigration(world) {
  return previewLegacyCapabilityMigrationFromProject(projector => world.project(projector));
}

export function legacyCapabilityCompatibilityModeFromProject(project) {
  const preview = previewLegacyCapabilityMigrationFromProject(project);
  return {
    mode: preview.pending.length ? "bridge-active" : "first-class-only",
    pendingCount: preview.pending.length,
    bridgeSources: [...new Set(preview.pending.map(row => row.bridgeSource))]
  };
}

export function previewLegacyCapabilityMigrationFromProject(project) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const capabilityIndex = project(moduleProjectors.capabilityIndex)?.byId ?? {};
  const capabilityInstalls = project(moduleProjectors.capabilityInstalls) ?? [];
  const explicitInstallKeys = new Set(
    capabilityInstalls
      .filter(row => row.source === "explicit")
      .map(row => `${row.targetKind}\u0000${row.target}\u0000${row.capability}`)
  );
  const pending = [];
  const definitionRows = new Map();
  const installRows = new Map();

  for (const capability of Object.values(capabilityIndex)) {
    const bridgeSource = typeof capability?.provenance?.source === "string" ? capability.provenance.source : "";
    if (!PLACEHOLDER_PROVENANCE_SOURCES.has(bridgeSource)) continue;
    const installedTargetKinds = uniqueStrings(
      capabilityInstalls
        .filter(row => row.capability === capability.id)
        .map(row => row.targetKind)
    );
    definitionRows.set(capability.id, {
      id: `legacyCapabilityMigration:definition:${capability.id}`,
      action: "definition.update",
      capabilityId: capability.id,
      bridgeSource,
      currentProvenance: bridgeSource,
      nextProvenance: "migration.legacyCapabilityBridge",
      placement: uniqueStrings([...(capability.placement ?? []), ...installedTargetKinds]),
      installTargets: capabilityInstalls
        .filter(row => row.capability === capability.id)
        .map(row => `${row.targetKind}:${row.target}`)
    });
  }

  for (const install of capabilityInstalls) {
    if (install.source !== "legacy-context" && install.source !== "legacy-host") continue;
    const key = `${install.targetKind}\u0000${install.target}\u0000${install.capability}`;
    if (explicitInstallKeys.has(key)) continue;
    installRows.set(key, {
      id: `legacyCapabilityMigration:install:${install.targetKind}:${install.target}:${install.capability}`,
      action: "install.explicit",
      capabilityId: install.capability,
      bridgeSource: install.source,
      targetKind: install.targetKind,
      target: install.target
    });
    if (!capabilityIndex[install.capability]) {
      definitionRows.set(install.capability, {
        id: `legacyCapabilityMigration:definition:${install.capability}`,
        action: "definition.create",
        capabilityId: install.capability,
        bridgeSource: install.source === "legacy-context"
          ? "legacyCapabilityRelation.contextCapability"
          : "legacyCapabilityRelation.hostCapability",
        currentProvenance: null,
        nextProvenance: "migration.legacyCapabilityBridge",
        placement: [install.targetKind],
        installTargets: [`${install.targetKind}:${install.target}`]
      });
    }
  }

  pending.push(...definitionRows.values(), ...installRows.values());
  pending.sort((left, right) =>
    String(left.action).localeCompare(String(right.action))
    || String(left.capabilityId).localeCompare(String(right.capabilityId))
    || String(left.targetKind || "").localeCompare(String(right.targetKind || ""))
    || String(left.target || "").localeCompare(String(right.target || ""))
  );

  return {
    compatibilityMode: pending.length ? "bridge-active" : "first-class-only",
    pending,
    summary: {
      pendingDefinitions: pending.filter(row => row.action.startsWith("definition.")).length,
      pendingInstalls: pending.filter(row => row.action === "install.explicit").length
    }
  };
}

export function applyLegacyCapabilityMigration(world, {
  actor
}) {
  const previewBefore = previewLegacyCapabilityMigration(world);
  if (!previewBefore.pending.length) {
    const witness = world.emit({
      process: "capability.migrateLegacy",
      actor,
      claims: [],
      body: { ok: true, actions: [], previewBefore, previewAfter: previewBefore }
    });
    return { ok: true, actions: [], previewBefore, previewAfter: previewBefore, witness };
  }

  const actions = [];
  const appliedDefinitionIds = new Set();
  const definitionRows = previewBefore.pending.filter(row => row.action.startsWith("definition."));
  for (const row of definitionRows) {
    if (appliedDefinitionIds.has(row.capabilityId)) continue;
    appliedDefinitionIds.add(row.capabilityId);
    const current = world.project(moduleProjectors.capabilityIndex).byId[row.capabilityId] ?? null;
    if (!current) {
      defineCapability(world, {
        actor,
        id: row.capabilityId,
        label: row.capabilityId,
        provenance: migratedProvenance(null, row.bridgeSource),
        placement: row.placement
      });
      actions.push({ action: "definition.create", capabilityId: row.capabilityId });
      continue;
    }
    updateCapability(world, {
      actor,
      ...current,
      placement: uniqueStrings([...(current.placement ?? []), ...(row.placement ?? [])]),
      provenance: migratedProvenance(current.provenance, row.bridgeSource),
      previousDefinition: current,
      previousVersion: current.version ?? null
    });
    actions.push({ action: "definition.update", capabilityId: row.capabilityId });
  }

  const explicitInstalls = world.project(moduleProjectors.capabilityInstalls)
    .filter(row => row.source === "explicit")
    .map(row => `${row.targetKind}\u0000${row.target}\u0000${row.capability}`);
  const explicitSet = new Set(explicitInstalls);
  for (const row of previewBefore.pending.filter(entry => entry.action === "install.explicit")) {
    const key = `${row.targetKind}\u0000${row.target}\u0000${row.capabilityId}`;
    if (explicitSet.has(key)) continue;
    installCapability(world, {
      actor,
      capability: row.capabilityId,
      target: row.target,
      targetKind: row.targetKind
    });
    explicitSet.add(key);
    actions.push({
      action: "install.explicit",
      capabilityId: row.capabilityId,
      targetKind: row.targetKind,
      target: row.target
    });
  }

  const previewAfter = previewLegacyCapabilityMigration(world);
  const witness = world.emit({
    process: "capability.migrateLegacy",
    actor,
    claims: [],
    body: {
      ok: true,
      actions,
      previewBefore,
      previewAfter
    }
  });
  return { ok: true, actions, previewBefore, previewAfter, witness };
}
