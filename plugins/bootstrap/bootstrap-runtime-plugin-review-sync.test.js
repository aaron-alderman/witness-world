import test from "node:test";
import assert from "node:assert/strict";
import {
  bindBootstrapRuntimePluginReviewSync,
  createBootstrapRuntimePluginReviewSyncHandler,
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

test("runtime plugin review sync binds the documented host event and handles authored review triggers", async () => {
  const events = [];
  const runner = {
    value: "demo_server"
  };
  const plugin = {
    value: "plugin.inspect"
  };
  let review = {
    serverRunner: "demo_server",
    packages: [{ plugin: "plugin.inspect" }]
  };
  const calls = [];

  const handler = bindBootstrapRuntimePluginReviewSync({
    target: {
      addEventListener(name, registered) {
        events.push([name, registered]);
      }
    },
    byId: id => id === "runtime-plugin-review-runner" ? runner : id === "runtime-plugin-review-plugin" ? plugin : null,
    request: async () => ({
      serverRunner: "demo_server",
      activeProfile: "full",
      packages: [{ plugin: "plugin.inspect" }]
    }),
    postJson: async () => ({}),
    refresh: async () => {},
    requestState: { current: 0 },
    getReview: () => review,
    setReview: next => {
      review = next;
      calls.push(["setReview", next.selectedPluginId || ""]);
    },
    getRuntimeProfile: () => "full",
    renderPage: () => calls.push(["renderPage"]),
    renderDetail: () => calls.push(["renderDetail"]),
    setStatus: (id, value) => calls.push(["setStatus", id, value])
  });

  assert.equal(typeof handler, "function");
  assert.deepEqual(events.map(([name]) => name), ["witness:bootstrap-runtime-plugin-review-sync"]);

  plugin.value = "plugin.inspect";
  assert.deepEqual(
    await handler({ detail: { source: "bootstrap-page-main", trigger: "plugin" } }),
    { handled: true }
  );
  assert.equal(calls.at(-1)?.[0], "renderPage");

  await handler({ detail: { source: "bootstrap-page-main", trigger: "server-runner" } });
  assert.equal(calls.at(-1)?.[0], "renderPage");

  const ignored = createBootstrapRuntimePluginReviewSyncHandler();
  assert.deepEqual(await ignored({ detail: { source: "other", trigger: "plugin" } }), { handled: false });

  const factory = renderBootstrapRuntimePluginReviewSyncFactory();
  assert.equal(factory.includes("const resolveBootstrapRuntimePluginReviewSelection ="), true);
  assert.equal(factory.includes("const loadBootstrapRuntimePluginReview ="), true);
  assert.equal(factory.includes("const selectBootstrapRuntimePluginReviewPlugin ="), true);
  assert.equal(factory.includes("const createBootstrapRuntimePluginReviewSyncHandler ="), true);
  assert.equal(factory.includes("const bindBootstrapRuntimePluginReviewSync ="), true);
});

test("runtime plugin review sync submits reconcile actions through the shared repair route", async () => {
  const calls = [];
  let review = {
    serverRunner: "demo_server",
    selectedPluginId: "plugin.notes-sidebar",
    packages: [{
      plugin: "plugin.notes-sidebar",
      reconcileActions: [{
        id: "remove-broken-install",
        label: "Remove broken install",
        available: true
      }]
    }]
  };

  const handler = createBootstrapRuntimePluginReviewSyncHandler({
    postJson: async (url, body) => {
      calls.push(["postJson", url, body]);
      return {};
    },
    refresh: async () => {
      calls.push(["refresh"]);
    },
    getReview: () => review,
    setReview: next => {
      review = next;
    },
    renderDetail: () => calls.push(["renderDetail"]),
    setStatus: (id, value) => calls.push(["setStatus", id, value])
  });

  assert.deepEqual(
    await handler({ detail: { source: "bootstrap-page-main", trigger: "repair", actionId: "remove-broken-install", actionLabel: "Remove broken install" } }),
    { handled: true }
  );
  assert.deepEqual(calls, [
    ["setStatus", "runtime-plugin-review-note", "Submitting Remove broken install."],
    ["postJson", "/api/runtime-plugin-reconciles", {
      serverRunner: "demo_server",
      plugin: "plugin.notes-sidebar",
      actionId: "remove-broken-install"
    }],
    ["refresh"],
    ["renderDetail"],
    ["setStatus", "runtime-plugin-review-note", "Remove broken install applied."]
  ]);
});
