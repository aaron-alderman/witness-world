import test from "node:test";
import assert from "node:assert/strict";
import {
  applyBootstrapShellSelectFill,
  applyBootstrapShellStatusView,
  buildBootstrapShellStatusView,
  renderBootstrapShellRenderViewFactory
} from "./bootstrap-shell-render-view.js";

test("bootstrap shell status view summarizes bootstrap, session, desktop, and operator state", () => {
  const view = buildBootstrapShellStatusView({
    model: { appReady: false },
    bootstrapState: {
      identities: [],
      operator: {
        contract: {
          persistence: { mode: "filesystem" },
          layout: "flat",
          worldHome: "C:/world"
        },
        mutations: { enabled: false, reason: "read-only" }
      }
    },
    session: { authenticated: false },
    desktopShell: null
  });

  assert.equal(view.bootstrapSummary.includes("No reachable app home route exists yet."), true);
  assert.equal(view.desktopSummary, "Desktop shell unavailable in this session.");
  assert.equal(view.sessionSummary, "No identities yet. Create the first identity to continue.");
  assert.equal(view.operatorSummary, "Persistence filesystem on flat at C:/world.");
  assert.equal(view.operatorWarning, "Operator mutations disabled: read-only.");
});

test("bootstrap shell status view apply writes the documented summary/status nodes", () => {
  const nodes = new Map([
    ["bootstrap-summary", { textContent: "" }],
    ["open-app-link", { href: "" }],
    ["desktop-summary", { textContent: "" }],
    ["session-summary", { textContent: "" }],
    ["operator-summary", { textContent: "" }],
    ["operator-warning", { textContent: "" }]
  ]);

  applyBootstrapShellStatusView({
    view: {
      bootstrapSummary: "summary",
      openAppHref: "/",
      desktopSummary: "desktop",
      sessionSummary: "session",
      operatorSummary: "operator",
      operatorWarning: "warning"
    },
    byId: id => nodes.get(id) || null
  });

  assert.equal(nodes.get("bootstrap-summary").textContent, "summary");
  assert.equal(nodes.get("open-app-link").href, "/");
  assert.equal(nodes.get("desktop-summary").textContent, "desktop");
  assert.equal(nodes.get("session-summary").textContent, "session");
  assert.equal(nodes.get("operator-summary").textContent, "operator");
  assert.equal(nodes.get("operator-warning").textContent, "warning");
});

test("bootstrap shell select fill applies the documented select inventories and preserves runtime review selection", () => {
  const calls = [];
  const selected = new Map([["runtime-plugin-review-plugin", "plugin.inspect"]]);
  const runtimePluginReview = {
    serverRunner: "demo_server",
    selectedPluginId: "plugin.inspect",
    packages: [{ plugin: "plugin.inspect", version: "0.1.0", statusBadges: ["installed"] }]
  };

  applyBootstrapShellSelectFill({
    model: {
      widgetKinds: ["Panel"],
      supportedFrontendOps: ["setText"],
      supportedMethods: ["GET"],
      supportedHandlers: ["page.home"],
      supportedHandlerSets: ["demo"],
      backendHosts: [{ id: "backendHost" }],
      frontendHosts: [{ id: "frontendHost" }]
    },
    bootstrapState: {
      contexts: [{ id: "ctx.root" }],
      widgets: [{ id: "widget.root" }],
      frontendPrograms: [{ id: "program.root" }],
      processes: [{ id: "ShellNavigation" }],
      types: [{ id: "ActiveRoute", role: "state" }, { id: "NotState", role: "event" }],
      backendPrograms: [{ soul: "backend.program" }],
      routes: [{ id: "route.home" }],
      serverRunners: [{ id: "demo_server" }],
      operator: {
        inventory: {
          backups: [{ id: "backup-1", status: "ready" }],
          imports: [{ id: "import-1", status: "ready" }]
        }
      }
    },
    runtimePluginReview,
    byId: id => id === "runtime-plugin-review-plugin"
      ? { value: selected.get(id) || "" }
      : null,
    fillSelect: (id, rows, getValue, getLabel) => {
      calls.push([id, rows.map(row => getValue(row)), rows.map(row => getLabel(row))]);
    },
    setSelectedValue: (id, value) => {
      selected.set(id, value);
    },
    buildServerRunnerOptionsFn: rows => rows.map(row => ({ value: row.id, label: row.id })),
    runtimePluginReviewRowsFn: review => review?.packages || [],
    runtimePluginReviewOptionLabelFn: row => row.plugin
  });

  assert.equal(calls.some(([id]) => id === "widget-kind"), true);
  assert.equal(calls.some(([id, values]) => id === "route-state-process" && values.includes("ShellNavigation")), true);
  assert.equal(calls.some(([id, values]) => id === "route-state-state" && values.includes("ActiveRoute") && !values.includes("NotState")), true);
  assert.equal(calls.some(([id]) => id === "runtime-plugin-review-runner"), true);
  assert.equal(calls.some(([id]) => id === "runtime-plugin-review-plugin"), true);
  assert.equal(calls.some(([id]) => id === "operator-restore-artifact"), true);
  assert.equal(runtimePluginReview.selectedPluginId, "plugin.inspect");
});

test("bootstrap shell render view factory exposes the shared browser helpers", () => {
  const factory = renderBootstrapShellRenderViewFactory();
  assert.equal(factory.includes("const buildBootstrapShellStatusView ="), true);
  assert.equal(factory.includes("const applyBootstrapShellStatusView ="), true);
  assert.equal(factory.includes("const applyBootstrapShellSelectFill ="), true);
});
