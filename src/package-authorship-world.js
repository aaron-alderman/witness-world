import { moduleProjectors } from "./modules.js";
import { materializeCanonicalPackageBundle } from "./package-authorship.js";

export function materializeCanonicalPackageBundleFromProject(project, {
  revisionId,
  materializedFiles = []
} = {}) {
  const normalizedRevisionId = typeof revisionId === "string" && revisionId.trim() ? revisionId.trim() : "";
  if (!normalizedRevisionId) throw new Error("revisionId is required");
  if (typeof project !== "function") throw new Error("project must be a function");

  const packageRevisionIndex = project(moduleProjectors.packageRevisionIndex);
  const revisionRecord = packageRevisionIndex?.byId?.[normalizedRevisionId] ?? null;
  if (!revisionRecord) throw new Error("package revision not found");

  const packageIndex = project(moduleProjectors.packageIndex);
  const packageRecord = packageIndex?.byId?.[revisionRecord.package] ?? null;
  if (!packageRecord) throw new Error("package not found");

  const packagePatchIndex = project(moduleProjectors.packagePatchIndex);
  const patches = packagePatchIndex?.byRevision?.[normalizedRevisionId] ?? [];

  const packageNamespaces = project(moduleProjectors.packageNamespaces) ?? [];
  const namespaces = packageNamespaces.filter(row =>
    row.package === packageRecord.id
    && (row.revision == null || row.revision === normalizedRevisionId)
  );

  const packageDependencyIndex = project(moduleProjectors.packageDependencyIndex);
  const dependencies = packageDependencyIndex?.bySourceRevision?.[normalizedRevisionId] ?? [];
  const packageTransformerIndex = project(moduleProjectors.packageTransformerIndex);
  const transformers = (packageTransformerIndex?.byPackage?.[packageRecord.id] ?? []).filter(row =>
    row.sourceRevision === normalizedRevisionId
    || row.targetRevision === normalizedRevisionId
  );

  return materializeCanonicalPackageBundle({
    packageRecord,
    revisionRecord,
    patches,
    namespaces,
    dependencies,
    transformers,
    materializedFiles
  });
}

function matchesPackageCoexistenceRow(row, id) {
  const target = typeof id === "string" && id.trim() ? id.trim() : "";
  if (!target) return true;
  return row.id === target
    || row.packageId === target
    || row.revisionIds.includes(target)
    || row.selectedRevisionIds.includes(target)
    || row.revisions.some(revision =>
      revision.id === target
      || revision.manifestPluginId === target
    )
    || row.namespaceSelections.some(namespace =>
      namespace.id === target
      || namespace.context === target
      || namespace.name === target
      || `${namespace.context}:${namespace.name}` === target
      || namespace.revision === target
    )
    || row.manifestPluginConflicts.some(conflict =>
      conflict.id === target
      || conflict.manifestPluginId === target
      || conflict.revisionIds.includes(target)
      || conflict.namespaceIds.includes(target)
    );
}

export function packageCoexistenceFromProject(project, {
  id = null
} = {}) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const rows = project(moduleProjectors.packageCoexistence) ?? [];
  const normalizedId = typeof id === "string" && id.trim() ? id.trim() : null;
  return normalizedId
    ? rows.filter(row => matchesPackageCoexistenceRow(row, normalizedId))
    : rows;
}

function matchesPackageConvergenceRow(row, id) {
  const target = typeof id === "string" && id.trim() ? id.trim() : "";
  if (!target) return true;
  return row.id === target
    || row.packageId === target
    || row.coexistenceId === target
    || row.transformerIds.includes(target)
    || row.convergencePatchIds.includes(target)
    || row.transformers.some(transformer =>
      transformer.id === target
      || transformer.sourceRevision === target
      || transformer.targetRevision === target
      || transformer.sourceNamespace === target
      || transformer.targetNamespace === target
    );
}

export function packageConvergenceFromProject(project, {
  id = null
} = {}) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const rows = project(moduleProjectors.packageConvergence) ?? [];
  const normalizedId = typeof id === "string" && id.trim() ? id.trim() : null;
  return normalizedId
    ? rows.filter(row => matchesPackageConvergenceRow(row, normalizedId))
    : rows;
}
