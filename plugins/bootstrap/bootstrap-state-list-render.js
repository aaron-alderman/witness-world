import path from "node:path";

export function renderBootstrapStateListRenderFactory() {
  return String.raw`
    const renderBootstrapStateItems = ${renderBootstrapStateItems.toString()};
    const renderBootstrapStateList = ${renderBootstrapStateList.toString()};
    const mcpServerInventoryLabel = ${mcpServerInventoryLabel.toString()};
    const mcpToolInventoryLabel = ${mcpToolInventoryLabel.toString()};
    const renderBootstrapStateInventory = ${renderBootstrapStateInventory.toString()};
  `;
}

export function renderBootstrapStateItems({
  id,
  items = [],
  byId = () => null,
  document = null
} = {}) {
  const root = byId(id);
  if (!root || !document?.createElement) return;
  root.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "surface-state-item surface-empty";
    empty.textContent = "None yet.";
    root.append(empty);
    return;
  }
  for (const spec of items) {
    const item = document.createElement("div");
    item.className = spec.className || (spec.emptyText ? "surface-state-item surface-empty" : "surface-state-item");
    if (spec.emptyText) {
      item.textContent = spec.emptyText;
      root.append(item);
      continue;
    }
    if (spec.title) {
      const title = document.createElement("strong");
      title.textContent = spec.title;
      item.append(title);
    }
    for (const text of spec.codes || []) {
      const code = document.createElement("code");
      code.textContent = text;
      item.append(code);
    }
    root.append(item);
  }
}

export function renderBootstrapStateList({
  id,
  rows = [],
  label = row => String(row),
  byId = () => null,
  document = null,
  stateSnapshots = new Map(),
  rowKey = row => JSON.stringify(row)
} = {}) {
  const root = byId(id);
  if (!root) return;
  const previousKeys = stateSnapshots.get(id) || new Set();
  const nextKeys = new Set();
  root.innerHTML = "";
  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "surface-state-item surface-empty";
    empty.textContent = "None yet.";
    root.append(empty);
    stateSnapshots.set(id, nextKeys);
    return;
  }
  for (const row of rows) {
    const key = rowKey(row);
    nextKeys.add(key);
    const item = document.createElement("div");
    item.className = "surface-state-item";
    if (previousKeys.size && !previousKeys.has(key)) item.setAttribute("data-tutorial-changed", "true");
    const title = document.createElement("strong");
    title.textContent = label(row);
    const code = document.createElement("code");
    code.textContent = JSON.stringify(row, null, 2);
    item.append(title, code);
    root.append(item);
  }
  stateSnapshots.set(id, nextKeys);
}

export function mcpServerInventoryLabel(row = {}) {
  const transports = (row.transports || []).join(", ") || "none";
  const runtimeState = row.attachedToActiveRuntime ? "active runtime" : "authored only";
  const path = row.httpPath ? " -> " + row.httpPath : "";
  return row.id + " @" + (row.serverRunner || "no runner") + " [" + transports + "] [" + runtimeState + "]" + path;
}

export function mcpToolInventoryLabel(row = {}) {
  const summary = (row.tools || []).map(tool => tool.tool + " [" + tool.actingMode + "]").join(", ");
  return row.id + " -> " + (summary || "no installed tools");
}

export function renderBootstrapStateInventory({
  authored = {},
  operator = {},
  byId = () => null,
  document = null,
  stateSnapshots = new Map(),
  rowKey = row => JSON.stringify(row),
  renderStateListFn = renderBootstrapStateList
} = {}) {
  const renderList = (id, rows, label) => renderStateListFn({
    id,
    rows,
    label,
    byId,
    document,
    stateSnapshots,
    rowKey
  });

  renderList("state-contexts", authored.contexts || [], row => row.id + (row.parent ? " <- " + row.parent : "") + ((row.capabilities || []).length ? " -> " + row.capabilities.join(", ") : ""));
  renderList("state-context-bindings", authored.contextBindings || [], row => row.context + " :: " + row.name + " -> " + row.target);
  renderList("state-context-exports", authored.contextExports || [], row => row.context + " :: " + row.name + " -> " + row.target);
  renderList("state-context-imports", authored.contextImports || [], row => row.context + " <- " + row.sourceContext + " :: " + row.name + " => " + row.exportName);
  renderList("state-context-scopes", authored.contextScopes || [], row => row.context + " :: " + row.name + " -> " + row.target + (row.sourceKind === "import" ? " [import]" : " [local]"));
  renderList("state-context-name-resolutions", authored.contextNameResolutions || [], row => row.context + " :: " + row.name + " -> " + (row.target || row.targets?.join(", ") || "(none)") + " [" + row.resolution + "]");
  renderList("state-context-name-conflicts", authored.contextNameConflicts || [], row => row.context + " :: " + row.name + " -> " + ((row.targets || []).join(", ") || "(none)") + " [conflict]");
  renderList("state-perspectives", authored.perspectives || [], row => row.id + (row.context ? " @" + row.context : ""));
  renderList("state-stewardships", authored.stewardships || [], row => row.steward + " -> " + row.target);
  renderList("state-proposals", authored.proposals || [], row => row.id + " [" + row.status + "] " + row.targetProcess);
  renderList("state-packages", authored.packages || [], row => row.id + (row.context ? " @" + row.context : "") + (row.packageKind ? " [" + row.packageKind + "]" : ""));
  renderList("state-package-revisions", authored.packageRevisions || [], row =>
    row.id + " -> " + row.package + (row.version ? " [" + row.version + "]" : "") + (row.status ? " [" + row.status + "]" : "")
  );
  renderList("state-package-patches", authored.packagePatches || [], row =>
    row.id + " -> " + row.revision + " :: " + row.path + (row.operation ? " [" + row.operation + "]" : "")
  );
  renderList("state-package-namespaces", authored.packageNamespaces || [], row =>
    row.id + " -> " + row.package + (row.context ? " @" + row.context : "") + (row.revision ? " [" + row.revision + "]" : "")
  );
  renderList("state-package-dependencies", authored.packageDependencies || [], row =>
    row.id + " :: " + row.sourceRevision + " -> " + row.targetKind + " " + row.targetId
  );
  renderList("state-package-transformers", authored.packageTransformers || [], row =>
    row.id + " :: " + (row.sourceNamespace || row.sourceRevision || "(none)") + " -> " + (row.targetNamespace || row.targetRevision || "(none)")
  );
  renderList("state-package-coexistence", authored.packageCoexistence || [], row =>
    row.packageId + " [" + (row.coexistenceMode || "unknown") + "] -> " + (((row.selectedRevisionIds || []).join(", ")) || "(none)")
  );
  renderList("state-package-convergence", authored.packageConvergence || [], row =>
    row.packageId + " [" + (row.status || "unknown") + "] -> " + (((row.transformerIds || []).join(", ")) || "(no transformers)")
  );
  renderList("state-package-apply-previews", authored.packageApplyPreviews || [], row =>
    row.packageId + " :: " + row.revisionId + " [" + (row.status || "unknown") + "]"
  );
  renderList("state-authority", authored.authority ? [
    "actor: " + (authored.authority.actor || "(none)"),
    "contexts: " + (authored.authority.mutationContexts || []).join(", ")
  ] : [], row => row);
  renderList("state-identities", authored.identities || [], row => row.id + " -> " + row.actor);
  renderList("state-widgets", authored.widgets || [], row => row.id + " (" + row.kind + ")");
  renderList("state-programs", authored.frontendPrograms || [], row => row.id + " -> " + row.rootWidget);
  renderList("state-steps", authored.frontendSteps || [], row => row.program + " / " + row.event + " / " + row.op + " / " + row.order);
  renderList("state-backend-programs", authored.backendPrograms || [], row => row.soul + (row.context ? " @" + row.context : ""));
  renderList("state-backend-program-versions", authored.backendProgramVersions || [], row => row.version + " -> " + row.soul + (row.active ? " [active]" : ""));
  renderList("state-backend-steps", authored.backendSteps || [], row => row.version + " / " + row.event + " / " + row.op + " / " + row.order);
  renderList("state-routes", authored.routes || [], row => row.id + " " + row.method + " " + row.path + (row.params?.backendProgramSoul ? " -> " + row.params.backendProgramSoul : ""));
  renderList("state-serves", authored.servedRoutes || [], row => row.serverRunner + " -> " + row.id);
  renderList("state-runners", authored.serverRunners || [], row => row.id + (row.handlerSet ? " [" + row.handlerSet + "]" : ""));
  renderList("state-capabilities", authored.capabilityCatalog || [], row => row.id + (row.placement?.length ? " -> " + row.placement.join(", ") : ""));
  renderList("state-capability-installs", authored.capabilityInstalls || [], row => row.targetKind + " " + row.target + " -> " + row.capability);
  renderList("state-runtime-plugin-installs", authored.runtimePluginInstalls || [], row => row.serverRunner + " -> " + row.plugin);
  renderList("state-runtime-plugin-availability", authored.runtimePluginAvailability || [], row => row.serverRunner + " :: " + row.plugin + (row.installed ? " [installed]" : (row.installable ? " [installable]" : " [blocked]")));
  renderList("mcp-server-inventory", authored.mcp?.servers || [], mcpServerInventoryLabel);
  renderList("mcp-tool-inventory", (authored.mcp?.servers || []).filter(row => (row.tools || []).length), mcpToolInventoryLabel);
  renderList("state-mcp-servers", authored.mcp?.servers || [], mcpServerInventoryLabel);
  renderList("state-mcp-tool-installs", (authored.mcp?.servers || []).filter(row => (row.tools || []).length), mcpToolInventoryLabel);
  renderList("state-operator-backups", operator.inventory?.backups || [], row => {
    const lineage = row.lineage?.worldHome ? ` (from ${path.basename(row.lineage.worldHome)})` : "";
    const comp = row.compatibility?.platformVersion ? ` [v:${row.compatibility.platformVersion}]` : "";
    const warning = row.compatibility?.platformVersion !== "v1" ? " [WARN: Incompatible]" : "";
    return `${row.id}${lineage}${comp}${warning} / ${row.createdAt?.slice(0, 10) || "unknown"} / ${row.witnessCount}w ${row.observationCount}o`;
  });
  renderList("state-operator-exports", operator.inventory?.exports || [], row => {
    const lineage = row.lineage?.worldHome ? ` (from ${path.basename(row.lineage.worldHome)})` : "";
    const comp = row.compatibility?.platformVersion ? ` [v:${row.compatibility.platformVersion}]` : "";
    const warning = row.compatibility?.platformVersion !== "v1" ? " [WARN: Incompatible]" : "";
    return `${row.id}${lineage}${comp}${warning} / ${row.createdAt?.slice(0, 10) || "unknown"} / ${row.witnessCount}w ${row.observationCount}o`;
  });
  renderList("state-operator-imports", operator.inventory?.imports || [], row => {
    const comp = row.compatibility?.platformVersion ? ` [v:${row.compatibility.platformVersion}]` : "";
    const warning = row.compatibility?.platformVersion !== "v1" ? " [WARN: Incompatible]" : "";
    return `${row.id}${comp}${warning} / ${row.status || "unknown"}`;
  });
  renderList("state-operator-activity", operator.recentActivity || [], row => row.process + " / " + (row.body?.artifactId || row.id));
}
