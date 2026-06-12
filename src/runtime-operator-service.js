import fs from "node:fs/promises";
import path from "node:path";

const OPERATOR_ACTIVITY_PROCESSES = new Set([
  "operator.backup",
  "operator.export",
  "operator.restore",
  "operator.import",
  "operator.backup.failed",
  "operator.export.failed",
  "operator.restore.failed",
  "operator.import.failed"
]);

function slugify(value, fallback = "artifact") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function artifactTimestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function pathInside(root, target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function artifactIdFromInput(value) {
  const id = String(value || "").trim();
  if (!id) return null;
  if (id.includes("/") || id.includes("\\") || id === "." || id === "..") return null;
  return id;
}

function basenameOrNull(filePath) {
  return typeof filePath === "string" && filePath.trim() ? path.basename(filePath) : null;
}

async function exists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

async function readJsonLines(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  if (!text.trim()) return [];
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

async function copyFileIfPresent(sourcePath, destinationPath) {
  if (!(await exists(sourcePath))) return false;
  await ensureDirectory(path.dirname(destinationPath));
  await fs.copyFile(sourcePath, destinationPath);
  return true;
}

async function copyDirectoryIfPresent(sourcePath, destinationPath) {
  if (!(await exists(sourcePath))) return false;
  await ensureDirectory(path.dirname(destinationPath));
  await fs.cp(sourcePath, destinationPath, { recursive: true, force: true });
  return true;
}

async function renameReplace(sourcePath, destinationPath) {
  await fs.rm(destinationPath, { recursive: true, force: true });
  await ensureDirectory(path.dirname(destinationPath));
  await fs.rename(sourcePath, destinationPath);
}

function operatorMutationGate(operatorContract) {
  const layout = operatorContract?.layout ?? null;
  const persistenceMode = operatorContract?.persistence?.mode ?? null;
  if (layout !== "world-home-v1") {
    return {
      enabled: false,
      reason: "operator mutations require the world-home-v1 layout",
      layout,
      persistenceMode
    };
  }
  return {
    enabled: true,
    reason: null,
    layout,
    persistenceMode
  };
}

async function describeArtifactDirectory({
  artifactDirectory,
  source,
  allowedKinds = []
}) {
  const manifestPath = path.join(artifactDirectory, "manifest.json");
  if (!(await exists(manifestPath))) {
    return {
      id: path.basename(artifactDirectory),
      kind: null,
      createdAt: null,
      source,
      includesDerived: false,
      witnessCount: 0,
      observationCount: 0,
      status: "invalid",
      reason: "manifest missing",
      path: artifactDirectory
    };
  }
  const manifest = await readJson(manifestPath);
  const canonicalTruth = manifest?.canonicalTruth ?? {};
  const kind = typeof manifest?.kind === "string" ? manifest.kind : null;
  const witnessPath = typeof canonicalTruth.witnessLog === "string"
    ? path.join(artifactDirectory, canonicalTruth.witnessLog)
    : null;
  const observationPath = typeof canonicalTruth.observationLog === "string"
    ? path.join(artifactDirectory, canonicalTruth.observationLog)
    : null;
  const kindAllowed = !allowedKinds.length || allowedKinds.includes(kind);
  const witnessExists = witnessPath ? await exists(witnessPath) : false;
  const observationExists = observationPath ? await exists(observationPath) : false;
  return {
    id: typeof manifest?.id === "string" ? manifest.id : path.basename(artifactDirectory),
    kind,
    createdAt: typeof manifest?.createdAt === "string" ? manifest.createdAt : null,
    source,
    includesDerived: manifest?.includesDerived === true,
    witnessCount: Number.isFinite(canonicalTruth.witnessCount) ? canonicalTruth.witnessCount : 0,
    observationCount: Number.isFinite(canonicalTruth.observationCount) ? canonicalTruth.observationCount : 0,
    status: kindAllowed && witnessExists && observationExists ? "ready" : "invalid",
    reason: !kindAllowed
      ? `artifact kind ${kind || "(unknown)"} not allowed here`
      : (!witnessExists || !observationExists)
        ? "canonical log payload missing"
        : null,
    path: artifactDirectory,
    manifest
  };
}

async function listArtifactDirectories(rootPath) {
  if (!rootPath || !(await exists(rootPath))) return [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(rootPath, entry.name));
}

async function listArtifacts(rootPath, source, allowedKinds = []) {
  const directories = await listArtifactDirectories(rootPath);
  const rows = await Promise.all(directories.map(directory => describeArtifactDirectory({
    artifactDirectory: directory,
    source,
    allowedKinds
  })));
  return rows.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
}

async function loadArtifactPayload(summary) {
  const manifest = summary?.manifest ?? {};
  const canonicalTruth = manifest.canonicalTruth ?? {};
  const witnessPath = path.join(summary.path, canonicalTruth.witnessLog);
  const observationPath = path.join(summary.path, canonicalTruth.observationLog);
  const witnesses = await readJsonLines(witnessPath);
  const observations = await readJsonLines(observationPath);
  return {
    manifest,
    witnesses,
    observations,
    runtimeSource: manifest.includesDerived === true ? path.join(summary.path, "runtime") : null
  };
}

export function createRuntimeOperatorService({
  world,
  operatorContract,
  storage = null,
  now = () => new Date()
}) {
  const worldHome = operatorContract?.worldHome ?? null;
  const directories = operatorContract?.directories ?? {};
  const witnessLogPath = operatorContract?.canonicalTruth?.witnessLogPath ?? null;
  const observationLogPath = operatorContract?.canonicalTruth?.observationLogPath ?? null;
  const logsRoot = witnessLogPath ? path.dirname(witnessLogPath) : null;
  const runtimeRoot = directories.runtimeRoot ?? null;
  const activityRoots = {
    backupsRoot: directories.backupsRoot ?? null,
    exportsRoot: directories.exportsRoot ?? null,
    importsRoot: directories.importsRoot ?? null
  };
  const derivedRoots = Object.entries({
    runtimeRoot,
    assetsRoot: storage?.assetsRoot ?? directories.assetsRoot ?? null,
    blobsRoot: storage?.blobsRoot ?? directories.blobsRoot ?? null,
    searchRoot: storage?.searchRoot ?? directories.searchRoot ?? null,
    webhooksRoot: storage?.webhooksRoot ?? directories.webhooksRoot ?? null
  })
    .filter(([, targetPath]) => typeof targetPath === "string" && targetPath)
    .filter(([, targetPath]) => runtimeRoot ? pathInside(runtimeRoot, targetPath) || path.resolve(targetPath) === path.resolve(runtimeRoot) : false)
    .map(([key, targetPath]) => ({ key, path: targetPath }));

  const canonicalTruthFiles = {
    witnessLogPath,
    observationLogPath,
    witnessLogName: basenameOrNull(witnessLogPath),
    observationLogName: basenameOrNull(observationLogPath)
  };

  const mutations = () => operatorMutationGate(operatorContract);

  async function ensureManagedMutationAllowed() {
    const gate = mutations();
    if (gate.enabled) return gate;
    const error = new Error(gate.reason || "operator mutations disabled");
    error.status = 409;
    error.details = gate;
    throw error;
  }

  async function ensureManagedRoots() {
    await Promise.all(Object.values(activityRoots).filter(Boolean).map(rootPath => ensureDirectory(rootPath)));
  }

  function nextArtifactId(label, fallback) {
    return `${artifactTimestamp(now())}-${slugify(label, fallback)}`;
  }

  function emitOperatorObservation(process, body = {}, actor = "system") {
    if (!world?.observe) return null;
    return world.observe({
      process,
      actor,
      claims: [],
      body
    });
  }

  async function copyCanonicalTruth(destinationRoot) {
    const logsDestination = path.join(destinationRoot, "logs");
    await ensureDirectory(logsDestination);
    const witnessDestination = path.join(logsDestination, canonicalTruthFiles.witnessLogName);
    const observationDestination = path.join(logsDestination, canonicalTruthFiles.observationLogName);
    const copiedWitness = await copyFileIfPresent(witnessLogPath, witnessDestination);
    const copiedObservation = await copyFileIfPresent(observationLogPath, observationDestination);
    if (!copiedWitness) await fs.writeFile(witnessDestination, "", "utf8");
    if (!copiedObservation) await fs.writeFile(observationDestination, "", "utf8");
  }

  async function copyArtifactCanonicalTruth(summary, destinationRoot) {
    const logsDestination = path.join(destinationRoot, "logs");
    const manifest = summary?.manifest ?? {};
    const canonicalTruth = manifest.canonicalTruth ?? {};
    await ensureDirectory(logsDestination);
    await copyFileIfPresent(
      path.join(summary.path, canonicalTruth.witnessLog),
      path.join(logsDestination, canonicalTruthFiles.witnessLogName)
    );
    await copyFileIfPresent(
      path.join(summary.path, canonicalTruth.observationLog),
      path.join(logsDestination, canonicalTruthFiles.observationLogName)
    );
  }

  async function reloadWorldTruthFromDisk() {
    const nextWitnesses = witnessLogPath && (await exists(witnessLogPath))
      ? await readJsonLines(witnessLogPath)
      : [];
    const nextObservations = observationLogPath && (await exists(observationLogPath))
      ? await readJsonLines(observationLogPath)
      : [];
    world?._replaceWitnesses?.(nextWitnesses);
    world?._replaceObservations?.(nextObservations);
    return {
      witnessCount: nextWitnesses.length,
      observationCount: nextObservations.length
    };
  }

  async function createArtifact({
    kind,
    rootPath,
    label = "",
    includeDerived = false,
    actor = "system",
    source = kind
  }) {
    await ensureManagedMutationAllowed();
    await ensureManagedRoots();
    const artifactId = nextArtifactId(label, kind);
    const artifactDirectory = path.join(rootPath, artifactId);
    const witnessEntries = witnessLogPath && (await exists(witnessLogPath)) ? await readJsonLines(witnessLogPath) : [];
    const observationEntries = observationLogPath && (await exists(observationLogPath)) ? await readJsonLines(observationLogPath) : [];
    await ensureDirectory(artifactDirectory);
    await copyCanonicalTruth(artifactDirectory);
    if (includeDerived && runtimeRoot) {
      await copyDirectoryIfPresent(runtimeRoot, path.join(artifactDirectory, "runtime"));
    }
    const manifest = {
      version: "world-artifact-v1",
      id: artifactId,
      kind,
      createdAt: now().toISOString(),
      label: String(label || "").trim() || null,
      source,
      includesDerived: includeDerived,
      operatorContract: {
        layout: operatorContract?.layout ?? null,
        persistenceMode: operatorContract?.persistence?.mode ?? null,
        worldHome
      },
      canonicalTruth: {
        witnessLog: path.posix.join("logs", canonicalTruthFiles.witnessLogName || "witnesses.jsonl"),
        observationLog: path.posix.join("logs", canonicalTruthFiles.observationLogName || "observations.jsonl"),
        witnessCount: witnessEntries.length,
        observationCount: observationEntries.length
      },
      derived: {
        runtimeRoot: includeDerived && runtimeRoot ? "runtime" : null,
        managedRoots: includeDerived ? derivedRoots.map(entry => entry.key) : []
      }
    };
    await fs.writeFile(path.join(artifactDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    const summary = await describeArtifactDirectory({
      artifactDirectory,
      source,
      allowedKinds: [kind]
    });
    emitOperatorObservation(`operator.${kind}`, {
      action: kind,
      artifactId,
      artifactPath: artifactDirectory,
      includesDerived: includeDerived,
      witnessCount: witnessEntries.length,
      observationCount: observationEntries.length
    }, actor);
    return summary;
  }

  async function resolveManagedArtifact(rootPath, artifactId, allowedKinds = []) {
    const normalizedId = artifactIdFromInput(artifactId);
    if (!normalizedId) {
      const error = new Error("artifactId must name a managed artifact directory");
      error.status = 400;
      throw error;
    }
    const artifactDirectory = path.resolve(rootPath, normalizedId);
    if (!pathInside(rootPath, artifactDirectory)) {
      const error = new Error("artifactId resolved outside the active world home");
      error.status = 400;
      throw error;
    }
    const summary = await describeArtifactDirectory({
      artifactDirectory,
      source: path.basename(rootPath),
      allowedKinds
    });
    if (summary.status !== "ready") {
      const error = new Error(summary.reason || "artifact is not ready");
      error.status = 400;
      error.summary = summary;
      throw error;
    }
    return summary;
  }

  async function replaceCurrentWorldFromArtifact({
    action,
    artifactRoot,
    artifactId,
    allowedKinds,
    preserveCurrent = false,
    actor = "system"
  }) {
    await ensureManagedMutationAllowed();
    await ensureManagedRoots();
    const summary = await resolveManagedArtifact(artifactRoot, artifactId, allowedKinds);
    let safetyBackup = null;
    if (preserveCurrent) {
      safetyBackup = await createArtifact({
        kind: "backup",
        rootPath: activityRoots.backupsRoot,
        label: `pre-${action}-${summary.id}`,
        includeDerived: true,
        actor,
        source: `${action}-preserve-current`
      });
    }
    const payload = await loadArtifactPayload(summary);
    const stagingRoot = path.join(worldHome, ".operator-stage", `${summary.id}-${slugify(action, action)}`);
    const swapRoot = path.join(worldHome, ".operator-swap", `${summary.id}-${slugify(action, action)}`);
    const stageLogsRoot = path.join(stagingRoot, "logs");
    const stageRuntimeRoot = path.join(stagingRoot, "runtime");
    const oldLogsRoot = path.join(swapRoot, "logs");
    const oldRuntimeRoot = path.join(swapRoot, "runtime");
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await fs.rm(swapRoot, { recursive: true, force: true });
    await ensureDirectory(stageLogsRoot);
    await ensureDirectory(swapRoot);
    await copyArtifactCanonicalTruth(summary, stagingRoot);
    if (payload.manifest.includesDerived === true && payload.runtimeSource) {
      await copyDirectoryIfPresent(payload.runtimeSource, stageRuntimeRoot);
    }
    if (logsRoot && (await exists(logsRoot))) {
      await renameReplace(logsRoot, oldLogsRoot);
    }
    await renameReplace(stageLogsRoot, logsRoot);
    if (runtimeRoot) {
      if (payload.manifest.includesDerived === true && (await exists(stageRuntimeRoot))) {
        if (await exists(runtimeRoot)) {
          await renameReplace(runtimeRoot, oldRuntimeRoot);
        }
        await renameReplace(stageRuntimeRoot, runtimeRoot);
      } else {
        await fs.rm(runtimeRoot, { recursive: true, force: true });
        await ensureDirectory(runtimeRoot);
      }
    }
    await fs.rm(stagingRoot, { recursive: true, force: true });
    await fs.rm(swapRoot, { recursive: true, force: true });
    const reloaded = await reloadWorldTruthFromDisk();
    const restartRequired = payload.manifest.includesDerived === true;
    emitOperatorObservation(`operator.${action}`, {
      action,
      artifactId: summary.id,
      artifactPath: summary.path,
      preserveCurrent,
      includesDerived: payload.manifest.includesDerived === true,
      restartRequired,
      witnessCount: reloaded.witnessCount,
      observationCount: reloaded.observationCount,
      safetyBackupId: safetyBackup?.id ?? null
    }, actor);
    return {
      artifact: summary,
      safetyBackup,
      restartRequired,
      reloaded
    };
  }

  async function backup(options = {}) {
    return createArtifact({
      kind: "backup",
      rootPath: activityRoots.backupsRoot,
      label: options.label,
      includeDerived: options.includeDerived === true,
      actor: options.actor ?? "system"
    });
  }

  async function exportWorld(options = {}) {
    return createArtifact({
      kind: "export",
      rootPath: activityRoots.exportsRoot,
      label: options.label,
      includeDerived: false,
      actor: options.actor ?? "system"
    });
  }

  async function restore(options = {}) {
    return replaceCurrentWorldFromArtifact({
      action: "restore",
      artifactRoot: activityRoots.backupsRoot,
      artifactId: options.artifactId,
      allowedKinds: ["backup"],
      preserveCurrent: options.preserveCurrent === true,
      actor: options.actor ?? "system"
    });
  }

  async function importWorld(options = {}) {
    return replaceCurrentWorldFromArtifact({
      action: "import",
      artifactRoot: activityRoots.importsRoot,
      artifactId: options.artifactId,
      allowedKinds: ["export"],
      preserveCurrent: options.preserveCurrent === true,
      actor: options.actor ?? "system"
    });
  }

  function recentActivity(limit = 10) {
    return (world?.allObservations?.() ?? [])
      .filter(observation => OPERATOR_ACTIVITY_PROCESSES.has(observation.process))
      .slice(-limit)
      .reverse()
      .map(observation => ({
        id: observation.id,
        process: observation.process,
        actor: observation.actor,
        body: observation.body ?? {}
      }));
  }

  async function state() {
    const gate = mutations();
    const [backups, exportsList, imports] = await Promise.all([
      listArtifacts(activityRoots.backupsRoot, "backups", ["backup"]),
      listArtifacts(activityRoots.exportsRoot, "exports", ["export"]),
      listArtifacts(activityRoots.importsRoot, "imports", ["export"])
    ]);
    return {
      contract: operatorContract,
      mutations: {
        ...gate,
        restoreAllowed: gate.enabled,
        importAllowed: gate.enabled
      },
      roots: { ...activityRoots, logsRoot, runtimeRoot },
      inventory: {
        backups,
        exports: exportsList,
        imports
      },
      recentActivity: recentActivity()
    };
  }

  return {
    mutations,
    state,
    backup,
    exportWorld,
    restore,
    importWorld,
    recentActivity
  };
}

export function runtimeOperatorMutations(operatorContract) {
  return operatorMutationGate(operatorContract);
}
