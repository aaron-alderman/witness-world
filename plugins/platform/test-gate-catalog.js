import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { summarizePlatformPathSystem } from "./branch-insights.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..", "..");

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function unique(values = []) {
  return [...new Set(values.map(String).filter(Boolean))];
}

function sortRows(rows, keys) {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const next = String(left[key] ?? "").localeCompare(String(right[key] ?? ""));
      if (next) return next;
    }
    return 0;
  });
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "gate";
}

function readTextSync(relativePath, fallback = "") {
  try {
    return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
  } catch {
    return fallback;
  }
}

function readJsonSync(relativePath, fallback) {
  try {
    return JSON.parse(readTextSync(relativePath, ""));
  } catch {
    return fallback;
  }
}

function listFilesSync(root, predicate) {
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesSync(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function normalizeGateCommand(command) {
  return String(command || "").replace(/\s+/g, " ").trim();
}

function gateRunnerForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes(".rs") || value.includes("cargo")) return "cargo-test";
  return "node-test";
}

function gateEnvironmentForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes(".rs") || value.includes("cargo")) return "local-rust-cargo";
  if (value.includes("ui.") || value.includes("browser")) return "local-browser";
  return "local-node";
}

function gateTimeoutForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes("runtime") || value.includes("ui.") || value.includes("host")) return 180000;
  return 120000;
}

function gateCostEstimateForPath(relativePath) {
  const value = String(relativePath || "");
  if (value.includes("runtime") || value.includes("ui.") || value.includes("host")) return "high";
  if (value.includes("platform") || value.includes("pipeline")) return "medium";
  return "low";
}

function looksLikeExplicitTestGateCommand(command) {
  const value = normalizeGateCommand(command);
  return /^(?:cmd \/c )?node --test\b/i.test(value)
    || /^cargo test\b/i.test(value)
    || /^npm run test(?:[:\w-]+)?\b/i.test(value)
    || /^pnpm (?:test|vitest)\b/i.test(value)
    || /^(?:npx )?vitest\b/i.test(value);
}

function extractMarkdownCodeTokens(source) {
  const tokens = [];
  const pattern = /`([^`\r\n]+)`/g;
  for (const match of String(source || "").matchAll(pattern)) tokens.push(match[1].trim());
  return unique(tokens);
}

function extractMarkdownRouteRefs(source) {
  const routes = [];
  const pattern = /(?:^|[\s(])((?:\/platform)|(?:\/api\/[A-Za-z0-9_./:-]+))/g;
  for (const match of String(source || "").matchAll(pattern)) routes.push(match[1].trim());
  return unique(routes);
}

function extractDocTestGateCommands(source) {
  return unique(
    extractMarkdownCodeTokens(source)
      .map(token => normalizeGateCommand(token))
      .filter(looksLikeExplicitTestGateCommand)
  );
}

function repoRelativeHintPath(fromRelativePath, specifier) {
  const value = String(specifier || "").trim();
  if (!value.startsWith(".")) return null;
  const baseDir = path.dirname(path.join(repoRoot, fromRelativePath));
  const resolved = path.resolve(baseDir, value);
  const relative = slash(path.relative(repoRoot, resolved));
  if (!relative || relative.startsWith("..")) return null;
  return relative;
}

function extractRepoRelativeSpecifiers(fromRelativePath, source) {
  const specifiers = [];
  const patterns = [
    /(?:import|export)\s+(?:[^"'`]+?\s+from\s+)?["'`]([^"'`]+)["'`]/g,
    /require\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /import\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
    /new URL\(\s*["'`]([^"'`]+)["'`]/g
  ];
  for (const pattern of patterns) {
    for (const match of String(source || "").matchAll(pattern)) {
      const resolved = repoRelativeHintPath(fromRelativePath, match[1]);
      if (resolved) specifiers.push(resolved);
    }
  }
  return unique(specifiers);
}

function extractRepoRootPathHints(source) {
  const paths = [];
  const pattern = /\b(?:docs|plugins|src|test|store|examples)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+\b/g;
  for (const match of String(source || "").matchAll(pattern)) paths.push(match[0]);
  return unique(paths);
}

function extractPlatformModelHintTargets(source) {
  const targets = [];
  const pluginPattern = /\bplugin\.[A-Za-z0-9_.-]+\b/g;
  const directNodePattern = /\b(?:profile|surface|testEnvironment):[A-Za-z0-9_./:-]+\b/g;
  for (const match of String(source || "").matchAll(pluginPattern)) targets.push(match[0]);
  for (const match of String(source || "").matchAll(directNodePattern)) targets.push(match[0]);
  for (const routeRef of extractMarkdownRouteRefs(source)) {
    if (routeRef === "/platform") targets.push("route:GET /platform");
  }
  return unique(targets);
}

function extractCandidateSnapshotHintTargets(source) {
  const text = String(source || "");
  if (
    text.includes("platform-change-set-apply")
    || text.includes("runtimeSnapshotRefresh")
    || text.includes("/api/runtime/backend-revisions/events")
  ) {
    return ["testEnvironment:platform-candidate-snapshot"];
  }
  return [];
}

function buildTestGateSourceHints(relativePath, source) {
  const sourceDependencies = unique([
    relativePath,
    ...extractRepoRelativeSpecifiers(relativePath, source),
    ...extractRepoRootPathHints(source)
  ]);
  const protectedObjects = new Set([
    ...extractPlatformModelHintTargets(source),
    ...extractCandidateSnapshotHintTargets(source)
  ]);
  for (const dependency of sourceDependencies) {
    const system = summarizePlatformPathSystem(dependency);
    protectedObjects.add(system.id);
    if (dependency.startsWith("docs/")) protectedObjects.add(`doc:${dependency}`);
    if (dependency.endsWith(".rvm")) protectedObjects.add(`rvm:${dependency}`);
    if (dependency.endsWith(".wcss")) protectedObjects.add(`wcss:${dependency}`);
  }
  return {
    sourceDependencies,
    protectedObjects: [...protectedObjects]
  };
}

function packageScriptProtectedObjects(scriptName, command) {
  const targets = [];
  const script = String(scriptName || "");
  const normalizedCommand = normalizeGateCommand(command);
  const pluginMatch = script.match(/^test:plugin:([a-z0-9-]+)$/i) || normalizedCommand.match(/\brun-plugin-tests\.mjs\s+([a-z0-9-]+)/i);
  if (pluginMatch) targets.push(`plugin.${pluginMatch[1]}`);
  if (script === "test:ui") targets.push("runtime.core");
  return unique(targets);
}

function targetLabel(targetId) {
  const value = String(targetId || "");
  if (value === "plugin.platform") return "Platform plugin";
  if (value === "plugin.mcp") return "MCP plugin";
  if (value === "runtime.core") return "Runtime core";
  if (value === "docs") return "Governed docs";
  if (value === "verification.tests") return "Verification tests";
  if (value === "surface.platform") return "Platform surface";
  if (value.startsWith("plugin.")) return `Plugin ${value.slice("plugin.".length)}`;
  if (value.startsWith("profile:")) return value;
  if (value.startsWith("route:")) return value.slice("route:".length);
  if (value.startsWith("testEnvironment:")) return value.slice("testEnvironment:".length);
  if (value.startsWith("doc:")) return value.slice("doc:".length);
  if (value.startsWith("rvm:")) return value.slice("rvm:".length);
  if (value.startsWith("wcss:")) return value.slice("wcss:".length);
  return value;
}

function relativeRepoPath(fromRoot, relativeOrAbsolutePath) {
  const raw = String(relativeOrAbsolutePath || "").trim();
  if (!raw) return null;
  const resolved = path.isAbsolute(raw) ? raw : path.resolve(fromRoot, raw);
  const relative = slash(path.relative(repoRoot, resolved));
  if (!relative || relative.startsWith("..")) return slash(raw);
  return relative;
}

function authoredGateCostEstimate({ executionClass = null, safetyClass = null } = {}) {
  if (String(executionClass || "") === "candidate_snapshot") return "high";
  if (String(executionClass || "") === "browser_session") return "high";
  if (String(executionClass || "") === "child_process") return "medium";
  return String(safetyClass || "") === "safe" ? "low" : "medium";
}

function verificationCommandForEntry(entry = {}) {
  const explicit = normalizeGateCommand(entry?.input?.command || "");
  if (explicit) return explicit;
  if (String(entry?.providerId || "") === "verification.javascriptModule") {
    const modulePath = String(entry?.input?.module || "").trim();
    return modulePath ? `verification.javascriptModule ${modulePath}` : "verification.javascriptModule";
  }
  return "";
}

export function buildAuthoredVerificationGates({
  verificationPolicy = null,
  appRoot = repoRoot,
  latestResultsByGate = Object.create(null),
  flakeScoresByGate = Object.create(null)
} = {}) {
  const rows = [];
  for (const entry of verificationPolicy?.verifierEntries ?? []) {
    const providerId = String(entry?.providerId || "");
    const gateId = String(entry?.gateId || "");
    if (!gateId || !providerId) continue;
    const moduleDependency = providerId === "verification.javascriptModule" && entry?.input?.module
      ? relativeRepoPath(appRoot, entry.input.module)
      : null;
    const sourceDependencies = unique([
      "app.wtoml",
      ...((entry?.sourceDependencies ?? []).map(dependency => relativeRepoPath(appRoot, dependency)).filter(Boolean)),
      moduleDependency
    ].filter(Boolean));
    const command = verificationCommandForEntry(entry);
    rows.push({
      id: gateId,
      title: String(entry?.title || gateId),
      sourcePath: "app.wtoml",
      command,
      runner: providerId === "verification.command"
        ? gateRunnerForPath(command)
        : "verification-provider",
      environment: String(entry?.executionClass || "") === "browser_session"
        ? "local-browser"
        : "local-node",
      timeoutMs: typeof entry?.timeoutMs === "number" ? entry.timeoutMs : 120000,
      protectedObjects: unique(entry?.targetIds ?? []),
      protectedObjectLabels: unique(entry?.targetIds ?? []).map(targetLabel),
      sourceDependencies,
      lastResult: latestResultsByGate[gateId]
        ? {
            runId: latestResultsByGate[gateId].runId,
            status: latestResultsByGate[gateId].status,
            exitCode: latestResultsByGate[gateId].exitCode,
            durationMs: latestResultsByGate[gateId].durationMs,
            producedAt: latestResultsByGate[gateId].producedAt ?? null
          }
        : null,
      flakeScore: typeof flakeScoresByGate[gateId] === "number" ? flakeScoresByGate[gateId] : null,
      costEstimate: authoredGateCostEstimate(entry),
      selectedByBranches: [],
      selectedByChangeSets: [],
      providerId,
      safetyClass: entry?.safetyClass ? String(entry.safetyClass) : null,
      executionClass: entry?.executionClass ? String(entry.executionClass) : null,
      invoke: entry?.invoke !== false,
      authored: true,
      verificationInput: entry?.input && typeof entry.input === "object" ? structuredClone(entry.input) : {}
    });
  }
  return sortRows(rows, ["id"]);
}

export function resolveEffectivePlatformTestGates({
  projectedTestGates = [],
  verificationPolicy = null,
  appRoot = repoRoot,
  latestResultsByGate = Object.create(null),
  flakeScoresByGate = Object.create(null)
} = {}) {
  const authored = buildAuthoredVerificationGates({
    verificationPolicy,
    appRoot,
    latestResultsByGate,
    flakeScoresByGate
  });
  const rows = new Map();
  for (const row of projectedTestGates ?? []) {
    if (!row?.id) continue;
    rows.set(String(row.id), {
      ...row,
      providerId: row.providerId ? String(row.providerId) : (row.command ? "verification.command" : null),
      safetyClass: row.safetyClass ? String(row.safetyClass) : null,
      executionClass: row.executionClass ? String(row.executionClass) : null,
      invoke: row.invoke !== false,
      authored: row.authored === true,
      verificationInput: row.verificationInput && typeof row.verificationInput === "object"
        ? structuredClone(row.verificationInput)
        : {}
    });
  }
  for (const row of authored) rows.set(String(row.id), row);
  return sortRows([...rows.values()].map(row => ({
    ...row,
    protectedObjects: unique(row.protectedObjects ?? []),
    protectedObjectLabels: unique(row.protectedObjectLabels ?? []),
    sourceDependencies: unique(row.sourceDependencies ?? [])
  })), ["id"]);
}

export function discoverProjectedTestGates(latestResultsByGate = Object.create(null), flakeScoresByGate = Object.create(null)) {
  const rows = new Map();
  const packageJson = readJsonSync("package.json", { scripts: {} });
  for (const [scriptName, command] of Object.entries(packageJson.scripts ?? {})) {
    if (!String(scriptName).startsWith("test")) continue;
    const gateId = `gate:script:${slugify(scriptName)}`;
    const normalizedCommand = normalizeGateCommand(command);
    const protectedObjects = packageScriptProtectedObjects(scriptName, normalizedCommand);
    rows.set(gateId, {
      id: gateId,
      title: normalizedCommand,
      sourcePath: "package.json",
      command: normalizedCommand,
      runner: gateRunnerForPath(normalizedCommand),
      environment: gateEnvironmentForPath(normalizedCommand),
      timeoutMs: gateTimeoutForPath(normalizedCommand),
      protectedObjects,
      protectedObjectLabels: protectedObjects.map(targetLabel),
      sourceDependencies: ["package.json"],
      lastResult: latestResultsByGate[gateId]
        ? {
            runId: latestResultsByGate[gateId].runId,
            status: latestResultsByGate[gateId].status,
            exitCode: latestResultsByGate[gateId].exitCode,
            durationMs: latestResultsByGate[gateId].durationMs,
            producedAt: latestResultsByGate[gateId].producedAt ?? null
          }
        : null,
      flakeScore: typeof flakeScoresByGate[gateId] === "number" ? flakeScoresByGate[gateId] : null,
      costEstimate: gateCostEstimateForPath(normalizedCommand),
      selectedByBranches: [],
      selectedByChangeSets: []
    });
  }

  for (const docFile of listFilesSync(path.join(repoRoot, "docs"), file => file.endsWith(".md"))) {
    const relative = slash(path.relative(repoRoot, docFile));
    const source = readTextSync(relative, "");
    for (const command of extractDocTestGateCommands(source)) {
      const gateId = `gate:doc:${relative}:${slugify(command)}`;
      rows.set(gateId, {
        id: gateId,
        title: command,
        sourcePath: relative,
        command,
        runner: gateRunnerForPath(command),
        environment: gateEnvironmentForPath(command),
        timeoutMs: gateTimeoutForPath(command),
        protectedObjects: buildTestGateSourceHints(relative, source).protectedObjects,
        protectedObjectLabels: buildTestGateSourceHints(relative, source).protectedObjects.map(targetLabel),
        sourceDependencies: buildTestGateSourceHints(relative, source).sourceDependencies,
        lastResult: latestResultsByGate[gateId]
          ? {
              runId: latestResultsByGate[gateId].runId,
              status: latestResultsByGate[gateId].status,
              exitCode: latestResultsByGate[gateId].exitCode,
              durationMs: latestResultsByGate[gateId].durationMs,
              producedAt: latestResultsByGate[gateId].producedAt ?? null
            }
          : null,
        flakeScore: typeof flakeScoresByGate[gateId] === "number" ? flakeScoresByGate[gateId] : null,
        costEstimate: gateCostEstimateForPath(command),
        selectedByBranches: [],
        selectedByChangeSets: []
      });
    }
  }

  for (const root of ["test", "plugins"]) {
    for (const file of listFilesSync(path.join(repoRoot, root), full => full.endsWith(".test.js"))) {
      const relative = slash(path.relative(repoRoot, file));
      const source = readTextSync(relative, "");
      const hints = buildTestGateSourceHints(relative, source);
      const gateId = `gate:${relative}`;
      rows.set(gateId, {
        id: gateId,
        title: relative,
        sourcePath: relative,
        command: `node --test ${relative}`,
        runner: gateRunnerForPath(relative),
        environment: gateEnvironmentForPath(relative),
        timeoutMs: gateTimeoutForPath(relative),
        protectedObjects: hints.protectedObjects,
        protectedObjectLabels: hints.protectedObjects.map(targetLabel),
        sourceDependencies: hints.sourceDependencies,
        lastResult: latestResultsByGate[gateId]
          ? {
              runId: latestResultsByGate[gateId].runId,
              status: latestResultsByGate[gateId].status,
              exitCode: latestResultsByGate[gateId].exitCode,
              durationMs: latestResultsByGate[gateId].durationMs,
              producedAt: latestResultsByGate[gateId].producedAt ?? null
            }
          : null,
        flakeScore: typeof flakeScoresByGate[gateId] === "number" ? flakeScoresByGate[gateId] : null,
        costEstimate: gateCostEstimateForPath(relative),
        selectedByBranches: [],
        selectedByChangeSets: []
      });
    }
  }

  return sortRows([...rows.values()].map(row => ({
    ...row,
    protectedObjects: unique(row.protectedObjects ?? []),
    protectedObjectLabels: unique(row.protectedObjectLabels ?? []),
    sourceDependencies: unique(row.sourceDependencies ?? [])
  })), ["id"]);
}

export function buildProjectedTestGateIndex(rows = []) {
  const byId = Object.create(null);
  const byProtectedObject = Object.create(null);
  const byBranch = Object.create(null);
  const byChangeSet = Object.create(null);
  for (const row of rows) {
    byId[row.id] = { ...row };
    for (const target of row.protectedObjects ?? []) {
      if (!byProtectedObject[target]) byProtectedObject[target] = [];
      byProtectedObject[target].push(row.id);
    }
  }
  for (const target of Object.keys(byProtectedObject)) {
    byProtectedObject[target] = unique(byProtectedObject[target]).sort((left, right) => left.localeCompare(right));
  }
  return { byId, byProtectedObject, byBranch, byChangeSet };
}

export function buildProjectedCoverageEdges(testGates = []) {
  const rows = [];
  for (const gate of Array.isArray(testGates) ? testGates : []) {
    for (const targetId of Array.isArray(gate.protectedObjects) ? gate.protectedObjects : []) {
      rows.push({
        id: `coverageEdge:${gate.id}:protectedObject:${targetId}`,
        gateId: String(gate.id || ""),
        gateTitle: String(gate.title || gate.id || ""),
        coverageKind: "protectedObject",
        targetId: String(targetId),
        targetLabel: targetLabel(targetId),
        sourceDependency: null,
        sourcePath: gate.sourcePath ? String(gate.sourcePath) : null
      });
    }
    for (const sourceDependency of Array.isArray(gate.sourceDependencies) ? gate.sourceDependencies : []) {
      rows.push({
        id: `coverageEdge:${gate.id}:sourceDependency:${sourceDependency}`,
        gateId: String(gate.id || ""),
        gateTitle: String(gate.title || gate.id || ""),
        coverageKind: "sourceDependency",
        targetId: `file:${String(sourceDependency)}`,
        targetLabel: String(sourceDependency),
        sourceDependency: String(sourceDependency),
        sourcePath: gate.sourcePath ? String(gate.sourcePath) : null
      });
    }
  }
  return sortRows(rows, ["gateId", "coverageKind", "targetId"]);
}

function autoSelectionCostRank(costEstimate) {
  const value = String(costEstimate || "").toLowerCase();
  if (value === "low") return 0;
  if (value === "medium") return 1;
  if (value === "high") return 2;
  return 3;
}

function autoSelectionSpecificityRank(gate) {
  const sourcePath = String(gate?.sourcePath || "");
  const command = normalizeGateCommand(gate?.command || "");
  if (sourcePath.endsWith(".test.js")) return 0;
  if (sourcePath.startsWith("docs/")) return 1;
  if (sourcePath === "package.json" && /^npm run test:[^ ]+/i.test(command)) return 2;
  if (sourcePath === "package.json" && /^npm run test\b/i.test(command)) return 3;
  return 4;
}

function autoSelectionTargetHintsForPath(relativePath) {
  const hints = new Set();
  const system = summarizePlatformPathSystem(relativePath);
  if (
    system.id === "runtime.core"
    || system.id === "runtime.profile"
    || system.id === "surface.platform"
    || system.id.startsWith("plugin.")
  ) {
    hints.add(system.id);
  }
  if (relativePath.startsWith("docs/")) hints.add(`doc:${relativePath}`);
  if (relativePath.endsWith(".rvm")) hints.add(`rvm:${relativePath}`);
  if (relativePath.endsWith(".wcss")) hints.add(`wcss:${relativePath}`);
  return [...hints];
}

export function selectContinuousTestGates(testGates = [], changedSources = [], { maxGateCount = Infinity } = {}) {
  const normalizedSources = unique(changedSources);
  const changedSourceSet = new Set(normalizedSources);
  const targetHints = new Set(normalizedSources.flatMap(autoSelectionTargetHintsForPath));
  const candidates = [];
  for (const gate of Array.isArray(testGates) ? testGates : []) {
    const matchedSourceDependencies = unique((gate?.sourceDependencies ?? []).filter(source => changedSourceSet.has(source)));
    const matchedTargets = unique((gate?.protectedObjects ?? []).filter(target => targetHints.has(target)));
    if (!matchedSourceDependencies.length && !matchedTargets.length) continue;
    candidates.push({
      ...gate,
      matchedSourceDependencies,
      matchedTargets,
      specificityRank: autoSelectionSpecificityRank(gate)
    });
  }
  candidates.sort((left, right) => {
    const sourceMatchDiff = right.matchedSourceDependencies.length - left.matchedSourceDependencies.length;
    if (sourceMatchDiff) return sourceMatchDiff;
    const targetMatchDiff = right.matchedTargets.length - left.matchedTargets.length;
    if (targetMatchDiff) return targetMatchDiff;
    const specificityDiff = Number(left.specificityRank || 0) - Number(right.specificityRank || 0);
    if (specificityDiff) return specificityDiff;
    const costDiff = autoSelectionCostRank(left.costEstimate) - autoSelectionCostRank(right.costEstimate);
    if (costDiff) return costDiff;
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
  return candidates.slice(0, Math.max(0, Number(maxGateCount) || 0));
}

function isTerminalGateResultStatus(status) {
  return ["passed", "failed", "error", "timed_out"].includes(String(status || ""));
}

export function buildFlakeScoreByGate(testResults = []) {
  const byGate = Object.create(null);
  for (const row of Array.isArray(testResults) ? testResults : []) {
    const gateId = String(row?.gateId || "");
    if (!gateId) continue;
    if (String(row?.cacheStatus || "") === "hit") continue;
    if (!isTerminalGateResultStatus(row?.status)) continue;
    if (!byGate[gateId]) byGate[gateId] = [];
    byGate[gateId].push({
      status: String(row.status),
      producedAt: row.producedAt ?? null,
      id: String(row.id || "")
    });
  }
  const scores = Object.create(null);
  for (const [gateId, rows] of Object.entries(byGate)) {
    const ordered = [...rows].sort((left, right) =>
      String(left.producedAt || "").localeCompare(String(right.producedAt || ""))
      || String(left.id || "").localeCompare(String(right.id || ""))
    );
    if (ordered.length < 2) {
      scores[gateId] = null;
      continue;
    }
    let transitions = 0;
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index - 1].status !== ordered[index].status) transitions += 1;
    }
    scores[gateId] = Number((transitions / Math.max(1, ordered.length - 1)).toFixed(4));
  }
  return scores;
}
