import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsWatch from "node:fs";
import path from "node:path";
import { createWorld } from "./kernel.js";
import {
  applyWidgetReplace,
  classifyWidgetReplacement,
  rollbackWidgetReplace,
  requestWidgetVersionActivationShared,
  widgetReplacementPropsFromInput,
  widgetVersionMigrationStatus
} from "./widget-evolution.js";
import {
  applyWitnessDocsWithRuntimePlugins,
  parseWitnessToml
} from "./dsl.js";
import { loadAppProject } from "./app-project.js";
import {
  applyDesire,
  compileRvmToDesirePlus,
  compileWtomlDocsToDesirePlus,
  compileRvmFileToDesirePlus,
  normalizeDesirePlusToDesire,
  serializeDesirePlusToRvm,
  serializeDesirePlusToWtoml
} from "./desire/index.js";
import { widgetDefinitions, widgetVersions } from "./widgets.js";

const MANIFEST_ONLY_DOC_KINDS = new Set(["desktopTarget"]);
const previewResolverCatalogCache = new WeakMap();

export const APP_REVISION_EVENTS_PATH = "/api/runtime/app-revisions/events";
export const BACKEND_REVISION_EVENTS_PATH = "/api/runtime/backend-revisions/events";
export const APP_SOURCE_WRITE_PATH = "/api/runtime/app-sources";
export const APP_PREVIEW_SESSIONS_PATH = "/api/runtime/app-preview-sessions";

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

function normalizeSourceOverlayMap(sourceOverlayByPath = null) {
  if (!sourceOverlayByPath) return new Map();
  if (sourceOverlayByPath instanceof Map) {
    return new Map(
      [...sourceOverlayByPath.entries()]
        .map(([filePath, content]) => [path.resolve(String(filePath || "")), typeof content === "string" ? content : String(content ?? "")])
        .filter(([filePath]) => filePath)
    );
  }
  if (typeof sourceOverlayByPath !== "object") return new Map();
  return new Map(
    Object.entries(sourceOverlayByPath)
      .map(([filePath, content]) => [path.resolve(String(filePath || "")), typeof content === "string" ? content : String(content ?? "")])
      .filter(([filePath]) => filePath)
  );
}

function sourceOverlayContentFor(filePath, sourceOverlayByPath = null) {
  if (!sourceOverlayByPath) return null;
  const overlays = sourceOverlayByPath instanceof Map
    ? sourceOverlayByPath
    : normalizeSourceOverlayMap(sourceOverlayByPath);
  const resolved = path.resolve(String(filePath || ""));
  return overlays.has(resolved) ? overlays.get(resolved) : null;
}

async function readSourceText(filePath, fsModule = fs, sourceOverlayByPath = null) {
  const resolved = path.resolve(filePath);
  const overlay = sourceOverlayContentFor(resolved, sourceOverlayByPath);
  if (typeof overlay === "string") return overlay;
  return await fsModule.readFile(resolved, "utf8");
}

function syntheticOverlayStat(content) {
  return {
    mtimeMs: Date.now(),
    size: Buffer.byteLength(String(content ?? ""), "utf8")
  };
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

async function readSourceRecord(filePath, sourceLanguage, fsModule = fs, sourceOverlayByPath = null) {
  const resolved = path.resolve(filePath);
  const overlay = sourceOverlayContentFor(resolved, sourceOverlayByPath);
  const text = typeof overlay === "string"
    ? overlay
    : await fsModule.readFile(resolved, "utf8");
  const stat = typeof overlay === "string"
    ? syntheticOverlayStat(overlay)
    : await fsModule.stat(resolved);
  return {
    filePath: resolved,
    sourceLanguage,
    content: text,
    contentHash: hashContent(text),
    mtimeMs: Number(stat.mtimeMs || 0),
    size: Number(stat.size || 0)
  };
}

async function compileSourceUnit({
  filePath,
  sourceLanguage,
  appRoot,
  dependencyGraph,
  fsModule = fs,
  sourceOverlayByPath = null,
  rvmFormRegistry = null
}) {
  const record = await readSourceRecord(filePath, sourceLanguage, fsModule, sourceOverlayByPath);
  const importsResolved = [...(dependencyGraph.forward.get(record.filePath) ?? [])];
  if (sourceLanguage === "rvm") {
    return {
      ...record,
      sourceId: sourceIdForPath(appRoot, record.filePath),
      importsResolved,
      witnessDocs: [],
      authoredDesireDocs: [
        normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(record.filePath, {
          rvmFormRegistry,
          readFile: (target, encoding) => readSourceText(target, fsModule, sourceOverlayByPath, encoding)
        }), { rvmFormRegistry })
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
  appProject,
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
  const runtimeDeclarationRegistry = appProject.runtimePluginRegistries?.runtimeDeclarationRegistry ?? null;
  for (const desire of authoredDesireDocs) applyDesire(world, desire, { runtimeDeclarationRegistry });
  return world;
}

async function buildCompiledSnapshot({
  manifestPath,
  appRoot,
  appProject,
  runtimeProfile,
  runtimePluginIds,
  env,
  fsModule = fs,
  sourceOverlayByPath = null,
  previousUnits = null,
  dirtyPaths = null
} = {}) {
  const normalizedOverlays = normalizeSourceOverlayMap(sourceOverlayByPath);
  const rvmFormRegistry = appProject.runtimePluginRegistries?.rvmFormRegistry ?? null;
  const dependencyGraph = createDependencyGraph(appProject);
  const currentDescriptors = new Map();
  const effectiveDirtyPaths = Array.isArray(dirtyPaths) && dirtyPaths.length
    ? dirtyPaths
    : appProject.sourceFiles.map(row => row.file);
  const dirtyClosure = reverseDependentClosure(dependencyGraph, effectiveDirtyPaths);
  const dirtyOnlyRefresh = Boolean(previousUnits?.size) && Array.isArray(dirtyPaths) && dirtyPaths.length > 0;
  if (!dirtyOnlyRefresh) {
    for (const source of appProject.sourceFiles ?? []) {
      const resolved = path.resolve(source.file);
      currentDescriptors.set(
        resolved,
        await readSourceRecord(
          resolved,
          source.sourceLanguage ?? sourceLanguageFor(resolved),
          fsModule,
          normalizedOverlays
        )
      );
    }
  }
  const compiledUnits = new Map();
  for (const source of appProject.sourceFiles ?? []) {
    const resolved = path.resolve(source.file);
    const previous = previousUnits?.get?.(resolved) ?? null;
    const sourceLanguage = source.sourceLanguage ?? sourceLanguageFor(resolved);
    const isDirtyByDependency = dirtyClosure.has(resolved) || !previous;
    let current = currentDescriptors.get(resolved);
    if (!current && (!dirtyOnlyRefresh || isDirtyByDependency)) {
      current = await readSourceRecord(
        resolved,
        sourceLanguage,
        fsModule,
        normalizedOverlays
      );
      currentDescriptors.set(resolved, current);
    }
    const isDirty = isDirtyByDependency
      || !previous
      || !current
      || previous.contentHash !== current.contentHash
      || previous.sourceLanguage !== current.sourceLanguage;
    if (!isDirty) {
      compiledUnits.set(resolved, previous);
      continue;
    }
    compiledUnits.set(resolved, await compileSourceUnit({
      filePath: resolved,
      sourceLanguage,
      appRoot,
      dependencyGraph,
      fsModule,
      sourceOverlayByPath: normalizedOverlays,
      rvmFormRegistry
    }));
  }
  const flattened = flattenCompiledUnits(manifestPath, compiledUnits);
  const world = await buildSnapshotWorld({
    appProject,
    manifestPath: appProject.manifestPath,
    witnessDocs: flattened.witnessDocs,
    authoredDesireDocs: flattened.authoredDesireDocs,
    runtimeProfile,
    runtimePluginIds,
    env
  });
  const sourceIndex = [...compiledUnits.values()].map(unit => ({
    filePath: unit.filePath,
    sourceId: unit.sourceId,
    sourceLanguage: unit.sourceLanguage,
    contentHash: unit.contentHash,
    mtimeMs: unit.mtimeMs,
    size: Number(unit.size || 0)
  }));
  const changedSources = [...dirtyClosure].map(filePath => sourceIdForPath(appRoot, filePath)).sort();
  return {
    appProject,
    world,
    dependencyGraph,
    compiledUnits,
    sourceIndex,
    changedSources
  };
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

function normalizeRevisionEvent({
  revision = 0,
  changedSources = [],
  trigger = "initial",
  status = "active",
  branchId = null,
  changeSetId = null
} = {}) {
  return {
    revision: Number(revision || 0),
    appRevision: Number(revision || 0),
    changedSources: Array.isArray(changedSources) ? changedSources.map(String) : [],
    trigger: String(trigger || "initial"),
    status: String(status || "active"),
    branchId: branchId ? String(branchId) : null,
    changeSetId: changeSetId ? String(changeSetId) : null
  };
}

function normalizePreviewEvent({
  id = null,
  baseAppRevision = 0,
  previewRevision = 0,
  changedSources = [],
  status = "active",
  invalidReason = null
} = {}) {
  return {
    id: id ? String(id) : null,
    baseAppRevision: Number(baseAppRevision || 0),
    previewRevision: Number(previewRevision || 0),
    changedSources: Array.isArray(changedSources) ? changedSources.map(String) : [],
    status: String(status || "active"),
    invalidReason: invalidReason ? String(invalidReason) : null
  };
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
    this.lastRevisionEvent = normalizeRevisionEvent({
      revision: 0,
      changedSources: [],
      trigger: "initial",
      status: "pending"
    });
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
      devMode: this.devMode,
      lastRevisionEvent: this.getLastRevisionEvent()
    };
  }

  async ensureFresh({ trigger = "request", branchId = null, changeSetId = null, status = null } = {}) {
    return this.runExclusive(async () => {
      const changed = await this.detectChangedPaths();
      for (const changedPath of changed) this.pendingDirtySources.add(changedPath);
      if (!this.pendingDirtySources.size) return this.activeSnapshot;
      return this.consumeDirtyAndRebuild(trigger, { branchId, changeSetId, status });
    });
  }

  async markDirtyPaths(paths = [], { trigger = "manual", branchId = null, changeSetId = null, status = null } = {}) {
    return this.runExclusive(async () => {
      for (const filePath of uniquePaths(paths)) this.pendingDirtySources.add(filePath);
      if (!this.pendingDirtySources.size) return this.activeSnapshot;
      return this.consumeDirtyAndRebuild(trigger, { branchId, changeSetId, status });
    });
  }

  async applySourceEdits(edits = [], { persist = true, trigger = "post", branchId = null, changeSetId = null, status = null } = {}) {
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
      const snapshot = await this.consumeDirtyAndRebuild(trigger, { branchId, changeSetId, status });
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
    const checks = await Promise.all((snapshot.sourceIndex ?? []).map(async row => {
      try {
        const stat = await this.fs.stat(row.filePath);
        const currentMtimeMs = Number(stat.mtimeMs || 0);
        const currentSize = Number(stat.size || 0);
        return currentMtimeMs !== row.mtimeMs || currentSize !== Number(row.size || 0)
          ? row.filePath
          : null;
      } catch {
        return row.filePath;
      }
    }));
    return new Set(checks.filter(Boolean));
  }

  async consumeDirtyAndRebuild(trigger, eventMeta = {}) {
    const dirtyPaths = [...this.pendingDirtySources];
    if (!dirtyPaths.length) return this.activeSnapshot;
    this.pendingDirtySources.clear();
    try {
      return await this.rebuildFromProject({
        appProject: await loadAppProject(this.manifestPath, {
          runtimeProfile: this.runtimeProfile,
          runtimePluginIds: this.runtimePluginIds,
          env: this.env
        }),
        dirtyPaths,
        trigger,
        eventMeta
      });
    } catch (error) {
      this.buildErrors = [normalizeBuildError(error)];
      for (const filePath of dirtyPaths) this.pendingDirtySources.add(filePath);
      if (this.activeSnapshot) return this.activeSnapshot;
      throw error;
    }
  }

  async rebuildFromProject({ appProject, dirtyPaths = [], trigger = "rebuild", eventMeta = {} } = {}) {
    const compiled = await buildCompiledSnapshot({
      manifestPath: this.manifestPath,
      appRoot: this.appRoot,
      appProject,
      runtimeProfile: this.runtimeProfile,
      runtimePluginIds: this.runtimePluginIds,
      env: this.env,
      fsModule: this.fs,
      previousUnits: this.activeSnapshot?.compiledUnits ?? new Map(),
      dirtyPaths
    });
    this.lastGoodSnapshot = this.activeSnapshot ?? null;
    this.appRevision += 1;
    this.activeSnapshot = {
      appRevision: this.appRevision,
      trigger,
      ...compiled
    };
    this.buildErrors = [];
    this.lastRevisionEvent = normalizeRevisionEvent({
      revision: this.appRevision,
      changedSources: compiled.changedSources,
      trigger,
      status: eventMeta?.status ?? "active",
      branchId: eventMeta?.branchId ?? null,
      changeSetId: eventMeta?.changeSetId ?? null
    });
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

function previewSessionInvalidReason(expectedRevision, activeRevision) {
  return `preview no longer matches active snapshot (expected app revision ${expectedRevision}, active revision ${activeRevision})`;
}

function isoNow() {
  return new Date().toISOString();
}

function previewAnnotationRows(world, filePath) {
  const resolved = path.resolve(filePath);
  return (world?.allWitnesses?.() ?? [])
    .filter(witness =>
      witness?.process === "dsl.source.annotate"
      && typeof witness?.body?.file === "string"
      && path.resolve(witness.body.file) === resolved
    )
    .map(witness => ({
      target: witness.body.target ?? null,
      file: witness.body.file,
      section: witness.body.section ?? null,
      line: witness.body.line ?? null,
      startLine: witness.body.startLine ?? null,
      startColumn: witness.body.startColumn ?? null,
      endLine: witness.body.endLine ?? null,
      endColumn: witness.body.endColumn ?? null,
      sourceLanguage: witness.body.sourceLanguage ?? null,
      sourceKind: witness.body.sourceKind ?? null,
      desireNodeId: witness.body.desireNodeId ?? null,
      desireSourceNodeIds: Array.isArray(witness.body.desireSourceNodeIds) ? [...witness.body.desireSourceNodeIds] : [],
      originNodeId: witness.body.originNodeId ?? null,
      via: Array.isArray(witness.body.via) ? [...witness.body.via] : [],
      values: structuredClone(witness.body.values ?? null),
      refResolutions: Array.isArray(witness.body.refResolutions) ? structuredClone(witness.body.refResolutions) : []
    }))
    .sort((left, right) =>
      Number(left.startLine ?? left.line ?? 0) - Number(right.startLine ?? right.line ?? 0)
      || Number(left.startColumn ?? 1) - Number(right.startColumn ?? 1)
      || String(left.target ?? "").localeCompare(String(right.target ?? ""))
    );
}

function normalizePreviewTargetLookupKey(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function currentPreviewWitnessCount(world) {
  if (typeof world?.witnessCount === "function") return Number(world.witnessCount() || 0);
  return typeof world?.allWitnesses === "function" ? Number(world.allWitnesses().length || 0) : 0;
}

function plainPreviewObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function previewUniqueStrings(values = []) {
  return [...new Set(
    values
      .map(value => typeof value === "string" ? value.trim() : "")
      .filter(Boolean)
  )];
}

function previewSplitClassTokens(value) {
  return previewUniqueStrings(String(value ?? "").split(/\s+/));
}

function previewClassTokensFromProps(props = {}) {
  const source = plainPreviewObject(props) ?? {};
  const tokens = new Set();
  for (const [key, value] of Object.entries(source)) {
    if (key === "class" || key === "className" || key.endsWith("Class")) {
      for (const token of previewSplitClassTokens(value)) tokens.add(token);
    }
  }
  return [...tokens];
}

function previewStringValueAtPath(root, dottedPath) {
  const parts = String(dottedPath ?? "").split(".").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = plainPreviewObject(current)?.[part];
    if (typeof current === "undefined") return null;
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function previewArrayStringsAtPath(root, dottedPath) {
  const parts = String(dottedPath ?? "").split(".").filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = plainPreviewObject(current)?.[part];
    if (typeof current === "undefined") return [];
  }
  return Array.isArray(current) ? previewUniqueStrings(current) : [];
}

function previewDescriptorStringValues(descriptor = null) {
  const row = plainPreviewObject(descriptor) ?? {};
  const attributeRows = Array.isArray(row.attributes)
    ? row.attributes.filter(entry => plainPreviewObject(entry))
    : [];
  const attributeMap = Object.fromEntries(attributeRows.map(entry => [String(entry.name || ""), entry.value]));
  const pageMetadata = plainPreviewObject(row.pageMetadata);
  return {
    id: previewUniqueStrings([
      row.id,
      attributeMap.id,
      ...(Array.isArray(row.ancestorIds) ? row.ancestorIds : [])
    ]),
    widgetIds: previewUniqueStrings([
      row.widgetId,
      attributeMap["data-widget"],
      attributeMap["data-surface-root-widget"],
      ...(Array.isArray(row.ancestorWidgetIds) ? row.ancestorWidgetIds : [])
    ]),
    surfaceIds: previewUniqueStrings([
      row.surfaceId,
      attributeMap["data-surface-id"],
      row.activeSurfaceId,
      row.nearestSurfaceId,
      ...(Array.isArray(row.ancestorSurfaceIds) ? row.ancestorSurfaceIds : []),
      previewStringValueAtPath(pageMetadata, "bodyAttributes.surfaceRootWidget"),
      previewStringValueAtPath(pageMetadata, "bodyAttributes.surfaceProgram")
    ]),
    routeKeys: previewUniqueStrings([
      previewStringValueAtPath(pageMetadata, "bodyAttributes.surfaceRoute"),
      previewStringValueAtPath(pageMetadata, "route.pathname")
    ]),
    classNames: previewUniqueStrings([
      ...(Array.isArray(row.classNames) ? row.classNames : []),
      ...previewSplitClassTokens(attributeMap.class)
    ]),
    tagName: typeof row.tagName === "string" ? row.tagName.trim().toLowerCase() : null,
    textPreview: typeof row.textPreview === "string" ? row.textPreview.trim() : null,
    sourceHints: previewUniqueStrings([
      previewStringValueAtPath(pageMetadata, "bodyAttributes.page"),
      previewStringValueAtPath(pageMetadata, "bodyAttributes.surfaceContext")
    ])
  };
}

function previewNormalizeResolverInput(targetQuery, options = {}) {
  const query = typeof targetQuery === "string" ? targetQuery.trim() : "";
  const descriptor = plainPreviewObject(options?.descriptor) ?? null;
  return {
    query,
    normalizedQuery: normalizePreviewTargetLookupKey(query),
    descriptor,
    preferredTarget: typeof options?.preferredTarget === "string" && options.preferredTarget.trim()
      ? options.preferredTarget.trim()
      : null
  };
}

function previewTargetAnnotationMatches(world, targetQuery) {
  const lookupKey = normalizePreviewTargetLookupKey(targetQuery);
  if (!lookupKey) return [];
  return previewResolverCatalog(world).annotationMatchesByLookupKey.get(lookupKey)?.map(row => structuredClone(row)) ?? [];
}

function previewSourceLanguagePriority(sourceLanguage) {
  if (sourceLanguage === "rvm") return 0;
  if (sourceLanguage === "wtoml") return 1;
  if (sourceLanguage === "wcss") return 2;
  return 10;
}

function editablePreviewAnnotationSource(match) {
  const sourceLanguage = String(match?.sourceLanguage ?? "").trim().toLowerCase();
  return sourceLanguage === "rvm" || sourceLanguage === "wtoml";
}

function chooseResolvedTarget(matches = [], targetQuery = "") {
  const query = String(targetQuery ?? "").trim();
  if (!matches.length) return null;
  const exact = matches.find(match => String(match?.target ?? "").trim() === query);
  if (exact) return exact.target;
  const normalized = normalizePreviewTargetLookupKey(query);
  const normalizedExact = matches.find(match =>
    normalizePreviewTargetLookupKey(match?.target) === normalized
  );
  if (normalizedExact) return normalizedExact.target;
  return matches[0]?.target ?? null;
}

function clonePreviewAnnotationWitnessBody(body = {}) {
  return {
    target: body.target ?? null,
    file: body.file ?? null,
    section: body.section ?? null,
    line: body.line ?? null,
    startLine: body.startLine ?? null,
    startColumn: body.startColumn ?? null,
    endLine: body.endLine ?? null,
    endColumn: body.endColumn ?? null,
    sourceLanguage: body.sourceLanguage ?? null,
    sourceKind: body.sourceKind ?? null,
    desireNodeId: body.desireNodeId ?? null,
    desireSourceNodeIds: Array.isArray(body.desireSourceNodeIds) ? [...body.desireSourceNodeIds] : [],
    originNodeId: body.originNodeId ?? null,
    via: Array.isArray(body.via) ? [...body.via] : [],
    values: structuredClone(body.values ?? null),
    refResolutions: Array.isArray(body.refResolutions) ? structuredClone(body.refResolutions) : []
  };
}

function previewResolverCatalog(world) {
  const witnessCount = currentPreviewWitnessCount(world);
  const cached = world ? previewResolverCatalogCache.get(world) : null;
  if (cached && cached.witnessCount === witnessCount) return cached.value;
  const witnesses = world?.allWitnesses?.() ?? [];
  const annotationRows = [];
  const annotationTargets = new Set();
  const annotationMatchesByLookupKey = new Map();
  const runtimeSurfaceRows = [];
  const parentByChild = new Map();
  for (const witness of witnesses) {
    if (witness?.process === "dsl.source.annotate" && typeof witness?.body?.target === "string") {
      const row = clonePreviewAnnotationWitnessBody(witness.body);
      const lookupKey = normalizePreviewTargetLookupKey(row.target);
      annotationRows.push(row);
      annotationTargets.add(row.target);
      if (lookupKey) {
        if (!annotationMatchesByLookupKey.has(lookupKey)) annotationMatchesByLookupKey.set(lookupKey, []);
        annotationMatchesByLookupKey.get(lookupKey).push(row);
      }
      continue;
    }
    if (witness?.process !== "desire.defineSurface" || !plainPreviewObject(witness.body)) continue;
    const row = {
      target: typeof witness.body.id === "string" ? witness.body.id : null,
      surfaceKind: witness.body.surfaceKind ?? null,
      className: witness.body.className ?? null,
      processRef: witness.body.processRef ?? null,
      projectionRefs: Array.isArray(witness.body.projectionRefs) ? structuredClone(witness.body.projectionRefs) : [],
      capabilityRefs: Array.isArray(witness.body.capabilityRefs) ? structuredClone(witness.body.capabilityRefs) : [],
      props: structuredClone(witness.body.props ?? {}),
      children: Array.isArray(witness.body.children) ? structuredClone(witness.body.children) : [],
      bindings: Array.isArray(witness.body.bindings) ? structuredClone(witness.body.bindings) : [],
      interactions: Array.isArray(witness.body.interactions) ? structuredClone(witness.body.interactions) : []
    };
    if (!row.target) continue;
    runtimeSurfaceRows.push(row);
    annotationTargets.add(row.target);
    for (const child of row.children ?? []) {
      if (!parentByChild.has(child)) parentByChild.set(child, row.target);
    }
  }
  for (const rows of annotationMatchesByLookupKey.values()) {
    rows.sort((left, right) =>
      String(left.target ?? "").localeCompare(String(right.target ?? ""))
      || String(left.file ?? "").localeCompare(String(right.file ?? ""))
      || Number(left.startLine ?? left.line ?? 0) - Number(right.startLine ?? right.line ?? 0)
      || Number(left.startColumn ?? 1) - Number(right.startColumn ?? 1)
    );
  }
  const value = {
    annotationRows,
    annotationTargets,
    annotationMatchesByLookupKey,
    runtimeSurfaceRows,
    parentByChild
  };
  if (world) previewResolverCatalogCache.set(world, { witnessCount, value });
  return value;
}

function previewRuntimeSurfaceRows(world) {
  return previewResolverCatalog(world).runtimeSurfaceRows.map(row => structuredClone(row));
}

function previewRuntimeSurfaceMap(world) {
  return new Map(previewResolverCatalog(world).runtimeSurfaceRows.map(row => [row.target, structuredClone(row)]));
}

function previewTargetSourceMatches(world, target) {
  const lookupKey = normalizePreviewTargetLookupKey(target);
  if (!lookupKey) return [];
  return previewResolverCatalog(world).annotationMatchesByLookupKey.get(lookupKey)?.map(row => structuredClone(row)) ?? [];
}

function previewSurfaceSelectorAnchors(surface = {}) {
  const props = plainPreviewObject(surface.props) ?? {};
  return previewUniqueStrings([
    props.presentationAnchor,
    props.domId,
    props.inputId,
    props.mountId,
    props.overlayCanvasId,
    props.tooltipId
  ]);
}

function previewSurfaceTextHints(surface = {}) {
  const props = plainPreviewObject(surface.props) ?? {};
  return previewUniqueStrings([
    props.text,
    props.title,
    props.label,
    props.placeholder,
    props.alt,
    props.name
  ]);
}

function previewSurfaceRouteHints(surface = {}) {
  const props = plainPreviewObject(surface.props) ?? {};
  return previewUniqueStrings([
    props.routeKey,
    props.bodyClass,
    props.hostClass,
    props.viewportClass
  ]);
}

function previewScoreTargetCandidate({
  target,
  runtimeSurface = null,
  sourceMatches = [],
  resolverInput = {}
} = {}) {
  const normalizedTarget = normalizePreviewTargetLookupKey(target);
  const descriptorValues = previewDescriptorStringValues(resolverInput.descriptor);
  const reasons = [];
  let score = 0;

  const addScore = (value, kind, detail) => {
    if (!value) return;
    score += Number(value);
    reasons.push({ kind, score: Number(value), detail: detail || null });
  };

  if (resolverInput.preferredTarget && resolverInput.preferredTarget === target) {
    addScore(240, "preferred-target", resolverInput.preferredTarget);
  }
  if (resolverInput.query) {
    if (resolverInput.query === target) addScore(180, "exact-target", resolverInput.query);
    if (resolverInput.normalizedQuery && resolverInput.normalizedQuery === normalizedTarget) {
      addScore(140, "normalized-target", resolverInput.query);
    } else if (resolverInput.normalizedQuery && normalizedTarget.includes(resolverInput.normalizedQuery)) {
      addScore(55, "partial-target", resolverInput.query);
    }
  }

  const runtime = runtimeSurface ?? {};
  const surfaceAnchors = previewSurfaceSelectorAnchors(runtime);
  for (const value of descriptorValues.id) {
    if (value && surfaceAnchors.includes(value)) addScore(150, "dom-anchor", value);
    if (value && target === value) addScore(120, "dom-id-target", value);
  }
  for (const value of descriptorValues.surfaceIds) {
    if (!value) continue;
    if (value === target) addScore(135, "surface-id", value);
    if (previewUniqueStrings([runtime.props?.surfaceId, runtime.props?.routeKey]).includes(value)) {
      addScore(48, "surface-prop", value);
    }
  }
  for (const value of descriptorValues.widgetIds) {
    if (!value) continue;
    if (value === target) addScore(132, "widget-id", value);
    if (previewUniqueStrings([runtime.props?.widgetId, runtime.props?.rootWidget]).includes(value)) {
      addScore(52, "widget-prop", value);
    }
  }
  for (const value of descriptorValues.routeKeys) {
    if (previewSurfaceRouteHints(runtime).some(hint =>
      normalizePreviewTargetLookupKey(hint).includes(normalizePreviewTargetLookupKey(value))
    )) {
      addScore(26, "route-hint", value);
    }
  }
  const runtimeClassTokens = new Set([
    ...previewSplitClassTokens(runtime.className),
    ...previewClassTokensFromProps(runtime.props)
  ]);
  for (const className of descriptorValues.classNames) {
    if (runtimeClassTokens.has(className)) addScore(18, "class-token", className);
  }
  const descriptorTextKey = normalizePreviewTargetLookupKey(descriptorValues.textPreview);
  if (descriptorTextKey) {
    for (const hint of previewSurfaceTextHints(runtime)) {
      const normalizedHint = normalizePreviewTargetLookupKey(hint);
      if (!normalizedHint) continue;
      if (normalizedHint === descriptorTextKey) {
        addScore(30, "text-exact", hint);
        break;
      }
      if (normalizedHint.includes(descriptorTextKey) || descriptorTextKey.includes(normalizedHint)) {
        addScore(12, "text-partial", hint);
        break;
      }
    }
  }
  if (descriptorValues.tagName && descriptorValues.tagName === String(runtime.props?.tag || "").trim().toLowerCase()) {
    addScore(9, "tag", descriptorValues.tagName);
  }
  if (sourceMatches.some(editablePreviewAnnotationSource)) addScore(6, "editable-source", null);
  if (sourceMatches.some(match => match.sourceLanguage === "wcss")) addScore(4, "style-source", null);

  const maxScore = 260;
  const confidence = score >= 200
    ? "high"
    : (score >= 90 ? "medium" : (score > 0 ? "low" : "none"));
  const matchType = reasons[0]?.kind ?? "annotation";
  return {
    target,
    score,
    confidence,
    matchType,
    editable: sourceMatches.some(editablePreviewAnnotationSource),
    componentKind: runtime.surfaceKind ?? null,
    sources: sourceMatches,
    provenance: {
      reasons,
      descriptor: resolverInput.descriptor ? structuredClone(resolverInput.descriptor) : null,
      normalizedQuery: resolverInput.normalizedQuery || null
    },
    rank: Math.max(0, Math.min(1, score / maxScore))
  };
}

function previewResolveTargetCandidates(world, targetQuery, options = {}) {
  const resolverInput = previewNormalizeResolverInput(targetQuery, options);
  const catalog = previewResolverCatalog(world);
  const runtimeSurfaces = new Map(catalog.runtimeSurfaceRows.map(row => [row.target, row]));
  const candidates = [...catalog.annotationTargets]
    .map(target => previewScoreTargetCandidate({
      target,
      runtimeSurface: runtimeSurfaces.get(target) ?? null,
      sourceMatches: catalog.annotationMatchesByLookupKey.get(normalizePreviewTargetLookupKey(target)) ?? [],
      resolverInput
    }))
    .filter(candidate => candidate.score > 0 || candidate.target === resolverInput.query || candidate.target === resolverInput.preferredTarget)
    .sort((left, right) =>
      Number(right.score || 0) - Number(left.score || 0)
      || String(left.target ?? "").localeCompare(String(right.target ?? ""))
    );
  const resolvedTarget = resolverInput.preferredTarget && candidates.some(candidate => candidate.target === resolverInput.preferredTarget)
    ? resolverInput.preferredTarget
    : chooseResolvedTarget(
      candidates.map(candidate => ({ target: candidate.target })),
      resolverInput.query
    );
  return {
    query: resolverInput.query,
    descriptor: resolverInput.descriptor ? structuredClone(resolverInput.descriptor) : null,
    resolvedTarget,
    matchType: candidates[0]?.matchType ?? null,
    confidence: candidates[0]?.confidence ?? "none",
    candidates
  };
}

function previewTargetBreadcrumbs(world, target) {
  const catalog = previewResolverCatalog(world);
  const surfaceMap = new Map(catalog.runtimeSurfaceRows.map(row => [row.target, row]));
  if (!surfaceMap.has(target)) return [];
  const chain = [];
  let current = target;
  const visited = new Set();
  while (current && !visited.has(current)) {
    visited.add(current);
    const row = surfaceMap.get(current) ?? null;
    chain.push({
      target: current,
      componentKind: row?.surfaceKind ?? null,
      parentTarget: catalog.parentByChild.get(current) ?? null
    });
    current = catalog.parentByChild.get(current) ?? null;
  }
  return chain.reverse();
}

function humanizePreviewPropertyKey(key) {
  const raw = String(key ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, first => first.toUpperCase());
}

function previewPropertyValueType(value, key = "") {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  const normalizedKey = String(key ?? "").trim();
  if (normalizedKey === "hidden") return "boolean";
  if (normalizedKey === "rawHtml" || normalizedKey === "style" || normalizedKey === "inputStyle" || normalizedKey === "text") {
    return "multiline";
  }
  return "string";
}

const PREVIEW_COMMON_PROPERTY_CATALOG = Object.freeze([
  Object.freeze({ key: "class", label: "Class", valueType: "string" }),
  Object.freeze({ key: "hidden", label: "Hidden", valueType: "boolean" }),
  Object.freeze({
    key: "tag",
    label: "Tag",
    valueType: "string",
    options: Object.freeze(["div", "span", "p", "h1", "h2", "h3", "section", "article", "header", "footer", "aside", "label", "button", "a"])
  }),
  Object.freeze({ key: "title", label: "Title", valueType: "string" }),
  Object.freeze({ key: "text", label: "Text", valueType: "multiline" }),
  Object.freeze({ key: "label", label: "Label", valueType: "string" }),
  Object.freeze({ key: "domId", label: "DOM Id", valueType: "string" }),
  Object.freeze({ key: "style", label: "Inline Style", valueType: "multiline" }),
  Object.freeze({ key: "rawHtml", label: "Raw HTML", valueType: "multiline" }),
  Object.freeze({ key: "href", label: "Href", valueType: "string" }),
  Object.freeze({ key: "src", label: "Src", valueType: "string" }),
  Object.freeze({ key: "alt", label: "Alt", valueType: "string" }),
  Object.freeze({ key: "name", label: "Name", valueType: "string" })
]);

const PREVIEW_PROPERTY_CATALOG_BY_COMPONENT_KIND = Object.freeze({
  "screen-header": Object.freeze([
    Object.freeze({ key: "text", label: "Text", valueType: "string" }),
    Object.freeze({ key: "tag", label: "Tag", valueType: "string" })
  ]),
  "text": Object.freeze([
    Object.freeze({ key: "text", label: "Text", valueType: "multiline" }),
    Object.freeze({ key: "tag", label: "Tag", valueType: "string" })
  ]),
  "leaf": Object.freeze([
    Object.freeze({ key: "rawHtml", label: "Raw HTML", valueType: "multiline" })
  ]),
  "action": Object.freeze([
    Object.freeze({ key: "text", label: "Text", valueType: "string" }),
    Object.freeze({ key: "href", label: "Href", valueType: "string" }),
    Object.freeze({ key: "messageRef", label: "Message Ref", valueType: "string" }),
    Object.freeze({
      key: "buttonType",
      label: "Button Type",
      valueType: "string",
      options: Object.freeze(["button", "submit", "reset"])
    })
  ]),
  "form-field": Object.freeze([
    Object.freeze({ key: "label", label: "Label", valueType: "string" }),
    Object.freeze({
      key: "inputType",
      label: "Input Type",
      valueType: "string",
      options: Object.freeze(["text", "password", "email", "number", "search", "tel", "url"])
    }),
    Object.freeze({ key: "inputId", label: "Input Id", valueType: "string" }),
    Object.freeze({ key: "inputClass", label: "Input Class", valueType: "string" }),
    Object.freeze({ key: "inputStyle", label: "Input Style", valueType: "multiline" }),
    Object.freeze({ key: "inputWrapClass", label: "Input Wrap Class", valueType: "string" }),
    Object.freeze({ key: "placeholder", label: "Placeholder", valueType: "string" }),
    Object.freeze({
      key: "autocomplete",
      label: "Autocomplete",
      valueType: "string",
      options: Object.freeze(["on", "off", "username", "current-password", "new-password", "email", "one-time-code"])
    }),
    Object.freeze({ key: "name", label: "Name", valueType: "string" })
  ]),
  "checkbox-field": Object.freeze([
    Object.freeze({ key: "label", label: "Label", valueType: "string" }),
    Object.freeze({ key: "inputId", label: "Input Id", valueType: "string" }),
    Object.freeze({ key: "inputClass", label: "Input Class", valueType: "string" })
  ]),
  "chart": Object.freeze([
    Object.freeze({ key: "pageStylesheetHref", label: "Page Stylesheet Href", valueType: "string" }),
    Object.freeze({ key: "bodyClass", label: "Body Class", valueType: "string" }),
    Object.freeze({ key: "viewportClass", label: "Viewport Class", valueType: "string" }),
    Object.freeze({ key: "hostClass", label: "Host Class", valueType: "string" }),
    Object.freeze({ key: "mountId", label: "Mount Id", valueType: "string" }),
    Object.freeze({ key: "mountClass", label: "Mount Class", valueType: "string" }),
    Object.freeze({ key: "mountTag", label: "Mount Tag", valueType: "string" }),
    Object.freeze({ key: "functionsModules", label: "Functions Modules", valueType: "string" }),
    Object.freeze({ key: "functionsExports", label: "Functions Exports", valueType: "string" }),
    Object.freeze({ key: "overlayCanvasId", label: "Overlay Canvas Id", valueType: "string" }),
    Object.freeze({ key: "overlayCanvasClass", label: "Overlay Canvas Class", valueType: "string" }),
    Object.freeze({ key: "tooltipId", label: "Tooltip Id", valueType: "string" }),
    Object.freeze({ key: "tooltipClass", label: "Tooltip Class", valueType: "string" }),
    Object.freeze({ key: "tooltipFormatter", label: "Tooltip Formatter", valueType: "string" }),
    Object.freeze({ key: "pageBackground", label: "Page Background", valueType: "string" })
  ])
});

function previewValidPropertyCatalog(componentKind, authoredProps = {}) {
  const entries = new Map();
  const addEntry = entry => {
    if (!entry?.key) return;
    const existing = entries.get(entry.key) ?? null;
    entries.set(entry.key, {
      key: entry.key,
      label: entry.label || existing?.label || humanizePreviewPropertyKey(entry.key),
      valueType: entry.valueType || existing?.valueType || previewPropertyValueType(authoredProps?.[entry.key], entry.key),
      options: Array.isArray(entry.options)
        ? [...entry.options]
        : (Array.isArray(existing?.options) ? [...existing.options] : undefined)
    });
  };
  for (const entry of PREVIEW_COMMON_PROPERTY_CATALOG) addEntry(entry);
  for (const entry of PREVIEW_PROPERTY_CATALOG_BY_COMPONENT_KIND[componentKind] ?? []) addEntry(entry);
  for (const key of Object.keys(authoredProps ?? {})) {
    addEntry({
      key,
      label: humanizePreviewPropertyKey(key),
      valueType: previewPropertyValueType(authoredProps[key], key)
    });
  }
  return [...entries.values()];
}

function previewRuntimeSurfaceModel(world, target) {
  const row = previewRuntimeSurfaceMap(world).get(target) ?? null;
  if (!row) return null;
  return {
    class: row.className ?? null,
    surfaceKind: row.surfaceKind ?? null,
    processRef: row.processRef ?? null,
    projectionRefs: structuredClone(row.projectionRefs ?? []),
    capabilityRefs: structuredClone(row.capabilityRefs ?? []),
    children: structuredClone(row.children ?? []),
    bindings: structuredClone(row.bindings ?? []),
    interactions: structuredClone(row.interactions ?? []),
    props: structuredClone(row.props ?? {})
  };
}

function compilePreviewSourceToDesirePlus({
  sourceText,
  filePath,
  sourceLanguage,
  rvmFormRegistry = null
}) {
  if (sourceLanguage === "rvm") {
    return compileRvmToDesirePlus(sourceText, { file: filePath, rvmFormRegistry });
  }
  const docs = parseWitnessToml(sourceText).map(doc => ({ ...doc, file: filePath }));
  return compileWtomlDocsToDesirePlus(docs, { file: filePath });
}

function findPreviewSurfaceNode(desirePlus, target) {
  return (desirePlus?.nodes ?? []).find(node =>
    node?.semantic?.kind === "surface"
    && node?.semantic?.name === target
  ) ?? null;
}

function previewSurfaceKindForNode(node) {
  if (typeof node?.semantic?.surfaceKind === "string" && node.semantic.surfaceKind.trim()) {
    return node.semantic.surfaceKind.trim();
  }
  if (typeof node?.payload?.values?.surfaceKind === "string" && node.payload.values.surfaceKind.trim()) {
    return node.payload.values.surfaceKind.trim();
  }
  return "surface";
}

function authoredPreviewSurfaceProps(node, sourceLanguage) {
  if (sourceLanguage === "rvm") {
    return {
      ...(node?.semantic?.className != null ? { class: node.semantic.className } : {}),
      ...(node?.semantic?.props ?? {})
    };
  }
  const values = node?.payload?.values ?? {};
  return {
    ...(values.className != null ? { class: values.className } : {}),
    ...(values.props ?? {})
  };
}

function normalizePreviewPropertyInput(value, valueType) {
  if (valueType === "boolean") {
    if (typeof value === "boolean") return value;
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }
  if (valueType === "number") {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) throw new Error("property value must be a number");
    return parsed;
  }
  return String(value ?? "");
}

function applyPreviewSurfaceProperty(node, sourceLanguage, propertyName, value, valueType) {
  const normalizedName = String(propertyName ?? "").trim();
  if (!normalizedName) throw new Error("property is required");
  const normalizedValue = normalizePreviewPropertyInput(value, valueType);
  if (sourceLanguage === "rvm") {
    if (!node?.semantic || node.semantic.kind !== "surface") throw new Error("surface semantic is unavailable");
    if (normalizedName === "class") node.semantic.className = normalizedValue;
    else {
      node.semantic.props = { ...(node.semantic.props ?? {}), [normalizedName]: normalizedValue };
    }
    if (node.payload && typeof node.payload === "object") node.payload.raw = null;
    return;
  }
  const currentValues = node?.payload?.values && typeof node.payload.values === "object"
    ? node.payload.values
    : null;
  if (!currentValues) throw new Error("surface values are unavailable");
  if (normalizedName === "class") currentValues.className = normalizedValue;
  else currentValues.props = { ...(currentValues.props ?? {}), [normalizedName]: normalizedValue };
  if (node.semantic && node.semantic.kind === "surface") {
    if (normalizedName === "class") node.semantic.className = normalizedValue;
    else node.semantic.props = { ...(node.semantic.props ?? {}), [normalizedName]: normalizedValue };
  }
}

function serializePreviewSurfaceSource(desirePlus, sourceLanguage, { rvmFormRegistry = null } = {}) {
  if (sourceLanguage === "rvm") {
    return serializeDesirePlusToRvm(desirePlus, { rvmFormRegistry });
  }
  return serializeDesirePlusToWtoml(desirePlus);
}

function previewAllowedFiles(world) {
  return new Set(
    (world?.allWitnesses?.() ?? [])
      .filter(witness => witness?.process === "dsl.source.annotate" && typeof witness?.body?.file === "string")
      .map(witness => path.resolve(witness.body.file))
  );
}

function clonePreviewCandidate(candidate = {}) {
  return {
    kind: typeof candidate?.kind === "string" ? candidate.kind : "",
    input: candidate?.input && typeof candidate.input === "object" && !Array.isArray(candidate.input)
      ? structuredClone(candidate.input)
      : {}
  };
}

function previewWitnessIdsSince(world, count = 0) {
  return world.allWitnesses().slice(Math.max(0, Number(count || 0))).map(witness => witness.id);
}

function runPreviewCandidate(world, candidate, actor) {
  const candidateKind = typeof candidate?.kind === "string" ? candidate.kind : "";
  const input = candidate?.input && typeof candidate.input === "object" && !Array.isArray(candidate.input)
    ? candidate.input
    : {};

  if (candidateKind === "widget.replace") {
    const id = typeof input?.id === "string" ? input.id.trim() : "";
    const current = widgetDefinitions(world.allWitnesses()).find(row => row.id === id) ?? null;
    if (!current) {
      return { candidateKind, ok: false, migrationStatus: "blocked", status: "blocked", reason: "widget not found", previewWitnessIds: [] };
    }
    if (widgetVersions(world.allWitnesses()).some(row => row.soul === id)) {
      return {
        candidateKind,
        ok: false,
        migrationStatus: "blocked",
        status: "blocked",
        reason: "versioned widgets must evolve through widget versions",
        previewWitnessIds: []
      };
    }
    const nextKind = typeof input?.kind === "string" ? input.kind.trim() : "";
    const nextProps = widgetReplacementPropsFromInput(current.props ?? {}, input);
    const classification = classifyWidgetReplacement({
      currentWidget: current,
      nextKind,
      nextProps
    });
    if (classification.migrationStatus === "blocked") {
      return {
        candidateKind,
        ok: false,
        migrationStatus: classification.migrationStatus,
        status: "blocked",
        reason: classification.reason || "widget replacement blocked",
        previewWitnessIds: []
      };
    }
    const beforeCount = world.witnessCount();
    applyWidgetReplace(world, {
      actor,
      id,
      kind: nextKind,
      props: nextProps,
      context: current.context ?? null,
      previous: current,
      migrationStatus: classification.migrationStatus
    });
    return {
      candidateKind,
      ok: true,
      migrationStatus: classification.migrationStatus,
      status: "replaced",
      reason: null,
      previewWitnessIds: previewWitnessIdsSince(world, beforeCount)
    };
  }

  if (candidateKind === "widget.version.activate") {
    const beforeCount = world.witnessCount();
    const result = requestWidgetVersionActivationShared(world, {
      actor,
      soul: typeof input?.soul === "string" ? input.soul.trim() : "",
      version: typeof input?.version === "string" ? input.version.trim() : ""
    });
    return {
      candidateKind,
      ok: result.ok,
      migrationStatus: widgetVersionMigrationStatus(result.status),
      status: result.status,
      reason: result.ok ? null : (result.witness?.body?.reason || "widget version transition blocked"),
      previewWitnessIds: previewWitnessIdsSince(world, beforeCount)
    };
  }

  if (candidateKind === "widget.replace.rollback") {
    const beforeCount = world.witnessCount();
    const result = rollbackWidgetReplace(world, {
      actor,
      id: typeof input?.id === "string" ? input.id.trim() : ""
    });
    return {
      candidateKind,
      ok: result.ok,
      migrationStatus: result.ok ? result.migrationStatus : "blocked",
      status: result.ok ? result.status : "blocked",
      reason: result.ok ? null : (result.witness?.body?.reason || "widget replace rollback unavailable"),
      previewWitnessIds: previewWitnessIdsSince(world, beforeCount)
    };
  }

  return {
    candidateKind,
    ok: false,
    migrationStatus: "blocked",
    status: "blocked",
    reason: "unsupported preview candidate kind",
    previewWitnessIds: []
  };
}

function replayPreviewCandidates(world, candidates = [], actor = "preview") {
  return candidates.map(candidate => runPreviewCandidate(world, candidate, actor));
}

export class AppPreviewSessionManager {
  constructor({
    appSnapshotManager,
    logger = null,
    fsModule = fs
  } = {}) {
    this.appSnapshotManager = appSnapshotManager ?? null;
    this.logger = logger;
    this.fs = fsModule;
    this.sessions = new Map();
  }

  currentActiveSnapshot() {
    return this.appSnapshotManager?.getActiveSnapshot?.() ?? null;
  }

  createSession() {
    const activeSnapshot = this.currentActiveSnapshot();
    if (!activeSnapshot) {
      throw new Error("active app snapshot unavailable");
    }
    const id = crypto.randomUUID();
    const now = isoNow();
    const session = {
      id,
      baseAppRevision: Number(activeSnapshot.appRevision || 0),
      previewRevision: 0,
      status: "active",
      invalidReason: null,
      createdAt: now,
      updatedAt: now,
      changedSources: [],
      overlaySources: new Map(),
      candidates: [],
      candidateResults: [],
      snapshot: null,
      listeners: new Set()
    };
    this.sessions.set(id, session);
    return this.readSession(id);
  }

  subscribe(sessionId, listener) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session || typeof listener !== "function") return () => {};
    session.listeners.add(listener);
    return () => session.listeners.delete(listener);
  }

  emitSession(session) {
    const payload = this.sessionShape(session);
    for (const listener of session.listeners) listener(payload);
  }

  refreshSessionState(session, { notify = false } = {}) {
    if (!session) return null;
    const activeSnapshot = this.currentActiveSnapshot();
    if (!activeSnapshot) return session;
    const activeRevision = Number(activeSnapshot.appRevision || 0);
    if (activeRevision === Number(session.baseAppRevision || 0)) return session;
    const nextReason = previewSessionInvalidReason(session.baseAppRevision, activeRevision);
    if (session.status === "stale" && session.invalidReason === nextReason) return session;
    session.status = "stale";
    session.invalidReason = nextReason;
    session.updatedAt = isoNow();
    if (notify) this.emitSession(session);
    return session;
  }

  sessionShape(session) {
    const refreshed = this.refreshSessionState(session);
    return {
      id: refreshed.id,
      baseAppRevision: Number(refreshed.baseAppRevision || 0),
      previewRevision: Number(refreshed.previewRevision || 0),
      status: String(refreshed.status || "active"),
      invalidReason: refreshed.invalidReason ?? null,
      createdAt: refreshed.createdAt ?? null,
      updatedAt: refreshed.updatedAt ?? null,
      changedSources: [...(refreshed.changedSources ?? [])],
      candidates: (refreshed.candidates ?? []).map(candidate => clonePreviewCandidate(candidate)),
      candidateResults: Array.isArray(refreshed.candidateResults) ? structuredClone(refreshed.candidateResults) : [],
      sources: [...refreshed.overlaySources.keys()].map(filePath => ({
        file: filePath,
        sourceId: sourceIdForPath(this.appSnapshotManager?.appRoot ?? path.dirname(filePath), filePath)
      })),
      event: normalizePreviewEvent({
        id: refreshed.id,
        baseAppRevision: refreshed.baseAppRevision,
        previewRevision: refreshed.previewRevision,
        changedSources: refreshed.changedSources,
        status: refreshed.status,
        invalidReason: refreshed.invalidReason
      })
    };
  }

  readSession(sessionId) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) return null;
    return this.sessionShape(session);
  }

  resolveRenderSession(sessionId) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) return { ok: false, reason: "missing" };
    const refreshed = this.refreshSessionState(session);
    if (refreshed.status === "stale") {
      return {
        ok: false,
        reason: "stale",
        session: this.sessionShape(refreshed)
      };
    }
    const activeSnapshot = this.currentActiveSnapshot();
    return {
      ok: true,
      session: this.sessionShape(refreshed),
      world: refreshed.snapshot?.world ?? activeSnapshot?.world ?? null
    };
  }

  async rebuildPreviewSnapshot(session, {
    overlaySources = session?.overlaySources ?? null,
    previewRevision = session?.previewRevision ?? 0
  } = {}) {
    const activeSnapshot = this.currentActiveSnapshot();
    if (!activeSnapshot) throw new Error("active app snapshot unavailable");
    const effectiveOverlaySources = new Map(overlaySources ?? session?.overlaySources ?? []);
    let compiled = activeSnapshot;
    if (effectiveOverlaySources.size) {
      const appProject = await loadAppProject(this.appSnapshotManager.manifestPath, {
        readFile: (target, encoding) => readSourceText(target, this.fs, effectiveOverlaySources, encoding)
      });
      compiled = await buildCompiledSnapshot({
        manifestPath: this.appSnapshotManager.manifestPath,
        appRoot: this.appSnapshotManager.appRoot,
        appProject,
        runtimeProfile: this.appSnapshotManager.runtimeProfile,
        runtimePluginIds: this.appSnapshotManager.runtimePluginIds,
        env: this.appSnapshotManager.env,
        fsModule: this.fs,
        sourceOverlayByPath: effectiveOverlaySources,
        previousUnits: activeSnapshot?.compiledUnits ?? new Map(),
        dirtyPaths: appProject.sourceFiles.map(row => row.file)
      });
    }
    const previewWorld = compiled.world?.fork?.() ?? createWorld();
    const candidateResults = replayPreviewCandidates(previewWorld, session?.candidates ?? [], `preview:${session?.id ?? "session"}`);
    return {
      appRevision: Number(session.baseAppRevision || 0),
      previewRevision: Number(previewRevision || 0),
      trigger: "preview",
      ...compiled,
      world: previewWorld,
      candidateResults
    };
  }

  async patchSources(sessionId, edits = []) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) throw new Error("preview session not found");
    this.refreshSessionState(session, { notify: true });
    if (session.status === "stale") return this.sessionShape(session);
    if (!Array.isArray(edits) || !edits.length) throw new Error("preview source edits are required");
    const resolvedEdits = edits.map(edit => {
      const sourceId = typeof edit?.path === "string" && edit.path.trim()
        ? normalizeSlashes(edit.path.trim())
        : null;
      if (!sourceId) throw new Error("each preview source edit requires path");
      if (typeof edit?.content !== "string") throw new Error(`preview source edit ${sourceId} requires string content`);
      const resolvedPath = absolutePathForSourceId(this.appSnapshotManager.appRoot, sourceId);
      validateWithinAllowedRoots(resolvedPath, this.appSnapshotManager.appRoot);
      return {
        filePath: resolvedPath,
        sourceId: sourceIdForPath(this.appSnapshotManager.appRoot, resolvedPath),
        content: edit.content
      };
    });
    const nextOverlaySources = new Map(session.overlaySources);
    for (const edit of resolvedEdits) nextOverlaySources.set(edit.filePath, edit.content);
    const nextPreviewRevision = Number(session.previewRevision || 0) + 1;
    const nextSnapshot = await this.rebuildPreviewSnapshot(session, {
      overlaySources: nextOverlaySources,
      previewRevision: nextPreviewRevision
    });
    session.overlaySources = nextOverlaySources;
    session.previewRevision = nextPreviewRevision;
    session.changedSources = resolvedEdits.map(edit => edit.sourceId);
    session.updatedAt = isoNow();
    session.snapshot = nextSnapshot;
    session.candidateResults = structuredClone(nextSnapshot?.candidateResults ?? []);
    session.status = "active";
    session.invalidReason = null;
    this.emitSession(session);
    return this.sessionShape(session);
  }

  async patchCandidates(sessionId, candidates = []) {
    const session = this.sessions.get(String(sessionId || ""));
    if (!session) throw new Error("preview session not found");
    this.refreshSessionState(session, { notify: true });
    if (session.status === "stale") {
      return {
        previewSession: this.sessionShape(session),
        results: Array.isArray(session.candidateResults) ? structuredClone(session.candidateResults) : []
      };
    }
    if (!Array.isArray(candidates)) throw new Error("preview candidates must be an array");
    session.candidates = candidates.map(candidate => clonePreviewCandidate(candidate));
    session.previewRevision = Number(session.previewRevision || 0) + 1;
    session.changedSources = [];
    session.updatedAt = isoNow();
    if (session.overlaySources.size || session.candidates.length) {
      session.snapshot = await this.rebuildPreviewSnapshot(session, {
        overlaySources: session.overlaySources,
        previewRevision: session.previewRevision
      });
      session.candidateResults = structuredClone(session.snapshot?.candidateResults ?? []);
    } else {
      session.snapshot = null;
      session.candidateResults = [];
    }
    session.status = "active";
    session.invalidReason = null;
    this.emitSession(session);
    return {
      previewSession: this.sessionShape(session),
      results: structuredClone(session.candidateResults)
    };
  }

  deleteSession(sessionId) {
    const key = String(sessionId || "");
    const session = this.sessions.get(key);
    if (!session) return false;
    session.status = "deleted";
    session.invalidReason = null;
    session.updatedAt = isoNow();
    this.emitSession(session);
    this.sessions.delete(key);
    return true;
  }

  async readSource(sessionId, filePath) {
    const resolved = this.resolveRenderSession(sessionId);
    if (!resolved.ok || !resolved.world) return null;
    const requestedFile = path.resolve(String(filePath || ""));
    const allowed = previewAllowedFiles(resolved.world);
    if (!allowed.has(requestedFile)) return null;
    const session = this.sessions.get(String(sessionId || ""));
    const text = await readSourceText(requestedFile, this.fs, session?.overlaySources ?? null);
    const annotations = previewAnnotationRows(resolved.world, requestedFile);
    return {
      file: requestedFile,
      sourceId: sourceIdForPath(this.appSnapshotManager?.appRoot ?? path.dirname(requestedFile), requestedFile),
      text,
      annotations,
      targets: [...new Set(annotations.map(node => node.target).filter(Boolean))]
    };
  }

  readTargetSources(sessionId, targetQuery, options = {}) {
    const resolved = this.resolveRenderSession(sessionId);
    if (!resolved.ok || !resolved.world) return null;
    const query = String(targetQuery ?? "").trim();
    const candidateResult = previewResolveTargetCandidates(resolved.world, query, options);
    const matchedTargets = candidateResult.candidates.map(candidate => candidate.target);
    const matches = matchedTargets.flatMap(target => previewTargetSourceMatches(resolved.world, target));
    return {
      query,
      descriptor: candidateResult.descriptor,
      resolvedTarget: candidateResult.resolvedTarget,
      matchType: candidateResult.matchType,
      confidence: candidateResult.confidence,
      candidates: candidateResult.candidates.map(candidate => ({
        target: candidate.target,
        score: candidate.score,
        confidence: candidate.confidence,
        matchType: candidate.matchType,
        editable: candidate.editable,
        componentKind: candidate.componentKind,
        sourceCount: candidate.sources.length,
        provenance: structuredClone(candidate.provenance)
      })),
      matches: matches.map(match => ({
        ...match,
        sourceId: typeof match.file === "string"
          ? sourceIdForPath(this.appSnapshotManager?.appRoot ?? path.dirname(match.file), match.file)
          : null
      })),
      targets: matchedTargets
    };
  }

  async inspectTarget(sessionId, targetQuery, options = {}) {
    const resolved = this.resolveRenderSession(sessionId);
    if (!resolved.ok || !resolved.world) return null;
    const matchResult = this.readTargetSources(sessionId, targetQuery, options);
    const matches = Array.isArray(matchResult?.matches) ? matchResult.matches : [];
    const candidates = Array.isArray(matchResult?.candidates) ? matchResult.candidates : [];
    const preferredTarget = typeof options?.preferredTarget === "string" && options.preferredTarget.trim()
      ? options.preferredTarget.trim()
      : null;
    const target = preferredTarget && candidates.some(candidate => candidate.target === preferredTarget)
      ? preferredTarget
      : (matchResult?.resolvedTarget || chooseResolvedTarget(matches, targetQuery));
    if (!target) return null;
    const targetMatches = matches.filter(match => match.target === target);
    if (!targetMatches.length && !candidates.some(candidate => candidate.target === target)) return null;
    const editableSource = targetMatches
      .filter(editablePreviewAnnotationSource)
      .sort((left, right) =>
        previewSourceLanguagePriority(left.sourceLanguage) - previewSourceLanguagePriority(right.sourceLanguage)
        || String(left.file ?? "").localeCompare(String(right.file ?? ""))
        || Number(left.startLine ?? left.line ?? 0) - Number(right.startLine ?? right.line ?? 0)
      )[0] ?? null;
    const sourceLanguage = editableSource?.sourceLanguage ?? null;
    let componentKind = "surface";
    let authoredProps = {};
    if (editableSource?.file && sourceLanguage) {
      const session = this.sessions.get(String(sessionId || ""));
      const text = await readSourceText(editableSource.file, this.fs, session?.overlaySources ?? null);
      const snapshot = this.currentActiveSnapshot();
      const rvmFormRegistry =
        session?.snapshot?.appProject?.runtimePluginRegistries?.rvmFormRegistry
        ?? resolved.world?.appProject?.runtimePluginRegistries?.rvmFormRegistry
        ?? snapshot?.appProject?.runtimePluginRegistries?.rvmFormRegistry
        ?? null;
      const desirePlus = compilePreviewSourceToDesirePlus({
        sourceText: text,
        filePath: editableSource.file,
        sourceLanguage,
        rvmFormRegistry
      });
      const node = findPreviewSurfaceNode(desirePlus, target);
      if (node) {
        componentKind = previewSurfaceKindForNode(node);
        authoredProps = authoredPreviewSurfaceProps(node, sourceLanguage);
      }
    }
    const runtimeProps = previewRuntimeSurfaceModel(resolved.world, target);
    const resolvedCandidate = candidates.find(candidate => candidate.target === target) ?? null;
    return {
      query: String(targetQuery ?? ""),
      resolvedFrom: matchResult?.resolvedTarget || null,
      target,
      componentKind,
      editable: Boolean(editableSource),
      editableSource: editableSource ? {
        file: editableSource.file,
        sourceId: editableSource.sourceId ?? sourceIdForPath(this.appSnapshotManager.appRoot, editableSource.file),
        sourceLanguage: editableSource.sourceLanguage ?? null
      } : null,
      authoredProps,
      runtimeProps,
      validProps: previewValidPropertyCatalog(componentKind, authoredProps),
      sources: targetMatches,
      styles: {
        sourceCount: targetMatches.filter(match => match.sourceLanguage === "wcss").length,
        generatedStylesheetHints: previewUniqueStrings([
          runtimeProps?.props?.pageStylesheetHref,
          runtimeProps?.props?.hostClass,
          runtimeProps?.props?.viewportClass,
          runtimeProps?.props?.bodyClass
        ])
      },
      breadcrumbs: previewTargetBreadcrumbs(resolved.world, target),
      provenance: resolvedCandidate?.provenance ?? null,
      candidates
    };
  }

  async patchTargetProperty(sessionId, {
    target,
    property,
    value
  } = {}) {
    const inspection = await this.inspectTarget(sessionId, target);
    if (!inspection) throw new Error("preview target not found");
    if (!inspection.editable || !inspection.editableSource?.file || !inspection.editableSource?.sourceLanguage) {
      throw new Error("selected target is not editable through RVM/WTOML preview sources");
    }
    const propertyName = String(property ?? "").trim();
    if (!propertyName) throw new Error("property is required");
    const validProperty = (inspection.validProps ?? []).find(entry => entry?.key === propertyName) ?? {
      key: propertyName,
      valueType: previewPropertyValueType(inspection.authoredProps?.[propertyName], propertyName)
    };
    const session = this.sessions.get(String(sessionId || ""));
    const text = await readSourceText(inspection.editableSource.file, this.fs, session?.overlaySources ?? null);
    const snapshot = this.currentActiveSnapshot();
    const rvmFormRegistry =
      session?.snapshot?.appProject?.runtimePluginRegistries?.rvmFormRegistry
      ?? snapshot?.appProject?.runtimePluginRegistries?.rvmFormRegistry
      ?? null;
    const desirePlus = compilePreviewSourceToDesirePlus({
      sourceText: text,
      filePath: inspection.editableSource.file,
      sourceLanguage: inspection.editableSource.sourceLanguage,
      rvmFormRegistry
    });
    const node = findPreviewSurfaceNode(desirePlus, inspection.target);
    if (!node) throw new Error(`target ${inspection.target} is not present in ${inspection.editableSource.sourceId}`);
    applyPreviewSurfaceProperty(
      node,
      inspection.editableSource.sourceLanguage,
      propertyName,
      value,
      validProperty.valueType
    );
    const nextSource = serializePreviewSurfaceSource(desirePlus, inspection.editableSource.sourceLanguage, {
      rvmFormRegistry
    });
    const previewSession = await this.patchSources(sessionId, [{
      path: inspection.editableSource.sourceId,
      content: nextSource
    }]);
    return {
      previewSession,
      inspection: await this.inspectTarget(sessionId, inspection.target)
    };
  }
}
