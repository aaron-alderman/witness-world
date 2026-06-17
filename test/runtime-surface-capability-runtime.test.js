import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureSurfaceCapabilityAssets,
  surfaceAssetRegistrySnapshot
} from "../src/runtime-surface-capability-runtime.js";

function createCapabilityDocument() {
  class FakeNode {
    constructor(tagName) {
      this.tagName = String(tagName || "div").toUpperCase();
      this.attributes = new Map();
      this.children = [];
      this.textContent = "";
      this.rel = "";
      this.href = "";
      this.src = "";
      this.type = "";
    }

    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
    }

    getAttribute(name) {
      return this.attributes.get(String(name)) ?? null;
    }

    addEventListener(eventName, listener) {
      if (eventName === "load") this.__onLoad = listener;
      if (eventName === "error") this.__onError = listener;
    }

    removeEventListener() {}
  }

  const document = {
    created: [],
    head: {
      children: [],
      appendChild(node) {
        this.children.push(node);
        if (typeof node.__onLoad === "function") node.__onLoad();
        return node;
      }
    },
    body: null,
    documentElement: null,
    createElement(tagName) {
      const node = new FakeNode(tagName);
      document.created.push(node);
      return node;
    },
    querySelector() {
      return null;
    }
  };
  document.body = document.head;
  document.documentElement = document.head;
  return document;
}

test("ensureSurfaceCapabilityAssets dedupes stylesheet and inline style registration", async () => {
  const document = createCapabilityDocument();
  const window = {};
  const assets = {
    stylesheetHrefs: ["/assets/chart.css"],
    inlineCss: [".chart { color: red; }"],
    scriptSrcs: []
  };

  await ensureSurfaceCapabilityAssets(document, window, assets);
  await ensureSurfaceCapabilityAssets(document, window, assets);

  const snapshot = surfaceAssetRegistrySnapshot(window);
  assert.deepEqual(snapshot.stylesheets, ["/assets/chart.css"]);
  assert.equal(snapshot.inlineStyles.length, 1);
  assert.equal(document.head.children.length, 2);
});

test("ensureSurfaceCapabilityAssets surfaces script load failures instead of silently continuing", async () => {
  class FakeNode {
    constructor(tagName) {
      this.tagName = String(tagName || "div").toUpperCase();
      this.attributes = new Map();
      this.textContent = "";
      this.src = "";
      this.rel = "";
      this.type = "";
    }

    setAttribute(name, value) {
      this.attributes.set(String(name), String(value));
    }

    addEventListener(eventName, listener) {
      if (eventName === "load") this.__onLoad = listener;
      if (eventName === "error") this.__onError = listener;
    }

    removeEventListener() {}
  }

  const document = {
    head: {
      appendChild(node) {
        queueMicrotask(() => {
          if (typeof node.__onError === "function") {
            node.__onError(new Error("asset boom"));
          }
        });
        return node;
      }
    },
    body: null,
    documentElement: null,
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    querySelector() {
      return null;
    }
  };
  document.body = document.head;
  document.documentElement = document.head;

  await assert.rejects(
    ensureSurfaceCapabilityAssets(document, {}, {
      scriptSrcs: ["/assets/chart-runtime.js"]
    }),
    /asset failed to load|asset boom/
  );
});
