import assert from "node:assert/strict";
import test from "node:test";
import {
  applySurfaceDomHostPlan,
  clearRouteUnderlay,
  updateSurfaceRouteUnderlay
} from "../src/runtime-surface-dom-host.js";

function createNode(id, tagName = "div") {
  return {
    id,
    tagName: String(tagName).toUpperCase(),
    style: {},
    children: [],
    parentNode: null,
    innerHTML: "",
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    insertBefore(child, beforeNode) {
      child.parentNode = this;
      const index = this.children.indexOf(beforeNode);
      if (index < 0) this.children.push(child);
      else this.children.splice(index, 0, child);
      return child;
    },
    removeChild(child) {
      const index = this.children.indexOf(child);
      if (index >= 0) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
    querySelectorAll() {
      return [];
    }
  };
}

function findNode(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

test("dom host applies route underlay mechanically and clears it", () => {
  const parent = createNode("parent");
  const activeRoot = createNode("surface-login", "main");
  parent.appendChild(activeRoot);
  const nodes = new Map([
    [parent.id, parent],
    [activeRoot.id, activeRoot]
  ]);
  const document = {
    body: parent,
    createElement(tagName) {
      return createNode("", tagName);
    },
    getElementById(id) {
      return nodes.get(String(id)) ?? findNode(parent, String(id)) ?? null;
    }
  };

  assert.equal(updateSurfaceRouteUnderlay(document, { view: { rootId: "surface-login" } }, {
    routeKey: "home",
    html: "<section id=\"underlay-home\"></section>"
  }), true);

  const underlay = parent.children[0];
  assert.equal(underlay.id, "surface-route-underlay");
  assert.equal(underlay.innerHTML, "<section id=\"underlay-home\"></section>");
  assert.equal(activeRoot.style.zIndex, "1");

  clearRouteUnderlay(document);
  assert.equal(parent.children.some(child => child.id === "surface-route-underlay"), false);
});

test("dom host plan materializes, patches, and dematerializes surfaces in order", async () => {
  const parentRoot = createNode("surface-parent", "main");
  const visibleNode = createNode("surface-visible", "section");
  parentRoot.appendChild(visibleNode);
  const nodes = new Map([
    [parentRoot.id, parentRoot],
    [visibleNode.id, visibleNode]
  ]);

  const inserted = [];
  const document = {
    getElementById(id) {
      return nodes.get(String(id)) ?? findNode(parentRoot, String(id)) ?? null;
    },
    createElement(tagName) {
      if (tagName === "template") {
        return {
          content: { firstElementChild: null },
          set innerHTML(value) {
            const id = String(value).match(/id=\"([^\"]+)\"/)?.[1] ?? "inserted";
            const node = createNode(id, "section");
            nodes.set(id, node);
            this.content.firstElementChild = node;
          }
        };
      }
      return createNode("", tagName);
    }
  };

  const surfaceById = new Map([
    ["Surface.Parent", {
      id: "Surface.Parent",
      view: { rootId: "surface-parent", propTargets: {}, interactionTargets: {} },
      children: ["Surface.Inserted", "Surface.Visible"]
    }],
    ["Surface.Inserted", {
      id: "Surface.Inserted",
      parentId: "Surface.Parent",
      fragmentHtml: "<section id=\"surface-inserted\"></section>",
      view: { rootId: "surface-inserted", propTargets: {}, interactionTargets: {} }
    }],
    ["Surface.Visible", {
      id: "Surface.Visible",
      parentId: "Surface.Parent",
      view: {
        rootId: "surface-visible",
        propTargets: {
          text: [{ id: "surface-visible", mode: "text" }]
        },
        interactionTargets: {}
      }
    }]
  ]);

  const result = await applySurfaceDomHostPlan({
    document,
    surfaceById,
    activeSurfaceId: "Surface.Visible",
    plan: {
      ops: [
        { kind: "materialize", surfaceId: "Surface.Inserted" },
        { kind: "patch-props", surfaceId: "Surface.Visible", props: { text: "Updated" } },
        { kind: "dematerialize", surfaceId: "Surface.Inserted" }
      ]
    },
    bootSurfaceCapabilities(root) {
      inserted.push(root?.id ?? null);
    }
  });

  assert.deepEqual(inserted, ["surface-inserted"]);
  assert.equal(visibleNode.textContent, "Updated");
  assert.equal(nodes.get("surface-inserted")?.parentNode, null);
  assert.equal(result.structureChanged, true);
});
