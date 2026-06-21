import { moduleProjectors } from "../../src/modules.js";
import { RUNTIME_NETWORK_CAPABILITY_INVENTORY } from "../../src/runtime-network-capability-inventory.js";

function visibleWitnessesForSystem(witnesses, { requestActor = null, appContext = null } = {}) {
  const projector = typeof appContext?.visibleWitnesses === "function"
    ? appContext.visibleWitnesses
    : () => witnesses;
  return projector(requestActor);
}

function processCounts(witnesses = []) {
  const counts = new Map();
  for (const witness of witnesses) {
    const process = String(witness?.process || "");
    if (!process) continue;
    counts.set(process, (counts.get(process) || 0) + 1);
  }
  return counts;
}

function activeCapabilityDefinitions(appContext = null) {
  return (appContext?.runtimeContributions?.capabilityDefinitions ?? [])
    .filter(row => row?.id)
    .map(row => ({
      id: String(row.id),
      label: String(row.label || row.id),
      source: "runtime-contribution",
      providerAdapters: Array.isArray(row.providerAdapters) ? row.providerAdapters.length : 0,
      witnessContract: row.witnessContract && typeof row.witnessContract === "object" ? "declared" : "none"
    }));
}

function capabilityRows(witnesses = [], appContext = null) {
  const definitions = moduleProjectors.capabilities(witnesses).map(row => ({
    id: row.id,
    label: row.label || row.id,
    source: "witnessed",
    providerAdapters: Array.isArray(row.providerAdapters) ? row.providerAdapters.length : 0,
    witnessContract: row.witnessContract && typeof row.witnessContract === "object" ? "declared" : "none"
  }));
  const runtimeDefinitions = activeCapabilityDefinitions(appContext);
  const installs = moduleProjectors.capabilityInstalls(witnesses).map(row => ({
    id: `${row.targetKind}:${row.target}:${row.capability}`,
    capability: row.capability,
    target: row.target,
    targetKind: row.targetKind,
    source: row.source || "install",
    witness: row.witness || null
  }));
  return {
    definitions: [...definitions, ...runtimeDefinitions]
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
    installs: installs.sort((left, right) => String(left.id).localeCompare(String(right.id)))
  };
}

function networkBoundaryRows() {
  return Object.entries(RUNTIME_NETWORK_CAPABILITY_INVENTORY).map(([key, entry]) => ({
    id: key,
    kind: "network",
    status: String(entry.scope || "static-inventory"),
    capability: entry.capabilityId || (Array.isArray(entry.capabilityIds) ? entry.capabilityIds.join(", ") : ""),
    ownerFiles: entry.ownerFiles ?? [],
    note: entry.note || ""
  }));
}

function capabilityBoundaryRows(capabilities = []) {
  return capabilities
    .filter(row => row.providerAdapters > 0 || row.witnessContract === "declared")
    .map(row => ({
      id: `capability:${row.id}`,
      kind: "capability",
      status: row.source,
      capability: row.id,
      ownerFiles: [],
      note: row.providerAdapters > 0
        ? `${row.providerAdapters} provider adapter(s)`
        : "witness contract declared"
    }));
}

function runtimeSummary(appContext = null) {
  const health = typeof appContext?.runtimeProcessHealthMonitor?.snapshot === "function"
    ? appContext.runtimeProcessHealthMonitor.snapshot()
    : null;
  return {
    health,
    status: health?.status || (health ? "unknown" : "unavailable"),
    ok: health?.ok ?? false,
    reasonCodes: Array.isArray(health?.reasonCodes) ? health.reasonCodes : [],
    runtimeCounts: health?.runtimeCounts ?? {},
    resourceFamilies: health?.resourceFamilies ?? {},
    lastGood: health?.lastGood ?? null
  };
}

function sourceRows(witnesses = []) {
  const byFile = new Map();
  for (const witness of witnesses) {
    const file = typeof witness?.body?.file === "string" ? witness.body.file : "";
    if (!file) continue;
    const row = byFile.get(file) ?? { file, count: 0, lastWitness: null };
    row.count += 1;
    row.lastWitness = witness.id || row.lastWitness;
    byFile.set(file, row);
  }
  return [...byFile.values()].sort((left, right) => String(left.file).localeCompare(String(right.file)));
}

function proofRows(witnesses = [], observations = []) {
  return [...witnesses, ...observations]
    .filter(row => String(row?.process || "").toLowerCase().includes("proof"))
    .slice(-20)
    .map(row => ({
      id: row.id || "",
      process: row.process || "",
      actor: row.actor || null,
      body: row.body ?? {}
    }));
}

function recentProcessRows(observations = []) {
  return observations
    .filter(row => String(row?.process || "").startsWith("backend.") || String(row?.process || "").startsWith("frontend."))
    .slice(-20)
    .reverse()
    .map(row => ({
      id: row.id || "",
      process: row.process || "",
      actor: row.actor || null,
      statusCode: row.body?.statusCode ?? null,
      program: row.body?.program ?? null,
      runId: row.body?.runId ?? null,
      stepId: row.body?.stepId ?? null
    }));
}

function recentEvidence(witnesses = [], observations = []) {
  return [
    ...witnesses.slice(-8).map(row => ({ kind: "witness", id: row.id || "", process: row.process || "", actor: row.actor || null })),
    ...observations.slice(-8).map(row => ({ kind: "observation", id: row.id || "", process: row.process || "", actor: row.actor || null }))
  ].slice(-12).reverse();
}

export function inspectWorldSystemReadModel(witnesses, {
  requestActor = null,
  appContext = null,
  observations = []
} = {}) {
  const visible = visibleWitnessesForSystem(witnesses, { requestActor, appContext });
  const counts = processCounts(visible);
  const capabilities = capabilityRows(visible, appContext);
  const runtime = runtimeSummary(appContext);
  const boundaries = [
    ...networkBoundaryRows(),
    ...capabilityBoundaryRows(capabilities.definitions)
  ].sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const sources = sourceRows(visible);
  const proofs = proofRows(visible, observations);
  return {
    summary: {
      witnesses: visible.length,
      observations: observations.length,
      processes: counts.size,
      capabilityDefinitions: capabilities.definitions.length,
      capabilityInstalls: capabilities.installs.length,
      boundaries: boundaries.length,
      runtimeStatus: runtime.status
    },
    capabilities,
    boundaries,
    runtime,
    processes: recentProcessRows(observations),
    sources,
    proofs,
    externalSystems: boundaries.map(row => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      capability: row.capability
    })),
    recentEvidence: recentEvidence(visible, observations)
  };
}
