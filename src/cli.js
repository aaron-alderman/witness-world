import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import readline from "node:readline";
import { randomUUID } from "node:crypto";
import { createWorld } from "./kernel.js";
import { loadWitnessTomlFile, applyWitnessDocs } from "./dsl.js";
import { moduleProjectors } from "./modules.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner, startServer } from "./host.js";
import {
  DEFAULT_RUNTIME_PROFILE,
  resolveRuntimeProfile,
  resolveRuntimeProfileStrict
} from "./runtime-bundles.js";

const [command, ...rest] = process.argv.slice(2);

if (command === "serve") {
  await runServe(rest);
} else if (command === "bootstrap") {
  await runBootstrap(rest);
} else if (command === "mcp") {
  await runMcp(rest);
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
  const witnessLogPath = process.env.WITNESS_LOG || path.join(os.tmpdir(), "witness-world-demo.witnesses.jsonl");
  const observationLogPath = process.env.OBSERVATION_LOG || path.join(os.tmpdir(), "witness-world-demo.observations.jsonl");
  const runtimeRoot = process.env.RUNTIME_ROOT || os.tmpdir();
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
    runtimeProfile
  });

  if (!server.ok) {
    console.error(server);
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
      `Runtime profile: ${runtimeProfile}`
    ],
    runtimeProfileInfo
  });
}

async function runBootstrap(args) {
  const parsed = parseBootstrapArgs(args);
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile: parsed.runtimeProfile,
    explicit: parsed.runtimeProfileExplicit
  });
  const runtimeProfile = runtimeProfileInfo.id;
  const bootstrapRoot = process.env.RUNTIME_ROOT
    ? path.resolve(process.env.RUNTIME_ROOT)
    : await fs.mkdtemp(path.join(os.tmpdir(), "witness-world-bootstrap-"));
  const witnessLogPath = process.env.WITNESS_LOG || path.join(bootstrapRoot, "bootstrap.witnesses.jsonl");
  const observationLogPath = process.env.OBSERVATION_LOG || path.join(bootstrapRoot, "bootstrap.observations.jsonl");
  const runtimeRoot = bootstrapRoot;
  const world = createWorld({ genesis: { system: "witness-world", mode: "bootstrap" }, witnessLogPath, observationLogPath });

  declareBackendHost(world, { actor: "system", id: "backendHost", runtimeProfile });
  declareFrontendHost(world, { actor: "system", id: "frontendHost", runtimeProfile });

  const server = await startServer(world, {
    actor: "system",
    port: parsed.port,
    runtimeRoot,
    runtimeProfile
  });

  if (!server.ok) {
    console.error(server);
    process.exit(1);
  }

  reportStartup({
    label: "Witness bootstrap running",
    server,
    witnessLogPath,
    observationLogPath,
    extras: [
      "Mode: blank-world bootstrap",
      `Runtime root: ${runtimeRoot}`,
      `Runtime profile: ${runtimeProfile}`,
      process.env.RUNTIME_ROOT
        ? "Persistence: warm start enabled via explicit RUNTIME_ROOT"
        : "Persistence: cold start from a fresh temp runtime root",
      "Open / or /_bootstrap to start authoring"
    ],
    runtimeProfileInfo
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
  const witnessLogPath = process.env.WITNESS_LOG || path.join(os.tmpdir(), "witness-world-demo.witnesses.jsonl");
  const observationLogPath = process.env.OBSERVATION_LOG || path.join(os.tmpdir(), "witness-world-demo.observations.jsonl");
  const runtimeRoot = process.env.RUNTIME_ROOT || os.tmpdir();
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
      runtimeProfile
    });
    if (!server.ok) {
      console.error(server);
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
        `Endpoint: ${server.url}/mcp/${encodeURIComponent(mcpServer.id)}`
      ],
      runtimeProfileInfo
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
    runtimeProfile
  });
  if (!server.ok) {
    console.error(server);
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

function parseServeArgs(args) {
  const result = { dslPath: null, serverRunnerId: null, port: 3000, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false };
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
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
      continue;
    }
  }
  return result;
}

function parseBootstrapArgs(args) {
  const result = { port: 3000, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false };
  const queue = [...args];
  while (queue.length) {
    const token = queue.shift();
    if (token === "--port") {
      result.port = Number(queue.shift() ?? 3000);
      continue;
    }
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
    }
  }
  return result;
}

function parseMcpArgs(args) {
  const result = { dslPath: null, serverRunnerId: null, mcpServerId: null, port: 3000, transport: "stdio", actor: null, runtimeProfile: DEFAULT_RUNTIME_PROFILE, runtimeProfileExplicit: false };
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
    if (token === "--runtime-profile") {
      result.runtimeProfile = queue.shift() ?? DEFAULT_RUNTIME_PROFILE;
      result.runtimeProfileExplicit = true;
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

function reportStartup({ label, server, witnessLogPath, observationLogPath, extras = [], runtimeProfileInfo = resolveRuntimeProfile(DEFAULT_RUNTIME_PROFILE) }) {
  console.log(`${label}: ${server.url}`);
  for (const line of extras) console.log(line);
  console.log(`Active bundles: ${runtimeProfileInfo.bundleIds.join(", ")}`);
  console.log(`Bundle counts: capabilities=${runtimeProfileInfo.bundles.reduce((sum, bundle) => sum + bundle.contributes.capabilities.length, 0)} routes=${runtimeProfileInfo.bundles.reduce((sum, bundle) => sum + bundle.contributes.routes.length, 0)} surfaces=${runtimeProfileInfo.bundles.reduce((sum, bundle) => sum + bundle.contributes.surfaces.length, 0)}`);
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

function usageText() {
  return [
    "Usage:",
    "  node src/cli.js serve <dslPath> [--server <id>] [--port <n>] [--runtime-profile <id>]",
    "  node src/cli.js bootstrap [--port <n>] [--runtime-profile <id>]",
    "  node src/cli.js mcp <dslPath> --mcp <id> [--server <id>] [--transport <stdio|http>] [--port <n>] [--actor <id>] [--runtime-profile <id>]"
  ].join("\n");
}
