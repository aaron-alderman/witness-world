import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import test from "node:test";
import { createWorld } from "../src/kernel.js";
import { AppPreviewSessionManager, AppSnapshotManager } from "../src/app-snapshot-manager.js";
import { loadAppProject } from "../src/app-project.js";
import { persistStableAppSourceCache } from "../src/runtime-stable-source-cache.js";
import { activateWidgetVersion, defineWidget, defineWidgetVersion, defineWidgetVersionTransition, widgetDefinitions } from "../src/widgets.js";

async function writeFile(targetPath, contents) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, contents, "utf8");
}

test("AppSnapshotManager.ensureFresh skips filesystem probing in explicit dirty-input mode when nothing is pending", async () => {
  let statCalls = 0;
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    watchEnabled: false,
    fsModule: {
      async stat() {
        statCalls += 1;
        throw new Error("explicit mode should not stat files during ensureFresh");
      }
    }
  });
  const activeSnapshot = { appRevision: 3, sourceIndex: [] };
  manager.activeSnapshot = activeSnapshot;

  const fresh = await manager.ensureFresh({ trigger: "request" });

  assert.equal(fresh, activeSnapshot);
  assert.equal(statCalls, 0);
  assert.equal(manager.diagnostics().dirtyInputMode, "explicit");
});

test("AppSnapshotManager.ensureFresh in watch mode waits for explicit invalidation instead of probing the filesystem", async () => {
  let statCalls = 0;
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    watchEnabled: true,
    fsModule: {
      async stat() {
        statCalls += 1;
        throw new Error("watch mode should not stat files during ensureFresh");
      }
    }
  });
  const activeSnapshot = { appRevision: 3, sourceIndex: [] };
  manager.activeSnapshot = activeSnapshot;

  const fresh = await manager.ensureFresh({ trigger: "request" });

  assert.equal(fresh, activeSnapshot);
  assert.equal(statCalls, 0);
  assert.equal(manager.diagnostics().dirtyInputMode, "watch");
});

test("AppSnapshotManager.ensureFresh rebuilds only pending explicit dirty paths without filesystem probing", async () => {
  let statCalls = 0;
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    watchEnabled: false,
    fsModule: {
      async stat() {
        statCalls += 1;
        throw new Error("explicit mode should not stat files during ensureFresh");
      }
    }
  });
  manager.activeSnapshot = { appRevision: 3, sourceIndex: [] };
  manager.pendingDirtySources.add("C:/tmp/app/shell.rvm");
  manager.consumeDirtyAndRebuild = async trigger => ({
    appRevision: 4,
    trigger
  });

  const fresh = await manager.ensureFresh({ trigger: "reload" });

  assert.equal(fresh.appRevision, 4);
  assert.equal(fresh.trigger, "reload");
  assert.equal(statCalls, 0);
});

test("AppSnapshotManager.ensureFresh derives dirty paths from witness-core generation metadata without local filesystem probing", async () => {
  let statCalls = 0;
  let refreshCalls = 0;
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/examples/engentus/app.wtoml",
    appRoot: "C:/tmp/examples/engentus",
    runtimeProfile: "full",
    devMode: true,
    watchEnabled: false,
    dirtyDetectionOwner: "witness-core",
    witnessCoreStatusStore: {
      async refresh() {
        refreshCalls += 1;
        return {
          generations: [{
            id: "gen_live_1",
            state: "green_local",
            sourcePaths: ["examples/engentus/app/shell-auth.rvm"]
          }]
        };
      }
    },
    fsModule: {
      async stat() {
        statCalls += 1;
        throw new Error("witness-core dirty detection should not stat files during ensureFresh");
      }
    }
  });
  manager.activeSnapshot = {
    appRevision: 3,
    sourceIndex: [{
      filePath: "C:/tmp/examples/engentus/app/shell-auth.rvm",
      sourceLanguage: "rvm",
      contentHash: "abc",
      mtimeMs: 10,
      size: 100
    }]
  };
  manager.consumeDirtyAndRebuild = async trigger => ({
    appRevision: 4,
    trigger
  });

  const fresh = await manager.ensureFresh({ trigger: "request" });

  assert.equal(fresh.appRevision, 4);
  assert.equal(fresh.trigger, "request");
  assert.equal(refreshCalls, 1);
  assert.equal(statCalls, 0);
  assert.equal(manager.lastAppliedWitnessCoreGenerationId, "gen_live_1");
  assert.equal(manager.diagnostics().dirtyDetectionOwner, "witness-core");
});

test("AppSnapshotManager.ensureFresh ignores preview witness-core generations for canonical refresh", async () => {
  const activeSnapshot = { appRevision: 7, sourceIndex: [] };
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    watchEnabled: false,
    dirtyDetectionOwner: "witness-core",
    witnessCoreStatusStore: {
      async refresh() {
        return {
          generations: [{
            id: "preview-session-1-g2",
            state: "green_local",
            sourcePaths: ["app/shell.rvm"]
          }]
        };
      }
    }
  });
  manager.activeSnapshot = activeSnapshot;
  manager.consumeDirtyAndRebuild = async () => {
    throw new Error("preview or failed generations should not trigger canonical rebuild");
  };

  const fresh = await manager.ensureFresh({ trigger: "request" });

  assert.equal(fresh, activeSnapshot);
  assert.equal(manager.pendingDirtySources.size, 0);
  assert.equal(manager.lastAppliedWitnessCoreGenerationId, null);
});

test("AppSnapshotManager applySourceEdits uses witness-core bridge for persisted published writes when available", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];
  const bridgeCalls = [];
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    generationBridge: {
      async statSource(input) {
        bridgeCalls.push({ kind: "stat", ...structuredClone(input) });
        return { path: input.path, exists: true, hash: "sha256:baseline", size: 12 };
      },
      async writeSource(input) {
        bridgeCalls.push({ kind: "write", ...structuredClone(input) });
        return { path: input.path, hash: "sha256:test", size: String(input.content ?? "").length };
      }
    },
    fsModule: {
      async mkdir(target) {
        mkdirCalls.push(String(target));
      },
      async writeFile(target, content) {
        writeFileCalls.push([String(target), String(content)]);
      }
    }
  });
  manager.consumeDirtyAndRebuild = async () => ({ appRevision: 3 });

  const result = await manager.applySourceEdits([{
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)"
  }], {
    persist: true,
    reason: "app.source.write",
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "tester"
    }
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.changedSources, ["app/shell.rvm"]);
  assert.deepEqual(bridgeCalls, [{
    kind: "stat",
    path: "app/shell.rvm",
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "tester"
    }
  }, {
    kind: "write",
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)",
    expectedHash: "sha256:baseline",
    reason: "app.source.write",
    previewOnly: false,
    correlation: {
      sessionId: "session-1",
      surfaceId: "surface-1",
      actor: "tester"
    }
  }]);
  assert.deepEqual(mkdirCalls, []);
  assert.deepEqual(writeFileCalls, []);
});

test("AppSnapshotManager applySourceEdits falls back to local fs when witness-core bridge write fails", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    logger: { warn() {} },
    generationBridge: {
      async writeSource() {
        throw new Error("bridge offline");
      }
    },
    fsModule: {
      async mkdir(target) {
        mkdirCalls.push(String(target));
      },
      async writeFile(target, content) {
        writeFileCalls.push([String(target), String(content)]);
      }
    }
  });
  manager.consumeDirtyAndRebuild = async () => ({ appRevision: 4 });

  const result = await manager.applySourceEdits([{
    path: "app/shell.rvm",
    content: "(surface LocalFallback)"
  }], {
    persist: true
  });

  assert.equal(result.ok, true);
  assert.deepEqual(mkdirCalls, ["C:\\tmp\\app"]);
  assert.deepEqual(writeFileCalls, [["C:\\tmp\\app\\shell.rvm", "(surface LocalFallback)"]]);
});

test("AppSnapshotManager applySourceEdits fails closed when witness-core published writes are required", async () => {
  const mkdirCalls = [];
  const writeFileCalls = [];
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    logger: { warn() {} },
    requireGenerationBridgeForPublishedWrites: true,
    generationBridge: {
      async statSource() {
        return { path: "app/shell.rvm", exists: true, hash: "sha256:baseline", size: 20 };
      },
      async writeSource() {
        const error = new Error("witness core unavailable");
        error.status = 503;
        error.code = "WITNESS_CORE_UNAVAILABLE";
        throw error;
      }
    },
    fsModule: {
      async mkdir(target) {
        mkdirCalls.push(String(target));
      },
      async writeFile(target, content) {
        writeFileCalls.push([String(target), String(content)]);
      }
    }
  });
  manager.consumeDirtyAndRebuild = async () => ({ appRevision: 4 });

  await assert.rejects(
    manager.applySourceEdits([{
      path: "app/shell.rvm",
      content: "(surface NoFallback)"
    }], {
      persist: true
    }),
    error => error?.status === 503 && error?.code === "WITNESS_CORE_UNAVAILABLE"
  );

  assert.deepEqual(mkdirCalls, []);
  assert.deepEqual(writeFileCalls, []);
});

test("AppPreviewSessionManager stores overlay edits without publishing to disk", async () => {
  const readFileCalls = [];
  const patchCalls = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      manifestPath: "C:/tmp/app.wtoml",
      appRoot: "C:/tmp",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return { appRevision: 7 };
      }
    },
    fsModule: {
      async readFile(target) {
        readFileCalls.push(String(target));
        return "(surface Shell)";
      }
    },
    generationBridge: {
      async patchSource(input) {
        patchCalls.push(structuredClone(input));
        return { path: input.path, hash: "sha256:test", size: String(input.content ?? "").length };
      }
    }
  });

  const session = previewManager.createSession();
  const internalSession = previewManager.sessions.get(session.id);
  let rebuildCalls = 0;
  previewManager.rebuildPreviewSnapshot = async currentSession => {
    rebuildCalls += 1;
    return {
      world: {
        allWitnesses() {
          return [];
        }
      },
      appProject: { sourceFiles: [] },
      sourceIndex: [],
      compiledUnits: new Map()
    };
  };

  const updated = await previewManager.patchSources(session.id, [{
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)"
  }]);
  const resolvedSourcePath = path.resolve("C:/tmp/app/shell.rvm");

  assert.equal(updated.previewRevision, 1);
  assert.deepEqual(updated.changedSources, ["app/shell.rvm"]);
  assert.equal(internalSession.overlaySources.get(resolvedSourcePath), "(surface ShellUpdated)");
  assert.equal(rebuildCalls, 1);
  assert.deepEqual(readFileCalls, []);
  assert.deepEqual(patchCalls, [{
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)",
    reason: "preview.overlay.patch",
    previewOnly: true,
    correlation: {
      sessionId: null,
      surfaceId: null,
      actor: null
    }
  }]);
});

test("AppPreviewSessionManager fails closed when witness-core preview access is required but unavailable", async () => {
  const readFileCalls = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      manifestPath: "C:/tmp/app.wtoml",
      appRoot: "C:/tmp",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return { appRevision: 7 };
      }
    },
    fsModule: {
      async readFile(target) {
        readFileCalls.push(String(target));
        return "(surface LocalFallback)";
      }
    },
    requireGenerationBridgeForPreviewAccess: true
  });

  const session = previewManager.createSession();

  await assert.rejects(
    previewManager.patchSources(session.id, [{
      path: "app/shell.rvm",
      content: "(surface RustOwnedOnly)"
    }]),
    error => error?.status === 503 && error?.code === "WITNESS_CORE_UNAVAILABLE"
  );

  assert.deepEqual(readFileCalls, []);
});

test("AppPreviewSessionManager rebuilds previews through witness-core source capabilities when preview access is required", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-preview-core-"));
  const appRoot = path.join(tempRoot, "app");
  const manifestPath = path.join(appRoot, "app.wtoml");
  const manifestText = `[app]
id = "preview_core_app"
imports = ["app/content.wtoml"]
`;
  await writeFile(manifestPath, manifestText);
  await writeFile(path.join(appRoot, "app", "content.wtoml"), "");

  let snapshotManager = null;
  try {
    const appProject = await loadAppProject(appRoot);
    snapshotManager = await AppSnapshotManager.create({
      appProject,
      runtimeProfile: "full",
      devMode: false
    });

    const bridgeCalls = [];
    const previewManager = new AppPreviewSessionManager({
      appSnapshotManager: snapshotManager,
      fsModule: {
        async readFile() {
          throw new Error("local preview read should not be used");
        },
        async stat() {
          throw new Error("local preview stat should not be used");
        }
      },
      generationBridge: {
        async readSource(input) {
          bridgeCalls.push({ kind: "read", path: input.path });
          if (input.path === "app.wtoml") {
            return { path: input.path, content: manifestText, hash: "sha256:manifest", size: manifestText.length };
          }
          if (input.path === "app/content.wtoml") {
            return { path: input.path, content: "", hash: "sha256:content", size: 0 };
          }
          throw new Error(`unexpected read path ${input.path}`);
        },
        async statSource(input) {
          bridgeCalls.push({ kind: "stat", path: input.path });
          if (input.path === "app.wtoml") {
            return { path: input.path, exists: true, hash: "sha256:manifest", size: manifestText.length, modifiedAt: "2026-01-01T00:00:00.000Z" };
          }
          if (input.path === "app/content.wtoml") {
            return { path: input.path, exists: true, hash: "sha256:content", size: 0, modifiedAt: "2026-01-01T00:00:00.000Z" };
          }
          throw new Error(`unexpected stat path ${input.path}`);
        },
        async patchSource(input) {
          bridgeCalls.push({ kind: "patch", path: input.path, content: input.content });
          return { path: input.path, hash: "sha256:patched", size: String(input.content ?? "").length };
        }
      },
      requireGenerationBridgeForPreviewAccess: true
    });

    const session = previewManager.createSession();
    const updated = await previewManager.patchSources(session.id, [{
      path: "app/content.wtoml",
      content: ""
    }]);

    assert.equal(updated.previewRevision, 1);
    assert.equal(bridgeCalls.some(call => call.kind === "patch" && call.path === "app/content.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === "app.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === "app.wtoml"), true);
  } finally {
    snapshotManager?.close?.();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("AppPreviewSessionManager uses workspace-scoped witness-core source ids for shared-lib preview sources", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-preview-shared-lib-"));
  const appRoot = path.join(tempRoot, "examples", "engentus");
  const manifestPath = path.join(appRoot, "app.wtoml");
  const manifestText = `[app]
id = "preview_shared_lib_app"
imports = ["../_lib/common.wtoml"]
`;
  await writeFile(manifestPath, manifestText);
  await writeFile(path.join(tempRoot, "examples", "_lib", "common.wtoml"), "");

  let snapshotManager = null;
  try {
    const appProject = await loadAppProject(appRoot);
    snapshotManager = await AppSnapshotManager.create({
      appProject,
      runtimeProfile: "full",
      cacheCwd: tempRoot,
      devMode: false
    });

    const bridgeCalls = [];
    const previewManager = new AppPreviewSessionManager({
      appSnapshotManager: snapshotManager,
      fsModule: {
        async readFile() {
          throw new Error("local shared-lib preview read should not be used");
        },
        async stat() {
          throw new Error("local shared-lib preview stat should not be used");
        }
      },
      generationBridge: {
        async readSource(input) {
          bridgeCalls.push({ kind: "read", path: input.path });
          if (input.path === "app.wtoml") {
            return { path: input.path, content: manifestText, hash: "sha256:manifest", size: manifestText.length };
          }
          if (input.path === "examples/_lib/common.wtoml") {
            return { path: input.path, content: "", hash: "sha256:shared", size: 0 };
          }
          throw new Error(`unexpected read path ${input.path}`);
        },
        async statSource(input) {
          bridgeCalls.push({ kind: "stat", path: input.path });
          if (input.path === "app.wtoml") {
            return { path: input.path, exists: true, hash: "sha256:manifest", size: manifestText.length, modifiedAt: "2026-01-01T00:00:00.000Z" };
          }
          if (input.path === "examples/_lib/common.wtoml") {
            return { path: input.path, exists: true, hash: "sha256:shared", size: 0, modifiedAt: "2026-01-01T00:00:00.000Z" };
          }
          throw new Error(`unexpected stat path ${input.path}`);
        },
        async patchSource(input) {
          bridgeCalls.push({ kind: "patch", path: input.path, content: input.content });
          return { path: input.path, hash: "sha256:patched", size: String(input.content ?? "").length };
        }
      },
      requireGenerationBridgeForPreviewAccess: true
    });

    const session = previewManager.createSession();
    const sharedLibPath = path.join(tempRoot, "examples", "_lib", "common.wtoml");
    const internalSession = previewManager.sessions.get(session.id);
    await previewManager.readPreviewSourceText(sharedLibPath, null, internalSession);
    await previewManager.readPreviewSourceStat(sharedLibPath, internalSession);
    const updated = await previewManager.patchSources(session.id, [{
      path: "../_lib/common.wtoml",
      content: ""
    }]);

    assert.equal(updated.previewRevision, 1);
    assert.equal(bridgeCalls.some(call => call.kind === "patch" && call.path === "examples/_lib/common.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === "app.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === "app.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "read" && call.path === "examples/_lib/common.wtoml"), true);
    assert.equal(bridgeCalls.some(call => call.kind === "stat" && call.path === "examples/_lib/common.wtoml"), true);
  } finally {
    snapshotManager?.close?.();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test("AppPreviewSessionManager marks sessions stale when the active app revision changes", () => {
  let activeRevision = 4;
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return { appRevision: activeRevision };
      }
    }
  });

  const session = previewManager.createSession();
  assert.equal(session.status, "active");

  activeRevision = 5;
  const stale = previewManager.readSession(session.id);

  assert.equal(stale.status, "stale");
  assert.match(stale.invalidReason, /expected app revision 4, active revision 5/);
});

test("AppPreviewSessionManager hydrates persisted preview sessions from witness core and rebuilds their preview world", async () => {
  const reads = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      manifestPath: "C:/tmp/app.wtoml",
      appRoot: "C:/tmp",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return { appRevision: 7, world: { allWitnesses() { return []; } } };
      }
    },
    generationBridge: {
      async readPreviewSession({ id }) {
        reads.push(id);
        return {
          id,
          baseAppRevision: 7,
          previewRevision: 2,
          status: "active",
          invalidReason: null,
          createdAt: "1",
          updatedAt: "2",
          changedSources: ["app/content.wtoml"],
          overlaySources: [{
            file: "C:/tmp/app/content.wtoml",
            content: 'text = "Live Core Preview"'
          }],
          candidates: [],
          candidateResults: [],
          correlation: {
            sessionId: "session-1",
            surfaceId: "surface-1",
            actor: "tester"
          },
          generationSequence: 2,
          currentGenerationId: "preview-session-1-g2",
          lastGoodGenerationId: "preview-session-1-g2",
          latestGenerationId: "preview-session-1-g2",
          latestGenerationState: "green_local",
          generationHistory: [{
            id: "preview-session-1-g2",
            state: "green_local",
            previewRevision: 2,
            createdAt: "2",
            sourcePaths: ["app/content.wtoml"]
          }]
        };
      }
    }
  });
  let rebuildCalls = 0;
  previewManager.rebuildPreviewSnapshot = async (_sessionLike, { overlaySources, previewRevision } = {}) => {
    rebuildCalls += 1;
    return {
      world: {
        allWitnesses() {
          return [];
        }
      },
      appProject: { sourceFiles: [] },
      sourceIndex: [],
      compiledUnits: new Map(),
      previewRevision,
      overlaySources
    };
  };

  const hydrated = await previewManager.hydrateSession("preview-session-1");
  const resolved = previewManager.resolveRenderSession("preview-session-1");

  assert.equal(reads[0], "preview-session-1");
  assert.equal(rebuildCalls, 1);
  assert.equal(hydrated.previewRevision, 2);
  assert.equal(resolved.ok, true);
  assert.equal(resolved.session.previewRevision, 2);
  assert.equal(previewManager.readSession("preview-session-1")?.generation.latestState, "green_local");
});

test("AppPreviewSessionManager persists stale preview session invalidation back to witness core", async () => {
  let activeRevision = 9;
  const writes = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return { appRevision: activeRevision };
      }
    },
    generationBridge: {
      async readPreviewSession() {
        return {
          id: "preview-stale",
          baseAppRevision: 7,
          previewRevision: 1,
          status: "active",
          invalidReason: null,
          createdAt: "1",
          updatedAt: "1",
          changedSources: [],
          overlaySources: [],
          candidates: [],
          candidateResults: [],
          correlation: { sessionId: null, surfaceId: null, actor: null },
          generationSequence: 1,
          currentGenerationId: "preview-stale-g1",
          lastGoodGenerationId: "preview-stale-g1",
          latestGenerationId: "preview-stale-g1",
          latestGenerationState: "green_local",
          generationHistory: []
        };
      },
      async writePreviewSession({ session }) {
        writes.push(structuredClone(session));
        return session;
      }
    }
  });

  const hydrated = await previewManager.hydrateSession("preview-stale", { rebuild: false });

  assert.equal(hydrated.status, "stale");
  assert.match(hydrated.invalidReason, /expected app revision 7, active revision 9/);
  await previewManager.flushSessionPersistence("preview-stale");
  assert.equal(writes.at(-1)?.status, "stale");
});

test("AppPreviewSessionManager mirrors preview revisions into witness core generations and preserves last good state on failure", async () => {
  const generationCalls = [];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      manifestPath: "C:/tmp/app.wtoml",
      appRoot: "C:/tmp",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return { appRevision: 7 };
      }
    },
    generationBridge: {
      async publishGeneration(input) {
        generationCalls.push(structuredClone(input));
        return {
          id: input.id,
          state: input.state,
          createdAt: `gen-${generationCalls.length}`
        };
      }
    }
  });

  const session = previewManager.createSession({
    correlation: {
      sessionId: "user-session-1",
      surfaceId: "route.goodman",
      actor: "operator"
    }
  });
  const internalSession = previewManager.sessions.get(session.id);
  previewManager.rebuildPreviewSnapshot = async (_currentSession, { previewRevision } = {}) => ({
    world: { allWitnesses() { return []; } },
    appProject: { sourceFiles: [], runtimePluginRegistries: null },
    sourceIndex: [],
    compiledUnits: new Map(),
    previewRevision
  });

  const first = await previewManager.patchSources(session.id, [{
    path: "app/shell.rvm",
    content: "(surface ShellUpdated)"
  }]);

  assert.equal(first.previewRevision, 1);
  assert.equal(first.generation.currentId, `preview-${session.id}-g1`);
  assert.equal(first.generation.lastGoodId, `preview-${session.id}-g1`);
  assert.equal(first.generation.latestState, "green_local");
  assert.equal(generationCalls[0].state, "green_local");
  assert.equal(generationCalls[0].correlation.sessionId, "user-session-1");
  assert.deepEqual(generationCalls[0].sourcePaths, ["app/shell.rvm"]);

  previewManager.rebuildPreviewSnapshot = async () => {
    throw new Error("preview rebuild failed");
  };

  await assert.rejects(
    previewManager.patchSources(session.id, [{
      path: "app/shell.rvm",
      content: "(surface Broken)"
    }]),
    /preview rebuild failed/
  );

  assert.equal(internalSession.previewRevision, 1);
  assert.equal(internalSession.currentGenerationId, `preview-${session.id}-g1`);
  assert.equal(internalSession.lastGoodGenerationId, `preview-${session.id}-g1`);
  assert.equal(internalSession.latestGenerationId, `preview-${session.id}-g2`);
  assert.equal(internalSession.latestGenerationState, "compile_failed");
  assert.equal(generationCalls[1].state, "compile_failed");
  assert.match(generationCalls[1].message, /preview rebuild failed/);
});

test("AppPreviewSessionManager resolves source associations by target query", () => {
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: {
            allWitnesses() {
              return [
                {
                  process: "dsl.source.annotate",
                  body: {
                    target: "EngentusLoginPasswordField",
                    file: "C:/tmp/app/shell-auth.rvm",
                    startLine: 59,
                    sourceLanguage: "rvm",
                    sourceKind: "view"
                  }
                },
                {
                  process: "dsl.source.annotate",
                  body: {
                    target: "EngentusLoginPasswordField",
                    file: "C:/tmp/app/engentus-desired-v2.wcss",
                    startLine: 1359,
                    sourceLanguage: "wcss",
                    sourceKind: "identity"
                  }
                }
              ];
            }
          }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "engentusloginpasswordfield");

  assert.equal(result.query, "engentusloginpasswordfield");
  assert.deepEqual(result.targets, ["EngentusLoginPasswordField"]);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(
    result.matches.map(match => [match.sourceLanguage, match.file]),
    [
      ["wcss", "C:/tmp/app/engentus-desired-v2.wcss"],
      ["rvm", "C:/tmp/app/shell-auth.rvm"]
    ]
  );
});

test("AppPreviewSessionManager replays widget evolution candidates against preview worlds and replaces prior candidate state", async () => {
  const world = createWorld();
  defineWidget(world, {
    actor: "system",
    id: "todo_title",
    kind: "Heading",
    props: { text: "Witness Todo", level: 1 },
    context: "frontend"
  });
  defineWidgetVersion(world, {
    actor: "system",
    soul: "todo_banner",
    version: "todo_banner_v1",
    kind: "Text",
    props: { text: "Versioned widget: v1" },
    context: "frontend"
  });
  defineWidgetVersion(world, {
    actor: "system",
    soul: "todo_banner",
    version: "todo_banner_v2",
    kind: "Text",
    props: { text: "Versioned widget: v2" },
    context: "frontend"
  });
  defineWidgetVersionTransition(world, {
    actor: "system",
    soul: "todo_banner",
    from: "todo_banner_v1",
    to: "todo_banner_v2",
    strategy: "compatible"
  });
  activateWidgetVersion(world, { actor: "system", soul: "todo_banner", version: "todo_banner_v1" });

  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world,
          compiledUnits: new Map()
        };
      }
    }
  });

  const session = previewManager.createSession();
  const first = await previewManager.patchCandidates(session.id, [{
    kind: "widget.replace",
    input: { id: "todo_title", kind: "Paragraph", text: "Preview paragraph" }
  }]);
  assert.equal(first.previewSession.previewRevision, 1);
  assert.equal(first.results[0].ok, true);
  assert.equal(first.results[0].migrationStatus, "compatible");
  const replacedWorld = previewManager.resolveRenderSession(session.id).world;
  const replacedWidget = widgetDefinitions(replacedWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(replacedWidget.kind, "Paragraph");
  assert.equal(replacedWidget.props.text, "Preview paragraph");

  const second = await previewManager.patchCandidates(session.id, [{
    kind: "widget.version.activate",
    input: { soul: "todo_banner", version: "todo_banner_v2" }
  }]);
  assert.equal(second.previewSession.previewRevision, 2);
  assert.equal(second.results[0].ok, true);
  assert.equal(second.results[0].migrationStatus, "compatible");
  const replayedWorld = previewManager.resolveRenderSession(session.id).world;
  const replayedWidget = widgetDefinitions(replayedWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(replayedWidget.kind, "Heading");
  const replayedBanner = widgetDefinitions(replayedWorld.allWitnesses()).find(row => row.id === "todo_banner");
  assert.equal(replayedBanner.props.text, "Versioned widget: v2");

  const third = await previewManager.patchCandidates(session.id, [{
    kind: "widget.replace.rollback",
    input: { id: "todo_title" }
  }]);
  assert.equal(third.previewSession.previewRevision, 3);
  assert.equal(third.results[0].ok, false);
  assert.equal(third.results[0].migrationStatus, "blocked");
  assert.match(third.results[0].reason, /no previous widget\.replace witness/);

  const rollbackSession = previewManager.createSession();
  const rollbackPreview = await previewManager.patchCandidates(rollbackSession.id, [
    {
      kind: "widget.replace",
      input: { id: "todo_title", kind: "Paragraph", text: "Rollback me" }
    },
    {
      kind: "widget.replace.rollback",
      input: { id: "todo_title" }
    }
  ]);
  assert.equal(rollbackPreview.previewSession.previewRevision, 1);
  assert.equal(rollbackPreview.results[0].ok, true);
  assert.equal(rollbackPreview.results[1].ok, true);
  assert.equal(rollbackPreview.results[1].migrationStatus, "compatible");
  const rolledBackWorld = previewManager.resolveRenderSession(rollbackSession.id).world;
  const rolledBackWidget = widgetDefinitions(rolledBackWorld.allWitnesses()).find(row => row.id === "todo_title");
  assert.equal(rolledBackWidget.kind, "Heading");
  assert.equal(rolledBackWidget.props.text, "Witness Todo");
});

test("AppPreviewSessionManager ranks target candidates from descriptor metadata and exposes provenance", () => {
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 40,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/engentus-desired-v2.wcss",
        startLine: 460,
        sourceLanguage: "wcss",
        sourceKind: "identity"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanChartTooltip",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 88,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRunProgressFill",
        surfaceKind: "leaf",
        className: "prog-fill running",
        props: {
          presentationAnchor: "goodman-run-progress-fill",
          text: "Running"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanChartTooltip",
        surfaceKind: "leaf",
        className: "chart-page__tooltip",
        props: {
          presentationAnchor: "goodman-chart-tooltip",
          text: "Tooltip"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "", {
    descriptor: {
      id: "goodman-run-progress-fill",
      classNames: ["prog-fill", "running"],
      textPreview: "Running"
    }
  });

  assert.equal(result.resolvedTarget, "GoodmanRunProgressFill");
  assert.equal(result.candidates[0].target, "GoodmanRunProgressFill");
  assert.equal(result.candidates[0].confidence, "high");
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "dom-anchor"), true);
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "class-token"), true);
  assert.equal(result.targets.includes("GoodmanChartTooltip"), true);
});

test("AppPreviewSessionManager inspects editable RVM targets with authored props and valid property catalog", async () => {
  const sourceText = `import desire/v3-alpha

view EngentusLoginPasswordField {
  kind form-field
  class auth-field
  prop label = "Password"
  prop inputType = "password"
  prop inputId = "login-pw"
  prop placeholder = "secret"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusLoginPasswordField",
        file: "C:/tmp/app/shell-auth.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusLoginPasswordField",
        surfaceKind: "form-field",
        className: "auth-field",
        props: {
          label: "Password",
          inputType: "password",
          inputId: "login-pw",
          placeholder: "secret"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-auth.rvm" || String(target) === "C:/tmp/app/shell-auth.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  const inspection = await previewManager.inspectTarget(session.id, "EngentusLoginPasswordField");

  assert.equal(inspection.target, "EngentusLoginPasswordField");
  assert.equal(inspection.componentKind, "form-field");
  assert.equal(inspection.editable, true);
  assert.equal(inspection.authoredProps.class, "auth-field");
  assert.equal(inspection.authoredProps.label, "Password");
  assert.equal(inspection.runtimeProps.surfaceKind, "form-field");
  assert.equal(inspection.validProps.some(entry => entry.key === "label"), true);
  assert.equal(inspection.validProps.some(entry => entry.key === "inputType"), true);
  assert.deepEqual(
    inspection.validProps.find(entry => entry.key === "inputType")?.options,
    ["text", "password", "email", "number", "search", "tel", "url"]
  );
});

test("AppPreviewSessionManager inspectTarget returns breadcrumbs and resolved provenance for descriptor-driven selection", async () => {
  const sourceText = `import desire/v3-alpha

view GoodmanPanel {
  kind group
}

view GoodmanRunProgressFill {
  kind text
  prop presentationAnchor = "goodman-run-progress-fill"
  prop text = "Running"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanPanel",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "GoodmanRunProgressFill",
        file: "C:/tmp/app/shell-goodman.rvm",
        startLine: 7,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanPanel",
        surfaceKind: "group",
        className: "panel",
        props: {},
        bindings: [],
        interactions: [],
        children: ["GoodmanRunProgressFill"]
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "GoodmanRunProgressFill",
        surfaceKind: "text",
        className: "prog-fill running",
        props: {
          presentationAnchor: "goodman-run-progress-fill",
          text: "Running"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-goodman.rvm" || String(target) === "C:/tmp/app/shell-goodman.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  const inspection = await previewManager.inspectTarget(session.id, "", {
    descriptor: {
      id: "goodman-run-progress-fill",
      classNames: ["prog-fill", "running"]
    }
  });

  assert.equal(inspection.target, "GoodmanRunProgressFill");
  assert.deepEqual(
    inspection.breadcrumbs.map(entry => entry.target),
    ["GoodmanPanel", "GoodmanRunProgressFill"]
  );
  assert.equal(Array.isArray(inspection.candidates), true);
  assert.equal(inspection.provenance.reasons.some(reason => reason.kind === "dom-anchor"), true);
});

test("AppPreviewSessionManager resolves through ancestor surface hints before broader candidate matching", async () => {
  const witnesses = [
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusPlatformConfigApp",
        surfaceKind: "group",
        className: "platform-config-body",
        props: {},
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "PlatformConfigSaveButton",
        surfaceKind: "action",
        className: "rbtn go",
        props: {
          text: "Save"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusPlatformConfigApp",
        file: "C:/tmp/app/shell-platform-config.rvm",
        startLine: 12,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "dsl.source.annotate",
      body: {
        target: "PlatformConfigSaveButton",
        file: "C:/tmp/app/shell-platform-config.rvm",
        startLine: 48,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    }
  });

  const session = previewManager.createSession();
  const result = previewManager.readTargetSources(session.id, "", {
    descriptor: {
      classNames: ["rbtn", "go"],
      ancestorSurfaceIds: ["PlatformConfigSaveButton", "EngentusPlatformConfigApp"],
      nearestSurfaceId: "PlatformConfigSaveButton"
    }
  });

  assert.equal(result.resolvedTarget, "PlatformConfigSaveButton");
  assert.equal(result.candidates[0].target, "PlatformConfigSaveButton");
  assert.equal(result.candidates[0].provenance.reasons.some(reason => reason.kind === "surface-id"), true);
});

test("AppPreviewSessionManager patchTargetProperty updates overlays and preserves last good preview on rebuild failure", async () => {
  const sourceText = `import desire/v3-alpha

view EngentusLoginPasswordField {
  kind form-field
  prop label = "Password"
  prop inputType = "password"
}
`;
  const witnesses = [
    {
      process: "dsl.source.annotate",
      body: {
        target: "EngentusLoginPasswordField",
        file: "C:/tmp/app/shell-auth.rvm",
        startLine: 3,
        sourceLanguage: "rvm",
        sourceKind: "view"
      }
    },
    {
      process: "desire.defineSurface",
      body: {
        id: "EngentusLoginPasswordField",
        surfaceKind: "form-field",
        className: null,
        props: {
          label: "Password",
          inputType: "password"
        },
        bindings: [],
        interactions: [],
        children: []
      }
    }
  ];
  const previewManager = new AppPreviewSessionManager({
    appSnapshotManager: {
      appRoot: "C:/tmp",
      manifestPath: "C:/tmp/app.wtoml",
      runtimeProfile: "full",
      runtimePluginIds: [],
      env: {},
      getActiveSnapshot() {
        return {
          appRevision: 4,
          world: { allWitnesses() { return witnesses; } },
          appProject: { runtimePluginRegistries: null }
        };
      }
    },
    fsModule: {
      async readFile(target) {
        if (String(target) === "C:\\tmp\\app\\shell-auth.rvm" || String(target) === "C:/tmp/app/shell-auth.rvm") {
          return sourceText;
        }
        throw new Error("unexpected read");
      }
    }
  });

  const session = previewManager.createSession();
  previewManager.rebuildPreviewSnapshot = async (_sessionLike, { overlaySources, previewRevision } = {}) => ({
    world: { allWitnesses() { return witnesses; } },
    appProject: { runtimePluginRegistries: null },
    compiledUnits: new Map(),
    sourceIndex: [],
    previewRevision
  });

  const first = await previewManager.patchTargetProperty(session.id, {
    target: "EngentusLoginPasswordField",
    property: "label",
    value: "Passcode"
  });
  const internalSession = previewManager.sessions.get(session.id);
  const resolvedSourcePath = path.resolve("C:/tmp/app/shell-auth.rvm");

  assert.equal(first.previewSession.previewRevision, 1);
  assert.match(internalSession.overlaySources.get(resolvedSourcePath), /prop label = Passcode/);

  previewManager.rebuildPreviewSnapshot = async () => {
    throw new Error("preview rebuild failed");
  };

  await assert.rejects(
    previewManager.patchTargetProperty(session.id, {
      target: "EngentusLoginPasswordField",
      property: "label",
      value: "Broken"
    }),
    /preview rebuild failed/
  );
  assert.match(internalSession.overlaySources.get(resolvedSourcePath), /prop label = Passcode/);
  assert.equal(internalSession.previewRevision, 1);
});

test("AppSnapshotManager serves the stable snapshot when witness core reports a failed latest generation", () => {
  const manager = createManager({
    async stat() {
      return { mtimeMs: 10, size: 100 };
    }
  });

  manager.activeSnapshot = {
    appRevision: 2,
    changedSources: ["app/shell.rvm"],
    world: {}
  };
  manager.stableSnapshot = {
    appRevision: 1,
    changedSources: [],
    world: {}
  };

  const liveSnapshot = manager.getServingSnapshot({
    witnessCoreStatus: { latestState: "green_local" }
  });
  const failedSnapshot = manager.getServingSnapshot({
    witnessCoreStatus: { latestState: "proof_failed" }
  });

  assert.equal(liveSnapshot.appRevision, 2);
  assert.equal(failedSnapshot.appRevision, 1);
  assert.equal(manager.servingState({
    witnessCoreStatus: { latestState: "proof_failed" }
  }).mode, "stable");
});

test("AppSnapshotManager obeys explicit witness core serving modes over local fallback preference", () => {
  const manager = createManager({
    async stat() {
      return { mtimeMs: 10, size: 100 };
    }
  });

  manager.activeSnapshot = {
    appRevision: 5,
    changedSources: ["app/live.rvm"],
    world: {}
  };
  manager.stableSnapshot = {
    appRevision: 2,
    changedSources: ["app/stable.rvm"],
    world: {}
  };
  manager.servingPreference = "stable";

  const explicitLive = manager.getServingSnapshot({
    witnessCoreStatus: {
      serving: {
        requestedMode: "live",
        effectiveMode: "live",
        reason: "requested-live"
      }
    }
  });
  const explicitStable = manager.getServingSnapshot({
    witnessCoreStatus: {
      serving: {
        requestedMode: "stable",
        effectiveMode: "stable",
        reason: "requested-stable"
      }
    }
  });

  assert.equal(explicitLive.appRevision, 5);
  assert.equal(explicitStable.appRevision, 2);
  assert.equal(manager.servingState({
    witnessCoreStatus: {
      serving: {
        requestedMode: "stable",
        effectiveMode: "stable",
        reason: "requested-stable"
      }
    }
  }).effectiveMode, "stable");
});

test("AppSnapshotManager promote and rollback controls move the serving pointer intentionally", () => {
  const manager = createManager({
    async stat() {
      return { mtimeMs: 10, size: 100 };
    }
  });

  manager.activeSnapshot = {
    appRevision: 3,
    changedSources: ["app/chart.rvm"],
    world: {}
  };
  manager.stableSnapshot = {
    appRevision: 1,
    changedSources: [],
    world: {}
  };

  const rolledBack = manager.rollbackToStable();
  assert.equal(rolledBack.appRevision, 1);
  assert.equal(manager.getServingSnapshot({
    witnessCoreStatus: { latestState: "green_local" }
  }).appRevision, 1);

  const promoted = manager.promoteActiveSnapshot();
  assert.equal(promoted.appRevision, 3);
  assert.equal(manager.getStableSnapshot().appRevision, 3);
  assert.equal(manager.getServingSnapshot({
    witnessCoreStatus: { latestState: "green_local" }
  }).appRevision, 3);
  const resumed = manager.requestServeLive();
  assert.equal(resumed.mode, "live");
  assert.equal(manager.getServingSnapshot({
    witnessCoreStatus: { latestState: "green_local" }
  }).appRevision, 3);
});

test("AppSnapshotManager loads a persisted stable snapshot cache on startup", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-stable-snapshot-startup-"));
  const appRoot = path.join(tempRoot, "app");
  const manifestPath = path.join(appRoot, "app.wtoml");
  await writeFile(manifestPath, "[app]\nid = \"live_app\"\n");

  await persistStableAppSourceCache(manifestPath, {
    appProject: { appRoot },
    compiledUnits: new Map([[
      manifestPath,
      {
        filePath: manifestPath,
        sourceId: "app.wtoml",
        sourceLanguage: "wtoml",
        contentHash: "stable-hash",
        content: "[app]\nid = \"stable_app\"\n"
      }
    ]])
  }, {
    cwd: tempRoot,
    fsModule: fs
  });

  try {
    const appProject = await loadAppProject(appRoot, { cwd: tempRoot, fsModule: fs });
    const manager = await AppSnapshotManager.create({
      appProject,
      runtimeProfile: "full",
      cacheCwd: tempRoot,
      devMode: false,
      fsModule: fs
    });

    assert.equal(manager.getActiveSnapshot().appProject.appId, "live_app");
    assert.equal(manager.getStableSnapshot().appProject.appId, "stable_app");
    assert.equal(manager.getServingSnapshot({
      witnessCoreStatus: { latestState: "proof_failed" }
    }).appProject.appId, "stable_app");
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
