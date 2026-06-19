import test from "node:test";
import assert from "node:assert/strict";
import {
  mcpServerInventoryLabel,
  mcpToolInventoryLabel,
  renderBootstrapStateInventory,
  renderBootstrapStateItems,
  renderBootstrapStateList,
  renderBootstrapStateListRenderFactory
} from "./bootstrap-state-list-render.js";

function createDocument() {
  return {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        textContent: "",
        children: [],
        attributes: new Map(),
        setAttribute(name, value) {
          this.attributes.set(name, value);
        },
        append(...children) {
          this.children.push(...children);
        }
      };
    }
  };
}

function createRoot() {
  return {
    innerHTML: "",
    children: [],
    append(...children) {
      this.children.push(...children);
    }
  };
}

test("bootstrap state list render marks newly added rows after the first render", () => {
  const document = createDocument();
  const root = createRoot();
  const stateSnapshots = new Map();
  const byId = id => id === "state-contexts" ? root : null;

  renderBootstrapStateList({
    id: "state-contexts",
    rows: [{ id: "ctx.root" }],
    label: row => row.id,
    byId,
    document,
    stateSnapshots,
    rowKey: row => row.id
  });
  assert.equal(root.children[0].className, "surface-state-item");
  assert.equal(root.children[0].attributes?.get?.("data-tutorial-changed"), undefined);

  root.children = [];
  renderBootstrapStateList({
    id: "state-contexts",
    rows: [{ id: "ctx.root" }, { id: "ctx.child" }],
    label: row => row.id,
    byId,
    document,
    stateSnapshots,
    rowKey: row => row.id
  });
  assert.equal(root.children[1].attributes.get("data-tutorial-changed"), "true");
});

test("bootstrap state item render writes structured sections without HTML string assembly", () => {
  const document = createDocument();
  const root = createRoot();

  renderBootstrapStateItems({
    id: "runtime-plugin-review-detail",
    items: [
      {
        title: "Operator Summary",
        codes: ["Installed on profile full."],
        actions: [{
          label: "Repair",
          dataset: { runtimePluginReviewActionId: "remove-broken-install" }
        }]
      },
      { emptyText: "Effective runtime composition is unchanged for this action." }
    ],
    byId: id => id === "runtime-plugin-review-detail" ? root : null,
    document
  });

  assert.equal(root.children[0].className, "surface-state-item");
  assert.equal(root.children[0].children[0].textContent, "Operator Summary");
  assert.equal(root.children[0].children[1].textContent, "Installed on profile full.");
  assert.equal(root.children[0].children[2].children[0].dataset.runtimePluginReviewActionId, "remove-broken-install");
  assert.equal(root.children[1].className, "surface-state-item surface-empty");
  assert.equal(root.children[1].textContent, "Effective runtime composition is unchanged for this action.");
});

test("bootstrap state inventory render fans authored and operator rows into the documented DOM ids", () => {
  const document = createDocument();
  const roots = new Map([
    ["state-contexts", createRoot()],
    ["state-collections", createRoot()],
    ["state-surfaces", createRoot()],
    ["state-processes", createRoot()],
    ["state-messages", createRoot()],
    ["state-projections", createRoot()],
    ["state-boundaries", createRoot()],
    ["state-policies", createRoot()],
    ["state-packages", createRoot()],
    ["state-package-apply-previews", createRoot()],
    ["state-runtime-plugin-availability", createRoot()],
    ["mcp-server-inventory", createRoot()],
    ["state-operator-backups", createRoot()],
    ["state-legacy-frontend-retired", createRoot()],
    ["state-legacy-frontend-pending", createRoot()],
    ["state-legacy-frontend-blocked", createRoot()]
  ]);

  renderBootstrapStateInventory({
    authored: {
      contexts: [{ id: "ctx.root" }],
      collections: [{ id: "native_todo_items", context: "frontend" }],
      surfaces: [{ id: "native_todo_surface_root", surfaceKind: "app-root" }],
      processes: [{ id: "nativeTodoProcess", handles: ["nativeTodoRefreshRequested"], emits: ["nativeTodoLoadCommand"] }],
      messages: [{ id: "nativeTodoRefreshRequested", role: "event" }],
      projections: [{ id: "nativeTodoStatusProjection", projectionKind: "format", source: "nativeTodoStatusText" }],
      boundaries: [{ id: "nativeTodoLoadBoundary", operations: [{ name: "nativeTodoLoad" }] }],
      policies: [{ id: "nativeTodoLoadPolicy", subject: "nativeTodoProcess" }],
      packages: [{ id: "package.plugin.inspect", context: "ctx.root", packageKind: "plugin" }],
      packageApplyPreviews: [{ packageId: "package.plugin.inspect", revisionId: "packageRevision.plugin.inspect.v1", status: "ready" }],
      runtimePluginAvailability: [{ serverRunner: "demo_server", plugin: "plugin.inspect", installed: true }],
      mcp: { servers: [{ id: "mcp.demo", serverRunner: "demo_server", transports: ["stdio"], attachedToActiveRuntime: true }] },
      legacyFrontendUplift: {
        retiredRoutes: [{ routeId: "legacy_home", method: "GET", path: "/", retirementKind: "page.home" }],
        pending: [{ id: "legacyFrontendUplift:route:legacy_home", routeId: "legacy_home", kind: "route", action: "route.rewrite" }],
        blocked: [{ id: "legacyFrontendUplift:blocked:legacy_home", routeId: "legacy_home", missingPrimitive: "manual rewrite required" }]
      }
    },
    operator: {
      inventory: {
        backups: [{ id: "backup-1", witnessCount: 3, observationCount: 4, createdAt: "2026-06-19T00:00:00Z", compatibility: { platformVersion: "v1" } }]
      }
    },
    byId: id => roots.get(id) || null,
    document,
    stateSnapshots: new Map(),
    rowKey: row => row.id || JSON.stringify(row)
  });

  assert.equal(roots.get("state-contexts").children[0].className, "surface-state-item");
  assert.equal(roots.get("state-contexts").children[0].children[0].textContent, "ctx.root");
  assert.equal(roots.get("state-collections").children[0].children[0].textContent, "native_todo_items @frontend");
  assert.equal(roots.get("state-surfaces").children[0].children[0].textContent, "native_todo_surface_root [app-root]");
  assert.equal(roots.get("state-processes").children[0].children[0].textContent, "nativeTodoProcess handles 1 emits 1");
  assert.equal(roots.get("state-messages").children[0].children[0].textContent, "nativeTodoRefreshRequested [event]");
  assert.equal(roots.get("state-projections").children[0].children[0].textContent, "nativeTodoStatusProjection [format] -> nativeTodoStatusText");
  assert.equal(roots.get("state-boundaries").children[0].children[0].textContent, "nativeTodoLoadBoundary -> nativeTodoLoad");
  assert.equal(roots.get("state-policies").children[0].children[0].textContent, "nativeTodoLoadPolicy -> nativeTodoProcess");
  assert.equal(roots.get("state-packages").children[0].children[0].textContent, "package.plugin.inspect @ctx.root [plugin]");
  assert.equal(roots.get("state-package-apply-previews").children[0].children[0].textContent, "package.plugin.inspect :: packageRevision.plugin.inspect.v1 [ready]");
  assert.equal(roots.get("state-runtime-plugin-availability").children[0].children[0].textContent, "demo_server :: plugin.inspect [installed]");
  assert.equal(roots.get("mcp-server-inventory").children[0].children[0].textContent, "mcp.demo @demo_server [stdio] [active runtime]");
  assert.equal(roots.get("state-operator-backups").children[0].children[0].textContent, "backup-1 [v:v1] / 2026-06-19 / 3w 4o");
  assert.equal(roots.get("state-legacy-frontend-retired").children[0].children[0].textContent, "legacy_home GET / [page.home]");
  assert.equal(roots.get("state-legacy-frontend-pending").children[0].children[0].textContent, "legacy_home :: route / route.rewrite / legacyFrontendUplift:route:legacy_home");
  assert.equal(roots.get("state-legacy-frontend-blocked").children[0].children[0].textContent, "legacy_home :: manual rewrite required");
});

test("bootstrap state inventory render derives operator lineage basenames without node path at browser runtime", () => {
  const document = createDocument();
  const roots = new Map([
    ["state-operator-exports", createRoot()]
  ]);

  renderBootstrapStateInventory({
    authored: {},
    operator: {
      inventory: {
        exports: [{
          id: "export-1",
          witnessCount: 2,
          observationCount: 1,
          createdAt: "2026-06-19T00:00:00Z",
          lineage: { worldHome: "C:\\tmp\\world-home" },
          compatibility: { platformVersion: "v1" }
        }]
      }
    },
    byId: id => roots.get(id) || null,
    document,
    stateSnapshots: new Map(),
    rowKey: row => row.id || JSON.stringify(row)
  });

  assert.equal(roots.get("state-operator-exports").children[0].children[0].textContent, "export-1 (from world-home) [v:v1] / 2026-06-19 / 2w 1o");
});

test("bootstrap state list helpers expose inventory labels and browser factory source", () => {
  assert.equal(
    mcpServerInventoryLabel({ id: "mcp.demo", serverRunner: "demo_server", transports: ["stdio"], attachedToActiveRuntime: true }),
    "mcp.demo @demo_server [stdio] [active runtime]"
  );
  assert.equal(
    mcpToolInventoryLabel({ id: "mcp.demo", tools: [{ tool: "world.read", actingMode: "delegated" }] }),
    "mcp.demo -> world.read [delegated]"
  );

  const factory = renderBootstrapStateListRenderFactory();
  assert.equal(factory.includes("const renderBootstrapStateItems ="), true);
  assert.equal(factory.includes("const bootstrapStatePortableBasename ="), true);
  assert.equal(factory.includes("const renderBootstrapStateList ="), true);
  assert.equal(factory.includes("const mcpServerInventoryLabel ="), true);
  assert.equal(factory.includes("const mcpToolInventoryLabel ="), true);
  assert.equal(factory.includes("const renderBootstrapStateInventory ="), true);
});
