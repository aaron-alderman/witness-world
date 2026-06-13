export function renderBootstrapRuntimePluginReviewViewFactory() {
  return String.raw`
    const runtimePluginReviewRows = ${runtimePluginReviewRows.toString()};
    const runtimePluginReviewOptionLabel = ${runtimePluginReviewOptionLabel.toString()};
    const buildBootstrapRuntimePluginPreviewSummary = ${buildBootstrapRuntimePluginPreviewSummary.toString()};
    const buildBootstrapRuntimePluginReviewView = ${buildBootstrapRuntimePluginReviewView.toString()};
  `;
}

export function runtimePluginReviewRows(review = null) {
  return review?.packages || [];
}

export function runtimePluginReviewOptionLabel(row = {}) {
  const badges = Array.isArray(row.statusBadges) && row.statusBadges.length
    ? " {" + row.statusBadges.join(", ") + "}"
    : "";
  return row.plugin + (row.version ? " [" + row.version + "]" : "") + badges;
}

export function buildBootstrapRuntimePluginPreviewSummary({
  review = null,
  row = null,
  runtimeProfile = "full"
} = {}) {
  const routeKindCounts = values => {
    const counts = new Map();
    for (const value of values || []) {
      const routeKind = typeof value?.routeKind === "string" && value.routeKind.trim()
        ? value.routeKind.trim()
        : null;
      if (!routeKind) continue;
      counts.set(routeKind, (counts.get(routeKind) ?? 0) + 1);
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
  };
  const summarizeRouteKinds = values => {
    const counts = routeKindCounts(values);
    return counts.length ? counts.map(([routeKind, count]) => routeKind + "=" + count).join(", ") : "none";
  };

  if (!row) return "Select a runtime plugin review row.";
  const preview = row.installed ? row.removePreview : row.installPreview;
  const profile = review?.activeProfile || row.compatibility?.activeProfile || runtimeProfile || "full";
  const parts = [
    (row.installed ? "Installed" : (row.installable ? "Installable" : "Blocked")) + " on profile " + profile + "."
  ];
  if (!row.installed && row.installable && (row.dependencies?.direct || []).length) {
    parts.push("Depends on: " + row.dependencies.direct.join(", ") + ".");
  }
  if (!row.installable && !row.installed && (row.blockingReasons || []).length) {
    parts.push("Blocked by: " + row.blockingReasons.join("; ") + ".");
  }
  if (preview?.available) {
    const bundleChanges = [
      ...(preview.delta?.addedBundleIds?.length ? ["add bundles " + preview.delta.addedBundleIds.join(", ")] : []),
      ...(preview.delta?.removedBundleIds?.length ? ["remove bundles " + preview.delta.removedBundleIds.join(", ")] : [])
    ];
    if (bundleChanges.length) parts.push("Would " + bundleChanges.join(" and ") + ".");
    const routeKindsAdded = summarizeRouteKinds((preview.delta?.addedHandlerMetadata || []).map(entry => entry.metadata));
    const routeKindsRemoved = summarizeRouteKinds((preview.delta?.removedHandlerMetadata || []).map(entry => entry.metadata));
    const routeKindsChanged = (preview.delta?.changedHandlerMetadata || []).length;
    if (routeKindsAdded !== "none" || routeKindsRemoved !== "none" || routeKindsChanged) {
      const routeParts = [];
      if (routeKindsAdded !== "none") routeParts.push("add handler route kinds " + routeKindsAdded);
      if (routeKindsRemoved !== "none") routeParts.push("remove handler route kinds " + routeKindsRemoved);
      if (routeKindsChanged) routeParts.push("change " + routeKindsChanged + " existing handler contracts");
      parts.push("Would " + routeParts.join(", ") + ".");
    }
    if (preview.delta?.effectiveNoOp) parts.push("Executable runtime composition is unchanged.");
  }
  return parts.join(" ");
}

export function buildBootstrapRuntimePluginReviewView({
  review = null,
  escapeHtml = value => String(value),
  runtimeProfile = "full"
} = {}) {
  const cloneForDisplay = value => {
    if (Array.isArray(value)) return value.map(cloneForDisplay);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneForDisplay(item)]));
    }
    return value;
  };
  const formatRuntimePluginValue = value => escapeHtml(JSON.stringify(cloneForDisplay(value), null, 2));
  const defaultNote = review?.note || "Runtime plugin review shows authored runner intent only.";

  if (!review?.serverRunner) {
    return {
      detailHtml: '<div class="state-item muted">Create a server runner to review runtime plugin composition.</div>',
      noteText: defaultNote
    };
  }

  const row = runtimePluginReviewRows(review).find(entry => entry.plugin === (review.selectedPluginId || "")) || null;
  if (!row) {
    return {
      detailHtml: '<div class="state-item muted">No discovered plugin packages for this server runner.</div>',
      noteText: defaultNote
    };
  }

  const preview = row.installed ? row.removePreview : row.installPreview;
  const renderCodeItems = values => values.length
    ? values.map(value => '<div class="state-item"><code>' + formatRuntimePluginValue(value) + '</code></div>').join("")
    : '<div class="state-item muted">None.</div>';
  const previewDelta = preview?.delta ? [
    { addedBundleIds: preview.delta.addedBundleIds, removedBundleIds: preview.delta.removedBundleIds },
    { addedCapabilityIds: preview.delta.addedCapabilityIds, removedCapabilityIds: preview.delta.removedCapabilityIds },
    { addedRoutes: preview.delta.addedRoutes, removedRoutes: preview.delta.removedRoutes },
    { addedSurfaces: preview.delta.addedSurfaces, removedSurfaces: preview.delta.removedSurfaces },
    {
      addedHandlerMetadata: preview.delta.addedHandlerMetadata,
      removedHandlerMetadata: preview.delta.removedHandlerMetadata,
      changedHandlerMetadata: preview.delta.changedHandlerMetadata
    }
  ] : [];
  const reviewSummary = buildBootstrapRuntimePluginPreviewSummary({
    review,
    row,
    runtimeProfile
  });

  return {
    detailHtml: [
      '<div class="state-item">',
      '<strong>Operator Summary</strong>',
      '<code>' + escapeHtml(reviewSummary) + '</code>',
      '</div>',
      '<div class="state-item">',
      '<strong>' + escapeHtml(row.displayName || row.plugin) + '</strong>',
      '<code>' + escapeHtml(row.plugin) + (row.version ? " [" + escapeHtml(row.version) + "]" : "") + '</code>',
      '<code>' + formatRuntimePluginValue({
        statusBadges: row.statusBadges,
        installed: row.installed,
        installable: row.installable,
        missingPackage: row.missingPackage,
        discoveryPath: row.discoveryPath,
        description: row.description
      }) + '</code>',
      '</div>',
      '<div class="state-item">',
      '<strong>Metadata And Trust</strong>',
      '<code>' + formatRuntimePluginValue({
        execution: row.execution,
        trust: row.trust,
        provenance: row.metadata?.provenance ?? null,
        permissions: row.metadata?.permissions ?? [],
        compatibleRuntimeProfiles: row.metadata?.compatibleRuntimeProfiles ?? [],
        compatibleShells: row.metadata?.compatibleShells ?? []
      }) + '</code>',
      '</div>',
      '<div class="state-item">',
      '<strong>Dependencies</strong>',
      '<code>' + formatRuntimePluginValue({
        direct: row.dependencies?.direct ?? [],
        missing: row.dependencies?.missing ?? [],
        reverseDependents: row.dependencies?.reverseDependents ?? [],
        blockingReasons: row.blockingReasons ?? []
      }) + '</code>',
      '</div>',
      '<div class="state-item">',
      '<strong>Declared Manifest Contributions</strong>',
      renderCodeItems([
        { capabilities: row.declaredManifestContributions?.capabilities ?? [] },
        { routes: row.declaredManifestContributions?.routes ?? [] },
        { surfaces: row.declaredManifestContributions?.surfaces ?? [] },
        { providers: row.declaredManifestContributions?.providers ?? [] }
      ]),
      '</div>',
      '<div class="state-item">',
      '<strong>Resolved Executable Contributions</strong>',
      renderCodeItems([
        { bundles: row.resolvedBundles ?? [] },
        { capabilities: row.resolvedRuntimeContributions?.capabilities ?? [] },
        { routes: row.resolvedRuntimeContributions?.routes ?? [] },
        { surfaces: row.resolvedRuntimeContributions?.surfaces ?? [] },
        { handlerSets: row.resolvedRuntimeContributions?.handlerSets ?? [] }
      ]),
      '</div>',
      '<div class="state-item">',
      '<strong>Current Runner Composition</strong>',
      '<code>' + formatRuntimePluginValue(row.currentComposition || review.currentComposition || null) + '</code>',
      '</div>',
      '<div class="state-item">',
      '<strong>' + (row.installed ? "Remove Preview" : "Install Preview") + '</strong>',
      '<code>' + formatRuntimePluginValue(preview || {
        available: false,
        note: row.installed ? "Plugin is not currently authored on this runner." : "Plugin is already authored on this runner."
      }) + '</code>',
      (preview?.available && preview?.delta?.effectiveNoOp ? '<div class="state-item muted">Effective runtime composition is unchanged for this action.</div>' : ''),
      (previewDelta.length ? renderCodeItems(previewDelta) : ''),
      '</div>'
    ].join(""),
    noteText: defaultNote + (reviewSummary ? " " + reviewSummary : "")
  };
}
