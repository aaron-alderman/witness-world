import test from "node:test";
import assert from "node:assert/strict";
import {
  renderBootstrapRefreshRuntimeFactory,
  runBootstrapRefresh,
  selectBootstrapRefreshReviewRunnerId
} from "./bootstrap-refresh-runtime.js";

test("bootstrap refresh review runner selection preserves the current runner when still available", () => {
  assert.equal(selectBootstrapRefreshReviewRunnerId({
    byId: () => ({ value: "demo_server" }),
    runtimePluginReview: { serverRunner: "fallback_server" },
    bootstrapState: {
      serverRunners: [{ id: "demo_server" }, { id: "other_server" }]
    }
  }), "demo_server");

  assert.equal(selectBootstrapRefreshReviewRunnerId({
    byId: () => ({ value: "missing_server" }),
    runtimePluginReview: { serverRunner: "fallback_server" },
    bootstrapState: {
      serverRunners: [{ id: "demo_server" }, { id: "other_server" }]
    }
  }), "demo_server");
});

test("bootstrap refresh loads authored state, refreshes runtime review, and renders around tutorial advancement", async () => {
  const state = {
    runtimePluginReview: {
      serverRunner: "other_server",
      selectedPluginId: "plugin.inspect"
    }
  };
  const calls = [];

  await runBootstrapRefresh({
    state,
    byId: id => id === "runtime-plugin-review-plugin"
      ? { value: "plugin.inspect" }
      : id === "runtime-plugin-review-runner"
        ? { value: "demo_server" }
        : null,
    request: async url => {
      calls.push(["request", url]);
      if (url === "/api/bootstrap-model") return { runtimeProfile: "full" };
      if (url === "/api/bootstrap-state") return { serverRunners: [{ id: "demo_server" }] };
      if (url === "/api/session") return { authenticated: true };
      throw new Error("unexpected request: " + url);
    },
    desktopApi: () => ({
      getDesktopShellState: async () => {
        calls.push(["desktop"]);
        return { shellId: "desktop" };
      }
    }),
    loadRuntimePluginReviewFn: async options => {
      calls.push(["review", options.serverRunnerId, options.getCurrentSelectedPluginId()]);
      options.setReview({
        serverRunner: options.serverRunnerId,
        selectedPluginId: options.getCurrentSelectedPluginId()
      });
      return true;
    },
    runtimePluginReviewRequestState: { current: 0 },
    loadTutorialProgress: async () => {
      calls.push(["tutorial"]);
    },
    render: () => {
      calls.push(["render"]);
    },
    requestMaybeAdvanceTutorial: async () => {
      calls.push(["advance"]);
    }
  });

  assert.deepEqual(calls, [
    ["request", "/api/bootstrap-model"],
    ["request", "/api/bootstrap-state"],
    ["request", "/api/session"],
    ["desktop"],
    ["review", "demo_server", "plugin.inspect"],
    ["tutorial"],
    ["render"],
    ["advance"],
    ["render"]
  ]);
  assert.deepEqual(state.model, { runtimeProfile: "full" });
  assert.deepEqual(state.bootstrapState, { serverRunners: [{ id: "demo_server" }] });
  assert.deepEqual(state.session, { authenticated: true });
  assert.deepEqual(state.desktopShell, { shellId: "desktop" });
  assert.deepEqual(state.runtimePluginReview, {
    serverRunner: "demo_server",
    selectedPluginId: "plugin.inspect"
  });
});

test("bootstrap refresh runtime factory exposes the shared browser helpers", () => {
  const factory = renderBootstrapRefreshRuntimeFactory();
  assert.equal(factory.includes("const selectBootstrapRefreshReviewRunnerId ="), true);
  assert.equal(factory.includes("const runBootstrapRefresh ="), true);
});
