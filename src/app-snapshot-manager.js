import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsWatch from "node:fs";
import path from "node:path";
import { createWorld } from "./kernel.js";
import {
  applyWitnessDocsWithRuntimePlugins,
  parseWitnessToml
} from "./dsl.js";
import { loadAppProject } from "./app-project.js";
import {
  applyDesire,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire
} from "./desire/index.js";

const MANIFEST_ONLY_DOC_KINDS = new Set(["desktopTarget"]);

export const APP_REVISION_EVENTS_PATH = "/api/runtime/app-revisions/events";
export const APP_SOURCE_WRITE_PATH = "/api/runtime/app-sources";

function hashContent(text) {
  return crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function sharedLibRootFor(appRoot) {
  return path.join(path.dirname(appRoot), "_lib");
}

function isWithinRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function allowedRootsFor(appRoot) {
  return [appRoot, sharedLibRootFor(appRoot)];
}

function validateWithinAllowedRoots(filePath, appRoot) {
  if (allowedRootsFor(appRoot).some(root => isWithinRoot(filePath, root))) return true;
  throw new Error(`source path outside allowed roots: ${filePath}`);
}

function sourceLanguageFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".rvm") return "rvm";
  return "wtoml";
}

function sourceIdForPath(appRoot, filePath) {
  return normalizeSlashes(path.relative(appRoot, filePath));
}

function absolutePathForSourceId(appRoot, sourceId) {
  return path.resolve(appRoot, sourceId);
}

function uniquePaths(values = []) {
  return [...new Set(values.map(value => path.resolve(String(value || ""))).filter(Boolean))];
}

function createDependencyGraph(appProject) {
  const forward = new Map();
  const reverse = new Map();
  const ensure = filePath => {
    const resolved = path.resolve(filePath);
    if (!forward.has(resolved)) forward.set(resolved, new Set());
    if (!reverse.has(resolved)) reverse.set(resolved, new Set());
    return resolved;
  };
  for (const source of appProject.sourceFiles ?? []) ensure(source.file);
  for (const entry of appProject.importEntries ?? []) {
    const from = ensure(entry.from);
    const to = ensure(entry.file);
    forward.get(from).add(to);
    reverse.get(to).add(from);
  }
  return { forward, reverse };
}

function reverseDependentClosure(graph, changedPaths) {
  const queue = [...uniquePaths(changedPaths)];
  const dirty = new Set(queue);
  while (queue.length) {
    const current = queue.shift();
    for (const dependent of graph.reverse.get(current) ?? []) {
      if (dirty.has(dependent)) continue;
      dirty.add(dependent);
      queue.push(dependent);
    }
  }
  return dirty;
}

async function readSourceRecord(filePath, sourceLanguage, fsModule = fs) {
  const resolved = path.resolve(filePath);
  const text = await fsModule.readFile(resolved, "utf8");
  const stat = await fsModule.stat(resolved);
  return {
    filePath: resolved,
    sourceLanguage,
    content: text,
    contentHash: hashContent(text),
    mtimeMs: Number(stat.mtimeMs || 0)
  };
}

async function compileSourceUnit({
  filePath,
  sourceLanguage,
  appRoot,
  dependencyGraph,
  fsModule = fs
}) {
  const record = await readSourceRecord(filePath, sourceLanguage, fsModule);
  const importsResolved = [...(dependencyGraph.forward.get(record.filePath) ?? [])];
  if (sourceLanguage === "rvm") {
    return {
      ...record,
      sourceId: sourceIdForPath(appRoot, record.filePath),
      importsResolved,
      witnessDocs: [],
      authoredDesireDocs: [
        normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(record.filePath))
      ]
    };
  }
  const parsedDocs = parseWitnessToml(record.content).map(doc => ({ ...doc, file: record.filePath }));
  return {
    ...record,
    sourceId: sourceIdForPath(appRoot, record.filePath),
    importsResolved,
    witnessDocs: parsedDocs.filter(doc => !MANIFEST_ONLY_DOC_KINDS.has(doc.kind)),
    authoredDesireDocs: []
  };
}

function flattenCompiledUnits(manifestPath, compiledUnits) {
  const witnessDocs = [];
  const authoredDesireDocs = [];
  const seen = new Set();
  const visit = filePath => {
    const resolved = path.resolve(filePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    const unit = compiledUnits.get(resolved);
    if (!unit) return;
    witnessDocs.push(...(unit.witnessDocs ?? []));
    authoredDesireDocs.push(...(unit.authoredDesireDocs ?? []));
    for (const importedPath of unit.importsResolved ?? []) visit(importedPath);
  };
  visit(manifestPath);
  return { witnessDocs, authoredDesireDocs };
}

async function buildSnapshotWorld({
  manifestPath,
  witnessDocs,
  authoredDesireDocs,
  runtimeProfile,
  runtimePluginIds,
  env
}) {
  const world = createWorld({
    genesis: {
      system: "witness-world",
      definitionPath: manifestPath,
      mode: "app-snapshot"
    }
  });
  await applyWitnessDocsWithRuntimePlugins(world, witnessDocs, {
    runtimeProfile,
    runtimePluginIds,
    env
  });
  for (const desire of authoredDesireDocs) applyDesire(world, desire);
  return world;
}

function normalizeBuildError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack ?? "" : "",
    code: error?.code ?? null
  };
}

function debounce(fn, delayMs) {
  let timer = null;
  const wrapped = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
    timer.unref?.();
  };
  wrapped.cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

function injectAppRevisionClient(html, { appRevision, eventsPath = APP_REVISION_EVENTS_PATH } = {}) {
  const runtime = `<script>
(() => {
  const currentRevision = ${JSON.stringify(Number(appRevision || 0))};
  if (typeof EventSource !== "function") return;
  const source = new EventSource(${JSON.stringify(eventsPath)});
  source.onmessage = event => {
    try {
      const payload = JSON.parse(event.data || "{}");
      if (Number(payload.appRevision || 0) <= currentRevision) return;
      source.close();
      window.location.reload();
    } catch {}
  };
  source.onerror = () => {
    try { source.close(); } catch {}
  };
})();
</script>`;
  if (html.includes("</body>")) return html.replace("</body>", `${runtime}</body>`);
  return `${html}\n${runtime}`;
}

export class AppSnapshotManager {
  constructor({
    manifestPath,
    appRoot,
    runtimeProfile,
    runtimePluginIds = [],
    env = process.env,
    devMode = false,
    logger = null,
    fsModule = fs,
    fsWatchModule = fsWatch
  }) {
    this.manifestPath = path.resolve(manifestPath);
    this.appRoot = path.resolve(appRoot);
    this.runtimeProfile = runtimeProfile;
    this.runtimePluginIds = runtimePluginIds;
    this.env = env;
    this.devMode = devMode;
    this.logger = logger;
    this.fs = fsModule;
    this.fsWatch = fsWatchModule;
    this.activeSnapshot = null;
    this.lastGoodSnapshot = null;
    this.buildErrors = [];
    this.pendingDirtySources = new Set();
    this.appRevision = 0;
    this.listeners = new Set();
    this.serial = Promise.resolve();
    this.watchers = [];
    this.lastRevisionEvent = { appRevision: 0, changedSources: [], trigger: "initial" };
    this.watcherRoots = [];
    this.scheduleWatchRefresh = debounce(() => {
      void this.ensureFresh({ trigger: "watch" }).catch(error => {
        this.logger?.error?.("app.snapshot.watch.failed", { error });
      });
    }, 80);
  }

  static async create({
    appProject,
    runtimeProfile,
    runtimePluginIds = [],
    env = process.env,
    devMode = false,
    logger = null,
    fsModule = fs,
    fsWatchModule = fsWatch
  }) {
    const manager = new AppSnapshotManager({
      manifestPath: appProject.manifestPath,
      appRoot: appProject.appRoot,
      runtimeProfile,
      runtimePluginIds,
      env,
      devMode,
      logger,
      fsModule,
      fsWatchModule
    });
    await manager.rebuildFromProject({
      appProject,
      dirtyPaths: appProject.sourceFiles.map(row => row.file),
      trigger: "initial"
    });
    if (devMode) manager.startWatchers();
    return manager;
  }

  subscribe(listener) {
    if (typeof listener !== "function") return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getActiveSnapshot() {
    return this.activeSnapshot;
  }

  getLastRevisionEvent() {
    return {
      ...this.lastRevisionEvent,
      changedSources: [...(this.lastRevisionEvent.changedSources ?? [])]
    };
  }

  diagnostics() {
    return {
      appRevision: this.appRevision,
      buildErrors: [...this.buildErrors],
      pendingDirtySources: [...this.pendingDirtySources].map(filePath => sourceIdForPath(this.appRoot, filePath)),
      sourceCount: this.activeSnapshot?.appProject?.sourceFiles?.length ?? 0,
      devMode: this.devMode
    };
  }

  async ensureFresh({ trigger = "request" } = {}) {
    return this.runExclusive(async () => {
      const changed = await this.detectChangedPaths();
      for (const changedPath of changed) this.pendingDirtySources.add(changedPath);
      if (!this.pendingDirtySources.size) return this.activeSnapshot;
      return this.consumeDirtyAndRebuild(trigger);
    });
  }

  async markDirtyPaths(paths = [], { trigger = "manual" } = {}) {
    return this.runExclusive(async () => {
      for (const filePath of uniquePaths(paths)) this.pendingDirtySources.add(filePath);
      if (!this.pendingDirtySources.size) return this.activeSnapshot;
      return this.consumeDirtyAndRebuild(trigger);
    });
  }

  async applySourceEdits(edits = [], { persist = true, trigger = "post" } = {}) {
    return this.runExclusive(async () => {
      if (!Array.isArray(edits) || !edits.length) {
        return { ok: false, appRevision: this.appRevision, buildErrors: [{ message: "edits are required", stack: "", code: "APP_SOURCE_EDITS_REQUIRED" }] };
      }
      const resolvedEdits = edits.map(edit => {
        const sourceId = typeof edit?.path === "string" && edit.path.trim()
          ? normalizeSlashes(edit.path.trim())
          : null;
        if (!sourceId) throw new Error("each source edit requires path");
        if (typeof edit?.content !== "string") throw new Error(`source edit ${sourceId} requires string content`);
        const resolvedPath = absolutePathForSourceId(this.appRoot, sourceId);
        validateWithinAllowedRoots(resolvedPath, this.appRoot);
        return {
          path: resolvedPath,
          sourceId: sourceIdForPath(this.appRoot, resolvedPath),
          content: edit.content
        };
      });
      if (persist) {
        for (const edit of resolvedEdits) {
          await this.fs.mkdir(path.dirname(edit.path), { recursive: true });
          await this.fs.writeFile(edit.path, edit.content, "utf8");
        }
      }
      for (const edit of resolvedEdits) this.pendingDirtySources.add(edit.path);
      const snapshot = await this.consumeDirtyAndRebuild(trigger);
      return {
        ok: this.buildErrors.length === 0,
        appRevision: snapshot?.appRevision ?? this.appRevision,
        changedSources: resolvedEdits.map(edit => edit.sourceId),
        buildErrors: [...this.buildErrors]
      };
    });
  }

  injectDevClient(html, snapshot = null) {
    if (!this.devMode) return html;
    return injectAppRevisionClient(html, {
      appRevision: snapshot?.appRevision ?? this.appRevision,
      eventsPath: APP_REVISION_EVENTS_PATH
    });
  }

  close() {
    this.scheduleWatchRefresh.cancel?.();
    for (const watcher of this.watchers) {
      try { watcher.close(); } catch {}
    }
    this.watchers = [];
  }

  async runExclusive(action) {
    const task = this.serial.then(action, action);
    this.serial = task.catch(() => {});
    return task;
  }

  async detectChangedPaths() {
    const snapshot = this.activeSnapshot;
    if (!snapshot) return new Set();
    const changed = new Set();
    const currentKnown = new Map(snapshot.sourceIndex.map(row => [row.filePath, row]));
    for (const row of currentKnown.values()) {
      try {
        const current = await readSourceRecord(row.filePath, row.sourceLanguage, this.fs);
        if (current.contentHash !== row.contentHash || current.mtimeMs !== row.mtimeMs) changed.add(row.filePath);
      } catch {
        changed.add(row.filePath);
      }
    }
    return changed;
  }

  async consumeDirtyAndRebuild(trigger) {
    const dirtyPaths = [...this.pendingDirtySources];
    if (!dirtyPaths.length) return this.activeSnapshot;
    this.pendingDirtySources.clear();
    try {
      return await this.rebuildFromProject({
        appProject: await loadAppProject(this.manifestPath),
        dirtyPaths,
        trigger
      });
    } catch (error) {
      this.buildErrors = [normalizeBuildError(error)];
      for (const filePath of dirtyPaths) this.pendingDirtySources.add(filePath);
      if (this.activeSnapshot) return this.activeSnapshot;
      throw error;
    }
  }

  async rebuildFromProject({ appProject, dirtyPaths = [], trigger = "rebuild" } = {}) {
    const dependencyGraph = createDependencyGraph(appProject);
    const currentDescriptors = new Map();
    for (const source of appProject.sourceFiles ?? []) {
      const resolved = path.resolve(source.file);
      currentDescriptors.set(resolved, await readSourceRecord(resolved, source.sourceLanguage ?? sourceLanguageFor(resolved), this.fs));
    }
    const dirtyClosure = reverseDependentClosure(dependencyGraph, dirtyPaths);
    const previousUnits = this.activeSnapshot?.compiledUnits ?? new Map();
    const compiledUnits = new Map();
    for (const source of appProject.sourceFiles ?? []) {
      const resolved = path.resolve(source.file);
      const current = currentDescriptors.get(resolved);
      const previous = previousUnits.get(resolved) ?? null;
      const isDirty = dirtyClosure.has(resolved)
        || !previous
        || previous.contentHash !== current.contentHash
        || previous.sourceLanguage !== current.sourceLanguage;
      if (!isDirty) {
        compiledUnits.set(resolved, previous);
        continue;
      }
      compiledUnits.set(resolved, await compileSourceUnit({
        filePath: resolved,
        sourceLanguage: source.sourceLanguage ?? sourceLanguageFor(resolved),
        appRoot: this.appRoot,
        dependencyGraph,
        fsModule: this.fs
      }));
    }
    const flattened = flattenCompiledUnits(this.manifestPath, compiledUnits);
    const world = await buildSnapshotWorld({
      manifestPath: appProject.manifestPath,
      witnessDocs: flattened.witnessDocs,
      authoredDesireDocs: flattened.authoredDesireDocs,
      runtimeProfile: this.runtimeProfile,
      runtimePluginIds: this.runtimePluginIds,
      env: this.env
    });
    const sourceIndex = [...compiledUnits.values()].map(unit => ({
      filePath: unit.filePath,
      sourceId: unit.sourceId,
      sourceLanguage: unit.sourceLanguage,
      contentHash: unit.contentHash,
      mtimeMs: unit.mtimeMs
    }));
    this.lastGoodSnapshot = this.activeSnapshot ?? null;
    this.appRevision += 1;
    this.activeSnapshot = {
      appRevision: this.appRevision,
      trigger,
      appProject,
      world,
      dependencyGraph,
      compiledUnits,
      sourceIndex
    };
    this.buildErrors = [];
    const changedSources = [...dirtyClosure].map(filePath => sourceIdForPath(this.appRoot, filePath)).sort();
    this.lastRevisionEvent = {
      appRevision: this.appRevision,
      changedSources,
      trigger
    };
    for (const listener of this.listeners) listener(this.getLastRevisionEvent());
    this.refreshWatchRoots();
    return this.activeSnapshot;
  }

  refreshWatchRoots() {
    if (!this.devMode) return;
    const nextRoots = uniquePaths(allowedRootsFor(this.appRoot));
    if (JSON.stringify(nextRoots) === JSON.stringify(this.watcherRoots)) return;
    this.close();
    this.watcherRoots = nextRoots;
    this.startWatchers();
  }

  startWatchers() {
    if (!this.devMode || this.watchers.length) return;
    const recursiveSupported = process.platform === "win32" || process.platform === "darwin";
    for (const root of this.watcherRoots.length ? this.watcherRoots : uniquePaths(allowedRootsFor(this.appRoot))) {
      try {
        const watcher = this.fsWatch.watch(root, { recursive: recursiveSupported }, () => {
          this.scheduleWatchRefresh();
        });
        this.watchers.push(watcher);
      } catch {
        const fallbackDirs = new Set([root]);
        for (const source of this.activeSnapshot?.appProject?.sourceFiles ?? []) {
          const fileDir = path.dirname(source.file);
          if (isWithinRoot(fileDir, root)) fallbackDirs.add(fileDir);
        }
        for (const directory of fallbackDirs) {
          try {
            const watcher = this.fsWatch.watch(directory, () => {
              this.scheduleWatchRefresh();
            });
            this.watchers.push(watcher);
          } catch {}
        }
      }
    }
  }
}
