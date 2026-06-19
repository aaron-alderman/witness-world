import {
  activeRuntimeSurfaceIds,
  cloneInspectionValue,
  collectCapabilityOutputsFromDom,
  normalizeCapabilityAssets,
  overlaySurfaceProps,
  resolveRouteStateDescriptor,
  resolveSurfaceCapabilities,
  resolveSurfaceRuntimeBinding,
  trimString
} from "./runtime-surface-runtime-shared.js";
import {
  activeRouteTargetForPath,
  routeTargetForManifestState
} from "./runtime-surface-route-runtime.js";
import {
  capabilityAssetHash,
  surfaceAssetRegistrySnapshot
} from "./runtime-surface-capability-runtime.js";
import {
  fallbackActiveRootNode,
  surfaceIsPresentInDom
} from "./runtime-surface-dom-host.js";

export function summarizeExecutionBlockers(snapshot = {}) {
  const pendingByKind = snapshot?.pendingByKind && typeof snapshot.pendingByKind === "object"
    ? snapshot.pendingByKind
    : {};
  const group = prefix => Object.entries(pendingByKind)
    .filter(([kind, count]) => Number(count || 0) > 0 && String(kind || "").startsWith(prefix))
    .reduce((total, [, count]) => total + Number(count || 0), 0);
  return {
    settled: Boolean(snapshot?.settled),
    activeTaskCount: Number(snapshot?.activeTaskCount || 0),
    process: group("process."),
    route: group("route-swap") + group("manifest-replacement") + group("surface-sync"),
    capability: group("capability-assets") + group("capability-mount"),
    bridge: group("runtime-bridge"),
    reconcile: group("reconcile")
  };
}

export function createSurfaceInspectionPoint({ window, manifest, runtime }) {
  const fetchServerDiagnostics = async () => {
    const fetchImpl = typeof window?.fetch === "function" ? window.fetch.bind(window) : null;
    if (!fetchImpl) return null;
    const response = await fetchImpl("/api/runtime/diagnostics", {
      headers: { accept: "application/json" }
    });
    if (!response?.ok) {
      throw new Error(`runtime diagnostics fetch failed (${response?.status ?? "unknown"})`);
    }
    return await response.json();
  };
  const inspection = {
    kind: "surface-runtime-inspection",
    diagnosticsUrl: "/api/runtime/diagnostics",
    get manifest() {
      return cloneInspectionValue(manifest);
    },
    get activeSurfaceId() {
      return runtime?.activeSurfaceId ?? manifest?.activeSurfaceId ?? null;
    },
    get surfaceIds() {
      return typeof runtime?.surfaceIds !== "undefined"
        ? cloneInspectionValue(runtime.surfaceIds)
        : (manifest?.surfaces ?? []).map(surface => surface.id);
    },
    get routeTargets() {
      return typeof runtime?.routeTargets !== "undefined"
        ? cloneInspectionValue(runtime.routeTargets)
        : cloneInspectionValue(manifest?.routeTargets ?? []);
    },
    get runtimeIds() {
      return cloneInspectionValue(manifest?.diagnostics?.includedRuntimeIds ?? []);
    },
    get browserRuntimeCapabilities() {
      return cloneInspectionValue(manifest?.browserRuntimeCapabilities ?? []);
    },
    get preloadPolicies() {
      return cloneInspectionValue(typeof runtime?.preloadPolicies !== "undefined"
        ? runtime.preloadPolicies
        : (manifest?.preloadPolicies ?? []));
    },
    get capabilityPreloadAssets() {
      return cloneInspectionValue(typeof runtime?.capabilityPreloadAssets !== "undefined"
        ? runtime.capabilityPreloadAssets
        : (manifest?.capabilityPreloadAssets ?? {}));
    },
    get capabilityAssets() {
      return cloneInspectionValue(manifest?.capabilityAssets ?? null);
    },
    get preloadTasks() {
      return cloneInspectionValue(typeof runtime?.preloadTasks !== "undefined" ? runtime.preloadTasks : []);
    },
    get loadedCapabilityAssets() {
      return surfaceAssetRegistrySnapshot(window);
    },
    get capabilityBootHookCount() {
      return Array.isArray(window?.__surfaceCapabilityBootHooks)
        ? window.__surfaceCapabilityBootHooks.length
        : 0;
    },
    get routeDebugLog() {
      return typeof runtime?.routeDebugLog !== "undefined"
        ? cloneInspectionValue(runtime.routeDebugLog)
        : [];
    },
    get lastRouteSwap() {
      return cloneInspectionValue(runtime?.lastRouteSwap ?? null);
    },
    get issues() {
      return cloneInspectionValue(typeof runtime?.issues !== "undefined" ? runtime.issues : []);
    },
    get latestProbe() {
      return cloneInspectionValue(runtime?.latestProbe ?? null);
    },
    get expectationProviderCount() {
      return Number(runtime?.expectationProviderCount ?? 0);
    },
    get runtimeBridgeCount() {
      return Number(runtime?.runtimeBridgeCount ?? 0);
    },
    get process() {
      const processRuntime = runtime?.processRuntime ?? null;
      if (!processRuntime) return null;
      return {
        counts: cloneInspectionValue(processRuntime.counts ?? null),
        inFlightCount: Number(processRuntime.inFlightCount ?? 0),
        state: cloneInspectionValue(typeof processRuntime.snapshot === "function" ? processRuntime.snapshot() : null),
        derives: cloneInspectionValue(typeof processRuntime.derives === "function" ? processRuntime.derives() : null),
        traceLength: Array.isArray(processRuntime.trace) ? processRuntime.trace.length : 0
      };
    },
    get execution() {
      return cloneInspectionValue(typeof runtime?.settleSnapshot === "function"
        ? runtime.settleSnapshot()
        : (runtime?.settleSnapshot ?? null));
    },
    get executionSummary() {
      return summarizeExecutionBlockers(this.execution);
    },
    get lastReconcileSummary() {
      return cloneInspectionValue(runtime?.lastReconcileSummary ?? null);
    },
    inspect() {
      return {
        kind: this.kind,
        activeSurfaceId: this.activeSurfaceId,
        surfaceIds: this.surfaceIds,
        routeTargets: this.routeTargets,
        runtimeIds: this.runtimeIds,
        browserRuntimeCapabilities: this.browserRuntimeCapabilities,
        preloadPolicies: this.preloadPolicies,
        capabilityPreloadAssets: this.capabilityPreloadAssets,
        capabilityAssets: this.capabilityAssets,
        preloadTasks: this.preloadTasks,
        loadedCapabilityAssets: this.loadedCapabilityAssets,
        capabilityBootHookCount: this.capabilityBootHookCount,
        lastRouteSwap: this.lastRouteSwap,
        routeDebugLog: this.routeDebugLog,
        issues: this.issues,
        latestProbe: this.latestProbe,
        expectationProviderCount: this.expectationProviderCount,
        runtimeBridgeCount: this.runtimeBridgeCount,
        execution: this.execution,
        executionSummary: this.executionSummary,
        lastReconcileSummary: this.lastReconcileSummary,
        process: this.process,
        manifestDiagnostics: cloneInspectionValue(manifest?.diagnostics ?? null)
      };
    },
    async whenSettled() {
      return typeof runtime?.whenSettled === "function" ? runtime.whenSettled() : null;
    },
    async rerunProbe() {
      return runtime?.rerunProbe ? await runtime.rerunProbe() : null;
    },
    clearIssues() {
      return runtime?.clearIssues ? runtime.clearIssues() : null;
    },
    async refreshServerDiagnostics() {
      const diagnostics = await fetchServerDiagnostics();
      this.serverDiagnostics = diagnostics;
      return diagnostics;
    },
    serverDiagnostics: null
  };
  return inspection;
}

export function installSurfaceInspectionPoint(window, manifest, runtime) {
  if (!window || typeof window !== "object") return null;
  const inspection = createSurfaceInspectionPoint({ window, manifest, runtime });
  window.world = inspection;
  window.witnessWorld = inspection;
  window.__surfaceRuntimeInspection = inspection;
  if (typeof window.fetch === "function") {
    Promise.resolve(inspection.refreshServerDiagnostics()).catch(error => {
      inspection.serverDiagnosticsError = {
        name: error?.name || "Error",
        message: String(error?.message || error)
      };
    });
  }
  return inspection;
}

export function surfaceDiagnosticsOverlayEnabled(window) {
  const explicit = window?.__surfaceRuntimeDiagnosticsOverlay;
  if (explicit === true) return true;
  if (explicit === false) return false;
  const href = trimString(window?.location?.href);
  if (href) {
    try {
      const url = new URL(href, "http://localhost");
      const mode = trimString(url.searchParams.get("surfaceDiagnostics"));
      if (mode === "1" || mode === "true") return true;
      if (mode === "0" || mode === "false") return false;
    } catch {}
  }
  const hostname = trimString(window?.location?.hostname);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function createSurfaceRuntimeIssueLedger() {
  const issues = [];
  const listeners = new Set();
  let sequence = 0;
  const notify = () => {
    const snapshot = issues.map(issue => cloneInspectionValue(issue));
    for (const listener of listeners) listener(snapshot);
  };
  const byId = id => issues.findIndex(issue => issue.id === id);
  return {
    nextCorrelationId(prefix = "issue") {
      sequence += 1;
      return `${String(prefix || "issue").trim() || "issue"}:${sequence}`;
    },
    upsert(input = {}) {
      const id = trimString(input.id) || `runtime-issue:${this.nextCorrelationId("auto")}`;
      const now = Date.now();
      const next = {
        id,
        severity: trimString(input.severity) || "error",
        phase: trimString(input.phase) || "runtime",
        kind: trimString(input.kind) || "runtime",
        message: String(input.message ?? ""),
        details: input.details ?? null,
        surfaceId: trimString(input.surfaceId),
        processRef: trimString(input.processRef),
        route: trimString(input.route),
        capability: trimString(input.capability),
        targetId: trimString(input.targetId),
        correlationId: trimString(input.correlationId),
        status: trimString(input.status) || "active"
      };
      const index = byId(id);
      if (index >= 0) {
        const previous = issues[index];
        issues[index] = {
          ...previous,
          ...next,
          at: previous.at ?? now,
          updatedAt: now,
          resolvedAt: next.status === "resolved"
            ? (previous.resolvedAt ?? now)
            : null
        };
      } else {
        issues.push({
          ...next,
          at: now,
          updatedAt: now,
          resolvedAt: next.status === "resolved" ? now : null
        });
      }
      notify();
      return cloneInspectionValue(issues[byId(id)]);
    },
    resolve(id, updates = {}) {
      const trimmed = trimString(id);
      if (!trimmed) return null;
      const index = byId(trimmed);
      if (index < 0) return null;
      const now = Date.now();
      issues[index] = {
        ...issues[index],
        ...updates,
        id: trimmed,
        status: "resolved",
        updatedAt: now,
        resolvedAt: issues[index].resolvedAt ?? now
      };
      notify();
      return cloneInspectionValue(issues[index]);
    },
    clear() {
      issues.splice(0, issues.length);
      notify();
    },
    list() {
      return issues.map(issue => cloneInspectionValue(issue));
    },
    active() {
      return issues.filter(issue => issue.status !== "resolved").map(issue => cloneInspectionValue(issue));
    },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export function surfaceRuntimeIssueSeverityRank(severity) {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

export function summarizeSurfaceRuntimeIssues(issues = []) {
  const summary = {
    total: 0,
    active: 0,
    resolved: 0,
    bySeverity: { error: 0, warning: 0, info: 0 },
    worstSeverity: null
  };
  for (const issue of issues ?? []) {
    summary.total += 1;
    if (issue?.status === "resolved") summary.resolved += 1;
    else summary.active += 1;
    const severity = trimString(issue?.severity) || "info";
    if (!Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)) summary.bySeverity[severity] = 0;
    summary.bySeverity[severity] += 1;
    if (!summary.worstSeverity || surfaceRuntimeIssueSeverityRank(severity) > surfaceRuntimeIssueSeverityRank(summary.worstSeverity)) {
      summary.worstSeverity = severity;
    }
  }
  return summary;
}

export function summarizeSurfaceRuntimeExpectationIssues(issues = []) {
  const summary = {
    total: 0,
    bySeverity: { error: 0, warning: 0, info: 0 }
  };
  for (const issue of issues ?? []) {
    summary.total += 1;
    const severity = trimString(issue?.severity) || "info";
    if (!Object.prototype.hasOwnProperty.call(summary.bySeverity, severity)) summary.bySeverity[severity] = 0;
    summary.bySeverity[severity] += 1;
  }
  return summary;
}



import { createSurfaceDiagnosticsOverlay } from "./runtime-guidance-companion-shell.js";

export function installSurfaceRuntimeBootFailure({ document, window, manifest, error }) {
  const issueLedger = createSurfaceRuntimeIssueLedger();
  const runtime = {
    blocked: {
      limitationType: "runtime",
      missingPrimitive: "surface runtime boot",
      reason: String(error?.message || error)
    },
    latestProbe: null,
    issues: [],
    expectationProviderCount: 0,
    rerunProbe: async () => null,
    whenSettled() {
      return Promise.resolve({
        settled: true,
        activeTaskCount: 0,
        pendingByKind: {},
        activeTasks: [],
        recentTasks: []
      });
    },
    settleSnapshot() {
      return {
        settled: true,
        activeTaskCount: 0,
        pendingByKind: {},
        activeTasks: [],
        recentTasks: []
      };
    },
    clearIssues() {
      issueLedger.clear();
      return [];
    },
    refresh() {
      return Promise.resolve(null);
    },
    get activeSurfaceId() {
      return trimString(manifest?.activeSurfaceId);
    },
    get manifestDiagnostics() {
      return manifest?.diagnostics ?? null;
    },
    get routeTargets() {
      return manifest?.routeTargets ?? [];
    },
    get surfaceIds() {
      return (manifest?.surfaces ?? []).map(surface => surface.id);
    },
    get lastRouteSwap() {
      return null;
    },
    get routeDebugLog() {
      return [];
    },
    get processRuntime() {
      return null;
    },
    destroy() {}
  };
  issueLedger.subscribe(issues => {
    runtime.issues = issues;
  });
  const inspection = installSurfaceInspectionPoint(window, manifest ?? {}, runtime);
  const overlay = createSurfaceDiagnosticsOverlay({
    document,
    window,
    inspection,
    issueLedger,
    enabled: surfaceDiagnosticsOverlayEnabled(window)
  });
  issueLedger.upsert({
    id: "surface-runtime:boot-exception",
    severity: "error",
    phase: "boot",
    kind: "runtime-boot-failure",
    message: "Surface interaction runtime boot failed",
    details: {
      name: error?.name || "Error",
      message: String(error?.message || error),
      stack: String(error?.stack || "")
    },
    correlationId: issueLedger.nextCorrelationId("boot")
  });
  runtime.destroy = () => overlay.destroy();
  return runtime;
}

export function mountedCapabilityMarkersForSurface(document, surface) {
  const rootId = trimString(surface?.view?.rootId);
  const nodes = [];
  const seen = new Set();
  const addNode = node => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    nodes.push(node);
  };
  const root = rootId ? document?.getElementById?.(rootId) : null;
  addNode(root);
  if (root && typeof root.querySelectorAll === "function") {
    for (const node of root.querySelectorAll("[data-surface-id]")) addNode(node);
  }
  const surfaceId = trimString(surface?.id);
  if (surfaceId && typeof document?.querySelectorAll === "function") {
    for (const node of document.querySelectorAll(`[data-surface-id="${surfaceId}"]`)) addNode(node);
  }
  const controller = nodes.some(node => Boolean(node?.__surfaceCapabilityController));
  const outputs = nodes.some(node => Boolean(node?.__surfaceCapabilityOutputs));
  return {
    rootId,
    mounted: controller || outputs,
    outputs,
    controller
  };
}

export function surfaceParentId(surface) {
  return trimString(surface?.parentId);
}

export function surfaceHasVisibleBinding(surface) {
  return Array.isArray(surface?.runtime?.bindings)
    ? surface.runtime.bindings.some(binding => trimString(binding?.prop) === "visible")
    : false;
}

export function surfaceExpectedVisible(surface, processRuntime, capabilityOutputs = {}) {
  if (!surfaceHasVisibleBinding(surface)) return false;
  const nextProps = overlaySurfaceProps(surface, processRuntime, capabilityOutputs);
  if (!Object.prototype.hasOwnProperty.call(nextProps, "visible")) return false;
  return Boolean(nextProps.visible);
}

export function capabilityAssetPresence(expected, loaded) {
  const missing = {
    stylesheetHrefs: [],
    scriptSrcs: [],
    inlineCss: [],
    scriptBodies: []
  };
  const loadedStylesheets = new Set(loaded?.stylesheets ?? []);
  const loadedScripts = new Set(loaded?.scripts ?? []);
  const loadedInlineStyles = new Set(loaded?.inlineStyles ?? []);
  const loadedInlineModules = new Set(loaded?.inlineModules ?? []);
  for (const href of expected?.stylesheetHrefs ?? []) {
    if (!loadedStylesheets.has(href)) missing.stylesheetHrefs.push(href);
  }
  for (const src of expected?.scriptSrcs ?? []) {
    if (!loadedScripts.has(src)) missing.scriptSrcs.push(src);
  }
  for (const cssText of expected?.inlineCss ?? []) {
    const key = capabilityAssetHash(cssText);
    if (!loadedInlineStyles.has(key)) missing.inlineCss.push(key);
  }
  for (const source of expected?.scriptBodies ?? []) {
    const key = capabilityAssetHash(source);
    if (!loadedInlineModules.has(key)) missing.scriptBodies.push(key);
  }
  return missing;
}

export function createSurfaceRuntimeProbe({
  document,
  window,
  manifest,
  surfaceById,
  activeSurfaceId,
  processRuntime,
  executionRunner,
  issueLedger,
  boundInteractionCount = 0,
  expectationProviders = [],
  runtimeBridgeCount = 0
} = {}) {
  const activeIds = activeRuntimeSurfaceIds(surfaceById, activeSurfaceId);
  const activeSurfaces = [...activeIds].map(id => surfaceById.get(id)).filter(Boolean);
  const currentSurface = surfaceById.get(activeSurfaceId) || null;
  const currentRootId = trimString(currentSurface?.view?.rootId);
  const currentRoot = (currentRootId ? document?.getElementById?.(currentRootId) : null)
    ?? fallbackActiveRootNode(document);
  const currentProcessRefs = [...new Set(activeSurfaces
    .map(surface => resolveSurfaceRuntimeBinding(manifest, surface.id).processRef)
    .filter(Boolean))];
  const missingInteractionTargets = [];
  const missingBindingTargets = [];
  const missingProcessBindings = [];
  const missingVisibleSurfaces = [];
  const missingCapabilities = [];
  const missingCapabilityControllers = [];
  const missingCapabilityOutputs = [];
  const execution = cloneInspectionValue(typeof executionRunner?.settledSnapshot === "function"
    ? executionRunner.settledSnapshot()
    : null);
  const capabilityBootPending = Object.entries(execution?.pendingByKind ?? {})
    .some(([kind, count]) =>
      Number(count || 0) > 0
      && (kind === "capability-assets" || kind === "capability-mount")
    );
  const capabilityOutputs = collectCapabilityOutputsFromDom(document);
  const capabilityMarkers = new Map(
    activeSurfaces.map(surface => [surface.id, mountedCapabilityMarkersForSurface(document, surface)])
  );
  for (const surface of activeSurfaces) {
    const present = surfaceIsPresentInDom(document, surface);
    const binding = resolveSurfaceRuntimeBinding(manifest, surface.id);
    const expectedVisible = surfaceExpectedVisible(surface, processRuntime, capabilityOutputs);
    if (!present && expectedVisible) {
      missingVisibleSurfaces.push({
        surfaceId: surface.id,
        rootId: trimString(surface?.view?.rootId) || null,
        parentId: surfaceParentId(surface)
      });
    }
    const hasInteractiveMeaning = (surface?.runtime?.interactions?.length ?? 0) > 0 || (surface?.runtime?.bindings?.length ?? 0) > 0;
    if (present && hasInteractiveMeaning && !binding.processRef) {
      missingProcessBindings.push({ surfaceId: surface.id });
    }
    const capabilities = resolveSurfaceCapabilities(binding, manifest?.browserRuntimeCapabilities);
    if (present && capabilities.missing.length) {
      missingCapabilities.push({ surfaceId: surface.id, capabilities: capabilities.missing });
    }
    const marker = capabilityMarkers.get(surface.id) ?? mountedCapabilityMarkersForSurface(document, surface);
    if (!capabilityBootPending && present && (surface?.runtime?.capabilityRefs?.length ?? 0) > 0 && !marker.controller) {
      missingCapabilityControllers.push({ surfaceId: surface.id, rootId: marker.rootId ?? null });
    }
    if (!present) continue;
    for (const interaction of surface?.runtime?.interactions ?? []) {
      const targetKey = trimString(interaction?.target);
      const targets = targetKey ? (surface?.view?.interactionTargets?.[targetKey] ?? []) : [];
      if (!targets.length) {
        missingInteractionTargets.push({ surfaceId: surface.id, targetKey, targetId: null });
        continue;
      }
      for (const target of targets) {
        const targetId = trimString(target?.id);
        if (!targetId || !document?.getElementById?.(targetId)) {
          missingInteractionTargets.push({ surfaceId: surface.id, targetKey, targetId });
        }
      }
    }
    for (const bindingSpec of surface?.runtime?.bindings ?? []) {
      const prop = trimString(bindingSpec?.prop);
      const targets = prop ? (surface?.view?.propTargets?.[prop] ?? []) : [];
      if (!targets.length) {
        missingBindingTargets.push({ surfaceId: surface.id, prop, targetId: null });
        continue;
      }
      for (const target of targets) {
        const targetId = trimString(target?.id);
        if (!targetId || !document?.getElementById?.(targetId)) {
          missingBindingTargets.push({ surfaceId: surface.id, prop, targetId });
        }
      }
    }
    const capabilitySources = (surface?.runtime?.bindings ?? [])
      .filter(bindingSpec => bindingSpec?.source?.kind === "capability")
      .map(bindingSpec => ({
        dependentSurfaceId: surface.id,
        sourceSurfaceId: trimString(bindingSpec?.source?.surface),
        output: trimString(bindingSpec?.source?.output)
      }))
      .filter(entry => entry.sourceSurfaceId && entry.output);
    for (const source of capabilitySources) {
      const sourceMarker = capabilityMarkers.get(source.sourceSurfaceId)
        ?? mountedCapabilityMarkersForSurface(document, surfaceById.get(source.sourceSurfaceId) ?? { id: source.sourceSurfaceId });
      if (!capabilityBootPending && !sourceMarker.outputs) {
        missingCapabilityOutputs.push({
          surfaceId: surface.id,
          rootId: sourceMarker.rootId,
          sourceSurfaceId: source.sourceSurfaceId,
          output: source.output
        });
      }
    }
  }
  const missingVisibleSurfaceIds = new Set(missingVisibleSurfaces.map(entry => entry.surfaceId));
  const filteredMissingVisibleSurfaces = missingVisibleSurfaces.filter(entry => {
    let parentId = trimString(entry.parentId);
    while (parentId) {
      if (missingVisibleSurfaceIds.has(parentId)) return false;
      parentId = surfaceParentId(surfaceById.get(parentId));
    }
    return true;
  });
  const activeRouteTarget = activeRouteTargetForPath(manifest, window?.location?.pathname);
  const routeStateTarget = routeTargetForManifestState(manifest, processRuntime);
  const loadedCapabilityAssets = surfaceAssetRegistrySnapshot(window);
  const missingCapabilityAssets = capabilityAssetPresence(normalizeCapabilityAssets(manifest?.capabilityAssets), loadedCapabilityAssets);
  const mountedCapabilitiesBySurface = activeSurfaces
    .filter(surface => (surface?.runtime?.capabilityRefs?.length ?? 0) > 0 && surfaceIsPresentInDom(document, surface))
    .map(surface => ({
      surfaceId: surface.id,
      capabilities: [...surface.runtime.capabilityRefs],
      ...(capabilityMarkers.get(surface.id) ?? mountedCapabilityMarkersForSurface(document, surface))
    }));
  const snapshot = {
    at: Date.now(),
    routePathname: trimString(window?.location?.pathname) || "/",
    activeSurfaceId: trimString(activeSurfaceId),
    rootNodeId: trimString(currentRoot?.id) || null,
    currentProcessRefs,
    processState: cloneInspectionValue(typeof processRuntime?.snapshot === "function" ? processRuntime.snapshot() : null),
    processDerives: cloneInspectionValue(typeof processRuntime?.derives === "function" ? processRuntime.derives() : null),
    runtimeBridgeCount: Number(runtimeBridgeCount || 0),
    routeState: cloneInspectionValue(resolveRouteStateDescriptor(manifest)),
    execution,
    boundInteractionCount: Number(boundInteractionCount || 0),
    missingInteractionTargets,
    missingBindingTargets,
    missingProcessBindings,
    missingVisibleSurfaces: filteredMissingVisibleSurfaces,
    missingCapabilities,
    missingCapabilityControllers,
    missingCapabilityOutputs,
    activeRouteTarget: cloneInspectionValue(activeRouteTarget),
    routeStateTarget: cloneInspectionValue(routeStateTarget),
    loadedCapabilityAssets,
    missingCapabilityAssets,
    mountedCapabilitiesBySurface,
    issues: typeof issueLedger?.list === "function" ? issueLedger.list() : []
  };
  const expectationIssues = [];
  for (const provider of expectationProviders ?? []) {
    if (typeof provider !== "function") continue;
    try {
      const issues = provider(snapshot, {
        manifest,
        activeSurfaceId,
        routePathname: snapshot.routePathname
      });
      if (Array.isArray(issues)) expectationIssues.push(...issues);
    } catch (error) {
      expectationIssues.push({
        id: `expectation-provider-failure:${expectationIssues.length}`,
        severity: "warning",
        phase: "settle-probe",
        kind: "expectation-provider-failure",
        message: "Surface expectation provider failed",
        details: String(error?.message || error)
      });
    }
  }
  snapshot.expectationIssues = expectationIssues;
  snapshot.expectationSummary = summarizeSurfaceRuntimeExpectationIssues(expectationIssues);
  return snapshot;
}
