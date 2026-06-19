import test from "node:test";
import assert from "node:assert/strict";
import { syncSurfaceRuntimeManifestScript } from "./runtime-surface-interaction-runtime.js";

class FakeNode {
  constructor(tagName = "div") {
    this.tagName = String(tagName || "div").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.textContent = "";
    this.type = "";
    this._id = "";
  }

  set id(value) {
    this._id = String(value || "");
  }

  get id() {
    return this._id;
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  getElementById(id) {
    if (this.id === id) return this;
    for (const child of this.children) {
      const found = child.getElementById?.(id) ?? null;
      if (found) return found;
    }
    return null;
  }
}

function createFakeDocument() {
  const body = new FakeNode("body");
  return {
    body,
    createElement(tagName) {
      return new FakeNode(tagName);
    },
    getElementById(id) {
      return body.getElementById(id);
    }
  };
}

test("syncSurfaceRuntimeManifestScript updates the DOM manifest payload used by capability runtimes", () => {
  const document = createFakeDocument();
  const manifest = {
    activeSurfaceId: "EngentusApp",
    chartSpecs: {
      GoodmanDiagram: {
        view: { id: "GoodmanDiagram" }
      }
    }
  };

  const node = syncSurfaceRuntimeManifestScript(document, manifest);
  assert.equal(node?.id, "surface-runtime-manifest");
  assert.equal(node?.type, "application/json");
  assert.deepEqual(JSON.parse(node.textContent), manifest);

  const updated = { activeSurfaceId: "EngentusMillChargeApp", chartSpecs: {} };
  const nextNode = syncSurfaceRuntimeManifestScript(document, updated);
  assert.equal(nextNode, node);
  assert.deepEqual(JSON.parse(node.textContent), updated);
});
