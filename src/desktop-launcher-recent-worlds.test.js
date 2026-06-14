import assert from "node:assert/strict";
import test from "node:test";
import {
  bindDesktopRecentWorlds,
  createDesktopRecentWorldRow,
  findDesktopRecentWorldRow,
  renderDesktopRecentWorlds,
  renderDesktopRecentWorldsFactory
} from "./desktop-launcher-recent-worlds.js";

function createFakeElement(tagName) {
  return {
    tagName: String(tagName).toUpperCase(),
    type: "",
    className: "",
    dataset: {},
    textContent: "",
    parentElement: null,
    children: [],
    append(...nodes) {
      for (const node of nodes) {
        node.parentElement = this;
        this.children.push(node);
      }
    },
    replaceChildren(...nodes) {
      this.children = [];
      this.append(...nodes);
    },
    addEventListener(type, handler) {
      this.listeners ??= new Map();
      this.listeners.set(type, handler);
    }
  };
}

function createFakeDocument() {
  return {
    createElement(tagName) {
      return createFakeElement(tagName);
    }
  };
}

test("desktop launcher recent-world helper renders empty and populated rows without innerHTML assembly", () => {
  const document = createFakeDocument();
  const root = createFakeElement("div");

  renderDesktopRecentWorlds({
    root,
    rows: [],
    document
  });
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tagName, "P");
  assert.equal(root.children[0].textContent, "No recent worlds yet.");

  renderDesktopRecentWorlds({
    root,
    rows: ["C:/worlds/demo"],
    document
  });
  assert.equal(root.children.length, 1);
  assert.equal(root.children[0].tagName, "BUTTON");
  assert.equal(root.children[0].className.includes("surface-link-item"), true);
  assert.equal(root.children[0].dataset.worldHome, "C:/worlds/demo");
  assert.equal(root.children[0].children[0].tagName, "STRONG");
  assert.equal(root.children[0].children[0].className, "surface-mono");
  assert.equal(root.children[0].children[0].textContent, "C:/worlds/demo");
  assert.equal(root.children[0].children[1].className, "surface-note");
  assert.equal(root.children[0].children[1].textContent, "Open this world directly");
});

test("desktop launcher recent-world helper resolves delegated row clicks through ancestor lookup", async () => {
  const document = createFakeDocument();
  const root = createFakeElement("div");
  const row = createDesktopRecentWorldRow({
    worldHome: "C:/worlds/demo",
    document
  });
  root.append(row);

  const innerTitle = row.children[0];
  assert.equal(findDesktopRecentWorldRow(innerTitle, root), row);

  const statuses = [];
  let refreshed = 0;
  const opened = [];
  bindDesktopRecentWorlds({
    root,
    desktop: {
      async openWorldHome(payload) {
        opened.push(payload);
        return { ok: false, reason: "busy" };
      }
    },
    setStatus: text => {
      statuses.push(text);
    },
    refresh: async () => {
      refreshed += 1;
    }
  });

  await root.listeners.get("click")({ target: innerTitle });

  assert.deepEqual(opened, [{ worldHome: "C:/worlds/demo" }]);
  assert.deepEqual(statuses, ["Opening selected world...", "busy"]);
  assert.equal(refreshed, 1);
});

test("desktop launcher recent-world helper factory exposes the shared browser helpers", () => {
  const factory = renderDesktopRecentWorldsFactory();
  assert.equal(factory.includes("const renderDesktopRecentWorlds ="), true);
  assert.equal(factory.includes("const bindDesktopRecentWorlds ="), true);
});
