export const RUNTIME_MUTABLE_SHARING_CLASSES = Object.freeze([
  "personal",
  "shared",
  "mixed"
]);

export const RUNTIME_MUTABLE_STATE_CLASSES = Object.freeze([
  "actor-scoped",
  "perspective-scoped",
  "context-shared"
]);

function cloneStringList(values = []) {
  return Array.isArray(values) ? values.map(value => String(value)) : [];
}

function freezeRow(row = {}) {
  return Object.freeze({
    id: String(row.id || ""),
    surface: String(row.surface || ""),
    title: String(row.title || row.surface || row.id || ""),
    sharingClass: String(row.sharingClass || "mixed"),
    stateClass: String(row.stateClass || "actor-scoped"),
    visibilityRule: String(row.visibilityRule || ""),
    authorityRule: String(row.authorityRule || ""),
    mutationMode: String(row.mutationMode || "direct"),
    variantOf: row.variantOf ? String(row.variantOf) : null,
    readSurfaces: Object.freeze(cloneStringList(row.readSurfaces)),
    mutationSurfaces: Object.freeze(cloneStringList(row.mutationSurfaces)),
    witnessProcesses: Object.freeze(cloneStringList(row.witnessProcesses)),
    sourceFiles: Object.freeze(cloneStringList(row.sourceFiles)),
    variants: Object.freeze(cloneStringList(row.variants)),
    notes: String(row.notes || "")
  });
}

function cloneRow(row = {}) {
  return {
    ...row,
    readSurfaces: cloneStringList(row.readSurfaces),
    mutationSurfaces: cloneStringList(row.mutationSurfaces),
    witnessProcesses: cloneStringList(row.witnessProcesses),
    sourceFiles: cloneStringList(row.sourceFiles),
    variants: cloneStringList(row.variants)
  };
}

const MUTABLE_SURFACE_SEMANTICS_LEDGER = Object.freeze([
  freezeRow({
    id: "mutableSurface:runtime.session",
    surface: "runtime.session",
    title: "Runtime Session",
    sharingClass: "personal",
    stateClass: "actor-scoped",
    visibilityRule: "request-session-private",
    authorityRule: "session-principal",
    mutationMode: "direct",
    readSurfaces: ["/api/session"],
    mutationSurfaces: ["POST /api/session", "DELETE /api/session"],
    witnessProcesses: [],
    sourceFiles: ["src/runtime-session-services.js"],
    notes: "Session identity, effective authority, and defaults remain private to the active request session instead of projecting through shared witnesses."
  }),
  freezeRow({
    id: "mutableSurface:demo.privateNotes",
    surface: "demo.privateNotes",
    title: "Private Notes",
    sharingClass: "personal",
    stateClass: "actor-scoped",
    visibilityRule: "actor-private",
    authorityRule: "request-actor",
    mutationMode: "direct",
    readSurfaces: ["/api/private-notes"],
    mutationSurfaces: ["POST /api/private-notes"],
    witnessProcesses: ["privateNote.create"],
    sourceFiles: ["plugins/demo/projections.js", "plugins/demo/private-notes-runtime.js"],
    notes: "Private note witnesses only project back to the same actor and are hidden from foreign or anonymous views."
  }),
  freezeRow({
    id: "mutableSurface:eden.pageTheme",
    surface: "eden.pageTheme",
    title: "Eden Edit Page Theme",
    sharingClass: "personal",
    stateClass: "actor-scoped",
    visibilityRule: "actor-projected",
    authorityRule: "request-actor",
    mutationMode: "direct",
    readSurfaces: ["GET /api/eden/page-theme", "eden.surface.edit"],
    mutationSurfaces: ["POST /api/eden/page-theme"],
    witnessProcesses: ["edenPageTheme.set"],
    sourceFiles: ["src/runtime-presentation.js", "plugins/eden/eden-projection.js"],
    notes: "Theme witnesses are keyed by actor and page id, so each actor sees their own edit-page treatment while anonymous readers fall back to defaults."
  }),
  freezeRow({
    id: "mutableSurface:demo.todos",
    surface: "demo.todos",
    title: "Demo Todos",
    sharingClass: "shared",
    stateClass: "context-shared",
    visibilityRule: "shared-readable",
    authorityRule: "context-authority-or-proposal",
    mutationMode: "proposal-fallback",
    readSurfaces: ["/api/todos"],
    mutationSurfaces: ["POST /api/todos", "PATCH /api/todos/:id", "DELETE /api/todos/:id"],
    witnessProcesses: ["todo.create", "todo.update", "todo.delete"],
    sourceFiles: ["plugins/demo/projections.js", "plugins/demo/todo-runtime.js"],
    notes: "Todo state is visible as a shared board, while writes require direct context authority or route through witnessed proposals."
  }),
  freezeRow({
    id: "mutableSurface:canvas.perspective",
    surface: "canvas.perspective",
    title: "Canvas Perspective Surface",
    sharingClass: "mixed",
    stateClass: "perspective-scoped",
    visibilityRule: "perspective-or-context-scoped",
    authorityRule: "perspective-owner-or-context-authority",
    mutationMode: "mixed",
    readSurfaces: ["/api/canvas", "/api/perspectives"],
    mutationSurfaces: ["canvas.perspective.create", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    witnessProcesses: ["canvas.perspective.create", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    sourceFiles: ["plugins/canvas/canvas-processes.js"],
    variants: ["mutableSurface:canvas.perspective.personal", "mutableSurface:canvas.perspective.shared"],
    notes: "Perspective state is always anchored to a perspective id, but authority flips between personal ownership and shared context governance depending on whether the perspective is contextless or context-bound."
  }),
  freezeRow({
    id: "mutableSurface:canvas.perspective.personal",
    surface: "canvas.perspective.personal",
    title: "Personal Canvas Perspective",
    sharingClass: "personal",
    stateClass: "perspective-scoped",
    visibilityRule: "perspective-owner-scoped",
    authorityRule: "perspective-owner-or-steward",
    mutationMode: "direct",
    variantOf: "mutableSurface:canvas.perspective",
    readSurfaces: ["/api/canvas", "/api/perspectives"],
    mutationSurfaces: ["canvas.perspective.create", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    witnessProcesses: ["canvas.perspective.create", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    sourceFiles: ["plugins/canvas/canvas-processes.js"],
    notes: "Contextless perspectives mutate through perspective ownership and stewardship rather than shared context authority."
  }),
  freezeRow({
    id: "mutableSurface:canvas.perspective.shared",
    surface: "canvas.perspective.shared",
    title: "Shared Canvas Perspective",
    sharingClass: "shared",
    stateClass: "perspective-scoped",
    visibilityRule: "context-visible",
    authorityRule: "context-authority-or-proposal",
    mutationMode: "proposal-fallback",
    variantOf: "mutableSurface:canvas.perspective",
    readSurfaces: ["/api/canvas", "/api/perspectives"],
    mutationSurfaces: ["POST /api/perspectives", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    witnessProcesses: ["canvas.perspective.create", "canvas.move", "canvas.style", "canvas.remove", "canvas.camera", "canvas.grid", "canvas.batch"],
    sourceFiles: ["plugins/canvas/canvas-processes.js", "src/runtime-governance.js"],
    notes: "Context-bound perspectives move onto shared context authority and proposal fallback instead of staying on actor-only ownership."
  })
]);

export function buildMutableSurfaceSemanticsLedger() {
  return MUTABLE_SURFACE_SEMANTICS_LEDGER.map(cloneRow);
}
