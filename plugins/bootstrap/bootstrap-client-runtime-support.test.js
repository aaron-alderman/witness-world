import test from "node:test";
import assert from "node:assert/strict";
import {
  bootstrapStateInventoryRowKey,
  createBootstrapClientRuntimeSupport,
  escapeBootstrapHtml,
  renderBootstrapClientRuntimeSupportFactory
} from "./bootstrap-client-runtime-support.js";

test("bootstrap client runtime support owns browser/runtime support helpers", async () => {
  const originalCss = globalThis.CSS;
  const calls = [];
  try {
    globalThis.CSS = { escape: value => "escaped:" + String(value) };
    const windowTarget = {
      witnessDesktop: {
        kind: "desktop-shell",
        async getDesktopShellState() {
          return { shellId: "desktop-1" };
        }
      }
    };
    const state = {
      model: { runtimeProfile: "minimal" },
      runtimePluginReview: { selectedPluginId: "plugin.todo" }
    };
    const support = createBootstrapClientRuntimeSupport({
      state,
      documentTarget: {
        querySelector(selector) {
          calls.push(["query", selector]);
          return { selector };
        }
      },
      windowTarget,
      byId(id) {
        calls.push(["by-id", id]);
        return { id };
      },
      setStatus(id, text) {
        calls.push(["status", id, text]);
      },
      buildBootstrapRuntimePluginReviewViewFn({ review, runtimeProfile }) {
        calls.push(["review-view", review.selectedPluginId, runtimeProfile]);
        return {
          detailItems: [{ label: "Selected Plugin", value: review.selectedPluginId }],
          noteText: "reviewed"
        };
      },
      renderBootstrapStateItemsFn({ id, items }) {
        calls.push(["state-items", id, items.length]);
      }
    });

    assert.equal(escapeBootstrapHtml('a<&>"\''), "a&lt;&amp;&gt;&quot;&#39;");
    assert.equal(bootstrapStateInventoryRowKey({ id: "row-1" }), "row-1");
    assert.equal(bootstrapStateInventoryRowKey({ program: "p", event: "e", op: "run" }), "p\u0000e\u0000run");
    assert.equal(support.stateSnapshots instanceof Map, true);
    assert.equal(support.desktopApi(), windowTarget.witnessDesktop);
    assert.deepEqual(support.byTarget("tutorial.target"), {
      selector: '[data-guidance-target="escaped:tutorial.target"], [data-tutorial-target="escaped:tutorial.target"]'
    });
    await support.sleep(0);
    support.renderRuntimePluginReviewDetail();
    support.publishRuntimeView({ stepId: "step-1" });

    assert.deepEqual(windowTarget.__witnessGuidance, { stepId: "step-1" });
    assert.deepEqual(windowTarget.__witnessTutorial, { stepId: "step-1" });
    assert.deepEqual(calls, [
      ["query", '[data-guidance-target="escaped:tutorial.target"], [data-tutorial-target="escaped:tutorial.target"]'],
      ["review-view", "plugin.todo", "minimal"],
      ["state-items", "runtime-plugin-review-detail", 1],
      ["status", "runtime-plugin-review-note", "reviewed"]
    ]);
  } finally {
    globalThis.CSS = originalCss;
  }
});

test("bootstrap client runtime support factory exposes the extracted support helper", () => {
  const factory = renderBootstrapClientRuntimeSupportFactory();
  assert.equal(factory.includes("const escapeBootstrapHtml ="), true);
  assert.equal(factory.includes("const bootstrapStateInventoryRowKey ="), true);
  assert.equal(factory.includes("const createBootstrapClientRuntimeSupport ="), true);
});
