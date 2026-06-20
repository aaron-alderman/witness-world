import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { launchDesktopProcess } from "./desktop-cli.js";
import { runOperatorTui } from "./operator-tui.js";
import { createWorld } from "./kernel.js";
import {
  DEFAULT_BOOTSTRAP_RUNTIME_PROFILE,
  DEFAULT_RUNTIME_PROFILE,
  resolveRuntimeProfile,
  resolveRuntimeProfileStrict
} from "./runtime-bundles.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { createRuntimeOperatorService, runtimeOperatorMutations } from "./runtime-operator-service.js";
import { startBlankRuntime } from "./runtime-local-launcher.js";
import { createLogger } from "./logger.js";
import { loadAppProjectWithStableFallback, resolveMcpTarget, resolveServeTarget } from "./app-project.js";
import { startAppRuntime } from "./app-runtime.js";
import { createStartupTelemetry } from "./startup-telemetry.js";
import { createWitnessCoreBridge } from "./witness-core-bridge.js";

const ANSI = Object.freeze({
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  dim: "\x1b[90m",
  reset: "\x1b[0m"
});

const DEFAULT_DIRECT_SERVE_PORT = 4017;
const DEFAULT_DIRECT_BOOTSTRAP_PORT = 4015;
const DEFAULT_DIRECT_HTTP_MCP_PORT = 4018;
const WITNESS_CORE_WORKSPACE_ROOT_ENV = "WITNESS_CORE_WORKSPACE_ROOT";

const [command, ...rest] = process.argv.slice(2);

if (command === "utility-serve") {
  await runServe(rest);
} else if (command === "utility-bootstrap") {
  await runBootstrap(rest);
} else if (command === "desktop") {
  await runDesktop(rest);
} else if (command === "utility-mcp") {
  await runMcp(rest);
} else if (command === "operator") {
  await runOperator(rest);
} else if (command === "tui") {
  await runTui(rest);
} else {
  console.error(usageText());
  process.exit(1);
}

function startupGenerationBridge(env = process.env) {
  const coreUrl = typeof env?.WITNESS_CORE_URL === "string" ? env.WITNESS_CORE_URL.trim() : "";
  if (!coreUrl) return null;
  return createWitnessCoreBridge({
    coreUrl,
    logger: createLogger()
  });
}

function resolveRuntimeWorkspaceCwd(env = process.env, fallbackCwd = process.cwd()) {
  const configured = typeof env?.[WITNESS_CORE_WORKSPACE_ROOT_ENV] === "string"
    ? env[WITNESS_CORE_WORKSPACE_ROOT_ENV].trim()
    : "";
  return path.resolve(configured || String(fallbackCwd || process.cwd()));
}

async function runServe(args) {
  const parsed = parseServeArgs(args);
  if (!parsed.appPath) {
    console.error(`Missing app path.\n${usageText()}`);
    process.exit(1);
  }
  let appProject = null;
  let selection = null;
  const startupTelemetry = createStartupTelemetry({ mode: "serve" });
  const generationBridge = startupGenerationBridge(process.env);
  const runtimeWorkspaceCwd = resolveRuntimeWorkspaceCwd(process.env, process.cwd());
  try {
    const loaded = await startupTelemetry.runPhase("app.project.load", () => loadAppProjectWithStableFallback(parsed.appPath, {
      runtimeProfile: parsed.runtimeProfile,
      runtimePluginIds: parsed.runtimePluginIds,
      env: process.env,
      cwd: runtimeWorkspaceCwd,
      generationBridge,
      requireGenerationBridgeForCanonicalReads: Boolean(generationBridge)
    }), {
      label: "Load app project"
    });
    appProject = loaded.appProject;
    selection = resolveServeTarget(appProject, { serverRunnerId: parsed.serverRunnerId });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  let launched = null;
  try {
    launched = await startAppRuntime({
      appProject,
      startupMode: "serve",
      port: parsed.port,
      serverRunnerId: selection.serverRunner.id,
      runtimeProfile: parsed.runtimeProfile,
      runtimeProfileExplicit: parsed.runtimeProfileExplicit,
      runtimePluginIds: parsed.runtimePluginIds,
      devMode: parsed.devMode,
      worldHome: parsed.worldHome,
      cwd: runtimeWorkspaceCwd,
      env: process.env,
      startupTelemetry
    });
  } catch (error) {
    reportStartupFailure(error);
    process.exit(1);
  }
  const { server, runner, witnessLogPath, observationLogPath, operatorContract, runtimeProfile, runtimeProfileInfo } = launched;

  if (!server.ok) {
    reportStartupFailure(server);
    process.exit(1);
  }

  reportStartup({
    label: "Witness server running",
    server,
    witnessLogPath,
    observationLogPath,
    extras: [
      `App root: ${appProject.appRoot}`,
      `Manifest: ${appProject.manifestPath}`,
      `Server runner: ${runner.id}`,
      `Selected target: ${selection.serverRunner.id}`,
      `Mode: ${parsed.devMode ? "dev" : "release"}`,
      `Runtime profile: ${runtimeProfile}`,
      `Persistence: ${operatorContract.persistence.mode}`,
      ...(operatorContract.worldHome ? [`World home: ${operatorContract.worldHome}`] : [])
    ],
    runtimeProfileInfo,
    runtimeComposition: server.runtimeBundleSummary,
    runtimePluginCatalog: server.runtimePluginCatalog,
    startupTelemetry: parsed.startupTelemetry ? {
      snapshot: () => server.getStartupTelemetry?.() ?? startupTelemetry.snapshot(),
      subscribe: server.subscribeStartupTelemetry?.bind(server) ?? null
    } : null
  });
}

async function runBootstrap(args) {
  const parsed = parseBootstrapArgs(args);
  const startupTelemetry = createStartupTelemetry({ mode: "bootstrap" });
  const runtimeWorkspaceCwd = resolveRuntimeWorkspaceCwd(process.env, process.cwd());
  let launched = null;
  try {
    launched = await startBlankRuntime({
      startupMode: "bootstrap",
      worldHome: parsed.worldHome,
      runtimeProfile: parsed.runtimeProfile,
      runtimeProfileExplicit: parsed.runtimeProfileExplicit,
      runtimePluginIds: parsed.runtimePluginIds,
      cwd: runtimeWorkspaceCwd,
      env: process.env,
      port: parsed.port,
      startupTelemetry
    });
  } catch (error) {
    if (error?.code === "RUNTIME_PROFILE_UNKNOWN") {
      console.error(`Unknown runtime profile: ${error.requestedProfile}`);
      console.error(`Valid runtime profiles: ${error.validProfileIds.join(", ")}`);
      process.exit(1);
    }
    throw error;
  }
  const {
    server,
    operatorContract,
    runtimeProfile,
    runtimeProfileInfo,
    witnessLogPath,
    observationLogPath
  } = launched;

  if (!server.ok) {
    reportStartupFailure(server);
    process.exit(1);
  }

  reportStartup({
    label: "Witness bootstrap running",
    server,
    witnessLogPath,
    observationLogPath,
    extras: [
      "Mode: blank-world bootstrap",
      `Runtime root: ${operatorContract.directories.runtimeRoot}`,
      `Runtime profile: ${runtimeProfile}`,
      `Persistence: ${operatorContract.persistence.mode}`,
      ...(operatorContract.worldHome ? [`World home: ${operatorContract.worldHome}`] : []),
      "Open / or /_bootstrap to start authoring"
    ],
    runtimeProfileInfo,
    runtimeComposition: server.runtimeBundleSummary,
    runtimePluginCatalog: server.runtimePluginCatalog,
    startupTelemetry: parsed.startupTelemetry ? {
      snapshot: () => server.getStartupTelemetry?.() ?? startupTelemetry.snapshot(),
      subscribe: server.subscribeStartupTelemetry?.bind(server) ?? null
    } : null
  });
}

async function runMcp(args) {
  const parsed = parseMcpArgs(args);
  if (!parsed.appPath) {
    console.error(`Missing app path.\n${usageText()}`);
    process.exit(1);
  }
  let appProject = null;
  let selection = null;
  const startupTelemetry = createStartupTelemetry({ mode: "mcp" });
  const generationBridge = startupGenerationBridge(process.env);
  const runtimeWorkspaceCwd = resolveRuntimeWorkspaceCwd(process.env, process.cwd());
  try {
    const loaded = await startupTelemetry.runPhase("app.project.load", () => loadAppProjectWithStableFallback(parsed.appPath, {
      runtimeProfile: parsed.runtimeProfile,
      runtimePluginIds: parsed.runtimePluginIds,
      env: process.env,
      cwd: runtimeWorkspaceCwd,
      generationBridge,
      requireGenerationBridgeForCanonicalReads: Boolean(generationBridge)
    }), {
      label: "Load app project"
    });
    appProject = loaded.appProject;
    selection = resolveMcpTarget(appProject, { mcpServerId: parsed.mcpServerId });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
  const mcpServer = selection.mcpServer;
  if (!mcpServer.transports.includes(parsed.transport)) {
    console.error(`MCP server ${mcpServer.id} does not support transport ${parsed.transport}`);
    process.exit(1);
  }

  if (parsed.transport === "http") {
    let launched = null;
    try {
      launched = await startAppRuntime({
        appProject,
        startupMode: "mcp",
        port: parsed.port,
        serverRunnerId: selection.serverRunner.id,
        runtimeProfile: parsed.runtimeProfile,
        runtimeProfileExplicit: parsed.runtimeProfileExplicit,
        runtimePluginIds: parsed.runtimePluginIds,
        worldHome: parsed.worldHome,
        cwd: runtimeWorkspaceCwd,
        env: process.env,
        startupTelemetry
      });
    } catch (error) {
      reportStartupFailure(error);
      process.exit(1);
    }
    const { server, runner, witnessLogPath, observationLogPath, operatorContract, runtimeProfile, runtimeProfileInfo } = launched;
    if (!server.ok) {
      reportStartupFailure(server);
      process.exit(1);
    }
    reportStartup({
      label: "Witness MCP server running",
      server,
      witnessLogPath,
      observationLogPath,
      extras: [
        `App root: ${appProject.appRoot}`,
        `Manifest: ${appProject.manifestPath}`,
        `Server runner: ${runner.id}`,
        `MCP server: ${mcpServer.id}`,
        `Runtime profile: ${runtimeProfile}`,
        `Persistence: ${operatorContract.persistence.mode}`,
        ...(operatorContract.worldHome ? [`World home: ${operatorContract.worldHome}`] : []),
        `Endpoint: ${server.url}/mcp/${encodeURIComponent(mcpServer.id)}`
      ],
      runtimeProfileInfo,
      runtimeComposition: server.runtimeBundleSummary,
      runtimePluginCatalog: server.runtimePluginCatalog,
      startupTelemetry: parsed.startupTelemetry ? {
        snapshot: () => server.getStartupTelemetry?.() ?? startupTelemetry.snapshot(),
        subscribe: server.subscribeStartupTelemetry?.bind(server) ?? null
      } : null
    });
    return;
  }

  const internalToken = randomUUID();
  let launched = null;
  try {
    launched = await startAppRuntime({
      appProject,
      startupMode: "mcp",
      port: 0,
      serverRunnerId: selection.serverRunner.id,
      runtimeProfile: parsed.runtimeProfile,
      runtimeProfileExplicit: parsed.runtimeProfileExplicit,
      runtimePluginIds: parsed.runtimePluginIds,
      worldHome: parsed.worldHome,
      cwd: process.cwd(),
      env: process.env,
      logger: createLogger({ level: "silent" }),
      mcpInternalToken: internalToken,
      startupTelemetry
    });
  } catch (error) {
    reportStartupFailure(error);
    process.exit(1);
  }
  const { server } = launched;
  if (!server.ok) {
    reportStartupFailure(server);
    process.exit(1);
  }
  const endpoint = `${server.url}/mcp/${encodeURIComponent(mcpServer.id)}`;
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let protocolVersion = null;
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let message = null;
      try {
        message = JSON.parse(trimmed);
      } catch (error) {
        console.error(`Invalid JSON-RPC input: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      if (message?.method === "initialize" && typeof message?.params?.protocolVersion === "string") {
        protocolVersion = message.params.protocolVersion;
      }
      const headers = {
        "content-type": "application/json",
        "x-witness-mcp-transport": "stdio",
        "x-witness-mcp-internal-token": internalToken,
        ...(parsed.actor ? { "x-witness-mcp-actor": parsed.actor } : {}),
        ...(protocolVersion ? { "mcp-protocol-version": protocolVersion } : {})
      };
      const response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(message)
      });
      if (response.status === 202) continue;
      const text = await response.text();
      if (!text.trim()) continue;
      process.stdout.write(`${text.trim()}\n`);
    }
  } finally {
    await server.close();
  }
}

async function runDesktop(args) {
  try {
    const exitCode = await launchDesktopProcess({
      args,
      cwd: process.cwd(),
      env: process.env
    });
    process.exit(exitCode ?? 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

async function runOperator(args) {
  const operatorActionSet = new Set(["backup", "export", "restore", "import"]);
  const firstArg = args[0] ?? null;
  if (!firstArg || firstArg.startsWith("--") || !operatorActionSet.has(firstArg)) {
    try {
      const exitCode = await launchDesktopProcess({
        args,
        cwd: process.cwd(),
        env: process.env,
        entryScript: path.resolve(process.cwd(), "src", "operator-workbench", "main.js")
      });
      process.exit(exitCode ?? 0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
    return;
  }
  const parsed = parseOperatorArgs(args);
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "operator",
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(parsed.worldHome ? { WORLD_HOME: parsed.worldHome } : {})
    }
  });
  const mutationGate = runtimeOperatorMutations(operatorContract);
  if (!mutationGate.enabled) {
    console.error(`Operator action unavailable: ${mutationGate.reason}`);
    console.error(`Persistence: ${operatorContract.persistence.mode}`);
    process.exit(1);
  }
  const world = createWorld({
    genesis: { system: "witness-world", mode: "operator" },
    witnessLogPath: operatorContract.canonicalTruth.witnessLogPath,
    observationLogPath: operatorContract.canonicalTruth.observationLogPath
  });
  const operatorService = createRuntimeOperatorService({
    world,
    operatorContract
  });

  if (parsed.action === "backup") {
    const artifact = await operatorService.backup({
      label: parsed.label,
      includeDerived: parsed.includeDerived,
      actor: "system"
    });
    reportOperatorArtifact({
      label: "Backup complete",
      artifact,
      restartRequired: false
    });
    return;
  }

  if (parsed.action === "export") {
    const artifact = await operatorService.exportWorld({
      label: parsed.label,
      actor: "system"
    });
    reportOperatorArtifact({
      label: "Export complete",
      artifact,
      restartRequired: false
    });
    return;
  }

  if (!parsed.artifact) {
    console.error(`Missing --artifact for operator ${parsed.action}.\n${usageText()}`);
    process.exit(1);
  }

  const artifactId = resolveManagedArtifactId({
    artifact: parsed.artifact,
    rootPath: parsed.action === "restore"
      ? operatorContract.directories.backupsRoot
      : operatorContract.directories.importsRoot,
    cwd: process.cwd()
  });
  if (!artifactId) {
    console.error("Operator --artifact must name a managed artifact directory under the active WORLD_HOME.");
    process.exit(1);
  }

  if (parsed.action === "restore") {
    const result = await operatorService.restore({
      artifactId,
      preserveCurrent: parsed.preserveCurrent,
      actor: "system"
    });
    reportOperatorReplace({
      label: "Restore complete",
      ...result
    });
    return;
  }

  if (parsed.action === "import") {
    const result = await operatorService.importWorld({
      artifactId,
      preserveCurrent: parsed.preserveCurrent,
      actor: "system"
    });
    reportOperatorReplace({
      label: "Import complete",
      ...result
    });
    return;
  }

  console.error(`Unknown operator action: ${parsed.action}\n${usageText()}`);
  process.exit(1);
}

async function runTui(args) {
  try {
    const exitCode = await runOperatorTui({
      args,
      cwd: process.cwd(),
      env: process.env,
      stdin: process.stdin,
      stdout: process.stdout
    });
    process.exit(exitCode ?? 0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function parseServeArgs(args) {
  const result = { appPath: null, serverRunnerId: null, port: DEFAULT_DIRECT_SERVE_PORT, worldHome: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [], devMode: true, startupTelemetry: false };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.appPath = queue.shift();
  while (queue.length) {
    const token = queue.shift();
    if (token === "--server") {
      result.serverRunnerId = queue.shift() ?? null;
      continue;
    }
    if (token === "--port") {
      result.port = Number(queue.shift() ?? DEFAULT_DIRECT_SERVE_PORT);
      continue;
    }
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
      continue;
    }
    if (token === "--runtime-plugin") {
      const pluginId = queue.shift() ?? "";
      if (pluginId) result.runtimePluginIds.push(pluginId);
      continue;
    }
    if (token === "--dev") {
      result.devMode = true;
      continue;
    }
    if (token === "--release") {
      result.devMode = false;
      continue;
    }
    if (token === "--startup-telemetry") {
      result.startupTelemetry = true;
    }
  }
  return result;
}

function parseBootstrapArgs(args) {
  const result = { port: DEFAULT_DIRECT_BOOTSTRAP_PORT, worldHome: null, runtimeProfile: DEFAULT_BOOTSTRAP_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [], startupTelemetry: false };
  const queue = [...args];
  while (queue.length) {
    const token = queue.shift();
    if (token === "--port") {
      result.port = Number(queue.shift() ?? DEFAULT_DIRECT_BOOTSTRAP_PORT);
      continue;
    }
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
      continue;
    }
    if (token === "--runtime-plugin") {
      const pluginId = queue.shift() ?? "";
      if (pluginId) result.runtimePluginIds.push(pluginId);
      continue;
    }
    if (token === "--startup-telemetry") {
      result.startupTelemetry = true;
    }
  }
  return result;
}

function parseMcpArgs(args) {
  const result = { appPath: null, serverRunnerId: null, mcpServerId: null, port: DEFAULT_DIRECT_HTTP_MCP_PORT, transport: "stdio", actor: null, worldHome: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [], startupTelemetry: false };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.appPath = queue.shift();
  while (queue.length) {
    const token = queue.shift();
    if (token === "--server") {
      result.serverRunnerId = queue.shift() ?? null;
      continue;
    }
    if (token === "--mcp") {
      result.mcpServerId = queue.shift() ?? null;
      continue;
    }
    if (token === "--port") {
      result.port = Number(queue.shift() ?? DEFAULT_DIRECT_HTTP_MCP_PORT);
      continue;
    }
    if (token === "--transport") {
      result.transport = (queue.shift() ?? "stdio").toLowerCase();
      continue;
    }
    if (token === "--actor") {
      result.actor = queue.shift() ?? null;
      continue;
    }
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
      continue;
    }
    if (token === "--runtime-plugin") {
      const pluginId = queue.shift() ?? "";
      if (pluginId) result.runtimePluginIds.push(pluginId);
      continue;
    }
    if (token === "--startup-telemetry") {
      result.startupTelemetry = true;
    }
  }
  return result;
}

function parseOperatorArgs(args) {
  const result = {
    action: null,
    worldHome: null,
    label: "",
    includeDerived: false,
    artifact: null,
    preserveCurrent: false
  };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.action = queue.shift();
  while (queue.length) {
    const token = queue.shift();
    if (token === "--world-home") {
      result.worldHome = queue.shift() ?? null;
      continue;
    }
    if (token === "--label") {
      result.label = queue.shift() ?? "";
      continue;
    }
    if (token === "--include-derived") {
      result.includeDerived = true;
      continue;
    }
    if (token === "--artifact") {
      result.artifact = queue.shift() ?? null;
      continue;
    }
    if (token === "--preserve-current") {
      result.preserveCurrent = true;
    }
  }
  return result;
}

function resolveCliRuntimeProfile({ runtimeProfile, explicit }) {
  if (!explicit) return resolveRuntimeProfile(runtimeProfile);
  const resolved = resolveRuntimeProfileStrict(runtimeProfile);
  if (resolved.ok) return resolved;
  console.error(`Unknown runtime profile: ${resolved.requestedProfile}`);
  console.error(`Valid runtime profiles: ${resolved.validProfileIds.join(", ")}`);
  process.exit(1);
}

function supportsAnsiColor() {
  return process.stdout?.isTTY === true && process.env.NO_COLOR == null;
}

function colorize(text, color) {
  if (!supportsAnsiColor()) return text;
  return `${color}${text}${ANSI.reset}`;
}

function formatDurationMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0ms";
  return `${Math.round(numeric * 10) / 10}ms`;
}

function phaseHasWarnings(phase) {
  const warningCount = Number(phase?.detail?.warningCount ?? 0);
  if (Number.isFinite(warningCount) && warningCount > 0) return true;
  return Array.isArray(phase?.detail?.warnings) && phase.detail.warnings.length > 0;
}

function phaseStatusDescriptor(phase) {
  if (phase?.status === "failed") return { label: "ERROR", color: ANSI.red };
  if (phaseHasWarnings(phase)) return { label: "WARN", color: ANSI.yellow };
  if (phase?.status === "pending") return { label: "LOADING", color: ANSI.blue };
  return { label: "READY", color: ANSI.green };
}

function formatStartupPhaseLine(phase) {
  const status = phaseStatusDescriptor(phase);
  const lane = phase?.blocking ? "blocking" : "background";
  const detailBits = [];
  if (phase?.detail?.lazy === true) detailBits.push("lazy");
  if (phase?.detail?.maxDelayExceeded === true) detailBits.push("forced");
  const detailSuffix = detailBits.length ? ` ${colorize(`[${detailBits.join(", ")}]`, ANSI.dim)}` : "";
  return `  ${colorize(status.label.padEnd(7), status.color)} ${phase.label} ${colorize(`(${lane}, ${formatDurationMs(phase.durationMs)})`, ANSI.dim)}${detailSuffix}`;
}

function printStartupTelemetry(snapshot) {
  if (!snapshot?.phases?.length) return;
  console.log(`Startup totals: meaningful-ready=${formatDurationMs(snapshot.meaningfulReadyAtMs ?? snapshot.totalMs)} total=${formatDurationMs(snapshot.totalMs)} background-pending=${snapshot.backgroundPendingCount ?? 0}`);
  console.log("Startup services:");
  for (const phase of snapshot.phases) {
    console.log(formatStartupPhaseLine(phase));
  }
}

function attachStartupTelemetryUpdates(startupTelemetrySource, initialSnapshot) {
  if (typeof startupTelemetrySource?.subscribe !== "function") return () => {};
  const rendered = new Map(
    (initialSnapshot?.phases ?? []).map(phase => [
      phase.id,
      `${phase.status}|${formatDurationMs(phase.durationMs)}|${phaseHasWarnings(phase) ? "warn" : "ok"}`
    ])
  );
  let backgroundSettled = (initialSnapshot?.backgroundPendingCount ?? 0) === 0;
  return startupTelemetrySource.subscribe(snapshot => {
    for (const phase of snapshot?.phases ?? []) {
      const signature = `${phase.status}|${formatDurationMs(phase.durationMs)}|${phaseHasWarnings(phase) ? "warn" : "ok"}`;
      if (rendered.get(phase.id) === signature) continue;
      rendered.set(phase.id, signature);
      if (phase.status === "pending") continue;
      console.log(`Startup update: ${formatStartupPhaseLine(phase).slice(2)}`);
    }
    if (!backgroundSettled && (snapshot?.backgroundPendingCount ?? 0) === 0) {
      backgroundSettled = true;
      console.log(`Startup background settled: total=${formatDurationMs(snapshot.totalMs)}`);
    }
  });
}

function isLoopbackUtilityUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return false;
  }
}

function reportStartup({
  label,
  server,
  witnessLogPath,
  observationLogPath,
  extras = [],
  runtimeProfileInfo = resolveRuntimeProfile(DEFAULT_RUNTIME_PROFILE),
  runtimeComposition = null,
  runtimePluginCatalog = null,
  startupTelemetry = null
}) {
  const startupTelemetrySnapshot = typeof startupTelemetry?.snapshot === "function"
    ? startupTelemetry.snapshot()
    : startupTelemetry;
  const activeBundleIds = runtimeComposition?.bundleIds ?? runtimeProfileInfo.bundleIds;
  const activeBundles = runtimeComposition?.bundles ?? runtimeProfileInfo.bundles;
  const handlerMetadata = runtimeComposition?.handlerMetadata ?? {};
  console.log(`${label}: ${server.url}`);
  if (isLoopbackUtilityUrl(server?.url)) {
    console.log("Ingress: loopback-only Node utility listener");
  }
  for (const line of extras) console.log(line);
  console.log(`Active profile: ${runtimeComposition?.profile ?? runtimeProfileInfo.id}`);
  console.log(`Active bundles: ${activeBundleIds.join(", ")}`);
  console.log(`Bundle counts: capabilities=${activeBundles.reduce((sum, bundle) => sum + (bundle.capabilityCount ?? bundle.contributes?.capabilities?.length ?? 0), 0)} routes=${activeBundles.reduce((sum, bundle) => sum + (bundle.routeCount ?? bundle.contributes?.routes?.length ?? 0), 0)} surfaces=${activeBundles.reduce((sum, bundle) => sum + (bundle.surfaceCount ?? bundle.contributes?.surfaces?.length ?? 0), 0)}`);
  const routeKinds = Object.values(handlerMetadata).reduce((counts, entry) => {
    const routeKind = typeof entry?.routeKind === "string" && entry.routeKind.trim() ? entry.routeKind.trim() : null;
    if (!routeKind) return counts;
    counts.set(routeKind, (counts.get(routeKind) ?? 0) + 1);
    return counts;
  }, new Map());
  if (routeKinds.size) {
    const summary = [...routeKinds.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([routeKind, count]) => `${routeKind}=${count}`)
      .join(", ");
    console.log(`Handler route kinds: ${summary}`);
  }
  if (runtimePluginCatalog) {
    console.log(`Authored runtime plugins: ${(runtimePluginCatalog.authoredPluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Startup default runtime plugins: ${(runtimePluginCatalog.startupPluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Configured runtime plugins: ${(runtimePluginCatalog.operatorPluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Activated runtime plugins: ${(runtimePluginCatalog.activePluginIds ?? []).join(", ") || "(none)"}`);
    const pluginToBundleMap = runtimePluginCatalog.selection?.pluginToBundleMap ?? {};
    const addedEntries = Object.entries(pluginToBundleMap);
    if (addedEntries.length) {
      console.log("Plugin-added bundles:");
      for (const [pluginId, bundleIds] of addedEntries) {
        console.log(`  ${pluginId} -> ${bundleIds.join(", ")}`);
      }
    } else {
      console.log("Plugin-added bundles: (none)");
    }
  }
  printStartupTelemetry(startupTelemetrySnapshot);
  console.log(`Runtime diagnostics: ${server.url}/api/runtime/diagnostics`);
  console.log(`Witness log: ${witnessLogPath}`);
  console.log(`Observation log: ${observationLogPath}`);
  console.log("Press Ctrl+C to stop.");
  const detachStartupUpdates = attachStartupTelemetryUpdates(startupTelemetry, startupTelemetrySnapshot);

  process.on("SIGINT", async () => {
    detachStartupUpdates();
    await server.close();
    console.log("\nStopped.");
    process.exit(0);
  });
}

function reportStartupFailure(result) {
  console.error(result.reason || result);
  const rejected = result.runtimePluginCatalog?.rejectedPlugins ?? [];
  for (const entry of rejected) {
    console.error(`Runtime plugin rejected: ${entry.id}`);
    if ((entry.requestedSources ?? []).length) {
      console.error(`  sources: ${entry.requestedSources.join(", ")}`);
    }
    for (const reason of entry.reasons ?? []) {
      console.error(`  - ${reason}`);
    }
  }
}

function resolveManagedArtifactId({
  artifact,
  rootPath,
  cwd
}) {
  const raw = String(artifact || "").trim();
  if (!raw) return null;
  if (!raw.includes("/") && !raw.includes("\\")) return raw;
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(cwd, raw);
  const relative = path.relative(rootPath || "", resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  if (relative.includes(path.sep)) return null;
  const id = path.basename(resolved);
  return id || null;
}

function reportOperatorArtifact({
  label,
  artifact,
  restartRequired
}) {
  console.log(label);
  console.log(`Artifact: ${artifact.path}`);
  console.log(`Artifact id: ${artifact.id}`);
  console.log(`Kind: ${artifact.kind}`);
  console.log(`Witnesses: ${artifact.witnessCount}`);
  console.log(`Observations: ${artifact.observationCount}`);
  console.log(`Includes derived: ${artifact.includesDerived === true ? "yes" : "no"}`);
  console.log(`Restart required: ${restartRequired ? "yes" : "no"}`);
}

function reportOperatorReplace({
  label,
  artifact,
  safetyBackup,
  restartRequired,
  reloaded
}) {
  console.log(label);
  console.log(`Artifact: ${artifact.path}`);
  console.log(`Artifact id: ${artifact.id}`);
  console.log(`Witnesses: ${reloaded?.witnessCount ?? artifact.witnessCount}`);
  console.log(`Observations: ${reloaded?.observationCount ?? artifact.observationCount}`);
  console.log(`Safety backup: ${safetyBackup?.path ?? "(none)"}`);
  console.log(`Restart required: ${restartRequired ? "yes" : "no"}`);
}

function usageText() {
  return [
    "Usage:",
    "  node src/cli.js utility-serve <app-dir|app.wtoml> [--server <id>] [--port <n>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>] [--release] [--startup-telemetry]  (loopback utility listener)",
    "  node src/cli.js utility-bootstrap [--port <n>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>] [--startup-telemetry]  (loopback utility listener)",
    "  node src/cli.js desktop [<app-dir|app.wtoml>] [--desktop-target <id>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]",
    "  node src/cli.js tui [<app-dir|app.wtoml>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>] [--command <text>]  (legacy raw shell)",
    "  node src/cli.js utility-mcp <app-dir|app.wtoml> [--mcp <id>] [--server <id>] [--transport <stdio|http>] [--port <n>] [--actor <id>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>] [--startup-telemetry]  (loopback utility listener)",
    "  node src/cli.js operator [<app-dir|app.wtoml>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]  (rich workbench)",
    "  node src/cli.js operator backup --world-home <path> [--label <text>] [--include-derived]",
    "  node src/cli.js operator export --world-home <path> [--label <text>]",
    "  node src/cli.js operator restore --world-home <path> --artifact <artifact-dir> [--preserve-current]",
    "  node src/cli.js operator import --world-home <path> --artifact <artifact-dir> [--preserve-current]"
  ].join("\n");
}
