import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildOperatorWorkbenchSnapshot,
  buildOperatorTuiState,
  createOperatorTuiEngine,
  loadOperatorTuiRuntimeContext
} from "../plugins/operator-workbench/tui-engine.js";
import {
  createOperatorWorkbenchController,
  createOperatorWorkbenchCore
} from "../plugins/operator-workbench/workbench/core.js";
import { createOperatorWorkbenchSettingsStore } from "../plugins/operator-workbench/workbench/settings.js";

const exampleRoot = path.resolve("examples", "operator");

async function loadExampleState() {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath: exampleRoot,
    runtimePluginIds: ["plugin.operator-workbench"]
  });
  const state = await buildOperatorTuiState(runtimeContext);
  return {
    state,
    async close() {
      await runtimeContext.close?.();
    }
  };
}

test("operator workbench settings store persists workspace-scoped layouts and keymaps", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-customization-"));
  try {
    const store = createOperatorWorkbenchSettingsStore({ userDataRoot: tempRoot });
    const workspaceKey = JSON.stringify({ cwd: "C:/repo", appPath: "examples/operator", worldHome: null });
    await store.saveLayout(workspaceKey, "wide", {
      viewportId: "operator_default",
      focusedPanelId: "operator_trace",
      root: {
        kind: "split",
        axis: "vertical",
        weight: 30,
        first: { kind: "panel", panelId: "operator_left" },
        second: { kind: "panel", panelId: "operator_trace" }
      },
      panels: {
        operator_left: { id: "operator_left", contentKind: "left-screen", leftScreenId: "operator_left" },
        operator_trace: { id: "operator_trace", contentKind: "screen", screenId: "operator_trace" }
      }
    });
    await store.saveKeymap(workspaceKey, "nav", {
      bindings: {
        F6: { target: "rename", targetKind: "action" }
      }
    });

    const workspace = await store.loadWorkspace(workspaceKey);
    assert.equal(workspace.layouts.wide.viewportId, "operator_default");
    assert.equal(workspace.layouts.wide.root.axis, "vertical");
    assert.equal(workspace.keymaps.nav.bindings.F6.target, "rename");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("operator TUI workbench taxonomy exposes first-class layout and keymap groups", async () => {
  const fixture = await loadExampleState();
  try {
    const engine = createOperatorTuiEngine(fixture.state);
    const result = await engine.execute("open workbench");
    assert.match(result.output, /Session/);
    assert.match(result.output, /Layouts/);
    assert.match(result.output, /Viewports/);
    assert.match(result.output, /Panels/);
    assert.match(result.output, /Contents/);
    assert.match(result.output, /Keymaps/);
    assert.match(result.output, /Actions/);
    assert.match(result.output, /Menus/);
    assert.match(result.output, /Splits/);
    assert.match(result.output, /Windows/);
    assert.match(result.output, /Chromes/);
  } finally {
    await fixture.close();
  }
});

test("operator workbench customization commands save layouts and keymaps and surface them in the snapshot", async () => {
  const fixture = await loadExampleState();
  try {
    const engine = createOperatorTuiEngine(fixture.state);
    const controller = createOperatorWorkbenchController({
      state: fixture.state,
      engine,
      saveLayoutRecord: async (_name, record) => record,
      saveKeymapRecord: async (_name, record) => record
    });
    const initialSnapshot = await controller.snapshot();
    const actionId = initialSnapshot.actions.available.find(action => action.builtin === "rename")?.id
      ?? initialSnapshot.actions.available[0]?.id;
    assert.ok(actionId);

    await controller.executeCommand("split vertical");
    await controller.executeCommand("layout save dual");
    await controller.executeCommand(`bind F6 ${actionId}`);
    await controller.executeCommand("keymap save nav");
    const snapshot = await controller.snapshot();

    assert.equal(snapshot.workbench.activeLayout.name, "dual");
    assert.equal(snapshot.workbench.activeKeymap.name, "nav");
    assert.equal(Object.keys(snapshot.workbench.activeLayout.panels).length, 3);
    assert.equal(snapshot.workbench.activeKeymap.bindings.F6.target, actionId);
    assert.equal(snapshot.workbench.layouts.some(record => record.id === "workbench.layout.dual"), true);
    assert.equal(snapshot.workbench.keymaps.some(record => record.id === "workbench.keymap.nav"), true);
  } finally {
    await fixture.close();
  }
});

test("operator workbench snapshot exposes a panel-native window graph for the rich host", async () => {
  const fixture = await loadExampleState();
  try {
    const engine = createOperatorTuiEngine(fixture.state);
    const snapshot = await buildOperatorWorkbenchSnapshot(fixture.state, engine.session, {});

    assert.equal(snapshot.window?.id, "operator_default");
    assert.equal(snapshot.rootSplit?.kind, "split");
    assert.equal(Array.isArray(snapshot.panels), true);
    assert.equal(Array.isArray(snapshot.chromes), true);
    assert.equal(snapshot.panels.some(panel => panel.role === "left" && panel.contentKind === "left-screen"), true);
    assert.equal(snapshot.panels.some(panel => panel.role === "right" && panel.contentKind === "screen"), true);
    assert.equal(snapshot.chromes.some(chrome => chrome.role === "top"), true);
    assert.equal(snapshot.chromes.some(chrome => chrome.role === "bottom"), true);
    assert.equal(snapshot.focusedPanelId, snapshot.workbench.focusedPanelId);
    assert.equal(snapshot.activeLayout.viewportId, snapshot.workbench.activeLayout.viewportId);
    assert.equal(typeof snapshot.panels[0]?.contentModel, "object");
  } finally {
    await fixture.close();
  }
});

test("operator workbench saves layouts and keymaps into authored workspace RVM and reloads them", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-authoring-"));
  const tempExampleRoot = path.join(tempRoot, "operator");
  await fs.cp(exampleRoot, tempExampleRoot, { recursive: true });

  const core = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });

  try {
    const initialSnapshot = await core.snapshot();
    const actionId = initialSnapshot.actions.available.find(action => action.builtin === "rename")?.id
      ?? initialSnapshot.actions.available[0]?.id;
    assert.ok(actionId);

    await core.executeCommand("split vertical");
    await core.executeCommand("layout save dual");
    await core.executeCommand(`bind F6 ${actionId}`);
    await core.executeCommand("keymap save nav");

    const authoredSource = await fs.readFile(path.join(tempExampleRoot, "browser", "operator.workbench.rvm"), "utf8");
    assert.match(authoredSource, /operator_layout dual \{/);
    assert.match(authoredSource, /operator_keymap nav \{/);
    assert.match(authoredSource, /binding F6 action /);
  } finally {
    await core.close();
  }

  const reloaded = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });
  try {
    const snapshot = await reloaded.snapshot();
    assert.equal(snapshot.workbench.layouts.some(record => record.id === "workbench.layout.dual"), true);
    assert.equal(snapshot.workbench.keymaps.some(record => record.id === "workbench.keymap.nav"), true);
  } finally {
    await reloaded.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("operator workbench inspect surfaces authored and current layout/keymap metadata", async () => {
  const fixture = await loadExampleState();
  try {
    const engine = createOperatorTuiEngine(fixture.state);
    const renameActionId = "workbench.layout.open";

    await engine.execute("split vertical");
    let result = await engine.execute("open workbench");
    assert.match(result.output, /Layouts/);
    result = await engine.execute("open layouts");
    assert.match(result.output, /Current Layout/);

    result = await engine.execute("inspect 1");
    assert.match(result.output, /Current Layout/);
    assert.match(result.output, /active layout: yes/);
    assert.match(result.output, /unsaved changes: yes/);
    assert.match(result.output, /authored base: \(default authored workbench\)/);

    await engine.execute("layout new dual");
    await engine.execute("open workbench");
    await engine.execute("open layouts");
    result = await engine.execute("inspect 1");
    assert.match(result.output, /Current Layout \(dual\)/);
    assert.match(result.output, /origin: current authored/);
    assert.match(result.output, /unsaved changes: no/);
    assert.match(result.output, /authored base: dual/);

    result = await engine.execute("inspect 2");
    assert.match(result.output, /^dual/m);
    assert.match(result.output, /kind: layout/);
    assert.match(result.output, /active layout: yes/);
    assert.match(result.output, /saved at:/);

    await engine.execute(`bind F6 ${renameActionId}`);
    await engine.execute("open workbench");
    await engine.execute("open keymaps");
    result = await engine.execute("inspect 1");
    assert.match(result.output, /Current Keymap/);
    assert.match(result.output, /binding count: 1/);
    assert.match(result.output, /unsaved changes: yes/);
    assert.match(result.output, /authored base: \(default authored workbench\)/);

    await engine.execute("keymap new nav");
    await engine.execute("open workbench");
    await engine.execute("open keymaps");
    result = await engine.execute("inspect 1");
    assert.match(result.output, /Current Keymap \(nav\)/);
    assert.match(result.output, /origin: current authored/);
    assert.match(result.output, /authored base: nav/);

    result = await engine.execute("inspect 2");
    assert.match(result.output, /^nav/m);
    assert.match(result.output, /kind: keymap/);
    assert.match(result.output, /active keymap: yes/);
    assert.match(result.output, /bindings:/);
    assert.match(result.output, /F6: workbench\.layout\.open/);
  } finally {
    await fixture.close();
  }
});

test("operator workbench lifecycle commands create rename delete and reset authored layouts and keymaps", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-lifecycle-"));
  const tempExampleRoot = path.join(tempRoot, "operator");
  await fs.cp(exampleRoot, tempExampleRoot, { recursive: true });

  const core = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });

  try {
    let result = await core.executeCommand("split vertical");
    assert.equal(result.result.status ?? "info", "info");

    result = await core.executeCommand("layout new dual");
    assert.match(result.result.output, /created layout dual\./);
    result = await core.executeCommand("layout duplicate dual dual_copy");
    assert.match(result.result.output, /duplicated layout dual as dual_copy\./);
    result = await core.executeCommand("layout rename dual_copy dual_ops");
    assert.match(result.result.output, /renamed layout dual_copy to dual_ops\./);
    result = await core.executeCommand("layout delete dual");
    assert.match(result.result.output, /deleted layout dual\./);
    result = await core.executeCommand("layouts");
    assert.doesNotMatch(result.result.output, /\bdual ::/);
    assert.match(result.result.output, /\* dual_ops ::/);

    const actionId = "workbench.layout.open";
    result = await core.executeCommand(`bind F6 ${actionId}`);
    assert.match(result.result.output, /bound F6 -> workbench\.layout\.open\./);
    result = await core.executeCommand("keymap new nav");
    assert.match(result.result.output, /created keymap nav\./);
    result = await core.executeCommand("keymap duplicate nav nav_copy");
    assert.match(result.result.output, /duplicated keymap nav as nav_copy\./);
    result = await core.executeCommand("keymap rename nav_copy nav_ops");
    assert.match(result.result.output, /renamed keymap nav_copy to nav_ops\./);
    result = await core.executeCommand("keymap delete nav");
    assert.match(result.result.output, /deleted keymap nav\./);
    result = await core.executeCommand("keymaps");
    assert.doesNotMatch(result.result.output, /\bnav ::/);
    assert.match(result.result.output, /\* nav_ops ::/);

    const authoredSource = await fs.readFile(path.join(tempExampleRoot, "browser", "operator.workbench.rvm"), "utf8");
    assert.doesNotMatch(authoredSource, /operator_layout dual \{/);
    assert.match(authoredSource, /operator_layout dual_ops \{/);
    assert.doesNotMatch(authoredSource, /operator_keymap nav \{/);
    assert.match(authoredSource, /operator_keymap nav_ops \{/);

    result = await core.executeCommand("split horizontal");
    assert.equal(result.snapshot.workbench.activeLayout.focusedPanelId != null, true);
    result = await core.executeCommand("layout reset");
    assert.match(result.result.output, /layout reset to dual_ops\./);
    assert.equal(Object.keys(result.snapshot.workbench.activeLayout.panels ?? {}).length, 3);

    result = await core.executeCommand(`bind F7 ${actionId}`);
    assert.match(result.result.output, /bound F7 -> workbench\.layout\.open\./);
    result = await core.executeCommand("keymap reset");
    assert.match(result.result.output, /keymap reset to nav_ops\./);
    assert.equal(Object.keys(result.snapshot.workbench.activeKeymap.bindings ?? {}).length, 1);
  } finally {
    await core.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("operator workbench controller routes workbench layout and keymap actions through semantic actions", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-controller-actions-"));
  const tempExampleRoot = path.join(tempRoot, "operator");
  await fs.cp(exampleRoot, tempExampleRoot, { recursive: true });

  const core = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });

  try {
    await core.executeCommand("split vertical");
    await core.executeCommand("layout new dual");
    await core.executeCommand("bind F6 workbench.layout.open");
    await core.executeCommand("keymap new nav");

    let next = await core.executeCommand("open workbench");
    next = await core.executeCommand("open layouts");
    const dualRow = next.snapshot.leftPane.rows.find(row => row.label === "dual");
    assert.equal(dualRow?.primaryAction?.actionId, "workbench.layout.open");

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.layout.duplicate",
      context: { record: structuredClone(dualRow.record) }
    });
    assert.match(next.result.output, /duplicated layout dual as dual-copy\./);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.layout.rename",
      context: { record: structuredClone(dualRow.record) }
    });
    assert.match(next.result.output, /renamed layout dual to dual-renamed\./);

    next = await core.executeCommand("open keymaps");
    const navRow = next.snapshot.leftPane.rows.find(row => row.label === "nav");
    assert.equal(navRow?.primaryAction?.actionId, "workbench.keymap.open");

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.keymap.duplicate",
      context: { record: structuredClone(navRow.record) }
    });
    assert.match(next.result.output, /duplicated keymap nav as nav-copy\./);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.keymap.rename",
      context: { record: structuredClone(navRow.record) }
    });
    assert.match(next.result.output, /renamed keymap nav to nav-renamed\./);
  } finally {
    await core.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("operator workbench inspect surfaces authored panel/content/window graph metadata", async () => {
  const fixture = await loadExampleState();
  try {
    const engine = createOperatorTuiEngine(fixture.state);

    await engine.execute("open workbench");
    let result = await engine.execute("open panels");
    assert.match(result.output, /Operator Navigation/);
    result = await engine.execute("inspect 1");
    assert.match(result.output, /name: operator_left/);
    assert.match(result.output, /kind: panel/);
    assert.match(result.output, /content id: operator_nav_content/);
    assert.match(result.output, /used by active layout: yes/);

    await engine.execute("open workbench");
    await engine.execute("open contents");
    result = await engine.execute("inspect 1");
    assert.match(result.output, /kind: content/);
    assert.match(result.output, /content kind:/);

    result = await engine.execute("inspect workbench.split.operator_main_split");
    assert.match(result.output, /kind: split/);
    assert.match(result.output, /axis: horizontal/);

    result = await engine.execute("inspect workbench.window.operator_default");
    assert.match(result.output, /kind: window/);
    assert.match(result.output, /root split: operator_main_split/);

    result = await engine.execute("inspect workbench.chrome.top_status");
    assert.match(result.output, /kind: chrome/);
    assert.match(result.output, /chrome kind: status_bar/);
  } finally {
    await fixture.close();
  }
});

test("operator workbench panel and content lifecycle commands rewrite authored workbench truth", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-panel-content-"));
  const tempExampleRoot = path.join(tempRoot, "operator");
  await fs.cp(exampleRoot, tempExampleRoot, { recursive: true });

  const core = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });

  try {
    let result = await core.executeCommand("panel duplicate operator_trace operator_trace_copy");
    assert.match(result.result.output, /duplicated panel operator_trace as operator_trace_copy\./);

    result = await core.executeCommand("panel rename operator_trace_copy operator_trace_ops");
    assert.match(result.result.output, /renamed panel operator_trace_copy to operator_trace_ops\./);

    result = await core.executeCommand("panel assign-content operator_trace_ops operator_links");
    assert.match(result.result.output, /assigned content operator_links to panel operator_trace_ops\./);

    result = await core.executeCommand("content duplicate operator_links operator_links_copy");
    assert.match(result.result.output, /duplicated content operator_links as operator_links_copy\./);

    result = await core.executeCommand("content rename operator_links_copy operator_links_ops");
    assert.match(result.result.output, /renamed content operator_links_copy to operator_links_ops\./);

    result = await core.executeCommand("panel delete operator_left");
    assert.match(result.result.output, /panel operator_left is still referenced by/);
    assert.equal(result.result.status, "error");

    result = await core.executeCommand("content delete operator_links");
    assert.match(result.result.output, /content operator_links is still referenced by/);
    assert.equal(result.result.status, "error");

    const authoredSource = await fs.readFile(path.join(tempExampleRoot, "browser", "operator.workbench.rvm"), "utf8");
    assert.match(authoredSource, /operator_panel operator_trace_ops \{/);
    assert.match(authoredSource, /content operator_links/);
    assert.match(authoredSource, /operator_content operator_links_ops \{/);
    assert.match(authoredSource, /operator_panel operator_trace_ops \{[\s\S]*content operator_links/s);
  } finally {
    await core.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("operator workbench controller routes panel and content actions through semantic actions", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-operator-panel-content-actions-"));
  const tempExampleRoot = path.join(tempRoot, "operator");
  await fs.cp(exampleRoot, tempExampleRoot, { recursive: true });

  const core = await createOperatorWorkbenchCore({
    args: [tempExampleRoot, "--runtime-plugin", "plugin.operator-workbench"]
  });

  try {
    let next = await core.executeCommand("open workbench");
    next = await core.executeCommand("open panels");
    const panelRow = next.snapshot.leftPane.rows.find(row => row.label === "Operator Trace");
    assert.match(panelRow?.primaryAction?.command ?? "", /^inspect /);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.panel.duplicate",
      context: { record: structuredClone(panelRow.record) }
    });
    assert.match(next.result.output, /duplicated panel operator_trace as operator_trace-copy\./);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.panel.rename",
      context: { record: structuredClone(panelRow.record) }
    });
    assert.match(next.result.output, /renamed panel operator_trace to operator_trace-renamed\./);

    next = await core.executeCommand("open contents");
    const contentRow = next.snapshot.leftPane.rows.find(row => row.label === "Links");
    assert.match(contentRow?.primaryAction?.command ?? "", /^inspect /);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.content.duplicate",
      context: { record: structuredClone(contentRow.record) }
    });
    assert.match(next.result.output, /duplicated content operator_links as operator_links-copy\./);

    next = await core.dispatchIntent({
      type: "run-action",
      actionId: "workbench.content.rename",
      context: { record: structuredClone(contentRow.record) }
    });
    assert.match(next.result.output, /renamed content operator_links to operator_links-renamed\./);
  } finally {
    await core.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
