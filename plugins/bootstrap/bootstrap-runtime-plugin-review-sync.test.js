import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapRuntimePluginReviewSync,
  loadBootstrapRuntimePluginReview,
  renderBootstrapRuntimePluginReviewSyncFactory,
  resolveBootstrapRuntimePluginReviewSelection,
  selectBootstrapRuntimePluginReviewPlugin
} from "./bootstrap-runtime-plugin-review-sync.js";

test("runtime plugin review selection prefers requested plugin and falls back to first package", () => {
  const review = {
    packages: [
      { plugin: "plugin.inspect" },
      { plugin: "plugin.notes-sidebar" }
    ]
  };

  assert.equal(resolveBootstrapRuntimePluginReviewSelection({
    review,
    selectedPluginId: "plugin.notes-sidebar"
  }), "plugin.notes-sidebar");

  assert.equal(resolveBootstrapRuntimePluginReviewSelection({
    review,
    selectedPluginId: "plugin.missing",
    currentSelectedPluginId: "plugin.inspect"
  }), "plugin.inspect");

  assert.equal(resolveBootstrapRuntimePluginReviewSelection({
    review,
    selectedPluginId: ""
  }), "plugin.inspect");
});

test("runtime plugin review loader preserves empty-runner fallback and live selection rules", async () => {
  const reviews = [];

  const empty = await loadBootstrapRuntimePluginReview({
    serverRunnerId: "",
    setReview: review => reviews.push(review),
    runtimeProfile: "minimal"
  });
  assert.equal(empty, false);
  assert.deepEqual(reviews[0], {
    serverRunner: null,
    activeProfile: "minimal",
    authoredPluginIds: [],
    currentComposition: null,
    packages: [],
    selectedPluginId: "",
    note: "Runtime plugin review shows authored runner intent only."
  });

  const requestState = { current: 0 };
  const ok = await loadBootstrapRuntimePluginReview({
    serverRunnerId: "demo_server",
    requestState,
    currentReview: { selectedPluginId: "plugin.inspect" },
    selectedPluginId: "plugin.notes-sidebar",
    request: async url => {
      assert.equal(url, "/api/runtime/plugin-reviews?serverRunner=demo_server");
      return {
        serverRunner: "demo_server",
        activeProfile: "full",
        packages: [
          { plugin: "plugin.inspect" },
          { plugin: "plugin.notes-sidebar" }
        ]
      };
    },
    setReview: review => reviews.push(review),
    runtimeProfile: "full"
  });

  assert.equal(ok, true);
  assert.equal(requestState.current, 1);
  assert.deepEqual(reviews.at(-1), {
    serverRunner: "demo_server",
    activeProfile: "full",
    packages: [
      { plugin: "plugin.inspect" },
      { plugin: "plugin.notes-sidebar" }
    ],
    selectedPluginId: "plugin.notes-sidebar"
  });
});

test("runtime plugin review loader resolves selection from live state after async review refresh", async () => {
  const reviews = [];
  let liveSelectedPluginId = "plugin.assets";

  const ok = await loadBootstrapRuntimePluginReview({
    serverRunnerId: "demo_server",
    requestState: { current: 0 },
    currentReview: { selectedPluginId: "plugin.assets" },
    getCurrentSelectedPluginId: () => liveSelectedPluginId,
    request: async () => {
      liveSelectedPluginId = "plugin.inspect";
      return {
        serverRunner: "demo_server",
        activeProfile: "full",
        packages: [
          { plugin: "plugin.assets" },
          { plugin: "plugin.inspect" }
        ]
      };
    },
    setReview: review => reviews.push(review),
    runtimeProfile: "full"
  });

  assert.equal(ok, true);
  assert.deepEqual(reviews.at(-1), {
    serverRunner: "demo_server",
    activeProfile: "full",
    packages: [
      { plugin: "plugin.assets" },
      { plugin: "plugin.inspect" }
    ],
    selectedPluginId: "plugin.inspect"
  });
});

test("runtime plugin review selector updates selected plugin without changing package inventory", () => {
  assert.deepEqual(
    selectBootstrapRuntimePluginReviewPlugin({
      review: {
        serverRunner: "demo_server",
        packages: [{ plugin: "plugin.inspect" }, { plugin: "plugin.notes-sidebar" }],
        selectedPluginId: "plugin.inspect"
      },
      selectedPluginId: "plugin.notes-sidebar"
    }),
    {
      serverRunner: "demo_server",
      packages: [{ plugin: "plugin.inspect" }, { plugin: "plugin.notes-sidebar" }],
      selectedPluginId: "plugin.notes-sidebar"
    }
  );
});

test("runtime plugin review sync binds the documented change listeners", () => {
  const runnerEvents = [];
  const pluginEvents = [];
  const runner = {
    value: "demo_server",
    addEventListener(name, handler) {
      runnerEvents.push([name, handler]);
    }
  };
  const plugin = {
    value: "plugin.inspect",
    addEventListener(name, handler) {
      pluginEvents.push([name, handler]);
    }
  };
  let review = {
    serverRunner: "demo_server",
    packages: [{ plugin: "plugin.inspect" }]
  };
  const calls = [];

  const handlers = bindBootstrapRuntimePluginReviewSync({
    byId: id => id === "runtime-plugin-review-runner" ? runner : id === "runtime-plugin-review-plugin" ? plugin : null,
    request: async () => ({
      serverRunner: "demo_server",
      activeProfile: "full",
      packages: [{ plugin: "plugin.inspect" }]
    }),
    requestState: { current: 0 },
    getReview: () => review,
    setReview: next => {
      review = next;
      calls.push(["setReview", next.selectedPluginId || ""]);
    },
    getRuntimeProfile: () => "full",
    renderPage: () => calls.push(["renderPage"]),
    setStatus: (id, value) => calls.push(["setStatus", id, value])
  });

  assert.equal(typeof handlers.runnerHandler, "function");
  assert.equal(typeof handlers.pluginHandler, "function");
  assert.deepEqual(runnerEvents.map(([name]) => name), ["change"]);
  assert.deepEqual(pluginEvents.map(([name]) => name), ["change"]);

  plugin.value = "plugin.inspect";
  handlers.pluginHandler();
  assert.equal(calls.at(-1)?.[0], "renderPage");

  const factory = renderBootstrapRuntimePluginReviewSyncFactory();
  assert.equal(factory.includes("const resolveBootstrapRuntimePluginReviewSelection ="), true);
  assert.equal(factory.includes("const loadBootstrapRuntimePluginReview ="), true);
  assert.equal(factory.includes("const selectBootstrapRuntimePluginReviewPlugin ="), true);
  assert.equal(factory.includes("const bindBootstrapRuntimePluginReviewSync ="), true);
});
