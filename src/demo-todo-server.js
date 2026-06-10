import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorld } from "./kernel.js";
import { applyWitnessDocs, loadWitnessTomlFile } from "./dsl.js";
import { declareBackendHost, declareFrontendHost, startTodoServer } from "./host.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const definitionPath = process.env.DEMO_DSL || path.join(__dirname, "..", "examples", "demo-todo-server.wtoml");
const definitionDocs = await loadWitnessTomlFile(definitionPath);
const serverDef = definitionDocs.find(doc => doc.kind === "todoServer")?.values;

if (!serverDef) {
  console.error(`No [[todoServer]] definition found in ${definitionPath}`);
  process.exit(1);
}

const witnessLogPath = process.env.WITNESS_LOG || path.join(os.tmpdir(), serverDef.witnessLogName ?? "witness-world-demo.witnesses.jsonl");
const world = createWorld({ genesis: { system: "witness-world", demo: "todo-ui", definitionPath }, witnessLogPath });

declareBackendHost(world, { actor: serverDef.actor, id: serverDef.backendHost });
declareFrontendHost(world, { actor: serverDef.actor, id: serverDef.frontendHost });

// Compile/apply the witnessed DSL definition into graph witnesses before serving.
applyWitnessDocs(world, definitionDocs);

const storePath = path.join(os.tmpdir(), serverDef.storeName ?? "witness-world-demo-todos.json");
const server = await startTodoServer(world, {
  actor: serverDef.actor,
  backendHost: serverDef.backendHost,
  frontendHost: serverDef.frontendHost,
  rootWidget: serverDef.rootWidget,
  frontendProgram: serverDef.frontendProgram ?? null,
  worldRootWidget: serverDef.worldRootWidget ?? null,
  worldFrontendProgram: serverDef.worldFrontendProgram ?? null,
  storePath,
  actors: serverDef.actors ?? [{ id: "aaron", label: "Aaron" }, { id: "callan", label: "Callan" }],
  port: Number(process.env.PORT || 3000)
});

if (!server.ok) {
  console.error(server);
  process.exit(1);
}

console.log(`Witness Todo running: ${server.url}`);
console.log(`Definition: ${definitionPath}`);
console.log(`Projection cache: ${storePath}`);
console.log(`Witness log: ${witnessLogPath}`);
console.log("Press Ctrl+C to stop.");

process.on("SIGINT", async () => {
  await server.close();
  console.log("\nStopped.");
  process.exit(0);
});
