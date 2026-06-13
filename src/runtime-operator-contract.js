import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function resolvedPath(value, cwd) {
  if (!value) return null;
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(cwd, value);
}

function worldHomeLayout(worldHome) {
  return {
    worldHome,
    logsRoot: path.join(worldHome, "logs"),
    runtimeRoot: path.join(worldHome, "runtime"),
    backupsRoot: path.join(worldHome, "backups"),
    exportsRoot: path.join(worldHome, "exports"),
    importsRoot: path.join(worldHome, "imports")
  };
}

export function buildRuntimeOperatorContract({
  startupMode = "serve",
  layout = "legacy-ephemeral",
  persistenceMode = "ephemeral",
  worldHome = null,
  runtimeRoot = null,
  witnessLogPath = null,
  observationLogPath = null,
  backupsRoot = null,
  exportsRoot = null,
  importsRoot = null,
  storage = null,
  notes = []
} = {}) {
  return {
    contractVersion: "2026-06-12",
    startupMode,
    layout,
    persistence: {
      mode: persistenceMode,
      warmStart: persistenceMode === "warm" || persistenceMode === "warm-compatibility",
      coldStart: persistenceMode === "cold",
      notes: [...notes]
    },
    worldHome,
    canonicalTruth: {
      witnessLogPath,
      observationLogPath
    },
    directories: {
      runtimeRoot,
      backupsRoot,
      exportsRoot,
      importsRoot,
      assetsRoot: storage?.assetsRoot ?? null,
      blobsRoot: storage?.blobsRoot ?? null,
      searchRoot: storage?.searchRoot ?? null,
      webhooksRoot: storage?.webhooksRoot ?? null
    },
    lifecycle: {
      supportedFlows: ["warm-restart", "cold-start", "backup", "restore", "export", "import", "repair-rebuild"],
      canonicalTruthKinds: ["witness-log", "observation-log"],
      derivedKinds: ["runtime-root", "assets", "blobs", "search", "webhooks"]
    }
  };
}

export async function resolveRuntimeOperatorPaths({
  startupMode = "serve",
  cwd = process.cwd(),
  env = process.env,
  worldHome = null,
  runtimeRoot = null,
  witnessLogPath = null,
  observationLogPath = null,
  mkdtemp = prefix => fs.mkdtemp(prefix),
  tmpdir = os.tmpdir()
} = {}) {
  const explicitWorldHome = resolvedPath(worldHome ?? env.WORLD_HOME ?? null, cwd);
  const explicitRuntimeRoot = resolvedPath(runtimeRoot ?? env.RUNTIME_ROOT ?? null, cwd);
  const explicitWitnessLog = resolvedPath(witnessLogPath ?? env.WITNESS_LOG ?? null, cwd);
  const explicitObservationLog = resolvedPath(observationLogPath ?? env.OBSERVATION_LOG ?? null, cwd);
  const bootstrapLogPrefix = startupMode === "bootstrap" ? "bootstrap" : "witness-world";

  if (explicitWorldHome) {
    const layout = worldHomeLayout(explicitWorldHome);
    return buildRuntimeOperatorContract({
      startupMode,
      layout: "world-home-v1",
      persistenceMode: "warm",
      worldHome: explicitWorldHome,
      runtimeRoot: explicitRuntimeRoot ?? layout.runtimeRoot,
      witnessLogPath: explicitWitnessLog ?? path.join(layout.logsRoot, `${bootstrapLogPrefix}.witnesses.jsonl`),
      observationLogPath: explicitObservationLog ?? path.join(layout.logsRoot, `${bootstrapLogPrefix}.observations.jsonl`),
      backupsRoot: layout.backupsRoot,
      exportsRoot: layout.exportsRoot,
      importsRoot: layout.importsRoot,
      notes: ["Named WORLD_HOME owns the operator-visible world layout."]
    });
  }

  if (startupMode === "bootstrap" && !explicitRuntimeRoot && !explicitWitnessLog && !explicitObservationLog) {
    const tempHome = await mkdtemp(path.join(tmpdir, "witness-world-bootstrap-"));
    const layout = worldHomeLayout(tempHome);
    return buildRuntimeOperatorContract({
      startupMode,
      layout: "world-home-v1",
      persistenceMode: "cold",
      worldHome: tempHome,
      runtimeRoot: layout.runtimeRoot,
      witnessLogPath: path.join(layout.logsRoot, "bootstrap.witnesses.jsonl"),
      observationLogPath: path.join(layout.logsRoot, "bootstrap.observations.jsonl"),
      backupsRoot: layout.backupsRoot,
      exportsRoot: layout.exportsRoot,
      importsRoot: layout.importsRoot,
      notes: ["Bootstrap cold starts create a fresh temp world home unless WORLD_HOME or explicit paths are provided."]
    });
  }

  if (explicitRuntimeRoot || explicitWitnessLog || explicitObservationLog) {
    return buildRuntimeOperatorContract({
      startupMode,
      layout: "compatibility-explicit-paths",
      persistenceMode: "warm-compatibility",
      runtimeRoot: explicitRuntimeRoot ?? tmpdir,
      witnessLogPath: explicitWitnessLog ?? path.join(explicitRuntimeRoot ?? tmpdir, `${bootstrapLogPrefix}.witnesses.jsonl`),
      observationLogPath: explicitObservationLog ?? path.join(explicitRuntimeRoot ?? tmpdir, `${bootstrapLogPrefix}.observations.jsonl`),
      notes: ["Explicit runtime/log paths are still supported as a compatibility path outside WORLD_HOME."]
    });
  }

  const tempHome = await mkdtemp(path.join(tmpdir, "witness-world-ephemeral-"));
  const layout = worldHomeLayout(tempHome);
  return buildRuntimeOperatorContract({
    startupMode,
    layout: "ephemeral-world-home-v1",
    persistenceMode: "ephemeral",
    worldHome: tempHome,
    runtimeRoot: layout.runtimeRoot,
    witnessLogPath: path.join(layout.logsRoot, `${bootstrapLogPrefix}.witnesses.jsonl`),
    observationLogPath: path.join(layout.logsRoot, `${bootstrapLogPrefix}.observations.jsonl`),
    backupsRoot: layout.backupsRoot,
    exportsRoot: layout.exportsRoot,
    importsRoot: layout.importsRoot,
    notes: ["No WORLD_HOME or explicit paths were provided, so startup uses an isolated ephemeral temp world."]
  });
}
