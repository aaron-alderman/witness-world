import test from "node:test";
import assert from "node:assert/strict";
import {
  mcpServerInventoryLabel,
  mcpToolInventoryLabel,
  renderBootstrapStateInventory,
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

test("bootstrap state inventory render fans authored and operator rows into the documented DOM ids", () => {
  const document = createDocument();
  const roots = new Map([
    ["state-contexts", createRoot()],
    ["state-runtime-plugin-availability", createRoot()],
    ["mcp-server-inventory", createRoot()],
    ["state-operator-backups", createRoot()]
  ]);

  renderBootstrapStateInventory({
    authored: {
      contexts: [{ id: "ctx.root" }],
      runtimePluginAvailability: [{ serverRunner: "demo_server", plugin: "plugin.inspect", installed: true }],
      mcp: { servers: [{ id: "mcp.demo", serverRunner: "demo_server", transports: ["stdio"], attachedToActiveRuntime: true }] }
    },
    operator: {
      inventory: {
        backups: [{ id: "backup-1", witnessCount: 3, observationCount: 4 }]
      }
    },
    byId: id => roots.get(id) || null,
    document,
    stateSnapshots: new Map(),
    rowKey: row => row.id || JSON.stringify(row)
  });

  assert.equal(roots.get("state-contexts").children[0].children[0].textContent, "ctx.root");
  assert.equal(roots.get("state-runtime-plugin-availability").children[0].children[0].textContent, "demo_server :: plugin.inspect [installed]");
  assert.equal(roots.get("mcp-server-inventory").children[0].children[0].textContent, "mcp.demo @demo_server [stdio] [active runtime]");
  assert.equal(roots.get("state-operator-backups").children[0].children[0].textContent, "backup-1 / witnesses 3 / observations 4");
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
  assert.equal(factory.includes("const renderBootstrapStateList ="), true);
  assert.equal(factory.includes("const mcpServerInventoryLabel ="), true);
  assert.equal(factory.includes("const mcpToolInventoryLabel ="), true);
  assert.equal(factory.includes("const renderBootstrapStateInventory ="), true);
});
