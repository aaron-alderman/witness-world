import path from "node:path";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { launchDesktopProcess } from "./desktop-cli.js";
import { createWorld } from "./kernel.js";
import { loadWitnessTomlFile, applyWitnessDocs } from "./dsl.js";
import { moduleProjectors } from "./modules.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner, startServer } from "./host.js";
import {
  DEFAULT_RUNTIME_PROFILE,
  resolveRuntimeProfile,
  resolveRuntimeProfileStrict
} from "./runtime-bundles.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";
import { createRuntimeOperatorService, runtimeOperatorMutations } from "./runtime-operator-service.js";
import { startBlankRuntime } from "./runtime-local-launcher.js";

const [command, ...rest] = process.argv.slice(2);

if (command === "serve") {
  await runServe(rest);
} else if (command === "bootstrap") {
  await runBootstrap(rest);
} else if (command === "desktop") {
  await runDesktop(rest);
} else if (command === "mcp") {
  await runMcp(rest);
} else if (command === "operator") {
  await runOperator(rest);
} else {
  console.error(usageText());
  process.exit(1);
}

async function runServe(args) {
  const parsed = parseServeArgs(args);
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile: parsed.runtimeProfile,
    explicit: parsed.runtimeProfileExplicit
  });
  const runtimeProfile = runtimeProfileInfo.id;
  if (!parsed.dslPath) {
    console.error(`Missing DSL path.\n${usageText()}`);
    process.exit(1);
  }

  const definitionPath = path.resolve(parsed.dslPath);
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "serve",
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(parsed.worldHome ? { WORLD_HOME: parsed.worldHome } : {})
    }
  });
  const witnessLogPath = operatorContract.canonicalTruth.witnessLogPath;
  const observationLogPath = operatorContract.canonicalTruth.observationLogPath;
  const runtimeRoot = operatorContract.directories.runtimeRoot;
  const world = createWorld({ genesis: { system: "witness-world", definitionPath }, witnessLogPath, observationLogPath });
  const docs = await loadWitnessTomlFile(definitionPath);
  applyWitnessDocs(world, docs);

  const resolved = resolveServerRunner(world, parsed.serverRunnerId ?? null);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }

  const runner = resolved.runner;
  if (!runner.backendHost || !runner.frontendHost) {
    console.error(`Server runner ${runner.id} is missing backendHost/frontendHost`);
    process.exit(1);
  }

  declareBackendHost(world, { actor: "system", id: runner.backendHost, runtimeProfile });
  declareFrontendHost(world, { actor: "system", id: runner.frontendHost, runtimeProfile });

  const server = await startServer(world, {
    actor: "system",
    serverRunnerId: runner.id,
    port: parsed.port,
    runtimeRoot,
    runtimeProfile,
    runtimePluginIds: parsed.runtimePluginIds.length ? parsed.runtimePluginIds : null,
    runtimeStartupMode: "serve",
    runtimeOperatorContract: operatorContract
  });

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
      `Definition: ${definitionPath}`,
      `Server runner: ${runner.id}`,
      `Runtime profile: ${runtimeProfile}`,
      `Persistence: ${operatorContract.persistence.mode}`,
      ...(operatorContract.worldHome ? [`World home: ${operatorContract.worldHome}`] : [])
    ],
    runtimeProfileInfo,
    runtimeComposition: server.runtimeBundleSummary,
    runtimePluginCatalog: server.runtimePluginCatalog
  });
}

async function runBootstrap(args) {
  const parsed = parseBootstrapArgs(args);
  let launched = null;
  try {
    launched = await startBlankRuntime({
      startupMode: "bootstrap",
      worldHome: parsed.worldHome,
      runtimeProfile: parsed.runtimeProfile,
      runtimeProfileExplicit: parsed.runtimeProfileExplicit,
      runtimePluginIds: parsed.runtimePluginIds,
      cwd: process.cwd(),
      env: process.env,
      port: parsed.port
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
    runtimePluginCatalog: server.runtimePluginCatalog
  });
}

async function runMcp(args) {
  const parsed = parseMcpArgs(args);
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile: parsed.runtimeProfile,
    explicit: parsed.runtimeProfileExplicit
  });
  const runtimeProfile = runtimeProfileInfo.id;
  if (!parsed.dslPath || !parsed.mcpServerId) {
    console.error(`Missing DSL path or MCP server id.\n${usageText()}`);
    process.exit(1);
  }

  const definitionPath = path.resolve(parsed.dslPath);
  const operatorContract = await resolveRuntimeOperatorPaths({
    startupMode: "mcp",
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...(parsed.worldHome ? { WORLD_HOME: parsed.worldHome } : {})
    }
  });
  const witnessLogPath = operatorContract.canonicalTruth.witnessLogPath;
  const observationLogPath = operatorContract.canonicalTruth.observationLogPath;
  const runtimeRoot = operatorContract.directories.runtimeRoot;
  const world = createWorld({ genesis: { system: "witness-world", definitionPath }, witnessLogPath, observationLogPath });
  const docs = await loadWitnessTomlFile(definitionPath);
  applyWitnessDocs(world, docs);

  const mcpServer = world.project(moduleProjectors.mcpServerIndex).byId[parsed.mcpServerId] ?? null;
  if (!mcpServer) {
    console.error(`MCP server not found: ${parsed.mcpServerId}`);
    process.exit(1);
  }
  if (!mcpServer.transports.includes(parsed.transport)) {
    console.error(`MCP server ${parsed.mcpServerId} does not support transport ${parsed.transport}`);
    process.exit(1);
  }

  const resolved = resolveServerRunner(world, mcpServer.serverRunner || parsed.serverRunnerId || null);
  if (!resolved.ok) {
    console.error(resolved.reason);
    process.exit(1);
  }

  const runner = resolved.runner;
  if (runner.id !== mcpServer.serverRunner) {
    console.error(`MCP server ${parsed.mcpServerId} is bound to server runner ${mcpServer.serverRunner}, not ${runner.id}`);
    process.exit(1);
  }
  if (!runner.backendHost || !runner.frontendHost) {
    console.error(`Server runner ${runner.id} is missing backendHost/frontendHost`);
    process.exit(1);
  }

  declareBackendHost(world, { actor: "system", id: runner.backendHost, runtimeProfile });
  declareFrontendHost(world, { actor: "system", id: runner.frontendHost, runtimeProfile });

  if (parsed.transport === "http") {
    const server = await startServer(world, {
      actor: "system",
      serverRunnerId: runner.id,
      port: parsed.port,
      runtimeRoot,
      runtimeProfile,
      runtimePluginIds: parsed.runtimePluginIds.length ? parsed.runtimePluginIds : null,
      runtimeStartupMode: "mcp",
      runtimeOperatorContract: operatorContract
    });
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
        `Definition: ${definitionPath}`,
        `Server runner: ${runner.id}`,
        `MCP server: ${mcpServer.id}`,
        `Runtime profile: ${runtimeProfile}`,
        `Persistence: ${operatorContract.persistence.mode}`,
        ...(operatorContract.worldHome ? [`World home: ${operatorContract.worldHome}`] : []),
        `Endpoint: ${server.url}/mcp/${encodeURIComponent(mcpServer.id)}`
      ],
      runtimeProfileInfo,
      runtimeComposition: server.runtimeBundleSummary,
      runtimePluginCatalog: server.runtimePluginCatalog
    });
    return;
  }

  const internalToken = randomUUID();
  const server = await startServer(world, {
    actor: "system",
    serverRunnerId: runner.id,
    port: 0,
    runtimeRoot,
    mcpInternalToken: internalToken,
    runtimeProfile,
    runtimePluginIds: parsed.runtimePluginIds.length ? parsed.runtimePluginIds : null,
    runtimeStartupMode: "mcp",
    runtimeOperatorContract: operatorContract
  });
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
  const parsed = parseOperatorArgs(args);
  if (!parsed.action) {
    console.error(`Missing operator action.\n${usageText()}`);
    process.exit(1);
  }
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

function parseServeArgs(args) {
  const result = { dslPath: null, serverRunnerId: null, port: 3000, worldHome: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [] };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.dslPath = queue.shift();
  while (queue.length) {
    const token = queue.shift();
    if (token === "--server") {
      result.serverRunnerId = queue.shift() ?? null;
      continue;
    }
    if (token === "--port") {
      result.port = Number(queue.shift() ?? 3000);
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
  }
  return result;
}

function parseBootstrapArgs(args) {
  const result = { port: 3000, worldHome: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [] };
  const queue = [...args];
  while (queue.length) {
    const token = queue.shift();
    if (token === "--port") {
      result.port = Number(queue.shift() ?? 3000);
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
    }
  }
  return result;
}

function parseMcpArgs(args) {
  const result = { dslPath: null, serverRunnerId: null, mcpServerId: null, port: 3000, transport: "stdio", actor: null, worldHome: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false, runtimePluginIds: [] };
  const queue = [...args];
  if (queue.length && !queue[0].startsWith("--")) result.dslPath = queue.shift();
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
      result.port = Number(queue.shift() ?? 3000);
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

function reportStartup({
  label,
  server,
  witnessLogPath,
  observationLogPath,
  extras = [],
  runtimeProfileInfo = resolveRuntimeProfile(DEFAULT_RUNTIME_PROFILE),
  runtimeComposition = null,
  runtimePluginCatalog = null
}) {
  const activeBundleIds = runtimeComposition?.bundleIds ?? runtimeProfileInfo.bundleIds;
  const activeBundles = runtimeComposition?.bundles ?? runtimeProfileInfo.bundles;
  const handlerMetadata = runtimeComposition?.handlerMetadata ?? {};
  console.log(`${label}: ${server.url}`);
  for (const line of extras) console.log(line);
  console.log(`Active bundles: ${activeBundleIds.join(", ")}`);
  console.log(`Bundle counts: capabilities=${activeBundles.reduce((sum, bundle) => sum + (bundle.capabilityCount ?? bundle.contributes.capabilities.length), 0)} routes=${activeBundles.reduce((sum, bundle) => sum + (bundle.routeCount ?? bundle.contributes.routes.length), 0)} surfaces=${activeBundles.reduce((sum, bundle) => sum + (bundle.surfaceCount ?? bundle.contributes.surfaces.length), 0)}`);
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
    console.log(`Operator runtime plugins: ${(runtimePluginCatalog.operatorPluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Effective runtime plugins: ${(runtimePluginCatalog.effectivePluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Configured runtime plugins: ${(runtimePluginCatalog.configuredPluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Activated runtime plugins: ${(runtimePluginCatalog.activePluginIds ?? []).join(", ") || "(none)"}`);
    console.log(`Plugin-added bundles: ${(runtimePluginCatalog.addedBundleIds ?? []).join(", ") || "(none)"}`);
  }
  console.log(`Runtime diagnostics: ${server.url}/api/runtime/diagnostics`);
  console.log(`Witness log: ${witnessLogPath}`);
  console.log(`Observation log: ${observationLogPath}`);
  console.log("Press Ctrl+C to stop.");

  process.on("SIGINT", async () => {
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
    "  node src/cli.js serve <dslPath> [--server <id>] [--port <n>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]",
    "  node src/cli.js bootstrap [--port <n>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]",
    "  node src/cli.js desktop [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]",
    "  node src/cli.js mcp <dslPath> --mcp <id> [--server <id>] [--transport <stdio|http>] [--port <n>] [--actor <id>] [--world-home <path>] [--runtime-profile <id>] [--runtime-plugin <id>]",
    "  node src/cli.js operator backup --world-home <path> [--label <text>] [--include-derived]",
    "  node src/cli.js operator export --world-home <path> [--label <text>]",
    "  node src/cli.js operator restore --world-home <path> --artifact <artifact-dir> [--preserve-current]",
    "  node src/cli.js operator import --world-home <path> --artifact <artifact-dir> [--preserve-current]"
  ].join("\n");
}
