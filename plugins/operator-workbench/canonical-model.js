function freezeRows(rows = []) {
  return Object.freeze(rows.map(row => Object.freeze({ ...row })));
}

function indexById(rows = []) {
  return new Map(rows.map(row => [row.id, row]));
}

export const OPERATOR_CANONICAL_ROOTS = freezeRows([
  {
    id: "workbench",
    label: "Workbench",
    summary: "Operator-local session, views, pane state, viewport state, and display controls."
  },
  {
    id: "things",
    label: "Things",
    summary: "Addressable objects, runtimes, artifacts, and named object families."
  },
  {
    id: "types",
    label: "Types",
    summary: "Declared shapes, classifications, policies, and reusable semantic categories."
  },
  {
    id: "relationships",
    label: "Relationships",
    summary: "Explicit edges, visibility rules, authority links, and attachment/install structure."
  },
  {
    id: "commands",
    label: "Commands",
    summary: "Intent-bearing actions, messages, queries, and execution verbs."
  },
  {
    id: "witnesses",
    label: "Witnesses",
    summary: "Evidence, traces, source-backed artifacts, and proof of current state."
  }
]);

export const OPERATOR_CANONICAL_DOMAINS = freezeRows([
  { id: "contexts", label: "Contexts", rootId: "things", family: "identity" },
  { id: "environments", label: "Environments", rootId: "things", family: "identity" },
  { id: "actors", label: "Actors", rootId: "things", family: "identity" },
  { id: "entities", label: "Entities", rootId: "things", family: "core" },
  { id: "collections", label: "Collections", rootId: "things", family: "core" },
  { id: "capabilities", label: "Capabilities", rootId: "things", family: "core" },
  { id: "processes", label: "Processes", rootId: "things", family: "core" },
  { id: "modules", label: "Modules", rootId: "things", family: "core" },
  { id: "messages", label: "Messages", rootId: "commands", family: "interaction" },
  { id: "events", label: "Events", rootId: "commands", family: "interaction" },
  { id: "queries", label: "Queries", rootId: "commands", family: "interaction" },
  { id: "commands", label: "Commands", rootId: "commands", family: "interaction" },
  { id: "views", label: "Views", rootId: "things", family: "frontend" },
  { id: "projections", label: "Projections", rootId: "things", family: "frontend" },
  { id: "routes", label: "Routes", rootId: "things", family: "frontend" },
  { id: "surfaces", label: "Surfaces", rootId: "things", family: "frontend" },
  { id: "widgets", label: "Widgets", rootId: "things", family: "frontend" },
  { id: "stores", label: "Stores", rootId: "things", family: "frontend" },
  { id: "plugins", label: "Plugins", rootId: "things", family: "runtime" },
  { id: "bundles", label: "Bundles", rootId: "things", family: "runtime" },
  { id: "packages", label: "Packages", rootId: "things", family: "runtime" },
  { id: "packageRevisions", label: "Package Revisions", rootId: "things", family: "runtime" },
  { id: "packagePatches", label: "Package Patches", rootId: "things", family: "runtime" },
  { id: "packageNamespaces", label: "Package Namespaces", rootId: "relationships", family: "runtime" },
  { id: "packageTransformers", label: "Package Transformers", rootId: "things", family: "runtime" },
  { id: "serverRunners", label: "Server Runners", rootId: "things", family: "runtime" },
  { id: "mcpServers", label: "MCP Servers", rootId: "things", family: "runtime" },
  { id: "materializedViews", label: "Materialized Views", rootId: "things", family: "runtime" },
  { id: "runtimePreload", label: "Runtime Preload", rootId: "things", family: "runtime" },
  { id: "runtimeProfiles", label: "Runtime Profiles", rootId: "things", family: "runtime" },
  { id: "types", label: "Types", rootId: "types", family: "schema" },
  { id: "traits", label: "Traits", rootId: "types", family: "schema" },
  { id: "valueTypes", label: "Value Types", rootId: "types", family: "schema" },
  { id: "processSpecs", label: "Process Specs", rootId: "types", family: "schema" },
  { id: "policies", label: "Policies", rootId: "types", family: "governance" },
  { id: "authRoles", label: "Auth Roles", rootId: "types", family: "governance" },
  { id: "appFeatureAccessPolicies", label: "App Feature Access Policies", rootId: "types", family: "governance" },
  { id: "graphEntityTypes", label: "Graph Entity Types", rootId: "types", family: "graph" },
  { id: "graphEdgeTypes", label: "Graph Edge Types", rootId: "types", family: "graph" },
  { id: "vocabulary", label: "Vocabulary", rootId: "types", family: "schema" },
  { id: "relationships", label: "Relationships", rootId: "relationships", family: "core" },
  { id: "boundaries", label: "Boundaries", rootId: "relationships", family: "core" },
  { id: "graphEdges", label: "Graph Edges", rootId: "relationships", family: "graph" },
  { id: "coverageEdges", label: "Coverage Edges", rootId: "relationships", family: "graph" },
  { id: "identityRoleGrants", label: "Identity Role Grants", rootId: "relationships", family: "governance" },
  { id: "docs", label: "Docs", rootId: "things", family: "evidence-artifact" },
  { id: "folders", label: "Folders", rootId: "things", family: "artifact" },
  { id: "files", label: "Files", rootId: "things", family: "artifact" },
  { id: "tasks", label: "Tasks", rootId: "things", family: "artifact" },
  { id: "telemetryMetrics", label: "Telemetry Metrics", rootId: "things", family: "artifact" },
  { id: "api", label: "API", rootId: "things", family: "artifact" },
  { id: "witnesses", label: "Witnesses", rootId: "witnesses", family: "evidence" },
  { id: "docSections", label: "Doc Sections", rootId: "witnesses", family: "evidence" },
  { id: "docReferences", label: "Doc References", rootId: "witnesses", family: "evidence" },
  { id: "testFiles", label: "Test Files", rootId: "witnesses", family: "evidence" },
  { id: "testGates", label: "Test Gates", rootId: "witnesses", family: "evidence" },
  { id: "wtomlSources", label: "WTOML Sources", rootId: "witnesses", family: "evidence" },
  { id: "rvmSources", label: "RVM Sources", rootId: "witnesses", family: "evidence" },
  { id: "wcssSources", label: "WCSS Sources", rootId: "witnesses", family: "evidence" },
  { id: "jsonSources", label: "JSON Sources", rootId: "witnesses", family: "evidence" },
  { id: "roadmaps", label: "Roadmaps", rootId: "witnesses", family: "evidence" },
  { id: "intentNodes", label: "Intent Nodes", rootId: "witnesses", family: "evidence" },
  { id: "testEnvironments", label: "Test Environments", rootId: "witnesses", family: "evidence" },
  { id: "compatibilityBridges", label: "Compatibility Bridges", rootId: "witnesses", family: "evidence" },
  { id: "mutableSurfaces", label: "Mutable Surfaces", rootId: "witnesses", family: "evidence" }
]);

export const OPERATOR_SESSION_SIDECAR_FIELDS = freezeRows([
  { id: "selection", label: "Selection", summary: "Active record/row target and implicit this-resolution." },
  { id: "focus", label: "Focus", summary: "Current semantic focus root and return path." },
  { id: "aliases", label: "Aliases", summary: "Operator-local labels for targets." },
  { id: "notes", label: "Notes", summary: "Operator-local notes and scratch state." },
  { id: "previewSession", label: "Preview Session", summary: "Detached preview-read or preview-write session lifecycle state." },
  { id: "savedViews", label: "Saved Views", summary: "Session-only result view presets and viewport jumps." },
  { id: "history", label: "History", summary: "Executed command history and replay metadata." },
  { id: "undoRedo", label: "Undo / Redo", summary: "Reversible operator actions and mutation replay bookkeeping." },
  { id: "paneState", label: "Pane State", summary: "Focused pane, section cursors, collapsed sections, and overlay state." },
  { id: "viewportLayout", label: "Viewport Layout", summary: "Pane sizes, split positions, and window-local presentation state." },
  { id: "displaySettings", label: "Display Settings", summary: "Font, density, color mode, and presentation preferences." },
  { id: "sourceView", label: "Source View", summary: "Current source representation and cursor state." },
  { id: "provenanceView", label: "Provenance View", summary: "Current provenance representation and cursor state." }
]);

export const OPERATOR_ACTION_FAMILIES = freezeRows([
  { id: "inspect", layer: "ontology", summary: "Read the current target and its canonical properties." },
  { id: "open", layer: "ontology", summary: "Follow a target into its default primary representation." },
  { id: "link", layer: "ontology", summary: "Resolve canonical addresses and typed references." },
  { id: "search", layer: "ontology", summary: "Discover targets across the canonical model or a scoped projection." },
  { id: "filter", layer: "session-sidecar", summary: "Narrow a current result view without changing ontology truth." },
  { id: "sort", layer: "session-sidecar", summary: "Order a current result view without changing ontology truth." },
  { id: "navigate", layer: "session-sidecar", summary: "Move focus, selection, cursor, and semantic location." },
  { id: "rename", layer: "commands", summary: "Issue a sanctioned rename or relabel command." },
  { id: "edit", layer: "commands", summary: "Issue a sanctioned mutation through the canonical write lane." },
  { id: "help", layer: "session-sidecar", summary: "Open contextual guidance tied to the active ontology target." },
  { id: "reference", layer: "ontology", summary: "Traverse typed references and dependency edges." },
  { id: "source", layer: "witnesses", summary: "Open authored/runtime source-backed evidence." },
  { id: "provenance", layer: "witnesses", summary: "Open trace/proof-backed evidence." }
]);

export const OPERATOR_FOLLOW_ON_PHASES = Object.freeze({
  layout: freezeRows([
    { id: "window", label: "Window" },
    { id: "split", label: "Split" },
    { id: "panel", label: "Panel" },
    { id: "viewport", label: "Viewport" },
    { id: "overlay", label: "Overlay" },
    { id: "handle", label: "Handle" },
    { id: "chrome", label: "Chrome" }
  ]),
  appearance: freezeRows([
    { id: "table", label: "Table" },
    { id: "list", label: "List" },
    { id: "tree", label: "Tree" },
    { id: "reader", label: "Reader" },
    { id: "propertyGrid", label: "Property Grid" },
    { id: "linkStyle", label: "Link Style" },
    { id: "selectionMode", label: "Selection Mode" },
    { id: "colorRole", label: "Color Role" },
    { id: "density", label: "Density" },
    { id: "glyphPolicy", label: "Glyph Policy" },
    { id: "copyPaste", label: "Copy / Paste" }
  ])
});

export const OPERATOR_WORKBENCH_FORM_MAPPINGS = freezeRows([
  { id: "operator_theme", layer: "presentation-appearance-follow-on", targetId: "colorRole", summary: "Legacy workbench appearance theme adapter." },
  { id: "operator_dataset", layer: "session-sidecar", targetId: "savedViews", summary: "Legacy row/column projection and primary-action adapter." },
  { id: "operator_screen", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Legacy right/left pane screen adapter." },
  { id: "operator_screen_section", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Legacy sectional subdivision inside a panel." },
  { id: "operator_overlay", layer: "presentation-layout-follow-on", targetId: "overlay", summary: "Legacy overlay surface adapter." },
  { id: "operator_handle", layer: "presentation-layout-follow-on", targetId: "handle", summary: "Legacy splitter handle adapter." },
  { id: "operator_surface", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Legacy status/command strip adapter." },
  { id: "operator_viewport", layer: "presentation-layout-follow-on", targetId: "viewport", summary: "Legacy one-viewport layout adapter." },
  { id: "operator_layout", layer: "workbench", targetId: "layout", summary: "Named authored layout catalog seam for split-tree snapshots." },
  { id: "operator_keymap", layer: "workbench", targetId: "keymap", summary: "Named authored keymap catalog seam for semantic bindings and panel overrides." },
  { id: "operator_setup", layer: "session-sidecar", targetId: "paneState", summary: "Legacy launcher/setup adapter for default screen and shortcut state." },
  { id: "operator_action", layer: "commands", targetId: "edit", summary: "Typed authored action seam for bindings, menus, and primary activation." },
  { id: "operator_menu", layer: "presentation-layout-follow-on", targetId: "overlay", summary: "Typed authored menu seam for contextual action groups." },
  { id: "operator_split", layer: "presentation-layout-follow-on", targetId: "split", summary: "Canonical split-tree authoring seam." },
  { id: "operator_panel", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Canonical panel authoring seam." },
  { id: "operator_content", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Canonical content payload seam for panels and sections." },
  { id: "operator_chrome", layer: "presentation-layout-follow-on", targetId: "chrome", summary: "Canonical top/bottom chrome seam." },
  { id: "operator_window", layer: "presentation-layout-follow-on", targetId: "window", summary: "Canonical window root and binding seam." }
]);

export const OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS = freezeRows([
  { id: "operator_theme", layer: "presentation-appearance-follow-on", targetId: "colorRole", summary: "Browser prototype theme input." },
  { id: "operator_action", layer: "commands", targetId: "edit", summary: "Browser prototype action input." },
  { id: "operator_menu", layer: "presentation-layout-follow-on", targetId: "overlay", summary: "Browser prototype menu input." },
  { id: "operator_content", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Browser prototype content input." },
  { id: "operator_panel", layer: "presentation-layout-follow-on", targetId: "panel", summary: "Browser prototype panel input." },
  { id: "operator_chrome", layer: "presentation-layout-follow-on", targetId: "chrome", summary: "Browser prototype chrome input." },
  { id: "operator_overlay", layer: "presentation-layout-follow-on", targetId: "overlay", summary: "Browser prototype overlay input." },
  { id: "operator_handle", layer: "presentation-layout-follow-on", targetId: "handle", summary: "Browser prototype handle input." },
  { id: "operator_split", layer: "presentation-layout-follow-on", targetId: "split", summary: "Browser prototype split input." },
  { id: "operator_window", layer: "presentation-layout-follow-on", targetId: "window", summary: "Browser prototype window input." },
  { id: "operator_setup", layer: "session-sidecar", targetId: "paneState", summary: "Browser prototype setup input." }
]);

export const OPERATOR_LEGACY_BROWSE_ROOTS = freezeRows([
  { id: "session", label: "Session", layer: "session-sidecar" },
  { id: "world", label: "World", layer: "legacy-browse-projection" },
  { id: "platform", label: "Platform", layer: "legacy-browse-projection" }
]);

export const OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS = freezeRows([
  { projection: "world", id: "context", targetDomainId: "contexts" },
  { projection: "world", id: "surface", targetDomainId: "surfaces", followOnPhase: "layout" },
  { projection: "world", id: "process", targetDomainId: "processes" },
  { projection: "world", id: "capability", targetDomainId: "capabilities" },
  { projection: "world", id: "widget", targetDomainId: "widgets", followOnPhase: "layout" },
  { projection: "world", id: "layout", targetDomainId: "surfaces", followOnPhase: "layout" },
  { projection: "world", id: "entity", targetDomainId: "entities" },
  { projection: "world", id: "message", targetDomainId: "messages" },
  { projection: "world", id: "boundary", targetDomainId: "boundaries" },
  { projection: "world", id: "store", targetDomainId: "stores" },
  { projection: "world", id: "projection", targetDomainId: "projections" },
  { projection: "world", id: "policy", targetDomainId: "policies" },
  { projection: "world", id: "type", targetDomainId: "types" },
  { projection: "world", id: "module", targetDomainId: "modules" },
  { projection: "world", id: "thing", targetDomainId: "entities" },
  { projection: "world", id: "witness", targetDomainId: "witnesses" },
  { projection: "world", id: "trait", targetDomainId: "traits" },
  { projection: "world", id: "valueType", targetDomainId: "valueTypes" },
  { projection: "world", id: "processSpec", targetDomainId: "processSpecs" },
  { projection: "world", id: "graphNode", targetDomainId: "entities" },
  { projection: "world", id: "graphEdge", targetDomainId: "graphEdges" },
  { projection: "world", id: "graphEntityType", targetDomainId: "graphEntityTypes" },
  { projection: "world", id: "graphEdgeType", targetDomainId: "graphEdgeTypes" },
  { projection: "world", id: "api", targetDomainId: "api" },
  { projection: "world", id: "vocabulary", targetDomainId: "vocabulary" },
  { projection: "platform", id: "plugin", targetDomainId: "plugins" },
  { projection: "platform", id: "bundle", targetDomainId: "bundles" },
  { projection: "platform", id: "doc", targetDomainId: "docs" },
  { projection: "platform", id: "folder", targetDomainId: "folders" },
  { projection: "platform", id: "task", targetDomainId: "tasks" },
  { projection: "platform", id: "testGate", targetDomainId: "testGates" },
  { projection: "platform", id: "testFile", targetDomainId: "testFiles" },
  { projection: "platform", id: "docSection", targetDomainId: "docSections" },
  { projection: "platform", id: "docReference", targetDomainId: "docReferences" },
  { projection: "platform", id: "wtomlSource", targetDomainId: "wtomlSources" },
  { projection: "platform", id: "rvmSource", targetDomainId: "rvmSources" },
  { projection: "platform", id: "wcssSource", targetDomainId: "wcssSources" },
  { projection: "platform", id: "fileSource", targetDomainId: "files" },
  { projection: "platform", id: "jsonSource", targetDomainId: "jsonSources" },
  { projection: "platform", id: "profile", targetDomainId: "runtimeProfiles" },
  { projection: "platform", id: "telemetryMetric", targetDomainId: "telemetryMetrics" },
  { projection: "platform", id: "compatibilityBridge", targetDomainId: "compatibilityBridges" },
  { projection: "platform", id: "boundary", targetDomainId: "boundaries" },
  { projection: "platform", id: "roadmap", targetDomainId: "roadmaps" },
  { projection: "platform", id: "intent", targetDomainId: "intentNodes" },
  { projection: "platform", id: "testEnvironment", targetDomainId: "testEnvironments" },
  { projection: "platform", id: "coverageEdge", targetDomainId: "coverageEdges" },
  { projection: "platform", id: "mutableSurface", targetDomainId: "mutableSurfaces", followOnPhase: "appearance" }
]);

export const OPERATOR_CANONICAL_MODEL = Object.freeze({
  roots: OPERATOR_CANONICAL_ROOTS,
  domains: OPERATOR_CANONICAL_DOMAINS,
  sessionSidecar: OPERATOR_SESSION_SIDECAR_FIELDS,
  actions: OPERATOR_ACTION_FAMILIES,
  followOnPhases: OPERATOR_FOLLOW_ON_PHASES,
  adapters: Object.freeze({
    workbenchForms: OPERATOR_WORKBENCH_FORM_MAPPINGS,
    browserPrototypeForms: OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS
  }),
  legacyBrowse: Object.freeze({
    roots: OPERATOR_LEGACY_BROWSE_ROOTS,
    groupMappings: OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS
  })
});

export const OPERATOR_CANONICAL_ROOTS_BY_ID = indexById(OPERATOR_CANONICAL_ROOTS);
export const OPERATOR_CANONICAL_DOMAINS_BY_ID = indexById(OPERATOR_CANONICAL_DOMAINS);
