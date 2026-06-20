import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { AppSnapshotManager } from "./app-snapshot-manager.js";
import {
  COMPUTE_MODULE_ABI_V1,
  COMPUTE_MODULE_EXPORT_V1,
  COMPUTE_MODULE_LANGUAGE_V1,
  loadAppProject
} from "./app-project.js";

const MODULE_ARTIFACT_DIR = path.join(".witness-core", "compute-modules");

export class BuildWorkerError extends Error {
  constructor(message, result) {
    super(message);
    this.name = "BuildWorkerError";
    this.result = result;
  }
}

function parseArgs(argv = []) {
  const result = {
    manifestPath: "",
    runtimeProfile: "authoring",
    workspaceRoot: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] ?? "");
    if (value === "--manifest") {
      result.manifestPath = String(argv[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (value === "--runtime-profile") {
      result.runtimeProfile = String(argv[index + 1] ?? "authoring");
      index += 1;
      continue;
    }
    if (value === "--workspace-root") {
      result.workspaceRoot = String(argv[index + 1] ?? "");
      index += 1;
    }
  }
  return result;
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function normalizeArtifactPath(artifactPath, workspaceRoot) {
  if (!workspaceRoot) return normalizeSlashes(artifactPath);
  const relative = path.relative(workspaceRoot, artifactPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return normalizeSlashes(artifactPath);
  }
  return normalizeSlashes(relative);
}

function sanitizeArtifactSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "compute_module";
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveAssemblyScriptCompilerScript() {
  const localRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "node_modules", "assemblyscript");
  const candidates = [
    path.join(localRoot, "dist", "asc.js"),
    path.join(localRoot, "bin", "asc.js")
  ];
  if (typeof import.meta.resolve === "function") {
    try {
      const resolved = await import.meta.resolve("assemblyscript");
      const mainPath = fileURLToPath(resolved);
      candidates.unshift(
        path.join(path.dirname(mainPath), "asc.js"),
        path.join(path.dirname(mainPath), "cli", "asc.js")
      );
    } catch {}
  }
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  throw new Error("AssemblyScript compiler not found. Install the `assemblyscript` package to enable compute-module compile proof.");
}

async function runChild(command, args, { cwd }) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", code => {
      resolve({
        code: Number(code ?? 1),
        stdout: stdout.trim(),
        stderr: stderr.trim()
      });
    });
  });
}

function buildArtifactPath(computeModule, workspaceRoot) {
  return path.join(
    workspaceRoot,
    MODULE_ARTIFACT_DIR,
    `${sanitizeArtifactSegment(computeModule.hostOperation)}__${sanitizeArtifactSegment(computeModule.id)}.wasm`
  );
}

async function verifyCompiledExport(artifactBytes, exportName, computeModule) {
  let wasmModule = null;
  try {
    wasmModule = new WebAssembly.Module(artifactBytes);
  } catch (error) {
    throw new Error(`compiled wasm for ${computeModule.id} is invalid: ${error instanceof Error ? error.message : String(error)}`);
  }
  const exportedInvoke = WebAssembly.Module.exports(wasmModule).find(entry =>
    entry.name === exportName && entry.kind === "function"
  );
  if (!exportedInvoke) {
    throw new Error(`compute module ${computeModule.id} compiled but does not export function ${exportName}`);
  }
}

async function compileComputeModule(computeModule, {
  appRoot,
  workspaceRoot
}) {
  const sourcePath = path.resolve(appRoot, computeModule.source);
  const artifactPath = buildArtifactPath(computeModule, workspaceRoot);
  const baseRecord = {
    id: computeModule.id,
    hostOperation: computeModule.hostOperation,
    source: computeModule.source,
    artifactPath: null,
    artifactHash: null,
    language: computeModule.language ?? COMPUTE_MODULE_LANGUAGE_V1,
    abi: computeModule.abi ?? COMPUTE_MODULE_ABI_V1,
    export: computeModule.export ?? COMPUTE_MODULE_EXPORT_V1,
    success: false,
    error: null
  };
  if (!(await pathExists(sourcePath))) {
    return {
      ...baseRecord,
      error: `compute module source not found: ${normalizeSlashes(sourcePath)}`
    };
  }
  await fs.mkdir(path.dirname(artifactPath), { recursive: true });
  const ascPath = await resolveAssemblyScriptCompilerScript();
  const compileResult = await runChild(process.execPath, [
    ascPath,
    sourcePath,
    "--outFile",
    artifactPath,
    "--runtime",
    "stub"
  ], {
    cwd: appRoot
  });
  if (compileResult.code !== 0) {
    return {
      ...baseRecord,
      error: compileResult.stderr || compileResult.stdout || `AssemblyScript compile failed for ${computeModule.id}`
    };
  }
  if (!(await pathExists(artifactPath))) {
    return {
      ...baseRecord,
      error: `AssemblyScript compile did not emit artifact for ${computeModule.id}`
    };
  }
  try {
    const artifactBytes = await fs.readFile(artifactPath);
    await verifyCompiledExport(artifactBytes, baseRecord.export, computeModule);
    return {
      ...baseRecord,
      artifactPath: normalizeArtifactPath(artifactPath, workspaceRoot),
      artifactHash: `sha256:${sha256Hex(artifactBytes)}`,
      success: true
    };
  } catch (error) {
    return {
      ...baseRecord,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function compileComputeModules(appProject, { workspaceRoot }) {
  const effectiveWorkspaceRoot = workspaceRoot || appProject.appRoot;
  const results = [];
  for (const computeModule of appProject.computeModules ?? []) {
    const result = await compileComputeModule(computeModule, {
      appRoot: appProject.appRoot,
      workspaceRoot: effectiveWorkspaceRoot
    });
    results.push(result);
    if (!result.success) {
      return {
        ok: false,
        error: result.error || `compute module compile failed: ${result.id}`,
        computeModules: results,
        computeModuleCount: (appProject.computeModules ?? []).length
      };
    }
  }
  return {
    ok: true,
    error: null,
    computeModules: results,
    computeModuleCount: results.length
  };
}

function buildResult({
  ok,
  error = null,
  manifestPath,
  runtimeProfile,
  appProject,
  diagnostics = {},
  computeModules = [],
  computeModuleCount = 0
}) {
  return {
    ok,
    error,
    manifestPath,
    runtimeProfile,
    appRoot: appProject.appRoot,
    sourceCount: Number(diagnostics.sourceCount || 0),
    appRevision: Number(diagnostics.appRevision || 0),
    computeModuleCount,
    computeModules
  };
}

export async function runBuildWorker({
  manifestPath,
  runtimeProfile = "authoring",
  workspaceRoot = ""
} = {}) {
  if (!String(manifestPath || "").trim()) {
    throw new Error("missing --manifest");
  }
  const appProject = await loadAppProject(manifestPath, { runtimeProfile });
  const manager = await AppSnapshotManager.create({
    appProject,
    runtimeProfile,
    devMode: false,
    watchEnabled: false,
    requireGenerationBridgeForPublishedWrites: false
  });
  try {
    const diagnostics = manager.diagnostics?.() ?? {};
    const buildErrors = Array.isArray(diagnostics.buildErrors) ? diagnostics.buildErrors : [];
    if (buildErrors.length) {
      const primary = buildErrors[0];
      const message = typeof primary?.message === "string" && primary.message
        ? primary.message
        : "snapshot build reported errors";
      throw new BuildWorkerError(message, buildResult({
        ok: false,
        error: message,
        manifestPath,
        runtimeProfile,
        appProject,
        diagnostics,
        computeModules: [],
        computeModuleCount: appProject.computeModules?.length ?? 0
      }));
    }
    const compileResult = await compileComputeModules(appProject, {
      workspaceRoot: workspaceRoot ? path.resolve(workspaceRoot) : ""
    });
    const result = buildResult({
      ok: compileResult.ok,
      error: compileResult.error,
      manifestPath,
      runtimeProfile,
      appProject,
      diagnostics,
      computeModules: compileResult.computeModules,
      computeModuleCount: compileResult.computeModuleCount
    });
    if (!compileResult.ok) {
      throw new BuildWorkerError(result.error || "compute module compile failed", result);
    }
    return result;
  } finally {
    manager.close?.();
  }
}

async function main() {
  const { manifestPath, runtimeProfile, workspaceRoot } = parseArgs(process.argv.slice(2));
  try {
    const result = await runBuildWorker({
      manifestPath,
      runtimeProfile,
      workspaceRoot
    });
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    const result = error instanceof BuildWorkerError && error.result
      ? error.result
      : {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
    process.stdout.write(JSON.stringify(result));
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

export { parseArgs };
