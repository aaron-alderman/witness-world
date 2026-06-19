import { moduleProjectors } from "./modules.js";
import { materializeCanonicalPackageBundle } from "./package-authorship.js";

export function materializeCanonicalPackageBundleFromProject(project, {
  revisionId,
  materializedFiles = []
} = {}) {
  const normalizedRevisionId = normalizeRequiredRevisionId(revisionId);
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
  const namespaceRowsById = new Map(
    packageNamespaces
      .filter(row => row.package === packageRecord.id && row.id)
      .map(row => [row.id, row])
  );
  const namespaceIdSet = new Set(namespaces.map(row => row.id).filter(Boolean));

  const packageDependencyIndex = project(moduleProjectors.packageDependencyIndex);
  const dependencies = packageDependencyIndex?.bySourceRevision?.[normalizedRevisionId] ?? [];
  const packageTransformerIndex = project(moduleProjectors.packageTransformerIndex);
  const transformers = (packageTransformerIndex?.byPackage?.[packageRecord.id] ?? []).filter(row =>
    row.sourceRevision === normalizedRevisionId
    || row.targetRevision === normalizedRevisionId
    || (row.sourceNamespace && namespaceIdSet.has(row.sourceNamespace))
    || (row.targetNamespace && namespaceIdSet.has(row.targetNamespace))
  );
  const bundleNamespaces = [...namespaces];
  for (const transformer of transformers) {
    for (const namespaceId of [transformer.sourceNamespace, transformer.targetNamespace]) {
      if (!namespaceId || namespaceIdSet.has(namespaceId)) continue;
      const namespaceRow = namespaceRowsById.get(namespaceId);
      if (!namespaceRow) continue;
      namespaceIdSet.add(namespaceId);
      bundleNamespaces.push(namespaceRow);
    }
  }

  return materializeCanonicalPackageBundle({
    packageRecord,
    revisionRecord,
    patches,
    namespaces: bundleNamespaces,
    dependencies,
    transformers,
    materializedFiles
  });
}

export function previewPackageRevisionApplyFromProject(project, {
  revisionId,
  materializedFiles = []
} = {}) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const normalizedRevisionId = normalizeRequiredRevisionId(revisionId);
  const bundle = materializeCanonicalPackageBundleFromProject(project, {
    revisionId: normalizedRevisionId,
    materializedFiles
  });
  const packageId = bundle.packageRecord.id;
  const coexistenceIndex = project(moduleProjectors.packageCoexistenceIndex);
  const coexistence = coexistenceIndex?.byRevision?.[normalizedRevisionId]
    ?? coexistenceIndex?.byPackage?.[packageId]
    ?? null;
  const convergenceIndex = project(moduleProjectors.packageConvergenceIndex);
  const convergence = convergenceIndex?.byPackage?.[packageId] ?? null;
  const selectedRevision = coexistence?.revisions?.find(row => row.id === normalizedRevisionId) ?? null;
  const selectedNamespaces = (coexistence?.namespaceSelections ?? [])
    .filter(row => row.revision === normalizedRevisionId);
  const selectedNamespaceIdSet = new Set(selectedNamespaces.map(row => row.id).filter(Boolean));
  const manifestPluginConflicts = (coexistence?.manifestPluginConflicts ?? [])
    .filter(conflict => conflict.revisionIds.includes(normalizedRevisionId));
  const relatedTransformers = (convergence?.transformers ?? [])
    .filter(transformer =>
      transformer.sourceRevision === normalizedRevisionId
      || transformer.targetRevision === normalizedRevisionId
      || (transformer.sourceNamespace && selectedNamespaceIdSet.has(transformer.sourceNamespace))
      || (transformer.targetNamespace && selectedNamespaceIdSet.has(transformer.targetNamespace))
    );
  const relatedTransformerIdSet = new Set(relatedTransformers.map(row => row.id).filter(Boolean));
  const relatedConvergencePatches = (convergence?.convergencePatches ?? [])
    .filter(patch =>
      patch.revision === normalizedRevisionId
      || (patch.transformer && relatedTransformerIdSet.has(patch.transformer))
    );
  const remainingGlue = (convergence?.remainingGlue ?? [])
    .filter(entry => entry.transformerId == null || relatedTransformerIdSet.has(entry.transformerId));
  const status = packageRevisionApplyPreviewStatus({
    coexistenceMode: coexistence?.coexistenceMode ?? "single-line",
    convergenceStatus: convergence?.status ?? null,
    manifestPluginConflicts,
    remainingGlue
  });
  return {
    kind: "packageRevisionApplyPreview",
    revisionId: normalizedRevisionId,
    packageId,
    status,
    explanation: packageRevisionApplyPreviewExplanation({
      status,
      selectedNamespaces,
      manifestPluginConflicts,
      convergenceExplanation: convergence?.explanation ?? null
    }),
    bundle,
    coexistence: cloneProjectedValue(coexistence),
    convergence: cloneProjectedValue(convergence),
    selectedRevision: cloneProjectedValue(selectedRevision),
    selectedNamespaces: cloneProjectedValue(selectedNamespaces),
    manifestPluginConflicts: cloneProjectedValue(manifestPluginConflicts),
    relatedTransformers: cloneProjectedValue(relatedTransformers),
    relatedConvergencePatches: cloneProjectedValue(relatedConvergencePatches),
    remainingGlue: cloneProjectedValue(remainingGlue)
  };
}

function packageApplyPreviewRowFromPreview(preview) {
  return {
    ...preview,
    id: `packageApplyPreview:${preview.revisionId}`,
    title: preview.selectedRevision?.version
      ? `${preview.packageId} ${preview.selectedRevision.version}`
      : preview.revisionId,
    packageLabel: preview.bundle?.packageRecord?.label ?? preview.packageId,
    revisionVersion: preview.selectedRevision?.version ?? preview.bundle?.revisionRecord?.version ?? null,
    revisionStatus: preview.selectedRevision?.status ?? preview.bundle?.revisionRecord?.status ?? null,
    bundleHash: preview.bundle?.bundleHash ?? null,
    bundleFileCount: Array.isArray(preview.bundle?.files) ? preview.bundle.files.length : 0,
    bundleFilePaths: Array.isArray(preview.bundle?.files) ? preview.bundle.files.map(file => file.path) : [],
    coexistenceId: preview.coexistence?.id ?? null,
    convergenceId: preview.convergence?.id ?? null,
    selectedNamespaceIds: (preview.selectedNamespaces ?? []).map(namespace => namespace.id),
    manifestConflictIds: (preview.manifestPluginConflicts ?? []).map(conflict => conflict.id),
    relatedTransformerIds: (preview.relatedTransformers ?? []).map(transformer => transformer.id),
    relatedConvergencePatchIds: (preview.relatedConvergencePatches ?? []).map(patch => patch.id),
    remainingGlueMessages: (preview.remainingGlue ?? []).map(item => item.message)
  };
}

function normalizeRequiredRevisionId(revisionId) {
  const normalizedRevisionId = typeof revisionId === "string" && revisionId.trim() ? revisionId.trim() : "";
  if (!normalizedRevisionId) throw new Error("revisionId is required");
  return normalizedRevisionId;
}

function packageRevisionApplyPreviewStatus({
  coexistenceMode,
  convergenceStatus,
  manifestPluginConflicts,
  remainingGlue
}) {
  if ((manifestPluginConflicts ?? []).some(conflict => conflict.blocked)) return "blocked";
  if (convergenceStatus === "unplanned") return "unplanned";
  if (convergenceStatus === "glue-required") return "glue-required";
  if (convergenceStatus === "converging") return "converging";
  if ((remainingGlue ?? []).length > 0) return "glue-required";
  if (coexistenceMode === "coexisting") return "coexisting";
  return "ready";
}

function packageRevisionApplyPreviewExplanation({
  status,
  selectedNamespaces,
  manifestPluginConflicts,
  convergenceExplanation
}) {
  switch (status) {
    case "blocked":
      return "Revision still collides with another authored line under the same manifest identity, and no explicit namespace split or supersede rule explains the coexistence.";
    case "unplanned":
      return convergenceExplanation
        ?? "Revision coexists with another authored line, but no package transformer contract explains convergence yet.";
    case "glue-required":
      return convergenceExplanation
        ?? "Revision can be inspected and replayed, but authored convergence glue still remains before the divergent lines can be treated as fully converged.";
    case "converging":
      return convergenceExplanation
        ?? "Revision participates in an authored convergence contract with patches already present and no remaining glue notes.";
    case "coexisting":
      return (selectedNamespaces ?? []).length > 0
        ? "Revision is selected by explicit package namespace rows, so it can coexist without collapsing the other authored line into a fake merge."
        : "Revision coexists with other authored lines and remains inspectable without forcing destructive collapse.";
    default:
      return (manifestPluginConflicts ?? []).length > 0
        ? "Revision is inspectable and replayable, and the current coexistence facts do not mark its manifest conflict as blocked."
        : "Revision is inspectable and replayable as the current authored package line with no remaining convergence blockers.";
  }
}

function matchesPackageApplyPreviewRow(row, id) {
  const target = typeof id === "string" && id.trim() ? id.trim() : "";
  if (!target) return true;
  return row.id === target
    || row.packageId === target
    || row.revisionId === target
    || row.coexistenceId === target
    || row.convergenceId === target
    || row.selectedNamespaceIds.includes(target)
    || row.manifestConflictIds.includes(target)
    || row.relatedTransformerIds.includes(target)
    || row.relatedConvergencePatchIds.includes(target);
}

export function packageApplyPreviewRowsFromProject(project, {
  id = null
} = {}) {
  if (typeof project !== "function") throw new Error("project must be a function");
  const packageRevisionIndex = project(moduleProjectors.packageRevisionIndex);
  const revisions = Array.isArray(packageRevisionIndex?.rows) ? packageRevisionIndex.rows : [];
  const normalizedId = typeof id === "string" && id.trim() ? id.trim() : null;
  const rows = revisions
    .map(revision => {
      try {
        return packageApplyPreviewRowFromPreview(previewPackageRevisionApplyFromProject(project, {
          revisionId: revision.id
        }));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) =>
      String(left.packageId).localeCompare(String(right.packageId))
      || String(left.revisionVersion ?? "").localeCompare(String(right.revisionVersion ?? ""))
      || String(left.revisionId).localeCompare(String(right.revisionId))
    );
  return normalizedId
    ? rows.filter(row => matchesPackageApplyPreviewRow(row, normalizedId))
    : rows;
}

function cloneProjectedValue(value) {
  return value == null ? value : structuredClone(value);
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
