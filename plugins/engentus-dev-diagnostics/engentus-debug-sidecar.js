function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeScriptBody(source) {
  return String(source ?? "").replaceAll("</script", "<\\/script");
}

export function renderEngentusDebugSupportScript() {
  return `
(() => {
  const config = window.__engentusDebugConfig || {};
  window.__sourceryCompanionEnabled = config.sourceryVisible !== false;
  window.__sourceryCompanionPinned = config.sourceryVisible !== false;
  let activeWcssPreviewSessionId = config.wcssPreviewSessionId
    || new URL(window.location.href).searchParams.get("wcssPreview")
    || null;
  let activeWcssPreviewVersion = 0;

  const makeId = () => window.crypto?.randomUUID?.()
    || ("debug-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8));

  const ensureDebugQuery = urlLike => {
    if (!urlLike) return urlLike;
    const previewSessionId = config.previewSessionId || null;
    const debugSessionId = config.debugSessionId || null;
    const url = new URL(String(urlLike), window.location.origin);
    if (previewSessionId) url.searchParams.set("previewSessionId", previewSessionId);
    if (debugSessionId) url.searchParams.set("debugSessionId", debugSessionId);
    if (activeWcssPreviewSessionId) url.searchParams.set("wcssPreview", activeWcssPreviewSessionId);
    return url.pathname + url.search + url.hash;
  };

  if (config.previewSessionId && config.debugSessionId) {
    const originalPushState = window.history?.pushState?.bind(window.history);
    const originalReplaceState = window.history?.replaceState?.bind(window.history);
    if (originalPushState) {
      window.history.pushState = (state, title, url) => originalPushState(state, title, ensureDebugQuery(url));
    }
    if (originalReplaceState) {
      window.history.replaceState = (state, title, url) => originalReplaceState(state, title, ensureDebugQuery(url));
    }
  }

  const currentDebugSessionId = config.debugSessionId || new URL(window.location.href).searchParams.get("debugSessionId") || null;
  const channel = currentDebugSessionId && typeof BroadcastChannel === "function"
    ? new BroadcastChannel("engentus-debug:" + currentDebugSessionId)
    : null;

  const inspectionSnapshot = () => {
    const inspection = window.__surfaceRuntimeInspection || window.world || null;
    return typeof inspection?.inspect === "function" ? inspection.inspect() : null;
  };

  const currentCanOpenDebug = () => {
    if (config.canOpenDebug === true) return true;
    const snapshot = inspectionSnapshot();
    const processState = snapshot?.process?.state && typeof snapshot.process.state === "object"
      ? snapshot.process.state
      : {};
    return processState.EngentusPlatformConfigAccess === "granted"
      || processState.featureAccess__engentus_platform_config === "granted";
  };

  const activeRootNode = snapshot => {
    const rootId = snapshot?.latestProbe?.rootNodeId || null;
    if (rootId) {
      const exact = document.getElementById(rootId);
      if (exact) return exact;
    }
    const activeSurfaceId = snapshot?.activeSurfaceId || null;
    if (activeSurfaceId) {
      const bySurface = document.querySelector('[data-surface-id="' + CSS.escape(activeSurfaceId) + '"]');
      if (bySurface) return bySurface;
    }
    return document.querySelector("[data-surface-id]") || document.body;
  };

  const snapshotPageMetadata = () => ({
    bodyAttributes: {
      page: document.body?.getAttribute?.("data-page") || null,
      surfaceContext: document.body?.getAttribute?.("data-surface-context") || null,
      surfaceRoute: document.body?.getAttribute?.("data-surface-route") || null,
      surfaceRootWidget: document.body?.getAttribute?.("data-surface-root-widget") || null,
      surfaceProgram: document.body?.getAttribute?.("data-surface-program") || null
    },
    stylesheets: Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .map(node => node.getAttribute?.("href") || "")
      .filter(Boolean),
    inlineCapabilityStyles: Array.from(document.querySelectorAll("style[data-surface-capability-style]"))
      .map(node => node.getAttribute?.("data-surface-capability-style") || "")
      .filter(Boolean),
    inlineCapabilityModules: Array.from(document.querySelectorAll("script[data-surface-capability-module]"))
      .map(node => node.getAttribute?.("data-surface-capability-module") || "")
      .filter(Boolean)
  });

  const childElementsFor = node => Array.from(node?.children || []);

  const domPathForNode = node => {
    const snapshot = inspectionSnapshot();
    const root = activeRootNode(snapshot);
    if (!root || !node) return null;
    if (node === root) return "root";
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentElement;
      if (!parent) return null;
      const siblings = childElementsFor(parent);
      const index = siblings.indexOf(current);
      if (index < 0) return null;
      path.unshift(String(index));
      current = parent;
    }
    return current === root ? ["root", ...path].join(".") : null;
  };

  const nodeTextPreview = node => {
    const fullText = String(node?.textContent || "").replace(/\s+/g, " ").trim();
    if (!fullText) return "";
    return fullText.length > 120 ? fullText.slice(0, 120) + "..." : fullText;
  };

  const describeDebugNode = node => {
    if (!node) return null;
    const ancestorSurfaceIds = [];
    const ancestorWidgetIds = [];
    const ancestorIds = [];
    let current = node;
    while (current) {
      const surfaceId = current.getAttribute?.("data-surface-id") || "";
      const widgetId = current.getAttribute?.("data-widget") || "";
      const domId = current.getAttribute?.("id") || "";
      if (surfaceId && !ancestorSurfaceIds.includes(surfaceId)) ancestorSurfaceIds.push(surfaceId);
      if (widgetId && !ancestorWidgetIds.includes(widgetId)) ancestorWidgetIds.push(widgetId);
      if (domId && !ancestorIds.includes(domId)) ancestorIds.push(domId);
      current = current.parentElement;
    }
    return {
      domPath: domPathForNode(node),
      tagName: String(node.tagName || "").toLowerCase(),
      id: node.getAttribute?.("id") || null,
      widgetId: node.getAttribute?.("data-widget") || null,
      surfaceId: node.getAttribute?.("data-surface-id") || null,
      nearestSurfaceId: ancestorSurfaceIds[0] || null,
      ancestorSurfaceIds,
      ancestorWidgetIds,
      ancestorIds,
      classNames: String(node.getAttribute?.("class") || "")
        .split(/\s+/)
        .map(value => value.trim())
        .filter(Boolean),
      textPreview: nodeTextPreview(node),
      attributes: Array.from(node.attributes || []).map(attribute => ({
        name: attribute.name,
        value: attribute.value
      }))
    };
  };

  const nodeForDomPath = domPath => {
    const root = activeRootNode(inspectionSnapshot());
    if (!root) return null;
    if (!domPath || domPath === "root") return root;
    const parts = String(domPath)
      .split(".")
      .slice(1)
      .map(value => Number.parseInt(value, 10))
      .filter(value => Number.isInteger(value) && value >= 0);
    let current = root;
    for (const index of parts) {
      current = childElementsFor(current)[index] || null;
      if (!current) return null;
    }
    return current;
  };

  let selectionHighlightOverlay = null;
  let hoverHighlightOverlay = null;
  let selectionHighlightedNode = null;
  let hoverHighlightedNode = null;
  let inspectModeEnabled = false;
  let inspectHoverDescriptor = null;
  let inspectSelectionDescriptor = null;

  const ensureHighlightOverlay = (kind = "selection") => {
    const existing = kind === "hover" ? hoverHighlightOverlay : selectionHighlightOverlay;
    if (existing?.isConnected) return existing;
    const overlay = document.createElement("div");
    overlay.setAttribute("data-engentus-debug-highlight", kind);
    overlay.style.position = "fixed";
    overlay.style.left = "0";
    overlay.style.top = "0";
    overlay.style.width = "0";
    overlay.style.height = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "2147483647";
    overlay.style.border = kind === "hover"
      ? "2px dashed rgba(251, 191, 36, 0.98)"
      : "2px solid rgba(56, 189, 248, 0.98)";
    overlay.style.boxShadow = kind === "hover"
      ? "0 0 0 9999px rgba(245, 158, 11, 0.08)"
      : "0 0 0 9999px rgba(14, 165, 233, 0.12)";
    overlay.style.borderRadius = "10px";
    overlay.style.opacity = "0";
    overlay.style.transition = "opacity 120ms ease";
    document.body?.appendChild?.(overlay);
    if (kind === "hover") hoverHighlightOverlay = overlay;
    else selectionHighlightOverlay = overlay;
    return overlay;
  };

  const positionOverlay = (overlay, node) => {
    if (!node?.isConnected || !overlay?.isConnected) return;
    const rect = node.getBoundingClientRect();
    overlay.style.left = Math.max(0, rect.left - 4) + "px";
    overlay.style.top = Math.max(0, rect.top - 4) + "px";
    overlay.style.width = Math.max(0, rect.width + 8) + "px";
    overlay.style.height = Math.max(0, rect.height + 8) + "px";
  };

  const refreshHighlightOverlay = () => {
    positionOverlay(selectionHighlightOverlay, selectionHighlightedNode);
    positionOverlay(hoverHighlightOverlay, hoverHighlightedNode);
  };

  const clearHighlight = (kind = "selection") => {
    const overlay = kind === "hover" ? hoverHighlightOverlay : selectionHighlightOverlay;
    if (overlay?.isConnected) overlay.style.opacity = "0";
    if (kind === "hover") hoverHighlightedNode = null;
    else selectionHighlightedNode = null;
  };

  const highlightNode = (node, {
    scroll = false,
    kind = "selection",
    transient = false
  } = {}) => {
    if (!node) return;
    if (scroll) node.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const overlay = ensureHighlightOverlay(kind);
    if (kind === "hover") hoverHighlightedNode = node;
    else selectionHighlightedNode = node;
    positionOverlay(overlay, node);
    overlay.style.opacity = "1";
    if (transient) {
      window.setTimeout(() => {
        if (overlay?.isConnected) overlay.style.opacity = "0";
      }, 2200);
    }
  };

  window.addEventListener("scroll", refreshHighlightOverlay, true);
  window.addEventListener("resize", refreshHighlightOverlay);

  const publishSelectionState = () => {
    inspectSelectionDescriptor = selectionHighlightedNode ? describeDebugNode(selectionHighlightedNode) : inspectSelectionDescriptor;
  };

  const publishSnapshot = () => {
    if (!channel) return;
    const snapshot = inspectionSnapshot();
    const rootNode = activeRootNode(snapshot);
    publishSelectionState();
    channel.postMessage({
      kind: "host-snapshot",
      route: {
        pathname: window.location.pathname,
        search: window.location.search,
        href: window.location.href
      },
      activeSurfaceId: snapshot?.activeSurfaceId || null,
      runtimeInspection: snapshot,
      processSnapshot: snapshot?.process || null,
      previewSession: {
        id: config.previewSessionId || null,
        previewRevision: Number(config.previewRevision || 0)
      },
      wcssPreview: {
        id: activeWcssPreviewSessionId || null,
        version: Number(activeWcssPreviewVersion || 0)
      },
      pageMetadata: snapshotPageMetadata(),
      inspectMode: inspectModeEnabled,
      hoverFocus: inspectHoverDescriptor,
      selectionFocus: inspectSelectionDescriptor,
      presentationInventorySummary: window.__engentusPresentationInventorySummary || null,
      sourceFocus: window.__engentusDebugFocus || null,
      domHtml: rootNode?.outerHTML || "",
      emittedAt: Date.now()
    });
  };

  const elementFromPointWithinRoot = event => {
    const root = activeRootNode(inspectionSnapshot());
    if (!root) return null;
    const node = document.elementFromPoint?.(event.clientX, event.clientY);
    if (!node || !(node instanceof Element)) return null;
    return root.contains(node) ? node : null;
  };

  const updateInspectHover = node => {
    const descriptor = describeDebugNode(node);
    inspectHoverDescriptor = descriptor;
    if (node) highlightNode(node, { kind: "hover" });
    else clearHighlight("hover");
    publishSnapshot();
  };

  const commitInspectSelection = node => {
    if (!node) return;
    inspectSelectionDescriptor = describeDebugNode(node);
    highlightNode(node, { kind: "selection", scroll: false });
    inspectModeEnabled = false;
    clearHighlight("hover");
    inspectHoverDescriptor = null;
    window.__engentusDebugFocus = {
      kind: "target",
      targetId: node.id || null,
      domPath: inspectSelectionDescriptor?.domPath || null
    };
    publishSnapshot();
  };

  const onInspectMouseMove = event => {
    if (!inspectModeEnabled) return;
    const node = elementFromPointWithinRoot(event);
    if (!node) {
      if (inspectHoverDescriptor) updateInspectHover(null);
      return;
    }
    const nextDescriptor = describeDebugNode(node);
    if (
      inspectHoverDescriptor?.domPath === nextDescriptor?.domPath
      && inspectHoverDescriptor?.id === nextDescriptor?.id
    ) return;
    updateInspectHover(node);
  };

  const onInspectClick = event => {
    if (!inspectModeEnabled) return;
    const node = elementFromPointWithinRoot(event);
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    commitInspectSelection(node);
  };

  const onInspectKeyDown = event => {
    if (!inspectModeEnabled) return;
    if (event.key === "Escape") {
      inspectModeEnabled = false;
      inspectHoverDescriptor = null;
      clearHighlight("hover");
      publishSnapshot();
    }
  };

  document.addEventListener("mousemove", onInspectMouseMove, true);
  document.addEventListener("click", onInspectClick, true);
  window.addEventListener("keydown", onInspectKeyDown, true);

  const updateHostUrlPreviewQuery = sessionId => {
    const url = new URL(window.location.href);
    if (sessionId) url.searchParams.set("wcssPreview", sessionId);
    else url.searchParams.delete("wcssPreview");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const applyWcssPreviewToLinks = ({
    sessionId = null,
    version = 0,
    persistUrl = true
  } = {}) => {
    const generatedCssPathPattern = new RegExp("^/engentus/__generated/.+\\.css$", "i");
    activeWcssPreviewSessionId = sessionId || null;
    activeWcssPreviewVersion = Number(version || 0);
    if (persistUrl) updateHostUrlPreviewQuery(activeWcssPreviewSessionId);
    for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"]'))) {
      const href = node.getAttribute?.("href") || "";
      if (!href) continue;
      const url = new URL(href, window.location.origin);
      if (!generatedCssPathPattern.test(url.pathname)) continue;
      if (activeWcssPreviewSessionId) url.searchParams.set("wcssPreview", activeWcssPreviewSessionId);
      else url.searchParams.delete("wcssPreview");
      if (activeWcssPreviewVersion > 0) url.searchParams.set("wcssPreviewVersion", String(activeWcssPreviewVersion));
      else url.searchParams.delete("wcssPreviewVersion");
      node.setAttribute("href", url.pathname + url.search + url.hash);
    }
    publishSnapshot();
  };

  const openDebugView = async () => {
    if (!currentCanOpenDebug()) return;
    let previewSessionId = config.previewSessionId || null;
    let debugSessionId = config.debugSessionId || null;
    let wcssPreviewSessionId = activeWcssPreviewSessionId || null;
    if (!previewSessionId) {
      const response = await fetch("/api/runtime/app-preview-sessions", {
        method: "POST",
        headers: { accept: "application/json" }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(body?.error || "Failed to create debug preview session.");
        return;
      }
      previewSessionId = body?.previewSession?.id || null;
    }
    if (!wcssPreviewSessionId) {
      const response = await fetch("/engentus/__generated/wcss/preview-session", {
        method: "POST",
        headers: { accept: "application/json" }
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(body?.error || "Failed to create WCSS preview session.");
        return;
      }
      wcssPreviewSessionId = body?.previewSessionId || null;
    }
    if (!previewSessionId) {
      window.alert("Preview session is unavailable.");
      return;
    }
    if (!wcssPreviewSessionId) {
      window.alert("WCSS preview session is unavailable.");
      return;
    }
    if (!debugSessionId) debugSessionId = makeId();
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set("previewSessionId", previewSessionId);
    currentUrl.searchParams.set("debugSessionId", debugSessionId);
    currentUrl.searchParams.set("wcssPreview", wcssPreviewSessionId);
    const debugUrl = new URL("/engentus/debug", window.location.origin);
    debugUrl.searchParams.set("previewSessionId", previewSessionId);
    debugUrl.searchParams.set("debugSessionId", debugSessionId);
    debugUrl.searchParams.set("wcssPreview", wcssPreviewSessionId);
    window.open(debugUrl.toString(), "_blank", "noopener");
    window.location.assign(currentUrl.toString());
  };

  const bindCompanionAction = () => {
    const shell = window.__sourceryCompanionShell;
    if (!shell?.setPanelAction) return false;
    shell.setPinned?.(config.sourceryVisible !== false);
    if (currentCanOpenDebug()) {
      shell.setPanelAction({
        label: "Open Debug View",
        onClick: () => {
          void openDebugView();
        }
      });
    } else {
      shell.setPanelAction(null);
    }
    return true;
  };

  window.setInterval(() => {
    bindCompanionAction();
  }, 1000);
  bindCompanionAction();

  if (channel) {
    channel.onmessage = event => {
      const message = event?.data && typeof event.data === "object" ? event.data : null;
      if (!message || message.kind !== "debug-command") return;
      if (message.command === "publish-snapshot") {
        publishSnapshot();
        return;
      }
      if (message.command === "jump-target") {
        const targetId = typeof message.targetId === "string" ? message.targetId.trim() : "";
        if (!targetId) return;
        const node = document.getElementById(targetId);
        node?.scrollIntoView?.({ block: "center", behavior: "smooth" });
        node?.focus?.();
        highlightNode(node, { scroll: false, kind: "selection" });
        inspectSelectionDescriptor = describeDebugNode(node);
        window.__engentusDebugFocus = { kind: "target", targetId };
        publishSnapshot();
        return;
      }
      if (message.command === "highlight-target") {
        const targetId = typeof message.targetId === "string" ? message.targetId.trim() : "";
        const domPath = typeof message.domPath === "string" ? message.domPath.trim() : "";
        const node = (targetId ? document.getElementById(targetId) : null) || nodeForDomPath(domPath);
        if (!node) return;
        highlightNode(node, { scroll: message.scroll === true, kind: "selection", transient: message.transient === true });
        inspectSelectionDescriptor = describeDebugNode(node);
        window.__engentusDebugFocus = {
          kind: "target",
          targetId: targetId || node.id || null,
          domPath: domPath || null
        };
        publishSnapshot();
        return;
      }
      if (message.command === "hover-target") {
        const targetId = typeof message.targetId === "string" ? message.targetId.trim() : "";
        const domPath = typeof message.domPath === "string" ? message.domPath.trim() : "";
        const node = (targetId ? document.getElementById(targetId) : null) || nodeForDomPath(domPath);
        if (!node) return;
        inspectHoverDescriptor = describeDebugNode(node);
        highlightNode(node, { kind: "hover" });
        publishSnapshot();
        return;
      }
      if (message.command === "clear-hover") {
        inspectHoverDescriptor = null;
        clearHighlight("hover");
        publishSnapshot();
        return;
      }
      if (message.command === "select-target") {
        const domPath = typeof message.domPath === "string" ? message.domPath.trim() : "";
        const targetId = typeof message.targetId === "string" ? message.targetId.trim() : "";
        const node = (targetId ? document.getElementById(targetId) : null) || nodeForDomPath(domPath);
        if (!node) return;
        commitInspectSelection(node);
        return;
      }
      if (message.command === "set-inspect-mode") {
        inspectModeEnabled = message.enabled === true;
        if (!inspectModeEnabled) {
          inspectHoverDescriptor = null;
          clearHighlight("hover");
        }
        publishSnapshot();
        return;
      }
      if (message.command === "apply-wcss-preview") {
        applyWcssPreviewToLinks({
          sessionId: typeof message.sessionId === "string" ? message.sessionId.trim() : "",
          version: Number(message.version || 0),
          persistUrl: message.persistUrl !== false
        });
        return;
      }
      if (message.command === "clear-wcss-preview") {
        applyWcssPreviewToLinks({ sessionId: null, version: 0, persistUrl: true });
        return;
      }
      if (message.command === "source-focus") {
        window.__engentusDebugFocus = {
          kind: "source",
          file: typeof message.file === "string" ? message.file : null,
          target: typeof message.target === "string" ? message.target : null
        };
        publishSnapshot();
      }
    };
    window.setInterval(publishSnapshot, 900);
    window.addEventListener("focus", publishSnapshot);
    window.addEventListener("popstate", publishSnapshot);
    window.addEventListener("focus", bindCompanionAction);
    window.addEventListener("popstate", bindCompanionAction);
    document.addEventListener("click", () => window.setTimeout(publishSnapshot, 0), true);
    document.addEventListener("click", () => window.setTimeout(bindCompanionAction, 0), true);
    document.addEventListener("input", () => window.setTimeout(publishSnapshot, 0), true);
    document.addEventListener("input", () => window.setTimeout(bindCompanionAction, 0), true);
    publishSnapshot();
  }

  window.__engentusDebugOpenView = openDebugView;
})();
  `.trim();
}

export function renderEngentusDebugPage({
  previewSessionId = null,
  wcssPreviewSessionId = null,
  debugSessionId = null,
  previewSession = null
} = {}) {
  const initialSessionJson = escapeScriptBody(JSON.stringify(previewSession ?? null));
  const pageScript = `
(() => {
  const previewSessionId = ${JSON.stringify(previewSessionId)};
  const initialWcssPreviewSessionId = ${JSON.stringify(wcssPreviewSessionId)};
  const debugSessionId = ${JSON.stringify(debugSessionId)};
  const initialSession = ${initialSessionJson};
  const propertyTimers = new Map();
  const createJsonTreeState = () => ({
    expanded: new Set(["root"]),
    limits: Object.create(null),
    strings: Object.create(null)
  });
  const createDomTreeState = () => ({
    expanded: new Set(["root"])
  });
  const createCssTreeState = () => ({
    expanded: new Set(["root"])
  });
  const state = {
    session: initialSession,
    inspectorPane: "props",
    hostSnapshot: null,
    sourceFile: null,
    sourcePayload: null,
    hoverDomPath: null,
    hoverDescriptor: null,
    selectedDomPath: null,
    selectedDescriptor: null,
    selectedTarget: null,
    selectedCandidate: null,
    inspection: null,
    inspectionCandidates: [],
    breadcrumbs: [],
    inspectMode: false,
    propertyDrafts: Object.create(null),
    propertyError: "",
    wcssPreview: {
      sessionId: initialWcssPreviewSessionId || new URL(window.location.href).searchParams.get("wcssPreview") || null,
      version: 0,
      document: null,
      schema: null,
      tokenCatalog: null,
      loadError: "",
      patchError: ""
    },
    generatedCss: {
      selectedHref: null,
      textByHref: Object.create(null),
      rulesByHref: Object.create(null),
      errorsByHref: Object.create(null)
    },
    statusText: "",
    statusTone: "",
    selectionStatus: "",
    selectionFallback: 0,
    lazy: {
      sessionJson: false,
      hostJson: false,
      domTree: false,
      sourceJson: false,
      sourceEditor: false,
      runtimeJson: false,
      stylesData: false
    },
    trees: {
      sessionJson: createJsonTreeState(),
      hostJson: createJsonTreeState(),
      sourceJson: createJsonTreeState(),
      runtimeJson: createJsonTreeState(),
      domTree: createDomTreeState(),
      generatedCss: Object.create(null)
    },
    resolutions: Object.create(null)
  };
  const domSnapshotCache = {
    html: null,
    root: null
  };

  const byId = id => document.getElementById(id);
  const channel = debugSessionId && typeof BroadcastChannel === "function"
    ? new BroadcastChannel("engentus-debug:" + debugSessionId)
    : null;

  const setText = (id, text) => {
    const node = byId(id);
    if (node) node.textContent = String(text ?? "");
  };

  const setStatus = (text, tone = "ok") => {
    state.statusText = String(text ?? "");
    state.statusTone = tone;
    const node = byId("debug-status");
    if (node) {
      node.textContent = state.statusText;
      node.dataset.tone = tone;
    }
  };

  const renderPlaceholder = (id, text) => {
    const node = byId(id);
    if (!node) return;
    node.innerHTML = "";
    const pre = document.createElement("pre");
    pre.textContent = String(text ?? "");
    node.append(pre);
  };

  const resetJsonTreeState = tree => {
    tree.expanded = new Set(["root"]);
    tree.limits = Object.create(null);
    tree.strings = Object.create(null);
  };

  const resetDomTreeState = tree => {
    tree.expanded = new Set(["root"]);
  };

  const jsonType = value => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
  };

  const defaultLimitFor = value => Array.isArray(value) ? 20 : 25;
  const longStringLimit = 180;

  const ensureBranchLimit = (tree, path, value) => {
    if (!Object.prototype.hasOwnProperty.call(tree.limits, path)) {
      tree.limits[path] = defaultLimitFor(value);
    }
    return tree.limits[path];
  };

  const toggleTreePath = (tree, path) => {
    if (tree.expanded.has(path)) tree.expanded.delete(path);
    else tree.expanded.add(path);
  };

  const showMoreTreePath = (tree, path, value) => {
    tree.limits[path] = ensureBranchLimit(tree, path, value) + defaultLimitFor(value);
  };

  const toggleLongString = (tree, path) => {
    tree.strings[path] = tree.strings[path] !== true;
  };

  const valueSummary = value => {
    const type = jsonType(value);
    if (type === "array") return "Array(" + value.length + ")";
    if (type === "object") return "Object{" + Object.keys(value).length + "}";
    if (type === "string") return '"' + value + '"';
    if (type === "null") return "null";
    return String(value);
  };

  const renderJsonTree = (containerId, value, tree, emptyMessage) => {
    const container = byId(containerId);
    if (!container) return;
    container.innerHTML = "";
    if (typeof value === "undefined") {
      renderPlaceholder(containerId, emptyMessage);
      return;
    }

    const renderNode = (nodeValue, path, label = null) => {
      const type = jsonType(nodeValue);
      const row = document.createElement("div");
      row.className = "debug-json-node";

      const line = document.createElement("div");
      line.className = "debug-json-line";
      row.append(line);

      const key = label == null ? null : document.createElement("span");
      if (key) {
        key.className = "debug-json-key";
        key.textContent = label + ":";
        line.append(key);
      }

      if (type === "array" || type === "object") {
        const expanded = tree.expanded.has(path);
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "debug-json-toggle";
        toggle.textContent = expanded ? "v" : ">";
        toggle.addEventListener("click", () => {
          toggleTreePath(tree, path);
          render();
        });
        if (key) line.insertBefore(toggle, key);
        else line.append(toggle);

        const summary = document.createElement("span");
        summary.className = "debug-json-summary";
        summary.textContent = valueSummary(nodeValue);
        line.append(summary);

        if (!expanded) return row;

        const children = document.createElement("div");
        children.className = "debug-json-children";
        row.append(children);

        const entries = type === "array"
          ? nodeValue.map((entry, index) => [String(index), entry])
          : Object.entries(nodeValue);
        const limit = ensureBranchLimit(tree, path, nodeValue);
        const visibleEntries = entries.slice(0, limit);
        for (const [childKey, childValue] of visibleEntries) {
          children.append(renderNode(childValue, path + "." + childKey, childKey));
        }
        if (entries.length > limit) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "debug-json-more";
          more.textContent = "See more (" + (entries.length - limit) + " remaining)";
          more.addEventListener("click", () => {
            showMoreTreePath(tree, path, nodeValue);
            render();
          });
          children.append(more);
        }
        return row;
      }

      const valueNode = document.createElement("span");
      valueNode.className = "debug-json-value debug-json-value-" + type;
      if (type === "string") {
        const long = nodeValue.length > longStringLimit;
        const expandedString = tree.strings[path] === true;
        valueNode.textContent = '"' + (long && !expandedString
          ? nodeValue.slice(0, longStringLimit) + "..."
          : nodeValue) + '"';
        line.append(valueNode);
        if (long) {
          const more = document.createElement("button");
          more.type = "button";
          more.className = "debug-json-inline-action";
          more.textContent = expandedString ? "Less" : "More";
          more.addEventListener("click", () => {
            toggleLongString(tree, path);
            render();
          });
          line.append(more);
        }
        return row;
      }

      valueNode.textContent = type === "null" ? "null" : String(nodeValue);
      line.append(valueNode);
      return row;
    };

    container.append(renderNode(value, "root"));
  };

  const uniqueStrings = values => [...new Set(
    (values ?? [])
      .map(value => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];

  const normalizeLookupKey = value => String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  const parseDomRoot = () => {
    const html = state.hostSnapshot?.domHtml || "";
    if (!html) {
      domSnapshotCache.html = null;
      domSnapshotCache.root = null;
      return null;
    }
    if (domSnapshotCache.html === html && domSnapshotCache.root) return domSnapshotCache.root;
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.body.children.length) {
      domSnapshotCache.html = html;
      domSnapshotCache.root = null;
      return null;
    }
    const root = doc.body.children.length === 1
      ? doc.body.children[0]
      : (() => {
        const wrapper = doc.createElement("div");
        wrapper.setAttribute("data-debug-snapshot-root", "1");
        for (const child of Array.from(doc.body.children)) wrapper.append(child);
        return wrapper;
      })();
    domSnapshotCache.html = html;
    domSnapshotCache.root = root;
    return root;
  };

  const childElementsFor = node => Array.from(node?.children || []);

  const domNodeAtPath = (root, domPath) => {
    if (!root) return null;
    if (!domPath || domPath === "root") return root;
    const parts = String(domPath)
      .split(".")
      .slice(1)
      .map(value => Number.parseInt(value, 10))
      .filter(value => Number.isInteger(value) && value >= 0);
    let current = root;
    for (const index of parts) {
      current = childElementsFor(current)[index] || null;
      if (!current) return null;
    }
    return current;
  };

  const nodeTextPreview = node => {
    const directText = Array.from(node?.childNodes || [])
      .filter(child => child?.nodeType === Node.TEXT_NODE)
      .map(child => String(child.textContent || "").replace(/\\s+/g, " ").trim())
      .filter(Boolean)
      .join(" ");
    const fullText = directText || String(node?.textContent || "").replace(/\\s+/g, " ").trim();
    if (!fullText) return "";
    return fullText.length > 120 ? fullText.slice(0, 120) + "..." : fullText;
  };

  const attributesForNode = node => Array.from(node?.attributes || []).map(attribute => ({
    name: attribute.name,
    value: attribute.value
  }));

  const describeDomNode = (node, domPath) => {
    const attributes = attributesForNode(node);
    const attributeMap = Object.fromEntries(attributes.map(attribute => [attribute.name, attribute.value]));
    const ancestorSurfaceIds = [];
    const ancestorWidgetIds = [];
    const ancestorIds = [];
    let current = node;
    while (current) {
      const currentSurfaceId = current.getAttribute?.("data-surface-id") || "";
      const currentWidgetId = current.getAttribute?.("data-widget") || "";
      const currentId = current.getAttribute?.("id") || "";
      if (currentSurfaceId && !ancestorSurfaceIds.includes(currentSurfaceId)) ancestorSurfaceIds.push(currentSurfaceId);
      if (currentWidgetId && !ancestorWidgetIds.includes(currentWidgetId)) ancestorWidgetIds.push(currentWidgetId);
      if (currentId && !ancestorIds.includes(currentId)) ancestorIds.push(currentId);
      current = current.parentElement;
    }
    return {
      domPath,
      tagName: String(node?.tagName || "").toLowerCase(),
      id: attributeMap.id || null,
      widgetId: attributeMap["data-widget"] || null,
      surfaceId: attributeMap["data-surface-id"] || null,
      nearestSurfaceId: ancestorSurfaceIds[0] || null,
      ancestorSurfaceIds,
      ancestorWidgetIds,
      ancestorIds,
      classNames: String(attributeMap.class || "")
        .split(/\\s+/)
        .map(value => value.trim())
        .filter(Boolean),
      textPreview: nodeTextPreview(node),
      childCount: childElementsFor(node).length,
      attributes
    };
  };

  const descriptorForPath = domPath => {
    const root = parseDomRoot();
    const node = domNodeAtPath(root, domPath);
    return node ? describeDomNode(node, domPath) : null;
  };

  const resolverDescriptorFor = descriptor => {
    if (!descriptor) return null;
    return {
      ...descriptor,
      activeSurfaceId: state.hostSnapshot?.activeSurfaceId || null,
      pageMetadata: state.hostSnapshot?.pageMetadata || null
    };
  };

  const resolutionCacheKey = descriptor => JSON.stringify({
    domPath: descriptor?.domPath || null,
    id: descriptor?.id || null,
    widgetId: descriptor?.widgetId || null,
    surfaceId: descriptor?.surfaceId || null,
    classNames: descriptor?.classNames || [],
    textPreview: descriptor?.textPreview || null,
    activeSurfaceId: state.hostSnapshot?.activeSurfaceId || null,
    route: state.hostSnapshot?.route?.pathname || null
  });

  const visibleResolutionSummary = result => {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    if (!candidates.length) return { status: "none", target: null, candidateCount: 0 };
    if (candidates.length > 1 && ((candidates[0]?.score || 0) - (candidates[1]?.score || 0) <= 25)) {
      return { status: "ambiguous", target: null, candidateCount: candidates.length };
    }
    return {
      status: "resolved",
      target: result?.resolvedTarget || candidates[0]?.target || null,
      candidateCount: candidates.length
    };
  };

  const fetchTargetCandidates = async ({
    query = "",
    descriptor = null,
    preferredTarget = ""
  } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (descriptor) params.set("descriptor", JSON.stringify(descriptor));
    if (preferredTarget) params.set("preferredTarget", preferredTarget);
    const response = await fetch(
      "/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/targets?" + params.toString(),
      { headers: { accept: "application/json" } }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || "Target resolution failed.");
    return body;
  };

  const resolutionDescriptorChain = domPath => {
    const root = parseDomRoot();
    const node = domNodeAtPath(root, domPath);
    if (!node) return [];
    const entries = [];
    let current = node;
    let currentPath = domPath;
    while (current) {
      entries.push({
        domPath: currentPath,
        descriptor: describeDomNode(current, currentPath)
      });
      current = current.parentElement;
      if (!current) break;
      const nextParts = String(currentPath).split(".");
      if (nextParts.length <= 1) break;
      nextParts.pop();
      currentPath = nextParts.join(".") || "root";
    }
    return entries;
  };

  const chooseCandidateFromResult = (result, preferredTarget = "") => {
    const candidates = Array.isArray(result?.candidates) ? result.candidates : [];
    if (!candidates.length) return { candidate: null, ambiguous: false };
    if (preferredTarget) {
      const exact = candidates.find(entry => entry.target === preferredTarget) || null;
      if (exact) return { candidate: exact, ambiguous: false };
    }
    if (candidates.length === 1) return { candidate: candidates[0], ambiguous: false };
    const top = candidates[0];
    const second = candidates[1] || null;
    const ambiguous = Boolean(second && ((top?.score || 0) - (second?.score || 0) <= 25));
    return { candidate: ambiguous ? null : top, ambiguous };
  };

  const ensureNodeResolution = async (domPath, {
    preferredTarget = "",
    force = false
  } = {}) => {
    if (!previewSessionId || !domPath) return null;
    const descriptor = descriptorForPath(domPath);
    if (!descriptor) return null;
    const cacheKey = resolutionCacheKey(descriptor);
    const cached = state.resolutions[domPath];
    if (!force && cached?.cacheKey === cacheKey && cached?.result) return cached.result;
    if (cached?.pending) return cached.pending;
    const pending = (async () => {
      const result = await fetchTargetCandidates({
        descriptor: resolverDescriptorFor(descriptor),
        preferredTarget
      });
      state.resolutions[domPath] = {
        cacheKey,
        result,
        summary: visibleResolutionSummary(result)
      };
      return result;
    })().finally(() => {
      if (state.resolutions[domPath]) delete state.resolutions[domPath].pending;
    });
    state.resolutions[domPath] = {
      cacheKey,
      pending,
      summary: { status: "pending", target: null, candidateCount: 0 }
    };
    return pending;
  };

  const syncSelectedDescriptorFromHost = () => {
    const nextDescriptor = state.selectedDomPath ? descriptorForPath(state.selectedDomPath) : null;
    if (!nextDescriptor) {
      state.selectedDescriptor = null;
      state.inspection = null;
      state.inspectionCandidates = [];
      state.breadcrumbs = [];
      state.propertyDrafts = Object.create(null);
      state.propertyError = "";
      state.selectionStatus = "";
      return;
    }
    state.selectedDescriptor = nextDescriptor;
  };

  const currentSourceRow = () => {
    const rows = Array.isArray(state.session?.sources) ? state.session.sources : [];
    return rows.find(row => row.file === state.sourceFile) || null;
  };

  const currentSourceRef = () => currentSourceRow()
    || (state.sourcePayload?.file ? {
      file: state.sourcePayload.file,
      sourceId: state.sourcePayload.sourceId || state.sourcePayload.file
    } : null);

  const currentPageStylesheetHrefs = () => uniqueStrings(state.hostSnapshot?.pageMetadata?.stylesheets);
  const currentAssetKinds = () => uniqueStrings(currentPageStylesheetHrefs().map(href => {
    if (/engentus-shell\.css/i.test(href)) return "shell";
    if (/engentus-chart-pages\.css/i.test(href)) return "chart";
    return "";
  }));
  const normalizeSearchValue = value => String(value ?? "").trim().toLowerCase();
  const normalizedSearchSegments = value => uniqueStrings(
    String(value ?? "")
      .split(/[^a-z0-9]+/i)
      .map(segment => segment.trim().toLowerCase())
      .filter(segment => segment.length >= 3)
  );
  const currentSelectionKeywords = () => uniqueStrings([
    state.selectedTarget,
    state.inspection?.target,
    state.inspection?.componentKind,
    ...(state.selectedDescriptor?.classNames ?? []),
    state.selectedDescriptor?.id,
    state.selectedDescriptor?.widgetId,
    state.selectedDescriptor?.surfaceId
  ].flatMap(normalizedSearchSegments));
  const ensureCssTree = href => {
    if (!href) return createCssTreeState();
    if (!state.trees.generatedCss[href]) state.trees.generatedCss[href] = createCssTreeState();
    return state.trees.generatedCss[href];
  };
  const currentWcssQuery = () => {
    const params = new URLSearchParams();
    if (state.wcssPreview.sessionId) params.set("previewSessionId", state.wcssPreview.sessionId);
    return params.toString();
  };
  const applyWcssPreviewToCurrentUrl = () => {
    const url = new URL(window.location.href);
    if (state.wcssPreview.sessionId) url.searchParams.set("wcssPreview", state.wcssPreview.sessionId);
    else url.searchParams.delete("wcssPreview");
    window.history.replaceState(window.history.state, "", url.toString());
  };
  const ensureWcssPreviewSession = async () => {
    if (state.wcssPreview.sessionId) return state.wcssPreview.sessionId;
    const response = await fetch("/engentus/__generated/wcss/preview-session", {
      method: "POST",
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "WCSS preview session create failed.");
    state.wcssPreview.sessionId = body?.previewSessionId || null;
    state.wcssPreview.version = Number(body?.version || 0);
    applyWcssPreviewToCurrentUrl();
    channel?.postMessage({
      kind: "debug-command",
      command: "apply-wcss-preview",
      sessionId: state.wcssPreview.sessionId,
      version: state.wcssPreview.version,
      persistUrl: true
    });
    return state.wcssPreview.sessionId;
  };
  const fetchWcssDocument = async () => {
    const query = currentWcssQuery();
    const response = await fetch("/engentus/__generated/wcss/document" + (query ? "?" + query : ""), {
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "WCSS document read failed.");
    return body;
  };
  const fetchWcssSchema = async () => {
    const query = currentWcssQuery();
    const response = await fetch("/engentus/__generated/wcss/schema" + (query ? "?" + query : ""), {
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "WCSS schema read failed.");
    return body;
  };
  const loadWcssInspector = async () => {
    try {
      if (state.wcssPreview.sessionId) applyWcssPreviewToCurrentUrl();
      const [documentBody, schemaBody] = await Promise.all([
        fetchWcssDocument(),
        fetchWcssSchema()
      ]);
      state.wcssPreview.document = documentBody?.document || null;
      state.wcssPreview.tokenCatalog = documentBody?.tokenCatalog || null;
      state.wcssPreview.schema = schemaBody?.schema || null;
      state.wcssPreview.version = Number(
        schemaBody?.previewSession?.version
        ?? documentBody?.previewSession?.version
        ?? state.wcssPreview.version
        ?? 0
      );
      state.wcssPreview.loadError = "";
      if (state.wcssPreview.sessionId) {
        channel?.postMessage({
          kind: "debug-command",
          command: "apply-wcss-preview",
          sessionId: state.wcssPreview.sessionId,
          version: state.wcssPreview.version,
          persistUrl: true
        });
      }
    } catch (error) {
      state.wcssPreview.loadError = error instanceof Error ? error.message : String(error);
    }
    render();
  };
  const previewableTokens = () => {
    const tokenCatalog = state.wcssPreview.tokenCatalog?.tokens ?? [];
    const assetKinds = currentAssetKinds();
    return tokenCatalog.filter(token => {
      const bindings = Array.isArray(token?.bindings) ? token.bindings : [];
      if (!assetKinds.length) return true;
      return bindings.some(binding => assetKinds.includes(binding?.asset));
    });
  };
  const previewableStyleFields = () => {
    const schemaStyles = Array.isArray(state.wcssPreview.schema?.styles) ? state.wcssPreview.schema.styles : [];
    const keywords = currentSelectionKeywords();
    const direct = [];
    const fallback = [];
    const pushField = (entry, styleName, field, extra = {}) => {
      const normalizedStyle = normalizeSearchValue(styleName);
      const matchesSelection = keywords.some(keyword => normalizedStyle.includes(keyword) || keyword.includes(normalizedStyle));
      const row = {
        key: entry,
        style: styleName,
        field,
        direct: matchesSelection,
        ...extra
      };
      if (matchesSelection) direct.push(row);
      else fallback.push(row);
    };
    for (const style of schemaStyles) {
      for (const field of style.fields ?? []) {
        if (field?.previewable) pushField(style.name + "::" + field.field, style.name, field.field, { value: field.value, kind: "style.field.set" });
      }
      for (const stateRow of style.states ?? []) {
        for (const field of stateRow.fields ?? []) {
          if (field?.previewable) pushField(style.name + "::state:" + stateRow.name + "::" + field.field, style.name, field.field, {
            value: field.value,
            state: stateRow.name,
            kind: "style.state_field.set"
          });
        }
      }
      for (const part of style.parts ?? []) {
        for (const field of part.fields ?? []) {
          if (field?.previewable) pushField(style.name + "::part:" + part.name + "::" + field.field, style.name, field.field, {
            value: field.value,
            part: part.name,
            kind: "style.field.set"
          });
        }
        for (const stateRow of part.states ?? []) {
          for (const field of stateRow.fields ?? []) {
            if (field?.previewable) pushField(style.name + "::part:" + part.name + "::state:" + stateRow.name + "::" + field.field, style.name, field.field, {
              value: field.value,
              part: part.name,
              state: stateRow.name,
              kind: "style.state_field.set"
            });
          }
        }
      }
    }
    return direct.length ? direct : fallback;
  };
  const patchWcssOps = async ops => {
    const previewSessionId = await ensureWcssPreviewSession();
    const response = await fetch("/engentus/__generated/wcss/preview-session", {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        previewSessionId,
        ops
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || body?.message || "WCSS preview patch failed.");
    state.wcssPreview.version = Number(body?.version || 0);
    state.wcssPreview.patchError = "";
    channel?.postMessage({
      kind: "debug-command",
      command: "apply-wcss-preview",
      sessionId: state.wcssPreview.sessionId,
      version: state.wcssPreview.version,
      persistUrl: true
    });
    await loadWcssInspector();
    setStatus("Updated styles.", "ok");
  };
  const scheduleWcssTokenPatch = async (tokenName, value) => {
    try {
      await patchWcssOps([{ kind: "token.set", token: tokenName, value: String(value ?? "").trim() }]);
    } catch (error) {
      state.wcssPreview.patchError = error instanceof Error ? error.message : String(error);
      setStatus(state.wcssPreview.patchError, "error");
      render();
    }
  };
  const scheduleWcssFieldPatch = async entry => {
    try {
      const operation = {
        kind: entry.kind,
        style: entry.style,
        field: entry.field,
        value: String(entry.value ?? "").trim()
      };
      if (entry.part) operation.part = entry.part;
      if (entry.state) operation.state = entry.state;
      await patchWcssOps([operation]);
    } catch (error) {
      state.wcssPreview.patchError = error instanceof Error ? error.message : String(error);
      setStatus(state.wcssPreview.patchError, "error");
      render();
    }
  };
  const parseCssRules = async cssText => {
    if (typeof CSSStyleSheet !== "function") return null;
    const sheet = new CSSStyleSheet();
    await sheet.replace(cssText);
    return Array.from(sheet.cssRules || []);
  };
  const loadGeneratedCss = async href => {
    if (!href) return;
    state.generatedCss.selectedHref = href;
    if (state.generatedCss.textByHref[href] || state.generatedCss.errorsByHref[href]) {
      render();
      return;
    }
    try {
      const response = await fetch(href, { headers: { accept: "text/css" } });
      const text = await response.text();
      if (!response.ok) throw new Error(text || "Generated CSS load failed.");
      state.generatedCss.textByHref[href] = text;
      state.generatedCss.rulesByHref[href] = await parseCssRules(text);
      state.generatedCss.errorsByHref[href] = "";
    } catch (error) {
      state.generatedCss.errorsByHref[href] = error instanceof Error ? error.message : String(error);
    }
    render();
  };

  const refreshSession = async () => {
    if (!previewSessionId) return;
    const response = await fetch("/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId), {
      headers: { accept: "application/json" }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.session = {
        id: previewSessionId,
        status: "missing",
        invalidReason: body?.error || "Preview session is unavailable.",
        sources: []
      };
      render();
      return;
    }
    state.session = body?.previewSession || null;
    const sources = Array.isArray(state.session?.sources) ? state.session.sources : [];
    if (!state.sourceFile && sources.length) state.sourceFile = sources[0].file;
    if (state.sourceFile && !sources.some(row => row.file === state.sourceFile) && !state.sourcePayload?.file) {
      state.sourceFile = sources[0]?.file || null;
    }
    render();
  };

  const loadSource = async file => {
    if (!previewSessionId || !file) return;
    const response = await fetch(
      "/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/source?file=" + encodeURIComponent(file),
      { headers: { accept: "application/json" } }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      state.sourcePayload = {
        file,
        sourceId: null,
        text: "",
        annotations: [],
        error: body?.error || "Source is unavailable."
      };
      resetJsonTreeState(state.trees.sourceJson);
      render();
      return;
    }
    state.sourceFile = file;
    state.sourcePayload = body;
    resetJsonTreeState(state.trees.sourceJson);
    render();
  };

  const applySourceEdit = async () => {
    const currentSource = currentSourceRef();
    if (!previewSessionId || !currentSource) return;
    const editor = byId("debug-source-editor");
    const response = await fetch("/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/sources", {
      method: "PATCH",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        edits: [{
          path: currentSource.sourceId || currentSource.file || state.sourceFile || "",
          content: editor?.value || ""
        }]
      })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus(body?.error || "Preview edit failed.", "error");
      return;
    }
    state.session = body?.previewSession || state.session;
    setStatus("Preview source updated.", "ok");
    if (state.sourceFile) await loadSource(state.sourceFile);
    if (state.selectedDomPath) await refreshInspection();
    if (state.lazy.stylesData) await loadWcssInspector();
    await refreshSession();
    channel?.postMessage({ kind: "debug-command", command: "publish-snapshot" });
  };

  const endPreview = async () => {
    if (!previewSessionId) return;
    await fetch("/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId), {
      method: "DELETE",
      headers: { accept: "application/json" }
    }).catch(() => null);
    if (state.wcssPreview.sessionId) {
      await fetch("/engentus/__generated/wcss/preview-session", {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          previewSessionId: state.wcssPreview.sessionId
        })
      }).catch(() => null);
      state.wcssPreview.sessionId = null;
      state.wcssPreview.version = 0;
      state.wcssPreview.document = null;
      state.wcssPreview.schema = null;
      state.wcssPreview.tokenCatalog = null;
      state.wcssPreview.loadError = "";
      state.wcssPreview.patchError = "";
      applyWcssPreviewToCurrentUrl();
      channel?.postMessage({ kind: "debug-command", command: "clear-wcss-preview" });
    }
    setStatus("Preview ended.", "ok");
    state.session = {
      id: previewSessionId,
      status: "deleted",
      invalidReason: null,
      sources: []
    };
    render();
  };

  const fetchInspection = async ({
    query = "",
    descriptor = null,
    preferredTarget = ""
  } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set("target", query);
    if (descriptor) params.set("descriptor", JSON.stringify(descriptor));
    if (preferredTarget) params.set("preferredTarget", preferredTarget);
    const response = await fetch(
      "/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/inspect?" + params.toString(),
      { headers: { accept: "application/json" } }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return null;
    return body;
  };

  const applyResolvedInspection = (inspection, {
    fallbackLevel = 0,
    descriptor = null,
    candidate = null,
    candidateResult = null
  } = {}) => {
    const previousTarget = state.inspection?.target || null;
    state.inspection = inspection || {
      error: "No source-backed component matched the selected DOM node.",
      target: null,
      authoredProps: {},
      validProps: [],
      sources: [],
      runtimeProps: null
    };
    state.selectedTarget = state.inspection?.target || null;
    state.selectedCandidate = candidate || null;
    state.inspectionCandidates = Array.isArray(candidateResult?.candidates)
      ? candidateResult.candidates
      : (Array.isArray(inspection?.candidates) ? inspection.candidates : []);
    state.breadcrumbs = Array.isArray(inspection?.breadcrumbs) ? inspection.breadcrumbs : [];
    state.selectionFallback = fallbackLevel;
    if ((state.inspection?.target || null) !== previousTarget) {
      state.propertyDrafts = Object.create(null);
    }
    state.propertyError = "";
    if (state.inspection?.editableSource?.file) {
      state.sourceFile = state.inspection.editableSource.file;
    }
    state.selectionStatus = inspection?.target
      ? ("Focused " + inspection.target + (fallbackLevel > 0 ? " via parent fallback." : "."))
      : "No source-backed component matched the selected node.";
    if (descriptor?.domPath) state.selectedDomPath = descriptor.domPath;
    if (descriptor) state.selectedDescriptor = descriptor;
  };

  const refreshInspection = async ({
    preferredTarget = ""
  } = {}) => {
    if (!previewSessionId || !state.selectedDomPath) return;
    const descriptor = state.selectedDescriptor;
    if (!descriptor) {
      state.inspection = null;
      state.selectedTarget = null;
      state.selectedCandidate = null;
      state.inspectionCandidates = [];
      state.breadcrumbs = [];
      state.selectionStatus = "";
      render();
      return;
    }
    state.selectionStatus = "Resolving source-backed component...";
    render();
    const descriptorChain = resolutionDescriptorChain(state.selectedDomPath);
    let resolvedInspection = null;
    let resolvedCandidate = null;
    let resolvedDescriptor = descriptor;
    let resolvedCandidateResult = null;
    let fallbackLevel = 0;
    let ambiguousResult = null;
    for (const [index, entry] of descriptorChain.entries()) {
      const candidateResult = await ensureNodeResolution(entry.domPath, {
        preferredTarget: preferredTarget || state.selectedTarget || ""
      });
      const { candidate, ambiguous } = chooseCandidateFromResult(candidateResult, preferredTarget || state.selectedTarget || "");
      if (ambiguous) {
        ambiguousResult = { entry, candidateResult, fallbackLevel: index };
        break;
      }
      if (!candidate) continue;
      const inspection = await fetchInspection({
        query: candidate.target,
        descriptor: resolverDescriptorFor(entry.descriptor),
        preferredTarget: candidate.target
      });
      if (inspection?.target) {
        resolvedInspection = inspection;
        resolvedCandidate = candidate;
        resolvedDescriptor = entry.descriptor;
        resolvedCandidateResult = candidateResult;
        fallbackLevel = index;
        break;
      }
    }
    if (resolvedInspection) {
      applyResolvedInspection(resolvedInspection, {
        fallbackLevel,
        descriptor: resolvedDescriptor,
        candidate: resolvedCandidate,
        candidateResult: resolvedCandidateResult
      });
      render();
      return;
    }
    state.selectedCandidate = null;
    state.selectedTarget = null;
    state.breadcrumbs = [];
    if (ambiguousResult) {
      state.inspection = {
        error: "Multiple source-backed targets match this DOM node. Choose a candidate below.",
        target: null,
        authoredProps: {},
        validProps: [],
        sources: [],
        runtimeProps: null
      };
      state.inspectionCandidates = ambiguousResult.candidateResult.candidates || [];
      state.selectionFallback = ambiguousResult.fallbackLevel;
      state.selectedDescriptor = ambiguousResult.entry.descriptor;
      state.selectionStatus = "Multiple authored targets match this node. Pick one to continue.";
      render();
      return;
    }
    state.inspection = {
      error: "No source-backed component matched the selected DOM node.",
      target: null,
      authoredProps: {},
      validProps: [],
      sources: [],
      runtimeProps: null
    };
    state.inspectionCandidates = [];
    state.selectionFallback = 0;
    state.selectionStatus = "No source-backed component matched the selected node.";
    render();
  };

  const propertyDisplayValue = entry => {
    if (Object.prototype.hasOwnProperty.call(state.propertyDrafts, entry.key)) return state.propertyDrafts[entry.key];
    const current = state.inspection?.authoredProps?.[entry.key];
    if (entry.valueType === "boolean") return Boolean(current === true);
    if (typeof current === "number") return current;
    return current == null ? "" : String(current);
  };

  const schedulePropertyPatch = (entry, value) => {
    if (!state.inspection?.target) return;
    state.propertyDrafts[entry.key] = value;
    state.propertyError = "";
    setStatus("Updating " + entry.key + "...", "ok");
    if (propertyTimers.has(entry.key)) {
      window.clearTimeout(propertyTimers.get(entry.key));
    }
    propertyTimers.set(entry.key, window.setTimeout(async () => {
      propertyTimers.delete(entry.key);
      const response = await fetch(
        "/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/properties",
        {
          method: "PATCH",
          headers: {
            accept: "application/json",
            "content-type": "application/json"
          },
          body: JSON.stringify({
            target: state.inspection.target,
            property: entry.key,
            value: state.propertyDrafts[entry.key]
          })
        }
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.propertyError = body?.error || "Property update failed.";
        setStatus(body?.error || "Property update failed.", "error");
        render();
        return;
      }
      delete state.propertyDrafts[entry.key];
      state.session = body?.previewSession || state.session;
      if (body?.inspection) {
        applyResolvedInspection(body.inspection, {
          fallbackLevel: state.selectionFallback,
          descriptor: state.selectedDescriptor,
          candidate: state.selectedCandidate,
          candidateResult: { candidates: body.inspection.candidates || state.inspectionCandidates }
        });
      }
      state.propertyError = "";
      setStatus("Updated " + entry.key + ".", "ok");
      if (state.lazy.sourceJson || state.lazy.sourceEditor) {
        const fileToReload = state.inspection?.editableSource?.file || state.sourceFile;
        if (fileToReload) await loadSource(fileToReload);
      }
      await refreshSession();
      channel?.postMessage({ kind: "debug-command", command: "publish-snapshot" });
      render();
    }, 350));
  };

  const renderSourceOptions = () => {
    const select = byId("debug-source-select");
    if (!select) return;
    const rows = [];
    const seen = new Set();
    const addRow = row => {
      if (!row?.file || seen.has(row.file)) return;
      seen.add(row.file);
      rows.push(row);
    };
    for (const row of Array.isArray(state.session?.sources) ? state.session.sources : []) addRow(row);
    for (const source of Array.isArray(state.inspection?.sources) ? state.inspection.sources : []) addRow({
      file: source.file,
      sourceId: source.sourceId || source.file
    });
    if (state.sourcePayload?.file) addRow({
      file: state.sourcePayload.file,
      sourceId: state.sourcePayload.sourceId || state.sourcePayload.file
    });
    if (state.inspection?.editableSource?.file) addRow(state.inspection.editableSource);
    select.innerHTML = "";
    for (const row of rows) {
      const option = document.createElement("option");
      option.value = row.file;
      option.textContent = row.sourceId || row.file;
      option.selected = row.file === state.sourceFile;
      select.append(option);
    }
    select.disabled = rows.length === 0;
  };

  const focusSourceAssociation = async source => {
    if (!source?.file) return;
    state.sourceFile = source.file;
    if (!state.sourcePayload || state.sourcePayload.file !== source.file) {
      await loadSource(source.file);
    }
    state.lazy.sourceJson = true;
    render();
    if (channel) {
      channel.postMessage({
        kind: "debug-command",
        command: "source-focus",
        file: source.file,
        target: source.target || state.inspection?.target || null
      });
    }
  };

  const renderSourceAnnotations = () => {
    const list = byId("debug-source-annotations");
    if (!list) return;
    const annotations = Array.isArray(state.sourcePayload?.annotations) ? state.sourcePayload.annotations : [];
    list.innerHTML = "";
    if (!annotations.length) {
      const empty = document.createElement("div");
      empty.className = "debug-empty";
      empty.textContent = state.sourcePayload?.error || "No source annotations for the current file.";
      list.append(empty);
      return;
    }
    for (const annotation of annotations) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "debug-annotation";
      row.textContent = (annotation.target || "target") + " @ " + (annotation.startLine || annotation.line || "?")
        + (annotation.sourceLanguage ? " [" + annotation.sourceLanguage + "]" : "");
      row.addEventListener("click", () => { void focusSourceAssociation(annotation); });
      list.append(row);
    }
  };

  const renderCssRulesTree = (containerId, href) => {
    const container = byId(containerId);
    if (!container) return;
    container.innerHTML = "";
    const text = state.generatedCss.textByHref[href];
    const error = state.generatedCss.errorsByHref[href];
    if (error) {
      const empty = document.createElement("div");
      empty.className = "debug-empty";
      empty.textContent = error;
      container.append(empty);
      return;
    }
    if (!text) {
      renderPlaceholder(containerId, "Load a generated stylesheet to inspect its rules.");
      return;
    }
    const tree = ensureCssTree(href);
    const rules = Array.isArray(state.generatedCss.rulesByHref[href]) ? state.generatedCss.rulesByHref[href] : null;
    if (!rules) {
      const pre = document.createElement("pre");
      pre.textContent = text;
      container.append(pre);
      return;
    }
    const snapshotRoot = parseDomRoot();
    const selectedNode = state.selectedDescriptor?.domPath
      ? domNodeAtPath(snapshotRoot, state.selectedDescriptor.domPath)
      : null;
    const selectorIncludesTargetHint = selectorText => {
      const selector = String(selectorText || "").toLowerCase();
      return currentSelectionKeywords().some(keyword => keyword && selector.includes(keyword));
    };
    const selectorMatchesNode = selectorText => {
      if (!selectedNode || !selectorText || typeof selectedNode.matches !== "function") return false;
      try {
        return selectedNode.matches(selectorText)
          || selectedNode.closest(selectorText) === selectedNode;
      } catch {
        return selectorIncludesTargetHint(selectorText);
      }
    };
    const ruleReasons = rule => {
      const reasons = [];
      const selectorText = String(rule?.selectorText || "");
      if (selectorText && selectorMatchesNode(selectorText)) reasons.push("selector match");
      if (selectorText && selectorIncludesTargetHint(selectorText)) reasons.push("component hint");
      return reasons;
    };
    const ruleIsRelevant = rule => {
      if (Array.isArray(rule?.cssRules) && rule.cssRules.length) return Array.from(rule.cssRules).some(ruleIsRelevant);
      return ruleReasons(rule).length > 0;
    };
    const renderRule = (rule, path) => {
      const wrapper = document.createElement("div");
      wrapper.className = "debug-json-node";
      const line = document.createElement("div");
      line.className = "debug-json-line";
      wrapper.append(line);
      const nested = Array.isArray(rule.cssRules) && rule.cssRules.length > 0;
      if (nested) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "debug-json-toggle";
        toggle.textContent = tree.expanded.has(path) ? "v" : ">";
        toggle.addEventListener("click", () => {
          toggleTreePath(tree, path);
          render();
        });
        line.append(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "debug-dom-spacer";
        spacer.textContent = "-";
        line.append(spacer);
      }
      const summary = document.createElement("span");
      summary.className = "debug-json-summary";
      summary.textContent = rule.selectorText || rule.conditionText || rule.name || rule.cssText.split("{")[0].trim() || "rule";
      line.append(summary);
      const reasons = ruleReasons(rule);
      if (reasons.length) {
        const badge = document.createElement("span");
        badge.className = "debug-dom-badge";
        badge.textContent = reasons.join(" • ");
        line.append(badge);
      }
      if (!nested) {
        const value = document.createElement("span");
        value.className = "debug-dom-text";
        value.textContent = rule.style?.cssText || rule.cssText;
        line.append(value);
        return wrapper;
      }
      if (!tree.expanded.has(path)) return wrapper;
      const children = document.createElement("div");
      children.className = "debug-json-children";
      wrapper.append(children);
      Array.from(rule.cssRules).forEach((childRule, index) => {
        children.append(renderRule(childRule, path + "." + index));
      });
      return wrapper;
    };
    const relevantRules = selectedNode ? rules.filter(ruleIsRelevant) : rules;
    if (selectedNode && !relevantRules.length) {
      const empty = document.createElement("div");
      empty.className = "debug-empty";
      empty.textContent = "No generated CSS rules matched the focused component.";
      container.append(empty);
      return;
    }
    relevantRules.forEach((rule, index) => {
      container.append(renderRule(rule, "root." + index));
    });
  };

  const renderGroupedSelectionSources = () => {
    const componentNode = byId("debug-component-sources");
    const styleNode = byId("debug-style-sources");
    const generatedNode = byId("debug-generated-css-links");
    const sources = Array.isArray(state.inspection?.sources) ? state.inspection.sources : [];
    const componentSources = sources.filter(source => source.sourceLanguage !== "wcss");
    const styleSources = sources.filter(source => source.sourceLanguage === "wcss");
    const stylesheetHrefs = currentPageStylesheetHrefs();

    const renderSourceRows = (node, rows, emptyText) => {
      if (!node) return;
      node.innerHTML = "";
      if (!rows.length) {
        const empty = document.createElement("div");
        empty.className = "debug-empty";
        empty.textContent = emptyText;
        node.append(empty);
        return;
      }
      for (const source of rows) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "debug-source-link";
        const title = document.createElement("strong");
        title.textContent = source.target || "target";
        const meta = document.createElement("span");
        meta.textContent = (source.sourceLanguage || "source") + " / " + (source.sourceKind || "?");
        const file = document.createElement("span");
        file.textContent = (source.sourceId || source.file || "") + ":" + (source.startLine || source.line || "?");
        row.append(title, meta, file);
        row.addEventListener("click", () => { void focusSourceAssociation(source); });
        node.append(row);
      }
    };

    renderSourceRows(componentNode, componentSources, state.inspection?.error || "No component-authored RVM/WTOML sources were resolved.");
    renderSourceRows(styleNode, styleSources, "No WCSS source annotations were resolved for this target.");

    if (generatedNode) {
      generatedNode.innerHTML = "";
      if (!stylesheetHrefs.length) {
        const empty = document.createElement("div");
        empty.className = "debug-empty";
        empty.textContent = "No generated CSS assets were captured for this page.";
        generatedNode.append(empty);
      } else {
        for (const href of stylesheetHrefs) {
          const row = document.createElement("button");
          row.type = "button";
          row.className = "debug-source-link";
          const assetKind = /engentus-shell\.css/i.test(href)
            ? "shell"
            : (/engentus-chart-pages\.css/i.test(href) ? "chart" : "asset");
          const title = document.createElement("strong");
          title.textContent = assetKind;
          const meta = document.createElement("span");
          meta.textContent = "generated css";
          const file = document.createElement("span");
          file.textContent = href;
          row.append(title, meta, file);
          row.addEventListener("click", () => { void loadGeneratedCss(href); });
          generatedNode.append(row);
        }
      }
    }
  };

  const renderStylesPane = () => {
    const statusNode = byId("debug-styles-status");
    const tokenNode = byId("debug-style-tokens");
    const fieldNode = byId("debug-style-fields");
    const stylesheetNode = byId("debug-selection-styles");
    const generatedCssNode = byId("debug-generated-css-view");
    if (statusNode) {
      const parts = [];
      if (state.wcssPreview.sessionId) parts.push("WCSS preview " + state.wcssPreview.sessionId);
      if (state.wcssPreview.version) parts.push("v" + state.wcssPreview.version);
      statusNode.textContent = state.wcssPreview.loadError
        || state.wcssPreview.patchError
        || (parts.join(" • ") || "Load the WCSS inspector to view previewable tokens and fields.");
    }

    if (stylesheetNode) {
      stylesheetNode.innerHTML = "";
      const metadata = state.hostSnapshot?.pageMetadata || {};
      const styleRows = [
        ...uniqueStrings(metadata.stylesheets).map(value => ({ kind: "stylesheet", value })),
        ...uniqueStrings(metadata.inlineCapabilityStyles).map(value => ({ kind: "inline-style", value })),
        ...uniqueStrings(metadata.inlineCapabilityModules).map(value => ({ kind: "inline-module", value })),
        ...uniqueStrings(state.inspection?.styles?.generatedStylesheetHints).map(value => ({ kind: "target-style-hint", value }))
      ];
      if (!styleRows.length) {
        const emptyStyle = document.createElement("div");
        emptyStyle.className = "debug-empty";
        emptyStyle.textContent = "No stylesheet metadata captured yet.";
        stylesheetNode.append(emptyStyle);
      } else {
        for (const rowData of styleRows) {
          const row = document.createElement("div");
          row.className = "debug-kv-row";
          const key = document.createElement("code");
          key.textContent = rowData.kind;
          const value = document.createElement("span");
          value.textContent = rowData.value;
          row.append(key, value);
          stylesheetNode.append(row);
        }
      }
    }

    if (tokenNode) {
      tokenNode.innerHTML = "";
      if (!state.lazy.stylesData) {
        const empty = document.createElement("div");
        empty.className = "debug-empty";
        empty.textContent = "Load the style inspector to see previewable WCSS tokens.";
        tokenNode.append(empty);
      } else {
        const tokens = previewableTokens();
        if (!tokens.length) {
          const empty = document.createElement("div");
          empty.className = "debug-empty";
          empty.textContent = "No previewable tokens are associated with the current page assets.";
          tokenNode.append(empty);
        } else {
          for (const token of tokens) {
            const field = document.createElement("label");
            field.className = "debug-field";
            const label = document.createElement("span");
            label.className = "debug-field-label";
            label.textContent = token.name;
            field.append(label);
            const input = document.createElement("input");
            input.type = "text";
            input.value = String(token.value ?? "");
            input.addEventListener("change", event => {
              void scheduleWcssTokenPatch(token.name, event.target.value);
            });
            field.append(input);
            tokenNode.append(field);
          }
        }
      }
    }

    if (fieldNode) {
      fieldNode.innerHTML = "";
      if (!state.lazy.stylesData) {
        const empty = document.createElement("div");
        empty.className = "debug-empty";
        empty.textContent = "Load the style inspector to see previewable WCSS style fields.";
        fieldNode.append(empty);
      } else {
        const rows = previewableStyleFields();
        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "debug-empty";
          empty.textContent = "No previewable WCSS fields were exposed for this page.";
          fieldNode.append(empty);
        } else {
          for (const rowData of rows) {
            const field = document.createElement("label");
            field.className = "debug-field";
            const label = document.createElement("span");
            label.className = "debug-field-label";
            label.textContent = rowData.style
              + (rowData.part ? " / part " + rowData.part : "")
              + (rowData.state ? " / state " + rowData.state : "")
              + " / " + rowData.field
              + (rowData.direct ? "" : " (page-level)");
            field.append(label);
            const input = document.createElement("input");
            input.type = "text";
            input.value = String(rowData.value ?? "");
            input.addEventListener("change", event => {
              rowData.value = event.target.value;
              void scheduleWcssFieldPatch(rowData);
            });
            field.append(input);
            fieldNode.append(field);
          }
        }
      }
    }

    if (generatedCssNode) {
      const href = state.generatedCss.selectedHref || currentPageStylesheetHrefs()[0] || null;
      if (href && !state.generatedCss.selectedHref) state.generatedCss.selectedHref = href;
      renderCssRulesTree("debug-generated-css-view", state.generatedCss.selectedHref);
    }
  };

  const renderSelectionBreadcrumbs = () => {
    const node = byId("debug-selection-breadcrumbs");
    if (!node) return;
    node.innerHTML = "";
    const breadcrumbs = Array.isArray(state.breadcrumbs) ? state.breadcrumbs : [];
    if (!breadcrumbs.length) {
      const empty = document.createElement("div");
      empty.className = "debug-empty";
      empty.textContent = "No authored parent chain is available for this target.";
      node.append(empty);
      return;
    }
    for (const entry of breadcrumbs) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "debug-chip" + (entry.target === state.selectedTarget ? " debug-chip-active" : "");
      button.textContent = entry.target + (entry.componentKind ? " (" + entry.componentKind + ")" : "");
      button.addEventListener("click", () => {
        void refreshInspection({ preferredTarget: entry.target });
      });
      node.append(button);
    }
  };

  const renderSelectionCandidates = () => {
    const node = byId("debug-selection-candidates");
    if (!node) return;
    node.innerHTML = "";
    const candidates = Array.isArray(state.inspectionCandidates) ? state.inspectionCandidates : [];
    if (!candidates.length) {
      const empty = document.createElement("div");
      empty.className = "debug-empty";
      empty.textContent = "No ranked candidates were returned for this selection.";
      node.append(empty);
      return;
    }
    for (const candidate of candidates.slice(0, 6)) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "debug-source-link" + (candidate.target === state.selectedTarget ? " debug-source-link-active" : "");
      const title = document.createElement("strong");
      title.textContent = candidate.target;
      const meta = document.createElement("span");
      meta.textContent = (candidate.componentKind || "surface") + " / " + (candidate.confidence || "none");
      const file = document.createElement("span");
      const reasons = Array.isArray(candidate.provenance?.reasons) ? candidate.provenance.reasons : [];
      file.textContent = reasons.slice(0, 2).map(reason => reason.kind + (reason.detail ? ":" + reason.detail : "")).join(" • ")
        || ("score " + Number(candidate.score || 0));
      row.append(title, meta, file);
      row.addEventListener("click", () => {
        state.selectedTarget = candidate.target;
        void refreshInspection({ preferredTarget: candidate.target });
      });
      node.append(row);
    }
  };

  const renderSelectionInspector = () => {
    const empty = byId("debug-selection-empty");
    const panel = byId("debug-selection-panel");
    const descriptor = state.selectedDescriptor;
    if (!descriptor) {
      if (empty) empty.hidden = false;
      if (panel) panel.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    if (panel) panel.hidden = false;

    setText("debug-selection-tag", "<" + descriptor.tagName + ">");
    setText("debug-selection-target", state.selectedTarget || state.inspection?.target || "-");
    setText("debug-selection-kind", state.inspection?.componentKind || "-");
    setText("debug-selection-path", descriptor.domPath || "root");
    setText("debug-selection-id", descriptor.id || "-");
    setText("debug-selection-widget", descriptor.widgetId || "-");
    setText("debug-selection-surface", descriptor.surfaceId || "-");
    setText("debug-selection-text", descriptor.textPreview || "No visible text");
    setText("debug-selection-status", state.selectionStatus || "");
    setText("debug-selection-fallback", state.selectionFallback > 0 ? "parent +" + state.selectionFallback : "direct");

    const attrsNode = byId("debug-selection-attrs");
    if (attrsNode) {
      attrsNode.innerHTML = "";
      if (!descriptor.attributes.length) {
        const emptyAttr = document.createElement("div");
        emptyAttr.className = "debug-empty";
        emptyAttr.textContent = "No attributes on this node.";
        attrsNode.append(emptyAttr);
      } else {
        for (const attribute of descriptor.attributes) {
          const row = document.createElement("div");
          row.className = "debug-kv-row";
          const key = document.createElement("code");
          key.textContent = attribute.name;
          const value = document.createElement("span");
          value.textContent = attribute.value;
          row.append(key, value);
          attrsNode.append(row);
        }
      }
    }

    const propsNode = byId("debug-authored-props");
    const propertyErrorNode = byId("debug-authored-error");
    if (propsNode) {
      propsNode.innerHTML = "";
      if (propertyErrorNode) {
        propertyErrorNode.textContent = state.propertyError || "";
        propertyErrorNode.hidden = !state.propertyError;
      }
      const inspection = state.inspection;
      const validProps = Array.isArray(inspection?.validProps) ? inspection.validProps : [];
      if (!inspection?.editable) {
        const emptyProps = document.createElement("div");
        emptyProps.className = "debug-empty";
        emptyProps.textContent = inspection?.error || "This selection is not editable through preview-backed RVM/WTOML sources.";
        propsNode.append(emptyProps);
      } else if (!validProps.length) {
        const emptyProps = document.createElement("div");
        emptyProps.className = "debug-empty";
        emptyProps.textContent = "No editable authored properties are exposed for this component.";
        propsNode.append(emptyProps);
      } else {
        for (const entry of validProps) {
          const field = document.createElement("label");
          field.className = "debug-field";
          const label = document.createElement("span");
          label.className = "debug-field-label";
          label.textContent = entry.label || entry.key;
          field.append(label);

          let control = null;
          const currentValue = propertyDisplayValue(entry);
          const optionValues = uniqueStrings([
            currentValue == null ? "" : String(currentValue),
            ...(Array.isArray(entry.options) ? entry.options : [])
          ]);
          if (entry.valueType === "boolean") {
            control = document.createElement("input");
            control.type = "checkbox";
            control.checked = Boolean(currentValue === true);
            control.addEventListener("change", event => {
              schedulePropertyPatch(entry, Boolean(event.target.checked));
            });
          } else if (optionValues.length && entry.valueType === "string") {
            control = document.createElement("select");
            for (const optionValue of optionValues) {
              const option = document.createElement("option");
              option.value = optionValue;
              option.textContent = optionValue || "(empty)";
              option.selected = optionValue === String(currentValue ?? "");
              control.append(option);
            }
            control.addEventListener("change", event => {
              state.propertyDrafts[entry.key] = event.target.value;
              schedulePropertyPatch(entry, event.target.value);
            });
          } else if (entry.valueType === "multiline") {
            control = document.createElement("textarea");
            control.rows = 3;
            control.value = String(currentValue ?? "");
            control.addEventListener("input", event => {
              state.propertyDrafts[entry.key] = event.target.value;
              schedulePropertyPatch(entry, event.target.value);
            });
          } else {
            control = document.createElement("input");
            control.type = entry.valueType === "number" ? "number" : "text";
            control.value = String(currentValue ?? "");
            control.addEventListener("input", event => {
              state.propertyDrafts[entry.key] = event.target.value;
              schedulePropertyPatch(entry, event.target.value);
            });
          }
          control.name = entry.key;
          field.append(control);
          propsNode.append(field);
        }
      }
    }

    const runtimePropsNode = byId("debug-runtime-props");
    if (runtimePropsNode) {
      runtimePropsNode.innerHTML = "";
      const runtimeProps = state.inspection?.runtimeProps && typeof state.inspection.runtimeProps === "object"
        ? state.inspection.runtimeProps
        : null;
      const runtimeEntries = runtimeProps
        ? Object.entries(runtimeProps).sort(([left], [right]) => left.localeCompare(right))
        : [];
      if (!runtimeEntries.length) {
        const emptyRuntime = document.createElement("div");
        emptyRuntime.className = "debug-empty";
        emptyRuntime.textContent = "No runtime-resolved properties were captured for this target.";
        runtimePropsNode.append(emptyRuntime);
      } else {
        for (const [keyName, rawValue] of runtimeEntries) {
          const row = document.createElement("div");
          row.className = "debug-kv-row";
          const key = document.createElement("code");
          key.textContent = keyName;
          const value = document.createElement("span");
          value.textContent = typeof rawValue === "string"
            ? rawValue
            : JSON.stringify(rawValue);
          row.append(key, value);
          runtimePropsNode.append(row);
        }
      }
    }

    renderSelectionBreadcrumbs();
    renderSelectionCandidates();
    renderGroupedSelectionSources();
    renderStylesPane();

    const paneNames = ["props", "styles", "sources", "runtime"];
    for (const paneName of paneNames) {
      const button = byId("debug-pane-" + paneName);
      if (button) button.dataset.active = state.inspectorPane === paneName ? "true" : "false";
      const panelNode = byId("debug-pane-panel-" + paneName);
      if (panelNode) panelNode.hidden = state.inspectorPane !== paneName;
    }

    if (state.lazy.runtimeJson) {
      renderJsonTree(
        "debug-runtime-json",
        {
          componentKind: state.inspection?.componentKind || null,
          runtime: state.inspection?.runtimeProps || null,
          dom: descriptor,
          page: state.hostSnapshot?.pageMetadata || null
        },
        state.trees.runtimeJson,
        "Load runtime inspection to inspect resolved props."
      );
    } else {
      renderPlaceholder("debug-runtime-json", "Load runtime inspection to inspect the focused component.");
    }
  };

  const renderDomTree = () => {
    const container = byId("debug-dom-tree");
    if (!container) return;
    if (!state.lazy.domTree) {
      renderPlaceholder("debug-dom-tree", "Load the structured DOM tree for the mirrored surface.");
      return;
    }
    const root = parseDomRoot();
    if (!root) {
      renderPlaceholder("debug-dom-tree", "Waiting for a mirrored DOM snapshot from Tab 1.");
      return;
    }
    container.innerHTML = "";

    const renderNode = (node, domPath) => {
      const wrapper = document.createElement("div");
      wrapper.className = "debug-dom-node";

      const line = document.createElement("div");
      line.className = "debug-dom-line"
        + (state.selectedDomPath === domPath ? " debug-dom-line-selected" : "")
        + (state.hoverDomPath === domPath ? " debug-dom-line-hover" : "");
      wrapper.append(line);

      const children = childElementsFor(node);
      if (children.length) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "debug-dom-toggle";
        toggle.textContent = state.trees.domTree.expanded.has(domPath) ? "v" : ">";
        toggle.addEventListener("click", event => {
          event.stopPropagation();
          toggleTreePath(state.trees.domTree, domPath);
          render();
        });
        line.append(toggle);
      } else {
        const spacer = document.createElement("span");
        spacer.className = "debug-dom-spacer";
        spacer.textContent = "-";
        line.append(spacer);
      }

      const descriptor = describeDomNode(node, domPath);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "debug-dom-summary";
      const tag = document.createElement("span");
      tag.className = "debug-dom-tag";
      tag.textContent = "<" + descriptor.tagName + ">";
      button.append(tag);
      if (descriptor.id) {
        const id = document.createElement("span");
        id.className = "debug-dom-id";
        id.textContent = "#" + descriptor.id;
        button.append(id);
      }
      if (descriptor.widgetId) {
        const widget = document.createElement("span");
        widget.className = "debug-dom-meta";
        widget.textContent = "widget:" + descriptor.widgetId;
        button.append(widget);
      }
      if (descriptor.surfaceId) {
        const surface = document.createElement("span");
        surface.className = "debug-dom-meta";
        surface.textContent = "surface:" + descriptor.surfaceId;
        button.append(surface);
      }
      if (descriptor.classNames.length) {
        const classToken = document.createElement("span");
        classToken.className = "debug-dom-class";
        classToken.textContent = "." + descriptor.classNames.slice(0, 3).join(".");
        button.append(classToken);
      }
      if (descriptor.textPreview) {
        const text = document.createElement("span");
        text.className = "debug-dom-text";
        text.textContent = descriptor.textPreview;
        button.append(text);
      }
      const resolutionSummary = state.resolutions[domPath]?.summary || null;
      if (resolutionSummary?.status) {
        const badge = document.createElement("span");
        badge.className = "debug-dom-badge";
        if (resolutionSummary.status === "resolved") {
          badge.textContent = resolutionSummary.target || "resolved";
        } else if (resolutionSummary.status === "ambiguous") {
          badge.textContent = "ambiguous (" + resolutionSummary.candidateCount + ")";
        } else if (resolutionSummary.status === "pending") {
          badge.textContent = "resolving";
        } else {
          badge.textContent = "no target";
        }
        button.append(badge);
      }
      button.addEventListener("click", async () => {
        state.selectedDomPath = domPath;
        state.selectedDescriptor = descriptor;
        state.selectedTarget = descriptor.nearestSurfaceId || null;
        channel?.postMessage({
          kind: "debug-command",
          command: "highlight-target",
          targetId: descriptor.id || "",
          domPath,
          scroll: false,
          transient: true
        });
        await refreshInspection();
      });
      button.addEventListener("mouseenter", () => {
        if (state.resolutions[domPath]?.result || state.resolutions[domPath]?.pending) return;
        void ensureNodeResolution(domPath, {
          preferredTarget: descriptor.nearestSurfaceId || ""
        }).then(() => render()).catch(() => {});
      });
      line.append(button);

      if (!children.length || !state.trees.domTree.expanded.has(domPath)) return wrapper;
      const childWrap = document.createElement("div");
      childWrap.className = "debug-dom-children";
      wrapper.append(childWrap);
      children.forEach((child, index) => {
        childWrap.append(renderNode(child, domPath + "." + index));
      });
      return wrapper;
    };

    container.append(renderNode(root, "root"));
  };

  const setInspectorPane = pane => {
    state.inspectorPane = pane;
    if (pane === "styles" && !state.lazy.stylesData) {
      state.lazy.stylesData = true;
      void loadWcssInspector();
    }
    render();
  };

  const render = () => {
    const session = state.session || {};
    setText("debug-session-id", session.id || previewSessionId || "-");
    setText("debug-session-status", session.status || "pending");
    setText("debug-session-revision", session.previewRevision || 0);
    setText("debug-session-detail", session.invalidReason || "");
    setText("debug-route", state.hostSnapshot?.route?.href || "Waiting for Tab 1...");
    setText("debug-active-surface", state.hostSnapshot?.activeSurfaceId || "-");
    setText("debug-source-count", Array.isArray(session.sources) ? session.sources.length : 0);
    setText("debug-dom-size", String((state.hostSnapshot?.domHtml || "").length || 0));
    setText("debug-runtime-keys", Object.keys(state.hostSnapshot?.runtimeInspection || {}).length);
    setStatus(state.statusText, state.statusTone || "ok");

    if (state.lazy.sessionJson) renderJsonTree("debug-session-json", session, state.trees.sessionJson, "Load JSON to inspect the preview session.");
    else renderPlaceholder("debug-session-json", "Load JSON to inspect the preview session.");

    if (state.lazy.hostJson) renderJsonTree("debug-host-json", state.hostSnapshot || null, state.trees.hostJson, "Load JSON to inspect the mirrored host snapshot.");
    else renderPlaceholder("debug-host-json", "Load JSON to inspect the mirrored host snapshot.");

    renderDomTree();
    renderSourceOptions();
    renderSelectionInspector();

    if (state.lazy.sourceJson) renderJsonTree("debug-source-json", state.sourcePayload || null, state.trees.sourceJson, "Load JSON to inspect source annotations and content.");
    else renderPlaceholder("debug-source-json", "Load JSON to inspect source annotations and content.");

    const editor = byId("debug-source-editor");
    if (editor) {
      editor.value = state.lazy.sourceEditor ? (state.sourcePayload?.text || "") : "";
      editor.hidden = !state.lazy.sourceEditor;
    }
    const applyButton = byId("debug-apply-source");
    if (applyButton) applyButton.hidden = !state.lazy.sourceEditor;
    const sourceEditorHint = byId("debug-source-editor-hint");
    if (sourceEditorHint) sourceEditorHint.hidden = state.lazy.sourceEditor;

    const highlightButton = byId("debug-highlight-selection");
    if (highlightButton) highlightButton.disabled = !state.selectedDescriptor;
    const jumpButton = byId("debug-jump-selection");
    if (jumpButton) jumpButton.disabled = !state.selectedDescriptor;
    const pickButton = byId("debug-pick-selection");
    if (pickButton) pickButton.textContent = state.inspectMode ? "Picking In Tab 1..." : "Pick In Tab 1";
    const hoverText = byId("debug-hover-target");
    if (hoverText) hoverText.textContent = state.hoverDescriptor?.id
      || state.hoverDescriptor?.widgetId
      || state.hoverDescriptor?.surfaceId
      || state.hoverDescriptor?.tagName
      || "-";
    const inspectModeText = byId("debug-inspect-mode");
    if (inspectModeText) inspectModeText.textContent = state.inspectMode ? "armed" : "idle";

    renderSourceAnnotations();
  };

  byId("debug-source-select")?.addEventListener("change", event => {
    state.sourceFile = event.target.value || null;
    state.sourcePayload = null;
    state.lazy.sourceJson = false;
    state.lazy.sourceEditor = false;
    render();
  });
  byId("debug-apply-source")?.addEventListener("click", () => {
    void applySourceEdit();
  });
  byId("debug-end-preview")?.addEventListener("click", () => {
    void endPreview();
  });
  byId("debug-request-snapshot")?.addEventListener("click", () => {
    channel?.postMessage({ kind: "debug-command", command: "publish-snapshot" });
  });
  byId("debug-pick-selection")?.addEventListener("click", () => {
    state.inspectMode = !state.inspectMode;
    channel?.postMessage({
      kind: "debug-command",
      command: "set-inspect-mode",
      enabled: state.inspectMode
    });
    render();
  });
  byId("debug-highlight-selection")?.addEventListener("click", () => {
    if (!state.selectedDescriptor) return;
    channel?.postMessage({
      kind: "debug-command",
      command: "highlight-target",
      targetId: state.selectedDescriptor.id || "",
      domPath: state.selectedDescriptor.domPath || "",
      scroll: false
    });
  });
  byId("debug-jump-selection")?.addEventListener("click", () => {
    if (!state.selectedDescriptor) return;
    channel?.postMessage({
      kind: "debug-command",
      command: "highlight-target",
      targetId: state.selectedDescriptor.id || "",
      domPath: state.selectedDescriptor.domPath || "",
      scroll: true
    });
  });
  byId("debug-load-session-json")?.addEventListener("click", () => {
    state.lazy.sessionJson = true;
    resetJsonTreeState(state.trees.sessionJson);
    render();
  });
  byId("debug-load-host-json")?.addEventListener("click", () => {
    state.lazy.hostJson = true;
    resetJsonTreeState(state.trees.hostJson);
    render();
  });
  byId("debug-load-dom-tree")?.addEventListener("click", () => {
    state.lazy.domTree = true;
    resetDomTreeState(state.trees.domTree);
    render();
  });
  byId("debug-load-runtime-json")?.addEventListener("click", () => {
    state.lazy.runtimeJson = true;
    resetJsonTreeState(state.trees.runtimeJson);
    render();
  });
  byId("debug-load-source-json")?.addEventListener("click", async () => {
    if (!state.sourceFile) return;
    if (!state.sourcePayload) await loadSource(state.sourceFile);
    state.lazy.sourceJson = true;
    render();
  });
  byId("debug-load-source-editor")?.addEventListener("click", async () => {
    if (!state.sourceFile) return;
    if (!state.sourcePayload) await loadSource(state.sourceFile);
    state.lazy.sourceEditor = true;
    render();
  });
  byId("debug-load-styles")?.addEventListener("click", () => {
    state.lazy.stylesData = true;
    void loadWcssInspector();
  });
  byId("debug-pane-props")?.addEventListener("click", () => {
    setInspectorPane("props");
  });
  byId("debug-pane-styles")?.addEventListener("click", () => {
    setInspectorPane("styles");
  });
  byId("debug-pane-sources")?.addEventListener("click", () => {
    setInspectorPane("sources");
  });
  byId("debug-pane-runtime")?.addEventListener("click", () => {
    setInspectorPane("runtime");
  });

  if (channel) {
    channel.onmessage = event => {
      const message = event?.data && typeof event.data === "object" ? event.data : null;
      if (!message || message.kind !== "host-snapshot") return;
      const previousDomHtml = state.hostSnapshot?.domHtml || "";
      state.hostSnapshot = message;
      if ((message?.domHtml || "") !== previousDomHtml) {
        state.resolutions = Object.create(null);
      }
      if (message?.wcssPreview?.id) {
        if (!state.wcssPreview.sessionId) state.wcssPreview.sessionId = message.wcssPreview.id;
        if (state.wcssPreview.sessionId === message.wcssPreview.id) {
          state.wcssPreview.version = Number(message.wcssPreview.version || state.wcssPreview.version || 0);
        }
      }
      state.inspectMode = message.inspectMode === true;
      state.hoverDescriptor = message.hoverFocus || null;
      state.hoverDomPath = message.hoverFocus?.domPath || null;
      const nextSelectionFocus = message.selectionFocus || null;
      if (
        nextSelectionFocus?.domPath
        && nextSelectionFocus.domPath !== state.selectedDomPath
      ) {
        state.selectedDomPath = nextSelectionFocus.domPath;
        state.selectedDescriptor = nextSelectionFocus;
        state.selectedTarget = nextSelectionFocus.nearestSurfaceId || state.selectedTarget || "";
        void refreshInspection({ preferredTarget: state.selectedTarget || "" });
      }
      syncSelectedDescriptorFromHost();
      render();
    };
    channel.postMessage({ kind: "debug-command", command: "publish-snapshot" });
  }

  if (previewSessionId && typeof EventSource === "function") {
    const source = new EventSource("/api/runtime/app-preview-sessions/" + encodeURIComponent(previewSessionId) + "/events");
    source.onmessage = event => {
      try {
        const payload = JSON.parse(event.data || "{}");
        if (payload.status === "deleted") {
          state.session = {
            id: previewSessionId,
            status: "deleted",
            invalidReason: null,
            sources: []
          };
          render();
          return;
        }
        void refreshSession().then(() => {
          if (state.selectedDomPath) return refreshInspection({ preferredTarget: state.selectedTarget || "" });
          return null;
        });
        if (state.lazy.stylesData && state.wcssPreview.sessionId) void loadWcssInspector();
      } catch {}
    };
    source.onerror = () => {
      source.close();
    };
  }

  void refreshSession();
  render();
})();
  `.trim();

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Engentus Debug View</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f172a;
        --panel: #111827;
        --panel-2: #172033;
        --panel-3: #0c1322;
        --text: #e5edf9;
        --muted: #91a2bc;
        --line: rgba(148, 163, 184, 0.2);
        --accent: #38bdf8;
        --accent-soft: rgba(56, 189, 248, 0.16);
        --ok: #86efac;
        --error: #fca5a5;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font: 13px/1.5 "Segoe UI", system-ui, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.08), transparent 28rem),
          linear-gradient(180deg, #0b1220 0%, var(--bg) 100%);
      }
      .debug-shell {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 16px;
        min-height: 100vh;
        padding: 16px;
      }
      .debug-column {
        display: grid;
        gap: 16px;
        align-content: start;
      }
      .debug-card {
        border: 1px solid var(--line);
        border-radius: 16px;
        background: rgba(17, 24, 39, 0.92);
        overflow: hidden;
        box-shadow: 0 16px 40px rgba(15, 23, 42, 0.22);
      }
      .debug-card header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        padding: 14px 16px;
        border-bottom: 1px solid var(--line);
        background: rgba(23, 32, 51, 0.9);
      }
      .debug-card h2 {
        margin: 0;
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .debug-card .meta {
        color: var(--muted);
        font-size: 12px;
      }
      .debug-card .body {
        padding: 16px;
      }
      .debug-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .debug-stat {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.5);
      }
      .debug-stat-label {
        color: var(--muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .debug-stat-value {
        margin-top: 4px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        word-break: break-word;
      }
      .debug-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .debug-pane-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 14px;
      }
      .debug-pane-tabs button[data-active="true"] {
        border-color: rgba(56, 189, 248, 0.65);
        background: rgba(56, 189, 248, 0.18);
      }
      button,
      select,
      textarea,
      input {
        font: inherit;
      }
      button {
        border: 1px solid var(--line);
        background: #1d2840;
        color: var(--text);
        border-radius: 10px;
        padding: 8px 12px;
        cursor: pointer;
      }
      button:hover:not(:disabled) {
        border-color: rgba(56, 189, 248, 0.45);
      }
      button:disabled {
        cursor: default;
        opacity: 0.6;
      }
      select,
      textarea,
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 10px;
        background: var(--panel-3);
        color: var(--text);
      }
      select,
      input {
        padding: 8px 10px;
      }
      textarea {
        min-height: 18rem;
        padding: 12px;
        resize: vertical;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .debug-status {
        min-height: 1.3rem;
      }
      .debug-status[data-tone="error"] {
        color: var(--error);
      }
      .debug-status[data-tone="ok"] {
        color: var(--ok);
      }
      .debug-json-tree,
      .debug-dom-tree {
        display: grid;
        gap: 4px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 12px;
      }
      .debug-json-node,
      .debug-dom-node {
        display: grid;
        gap: 4px;
      }
      .debug-json-line,
      .debug-dom-line {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        flex-wrap: wrap;
      }
      .debug-json-children,
      .debug-dom-children {
        margin-left: 18px;
        display: grid;
        gap: 4px;
        border-left: 1px solid rgba(148, 163, 184, 0.16);
        padding-left: 10px;
      }
      .debug-json-toggle,
      .debug-json-more,
      .debug-json-inline-action,
      .debug-dom-toggle {
        padding: 2px 6px;
        min-height: 0;
        border-radius: 8px;
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        font-size: 11px;
      }
      .debug-json-key {
        color: #93c5fd;
      }
      .debug-json-summary {
        color: #cbd5e1;
      }
      .debug-json-value-string {
        color: #86efac;
      }
      .debug-json-value-number {
        color: #fcd34d;
      }
      .debug-json-value-boolean {
        color: #f9a8d4;
      }
      .debug-json-value-null {
        color: var(--muted);
      }
      .debug-dom-line-selected {
        background: var(--accent-soft);
        border-radius: 10px;
        padding: 4px 6px;
      }
      .debug-dom-line-hover {
        background: rgba(245, 158, 11, 0.12);
        border-radius: 10px;
        padding: 4px 6px;
      }
      .debug-dom-spacer {
        width: 1.5rem;
        color: var(--muted);
        text-align: center;
      }
      .debug-dom-summary {
        flex: 1;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-start;
        align-items: center;
        text-align: left;
        background: transparent;
        padding: 4px 6px;
      }
      .debug-dom-tag { color: #93c5fd; }
      .debug-dom-id { color: #fcd34d; }
      .debug-dom-class { color: #c4b5fd; }
      .debug-dom-meta,
      .debug-dom-text { color: var(--muted); }
      .debug-dom-badge,
      .debug-chip {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 2px 8px;
        color: var(--muted);
        background: rgba(15, 23, 42, 0.5);
        font-size: 11px;
      }
      .debug-chip-active,
      .debug-source-link-active {
        border-color: rgba(56, 189, 248, 0.65);
        background: rgba(56, 189, 248, 0.14);
      }
      .debug-empty {
        color: var(--muted);
      }
      .debug-chip-row {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
      }
      .debug-selection-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }
      .debug-selection-box {
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 10px 12px;
        background: rgba(15, 23, 42, 0.45);
      }
      .debug-selection-box strong,
      .debug-kv-row code {
        font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      }
      .debug-kv-list,
      .debug-source-link-list,
      .debug-annotation-list,
      .debug-fields {
        display: grid;
        gap: 8px;
      }
      .debug-kv-row {
        display: grid;
        grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
        gap: 10px;
        align-items: start;
      }
      .debug-source-link,
      .debug-annotation {
        display: grid;
        gap: 2px;
        text-align: left;
      }
      .debug-source-link strong {
        color: var(--text);
      }
      .debug-source-link span {
        color: var(--muted);
      }
      .debug-field {
        display: grid;
        gap: 6px;
      }
      .debug-field-label {
        color: var(--muted);
        font-size: 12px;
      }
      .debug-inline-error {
        color: var(--error);
        min-height: 1.25rem;
        margin-bottom: 8px;
      }
      .debug-section-title {
        margin: 18px 0 8px;
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--muted);
      }
      @media (max-width: 1200px) {
        .debug-shell {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 720px) {
        .debug-grid,
        .debug-selection-grid {
          grid-template-columns: 1fr;
        }
        .debug-kv-row {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="debug-shell">
      <div class="debug-column">
        <section class="debug-card">
          <header>
            <h2>Session</h2>
            <div class="debug-actions">
              <button type="button" id="debug-request-snapshot">Refresh Mirror</button>
              <button type="button" id="debug-pick-selection">Pick In Tab 1</button>
              <button type="button" id="debug-end-preview">End Preview</button>
            </div>
          </header>
          <div class="body">
            <div class="debug-grid">
              <div class="debug-stat">
                <div class="debug-stat-label">Preview Session</div>
                <div class="debug-stat-value" id="debug-session-id">-</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Preview Status</div>
                <div class="debug-stat-value" id="debug-session-status">pending</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Preview Revision</div>
                <div class="debug-stat-value" id="debug-session-revision">0</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Active Surface</div>
                <div class="debug-stat-value" id="debug-active-surface">-</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Overlay Sources</div>
                <div class="debug-stat-value" id="debug-source-count">0</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">DOM Size</div>
                <div class="debug-stat-value" id="debug-dom-size">0</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Runtime Keys</div>
                <div class="debug-stat-value" id="debug-runtime-keys">0</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Inspect Mode</div>
                <div class="debug-stat-value" id="debug-inspect-mode">idle</div>
              </div>
              <div class="debug-stat">
                <div class="debug-stat-label">Hover Target</div>
                <div class="debug-stat-value" id="debug-hover-target">-</div>
              </div>
            </div>
            <div class="meta" id="debug-session-detail" style="margin-top:12px;"></div>
            <div class="meta debug-status" id="debug-status" style="margin-top:8px;"></div>
            <div class="debug-stat" style="margin-top:12px;">
              <div class="debug-stat-label">Mirrored Route</div>
              <div class="debug-stat-value" id="debug-route">Waiting for Tab 1...</div>
            </div>
          </div>
        </section>

        <section class="debug-card">
          <header>
            <h2>DOM Explorer</h2>
            <div class="debug-actions">
              <button type="button" id="debug-load-dom-tree">Load DOM Tree</button>
            </div>
          </header>
          <div class="body">
            <div class="debug-dom-tree" id="debug-dom-tree"></div>
          </div>
        </section>

        <section class="debug-card">
          <header>
            <h2>Host JSON</h2>
            <div class="debug-actions">
              <button type="button" id="debug-load-host-json">Load JSON</button>
            </div>
          </header>
          <div class="body">
            <div class="debug-json-tree" id="debug-host-json"></div>
          </div>
        </section>

        <section class="debug-card">
          <header>
            <h2>Session JSON</h2>
            <div class="debug-actions">
              <button type="button" id="debug-load-session-json">Load JSON</button>
            </div>
          </header>
          <div class="body">
            <div class="debug-json-tree" id="debug-session-json"></div>
          </div>
        </section>
      </div>

      <div class="debug-column">
        <section class="debug-card">
          <header>
            <h2>Focused Component</h2>
            <div class="debug-actions">
              <button type="button" id="debug-highlight-selection" disabled>Highlight In Tab 1</button>
              <button type="button" id="debug-jump-selection" disabled>Jump In Tab 1</button>
            </div>
          </header>
          <div class="body">
            <div class="debug-empty" id="debug-selection-empty">Select a DOM node from the explorer to inspect and preview-edit its authored properties.</div>
            <div id="debug-selection-panel" hidden>
              <div class="debug-selection-grid">
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Target</div>
                  <div class="debug-stat-value" id="debug-selection-target">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Kind</div>
                  <div class="debug-stat-value" id="debug-selection-kind">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Tag</div>
                  <div class="debug-stat-value" id="debug-selection-tag">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">DOM Path</div>
                  <div class="debug-stat-value" id="debug-selection-path">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Id</div>
                  <div class="debug-stat-value" id="debug-selection-id">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Widget</div>
                  <div class="debug-stat-value" id="debug-selection-widget">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Surface</div>
                  <div class="debug-stat-value" id="debug-selection-surface">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Text</div>
                  <div class="debug-stat-value" id="debug-selection-text">-</div>
                </div>
                <div class="debug-selection-box">
                  <div class="debug-stat-label">Resolver Path</div>
                  <div class="debug-stat-value" id="debug-selection-fallback">direct</div>
                </div>
              </div>
              <div class="meta" id="debug-selection-status" style="margin-bottom:12px;"></div>
              <div class="debug-section-title">Target Breadcrumbs</div>
              <div class="debug-chip-row" id="debug-selection-breadcrumbs"></div>
              <div class="debug-section-title">Candidate Matches</div>
              <div class="debug-source-link-list" id="debug-selection-candidates"></div>
              <div class="debug-pane-tabs">
                <button type="button" id="debug-pane-props" data-active="true">Props</button>
                <button type="button" id="debug-pane-styles" data-active="false">Styles</button>
                <button type="button" id="debug-pane-sources" data-active="false">Sources</button>
                <button type="button" id="debug-pane-runtime" data-active="false">Runtime</button>
              </div>

              <div id="debug-pane-panel-props">
                <div class="debug-section-title">Authored Properties</div>
                <div class="debug-inline-error" id="debug-authored-error" hidden></div>
                <div class="debug-fields" id="debug-authored-props"></div>
              </div>

              <div id="debug-pane-panel-styles" hidden>
                <div class="debug-actions" style="margin-bottom:12px;">
                  <button type="button" id="debug-load-styles">Load Style Inspector</button>
                </div>
                <div class="meta" id="debug-styles-status" style="margin-bottom:12px;"></div>
                <div class="debug-section-title">WCSS Tokens</div>
                <div class="debug-fields" id="debug-style-tokens"></div>
                <div class="debug-section-title">WCSS Style Fields</div>
                <div class="debug-fields" id="debug-style-fields"></div>
                <div class="debug-section-title">Stylesheet Metadata</div>
                <div class="debug-kv-list" id="debug-selection-styles"></div>
                <div class="debug-section-title">Generated CSS</div>
                <div class="debug-source-link-list" id="debug-generated-css-links"></div>
                <div class="debug-json-tree" id="debug-generated-css-view"></div>
              </div>

              <div id="debug-pane-panel-sources" hidden>
                <div class="debug-section-title">Component Source</div>
                <div class="debug-source-link-list" id="debug-component-sources"></div>
                <div class="debug-section-title">Style Source</div>
                <div class="debug-source-link-list" id="debug-style-sources"></div>
                <div class="debug-section-title">DOM Attributes</div>
                <div class="debug-kv-list" id="debug-selection-attrs"></div>
              </div>

              <div id="debug-pane-panel-runtime" hidden>
                <div class="debug-section-title">Runtime Properties</div>
                <div class="debug-kv-list" id="debug-runtime-props"></div>
                <div class="debug-section-title">Runtime + DOM JSON</div>
                <div class="debug-actions" style="margin-bottom:12px;">
                  <button type="button" id="debug-load-runtime-json">Load Runtime JSON</button>
                </div>
                <div class="debug-json-tree" id="debug-runtime-json"></div>
              </div>
            </div>
          </div>
        </section>

        <section class="debug-card">
          <header>
            <h2>Source Editor</h2>
            <div class="meta">Advanced preview source editing</div>
          </header>
          <div class="body">
            <select id="debug-source-select"></select>
            <div class="debug-actions" style="margin: 12px 0;">
              <button type="button" id="debug-load-source-json">Load Source JSON</button>
              <button type="button" id="debug-load-source-editor">Load Source Editor</button>
              <button type="button" id="debug-apply-source">Apply Preview Edit</button>
            </div>
            <div class="debug-json-tree" id="debug-source-json"></div>
            <div class="debug-empty" id="debug-source-editor-hint" style="margin-top:12px;">Load the raw editor only when you need to patch the underlying preview source directly.</div>
            <textarea id="debug-source-editor" spellcheck="false" hidden></textarea>
          </div>
        </section>

        <section class="debug-card">
          <header>
            <h2>Source Annotations</h2>
            <div class="meta">Linked by dsl.source.annotate</div>
          </header>
          <div class="body">
            <div class="debug-annotation-list" id="debug-source-annotations"></div>
          </div>
        </section>
      </div>
    </div>
    <script>${escapeScriptBody(pageScript)}</script>
  </body>
</html>`;
}
