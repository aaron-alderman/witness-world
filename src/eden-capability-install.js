import { projectors } from "./projectors-core.js";

const DEFAULT_SURFACE_ID = "eden.surface.world";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(entry => stringOrNull(entry)).filter(Boolean))]
    : [];
}

function normalizeCapabilityRow(body) {
  if (!body || typeof body !== "object" || !body.id) return null;
  return {
    id: String(body.id),
    label: stringOrNull(body.label) ?? String(body.id),
    version: stringOrNull(body.version),
    provenance: body.provenance && typeof body.provenance === "object" ? { ...body.provenance } : null,
    dependsOn: Array.isArray(body.dependsOn) ? [...new Set(body.dependsOn.map(String).filter(Boolean))] : [],
    publicApi: Array.isArray(body.publicApi) ? body.publicApi.map(entry => entry && typeof entry === "object" ? { ...entry } : entry).filter(Boolean) : [],
    providerAdapters: Array.isArray(body.providerAdapters)
      ? body.providerAdapters.map(entry => entry && typeof entry === "object" ? { ...entry } : entry).filter(Boolean)
      : [],
    placement: Array.isArray(body.placement) ? [...new Set(body.placement.map(String).filter(Boolean))] : [],
    context: stringOrNull(body.context)
  };
}

function capabilityCatalog(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== "defineCapability") continue;
    const row = normalizeCapabilityRow(witness.body);
    if (!row) continue;
    rows.set(row.id, row);
  }
  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function capabilityInstalls(witnesses) {
  const rows = [];
  const seen = new Set();
  const rels = projectors.currentRelations(witnesses);
  const add = row => {
    const key = `${row.targetKind}\u0000${row.target}\u0000${row.capability}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  for (const row of rels) {
    if (row.rel === "installsCapability") {
      add({
        target: row.from,
        capability: row.to,
        targetKind: String(row.meta?.targetKind || ""),
        config: row.meta?.config && typeof row.meta.config === "object" ? { ...row.meta.config } : null,
        source: "explicit",
        witness: row.witness
      });
    }
    if (row.rel === "contextCapability") {
      add({
        target: row.from,
        capability: row.to,
        targetKind: "context",
        config: null,
        source: "legacy-context",
        witness: row.witness
      });
    }
    if (row.rel === "hostCapability") {
      add({
        target: row.from,
        capability: row.to,
        targetKind: "host",
        config: null,
        source: "legacy-host",
        witness: row.witness
      });
    }
  }

  return rows.sort((a, b) =>
    String(a.targetKind).localeCompare(String(b.targetKind))
    || String(a.target).localeCompare(String(b.target))
    || String(a.capability).localeCompare(String(b.capability))
  );
}

function summarizeCapability(capability) {
  const source = stringOrNull(capability?.provenance?.source);
  if (source) return source;
  const api = Array.isArray(capability?.publicApi) ? capability.publicApi.map(field => stringOrNull(field?.name)).filter(Boolean) : [];
  if (api.length) return "API: " + api.join(", ");
  const adapters = Array.isArray(capability?.providerAdapters) ? capability.providerAdapters.map(adapter => stringOrNull(adapter?.label) ?? stringOrNull(adapter?.id)).filter(Boolean) : [];
  if (adapters.length) return "Adapters: " + adapters.join(", ");
  return "Inspectable capability object";
}

export function projectEdenCapabilityInstallState(witnesses, {
  actor = null,
  surfaceId = DEFAULT_SURFACE_ID,
  target = "frontend",
  targetKind = "context",
  targetLabel = null,
  recommendedCapabilities = []
} = {}) {
  const normalizedSurfaceId = stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID;
  const normalizedTarget = stringOrNull(target) ?? "frontend";
  const normalizedTargetKind = stringOrNull(targetKind) ?? "context";
  const normalizedTargetLabel = stringOrNull(targetLabel) ?? normalizedTarget;
  const recommendations = stringList(recommendedCapabilities);
  const catalog = capabilityCatalog(witnesses);
  const installs = capabilityInstalls(witnesses)
    .filter(row => row.target === normalizedTarget && row.targetKind === normalizedTargetKind);
  const installedByCapability = new Map(installs.map(row => [row.capability, row]));
  const compatible = catalog.filter(row => Array.isArray(row.placement) && row.placement.includes(normalizedTargetKind));
  const compatibleById = new Map(compatible.map(row => [row.id, row]));
  const suggestedRows = (recommendations.length
    ? recommendations.map(id => compatibleById.get(id)).filter(Boolean)
    : compatible
  ).map(row => {
    const install = installedByCapability.get(row.id) ?? null;
    const dependencies = Array.isArray(row.dependsOn) ? row.dependsOn : [];
    const missingDependencies = dependencies.filter(id => !installedByCapability.has(id));
    const adapterLabels = Array.isArray(row.providerAdapters)
      ? row.providerAdapters.map(adapter => stringOrNull(adapter?.label) ?? stringOrNull(adapter?.id)).filter(Boolean)
      : [];
    return {
      id: row.id,
      label: row.label || row.id,
      version: row.version || null,
      summary: summarizeCapability(row),
      context: row.context || null,
      placement: Array.isArray(row.placement) ? [...row.placement] : [],
      dependsOn: dependencies,
      providerAdapters: adapterLabels,
      installed: Boolean(install),
      installSource: install?.source || null,
      missingDependencies
    };
  });

  return {
    mode: "capabilityInstall",
    actor,
    surfaceId: normalizedSurfaceId,
    target: normalizedTarget,
    targetKind: normalizedTargetKind,
    targetLabel: normalizedTargetLabel,
    suggestedCapabilities: suggestedRows,
    installedCapabilities: installs.map(row => {
      const capability = compatibleById.get(row.capability) ?? catalog.find(entry => entry.id === row.capability) ?? null;
      return {
        id: row.capability,
        label: capability?.label || row.capability,
        version: capability?.version || null,
        source: row.source || null
      };
    })
  };
}
