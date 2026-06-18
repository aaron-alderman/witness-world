export function diagnosticsFromPlatformAppContext(appContext) {
  const summary = appContext?.runtimeBundleSummary ?? {};
  const snapshotManager = appContext?.appSnapshotManager ?? null;
  const snapshotDiagnostics = snapshotManager?.diagnostics?.() ?? null;
  const activeSnapshot = snapshotManager?.getActiveSnapshot?.() ?? null;
  const lastRevisionEvent = snapshotManager?.getLastRevisionEvent?.() ?? null;
  const lastGoodSnapshot = snapshotManager?.lastGoodSnapshot ?? activeSnapshot ?? null;
  const testMonitor = appContext?.providerRuntimes?.["platform.testMonitor"]?.inspect?.() ?? null;
  return {
    activeProfile: appContext?.runtimeProfile ?? summary.profile ?? null,
    activeBundles: (summary.bundles ?? []).map(bundle => ({
      id: bundle.id,
      kind: bundle.kind,
      displayName: bundle.displayName,
      description: bundle.description
    })),
    providedCapabilities: [...(summary.capabilities ?? [])],
    routes: (summary.routes ?? []).map(route => ({ ...route })),
    surfaces: (summary.surfaces ?? appContext?.runtimeSurfaceEntries ?? []).map(surface => ({ ...surface })),
    plugins: {
      activePluginIds: [...(appContext?.activeRuntimePluginIds ?? appContext?.runtimePluginCatalog?.activePluginIds ?? [])],
      effectivePluginIds: [...(appContext?.effectiveRuntimePluginIds ?? appContext?.runtimePluginCatalog?.effectivePluginIds ?? [])],
      rejectedPlugins: [...(appContext?.runtimePluginCatalog?.rejectedPlugins ?? [])]
    },
    testMonitor: testMonitor
      ? {
          enabled: testMonitor.enabled === true,
          watchFs: testMonitor.watchFs === true,
          maxAutoRunsPerCycle: Number(testMonitor.maxAutoRunsPerCycle || 0),
          watchDebounceMs: Number(testMonitor.watchDebounceMs || 0),
          status: testMonitor.status ? String(testMonitor.status) : "idle",
          processing: testMonitor.processing === true,
          pendingSourcePaths: Array.isArray(testMonitor.pendingSourcePaths)
            ? testMonitor.pendingSourcePaths.map(String)
            : [],
          pendingSourceCount: Number(testMonitor.pendingSourceCount || 0),
          pendingChangeSets: Array.isArray(testMonitor.pendingChangeSets)
            ? testMonitor.pendingChangeSets.map(row => ({
                branchId: row?.branchId ? String(row.branchId) : null,
                changeSetId: row?.changeSetId ? String(row.changeSetId) : null,
                candidateSnapshotId: row?.candidateSnapshotId ? String(row.candidateSnapshotId) : null,
                queuedAt: row?.queuedAt ? String(row.queuedAt) : null
              }))
            : [],
          pendingChangeSetCount: Number(testMonitor.pendingChangeSetCount || 0)
        }
      : null,
    appSnapshot: snapshotDiagnostics
      ? {
          ...snapshotDiagnostics,
          lastGoodAppRevision: Number(lastGoodSnapshot?.appRevision || snapshotDiagnostics.appRevision || 0),
          activeSourceIds: Array.isArray(activeSnapshot?.sourceIndex)
            ? activeSnapshot.sourceIndex.map(row => String(row.sourceId || row.filePath || ""))
            : [],
          lastRevisionEvent: lastRevisionEvent
            ? {
                revision: Number(lastRevisionEvent.revision || lastRevisionEvent.appRevision || 0),
                appRevision: Number(lastRevisionEvent.appRevision || 0),
                changedSources: Array.isArray(lastRevisionEvent.changedSources) ? lastRevisionEvent.changedSources.map(String) : [],
                trigger: String(lastRevisionEvent.trigger || "initial"),
                status: String(lastRevisionEvent.status || "active"),
                branchId: lastRevisionEvent.branchId ? String(lastRevisionEvent.branchId) : null,
                changeSetId: lastRevisionEvent.changeSetId ? String(lastRevisionEvent.changeSetId) : null
              }
            : null
        }
      : null
  };
}
