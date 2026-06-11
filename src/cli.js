import os from "node:os";
import path from "node:path";
import { createWorld } from "./kernel.js";
import { loadWitnessTomlFile, applyWitnessDocs } from "./dsl.js";
import { declareBackendHost, declareFrontendHost, resolveServerRunner, startServer } from "./host.js";

const [command, ...rest] = process.argv.slice(2);

if (command !== "serve") {
  console.error('Usage: node src/cli.js serve <dslPath> [--server <id>] [--port <n>]');
  process.exit(1);
}

const parsed = parseServeArgs(rest);
if (!parsed.dslPath) {
  console.error('Missing DSL path. Usage: node src/cli.js serve <dslPath> [--server <id>] [--port <n>]');
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

declareBackendHost(world, { actor: "system", id: runner.backendHost });
declareFrontendHost(world, { actor: "system", id: runner.frontendHost });

const server = await startServer(world, {
  actor: "system",
  serverRunnerId: runner.id,
  port: parsed.port,
  runtimeRoot
});

if (!server.ok) {
  console.error(server);
  process.exit(1);
}

console.log(`Witness server running: ${server.url}`);
console.log(`Definition: ${definitionPath}`);
console.log(`Server runner: ${runner.id}`);
console.log(`Witness log: ${witnessLogPath}`);
console.log(`Observation log: ${observationLogPath}`);
console.log("Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  await server.close();
  console.log("\nStopped.");
  process.exit(0);
});

function parseServeArgs(args) {
  const result = { dslPath: null, serverRunnerId: null, port: 3000 };
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
  }
  return result;
}
