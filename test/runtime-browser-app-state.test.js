import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowserStateSnapshot,
  createMemoryStorage,
  deepMergeState,
  mergeScopedBrowserState,
  readPath,
  readScopedBrowserState,
  writePath,
  writeScopedBrowserState
} from "../src/runtime-browser-app-state.js";

test("browser app-state helpers merge scoped state deterministically", () => {
  const merged = mergeScopedBrowserState({
    defaults: { ui: { mode: "static", open: false }, chart: { fills: ["#111"] } },
    persistent: { chart: { fills: ["#abc"] } },
    session: { ui: { mode: "mc" } },
    ephemeral: { ui: { open: true } }
  });

  assert.deepEqual(merged, {
    ui: { mode: "mc", open: true },
    chart: { fills: ["#abc"] }
  });
});

test("browser app-state helpers read and write nested paths", () => {
  const updated = writePath({}, "ui.scrubber.t", 6);
  assert.equal(readPath(updated, "ui.scrubber.t"), 6);
  assert.deepEqual(deepMergeState(updated, { ui: { scrubber: { playing: true } } }), {
    ui: { scrubber: { t: 6, playing: true } }
  });
});

test("browser app-state storage snapshots split session and persistent scopes", () => {
  const state = {
    ui: { mode: "mc", activeSimId: "sim_1", transient: true },
    boltSets: { a: { visible: true } },
    chartEdit: { bandFills: ["#111", "#222"] }
  };
  const snapshot = createBrowserStateSnapshot({
    state,
    sessionPaths: ["ui.mode", "ui.activeSimId"],
    persistentPaths: ["boltSets", "chartEdit"]
  });

  assert.deepEqual(snapshot, {
    session: { ui: { mode: "mc", activeSimId: "sim_1" } },
    persistent: {
      boltSets: { a: { visible: true } },
      chartEdit: { bandFills: ["#111", "#222"] }
    }
  });

  const storage = createMemoryStorage();
  writeScopedBrowserState(storage, "demo", snapshot.persistent);
  assert.deepEqual(readScopedBrowserState(storage, "demo"), snapshot.persistent);
});
