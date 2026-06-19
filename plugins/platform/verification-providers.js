import path from "node:path";
import { pathToFileURL } from "node:url";

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizeExecutionStatus(value, fallback = "passed") {
  const status = optionalText(value) ?? fallback;
  if (["passed", "failed", "error", "timed_out"].includes(status)) return status;
  return fallback;
}

function normalizeCaseOrSuiteStatus(value, fallback = "passed") {
  const status = optionalText(value) ?? fallback;
  if (["passed", "failed", "error", "timed_out", "skipped", "todo", "unknown"].includes(status)) return status;
  return fallback;
}

function normalizeArtifactRows(runId, rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: optionalText(row?.id) ?? `testArtifact:${runId}:verifier:${index + 1}`,
    artifactKind: optionalText(row?.artifactKind) ?? "artifact",
    fileName: optionalText(row?.fileName),
    contentType: optionalText(row?.contentType) ?? "text/plain",
    content: typeof row?.content === "string" ? row.content : JSON.stringify(row?.content ?? null, null, 2),
    structuredFormat: optionalText(row?.structuredFormat),
    summary: row?.summary && typeof row.summary === "object" ? structuredClone(row.summary) : null,
    title: optionalText(row?.title)
  }));
}

function normalizeSuiteRows(runId, rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: optionalText(row?.id) ?? `testSuite:${runId}:verifier:${index + 1}`,
    artifactId: optionalText(row?.artifactId),
    format: optionalText(row?.format),
    name: optionalText(row?.name) ?? `Verifier suite ${index + 1}`,
    status: normalizeCaseOrSuiteStatus(row?.status, "passed"),
    total: typeof row?.total === "number" ? row.total : 0,
    passed: typeof row?.passed === "number" ? row.passed : 0,
    failed: typeof row?.failed === "number" ? row.failed : 0,
    errors: typeof row?.errors === "number" ? row.errors : 0,
    skipped: typeof row?.skipped === "number" ? row.skipped : 0,
    durationMs: typeof row?.durationMs === "number" ? row.durationMs : null
  }));
}

function normalizeCaseRows(runId, rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: optionalText(row?.id) ?? `testCase:${runId}:verifier:${index + 1}`,
    suiteId: optionalText(row?.suiteId),
    artifactId: optionalText(row?.artifactId),
    format: optionalText(row?.format),
    name: optionalText(row?.name) ?? `Verifier case ${index + 1}`,
    status: normalizeCaseOrSuiteStatus(row?.status, "passed"),
    testNumber: typeof row?.testNumber === "number" ? row.testNumber : (index + 1),
    classname: optionalText(row?.classname),
    durationMs: typeof row?.durationMs === "number" ? row.durationMs : null
  }));
}

function resolveModuleExports(namespace = {}, input = {}) {
  const exportName = optionalText(input.exportName);
  const cleanupExportName = optionalText(input.cleanupExportName);
  const collectArtifactsExportName = optionalText(input.collectArtifactsExportName);
  const root = namespace?.default && typeof namespace.default === "object" && namespace.default !== null
    ? namespace.default
    : namespace;
  const verify = exportName
    ? namespace?.[exportName] ?? root?.[exportName] ?? null
    : namespace?.verify ?? root?.verify ?? namespace?.default ?? null;
  const cleanup = cleanupExportName
    ? namespace?.[cleanupExportName] ?? root?.[cleanupExportName] ?? null
    : namespace?.cleanup ?? root?.cleanup ?? null;
  const collectArtifacts = collectArtifactsExportName
    ? namespace?.[collectArtifactsExportName] ?? root?.[collectArtifactsExportName] ?? null
    : namespace?.collectArtifacts ?? root?.collectArtifacts ?? null;
  return {
    verify,
    cleanup,
    collectArtifacts
  };
}

async function importVerifierModule({ workspaceRoot, modulePath }) {
  const resolvedPath = path.isAbsolute(modulePath)
    ? modulePath
    : path.resolve(workspaceRoot, modulePath);
  return import(`${pathToFileURL(resolvedPath).href}?t=${Date.now().toString(36)}`);
}

const commandProvider = Object.freeze({
  kind: "verificationProvider",
  id: "verification.command",
  supportedExecutionClasses: Object.freeze(["child_process", "browser_session", "candidate_snapshot"]),
  defaultSafetyClass: "unsafe",
  async run(context) {
    const command = optionalText(context?.input?.command) ?? optionalText(context?.gate?.command);
    if (!command) {
      return {
        execution: {
          status: "error",
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          timedOut: false,
          error: "verification.command requires a command"
        },
        artifacts: [],
        suites: [],
        cases: []
      };
    }
    const execution = await context.executeCommand(command);
    return {
      execution,
      artifacts: [],
      suites: [],
      cases: [],
      providerState: null
    };
  }
});

const javascriptModuleProvider = Object.freeze({
  kind: "verificationProvider",
  id: "verification.javascriptModule",
  supportedExecutionClasses: Object.freeze(["in_process"]),
  defaultSafetyClass: "safe",
  async run(context) {
    const modulePath = optionalText(context?.input?.module);
    if (!modulePath) {
      return {
        execution: {
          status: "error",
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          timedOut: false,
          error: "verification.javascriptModule requires input.module"
        },
        artifacts: [],
        suites: [],
        cases: [],
        providerState: null
      };
    }
    const namespace = await importVerifierModule({
      workspaceRoot: context.workspace.cwd,
      modulePath
    });
    const exports = resolveModuleExports(namespace, context.input);
    if (typeof exports.verify !== "function") {
      throw new Error(`verification module ${modulePath} does not export a verifier function`);
    }
    const output = await exports.verify({
      ...context,
      modulePath
    });
    const execution = {
      status: normalizeExecutionStatus(output?.status, "passed"),
      exitCode: typeof output?.exitCode === "number" ? output.exitCode : (output?.status === "passed" ? 0 : null),
      signal: optionalText(output?.signal),
      stdout: typeof output?.stdout === "string" ? output.stdout : "",
      stderr: typeof output?.stderr === "string" ? output.stderr : "",
      timedOut: output?.timedOut === true,
      error: optionalText(output?.error)
    };
    return {
      execution,
      artifacts: normalizeArtifactRows(context.runId, output?.artifacts),
      suites: normalizeSuiteRows(context.runId, output?.suites),
      cases: normalizeCaseRows(context.runId, output?.cases),
      providerState: {
        cleanup: typeof exports.cleanup === "function" ? exports.cleanup : null,
        collectArtifacts: typeof exports.collectArtifacts === "function" ? exports.collectArtifacts : null,
        output
      }
    };
  },
  async cleanup(context, runResult) {
    const cleanup = runResult?.providerState?.cleanup;
    const collectArtifacts = runResult?.providerState?.collectArtifacts;
    let summary = "No cleanup work was required.";
    const artifacts = [];
    if (typeof cleanup === "function") {
      const outcome = await cleanup({
        ...context,
        moduleOutput: runResult?.providerState?.output ?? null
      });
      summary = optionalText(outcome?.summary) ?? "Cleanup completed.";
      artifacts.push(...normalizeArtifactRows(context.runId, outcome?.artifacts));
    }
    if (typeof collectArtifacts === "function") {
      const produced = await collectArtifacts({
        ...context,
        moduleOutput: runResult?.providerState?.output ?? null
      });
      artifacts.push(...normalizeArtifactRows(context.runId, produced));
    }
    return {
      status: "passed",
      summary,
      artifacts
    };
  }
});

export const PLATFORM_VERIFICATION_PROVIDER_ENTRIES = Object.freeze([
  commandProvider,
  javascriptModuleProvider
]);

export const PLATFORM_VERIFICATION_PROVIDERS = Object.freeze(
  Object.fromEntries(PLATFORM_VERIFICATION_PROVIDER_ENTRIES.map(provider => [provider.id, provider]))
);
