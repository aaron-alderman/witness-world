import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RUNTIME_NETWORK_CAPABILITY_INVENTORY,
  runtimeNetworkCapabilityOwnerFiles
} from "../src/runtime-network-capability-inventory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const srcRoot = path.join(repoRoot, "src");

async function listJavaScriptFiles(rootPath) {
  const files = [];
  async function visit(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (entry.isFile() && (entry.name.endsWith(".js") || entry.name.endsWith(".mjs"))) {
        files.push(absolutePath);
      }
    }
  }
  await visit(rootPath);
  return files.sort((left, right) => left.localeCompare(right));
}

function relativeRepoPath(filePath) {
  return path.relative(repoRoot, filePath).replaceAll("\\", "/");
}

async function matchSourceFiles(pattern) {
  const matches = [];
  for (const absolutePath of await listJavaScriptFiles(srcRoot)) {
    const source = await fs.readFile(absolutePath, "utf8");
    if (pattern.test(source)) matches.push(relativeRepoPath(absolutePath));
    pattern.lastIndex = 0;
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

async function matchFilesUnder(rootPath, pattern) {
  const matches = [];
  for (const absolutePath of await listJavaScriptFiles(rootPath)) {
    const relativePath = relativeRepoPath(absolutePath);
    if (relativePath.endsWith(".test.js")) continue;
    const source = await fs.readFile(absolutePath, "utf8");
    if (pattern.test(source)) matches.push(relativePath);
    pattern.lastIndex = 0;
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

async function matchFilesWithin(relativeDirs, pattern) {
  const matches = [];
  for (const relativeDir of relativeDirs) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    for (const absolutePath of await listJavaScriptFiles(absoluteDir)) {
      const relativePath = relativeRepoPath(absolutePath);
      if (relativePath.endsWith(".test.js")) continue;
      const source = await fs.readFile(absolutePath, "utf8");
      if (pattern.test(source)) matches.push(relativePath);
      pattern.lastIndex = 0;
    }
  }
  return matches.sort((left, right) => left.localeCompare(right));
}

test("roadmap doc includes live checkbox markers", async () => {
  const docPath = path.join(repoRoot, "docs", "RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md");
  const source = await fs.readFile(docPath, "utf8");
  assert.match(source, /\[x\]/i);
  assert.match(source, /\[ \]/);
});

test("checked-in supervised dev config exposes the supported app path through the Rust frontdoor", async () => {
  const configPath = path.join(repoRoot, "witness-core.toml");
  const config = await fs.readFile(configPath, "utf8");
  assert.match(config, /\[frontdoor\]/);
  assert.match(config, /public_addr\s*=\s*"127\.0\.0\.1:3000"/);
  assert.match(config, /command\s*=\s*"node src\/cli\.js utility-serve examples\/engentus --server engentus_server --port \{runtime_port\} --runtime-profile full --startup-telemetry"/);
  assert.match(config, /control_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/worker-control"/);

  const bootstrapConfig = await fs.readFile(path.join(repoRoot, "witness-core-bootstrap.toml"), "utf8");
  assert.match(bootstrapConfig, /\[frontdoor\]/);
  assert.match(bootstrapConfig, /public_addr\s*=\s*"127\.0\.0\.1:3000"/);
  assert.match(bootstrapConfig, /command\s*=\s*"node src\/cli\.js utility-bootstrap --port \{runtime_port\}"/);
  assert.match(bootstrapConfig, /control_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/worker-control"/);

  const authoringConfig = await fs.readFile(path.join(repoRoot, "witness-core-authoring.toml"), "utf8");
  assert.match(authoringConfig, /\[frontdoor\]/);
  assert.match(authoringConfig, /public_addr\s*=\s*"127\.0\.0\.1:3000"/);
  assert.match(authoringConfig, /command\s*=\s*"node src\/cli\.js utility-bootstrap --port \{runtime_port\} --runtime-profile authoring --runtime-plugin plugin\.mcp"/);
  assert.match(authoringConfig, /control_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/worker-control"/);

  const engentusMcpConfig = await fs.readFile(path.join(repoRoot, "witness-core-engentus-mcp.toml"), "utf8");
  assert.match(engentusMcpConfig, /\[frontdoor\]/);
  assert.match(engentusMcpConfig, /public_addr\s*=\s*"127\.0\.0\.1:8791"/);
  assert.match(engentusMcpConfig, /command\s*=\s*"node src\/cli\.js utility-mcp examples\/engentus --mcp engentus_mcp --server engentus_server --transport http --port \{runtime_port\} --runtime-profile full"/);
  assert.match(engentusMcpConfig, /control_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/worker-control"/);

  const packageJson = JSON.parse(await fs.readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.equal(packageJson.scripts?.bootstrap, "cargo run --manifest-path substrate/Cargo.toml -p witness-core -- --config witness-core-bootstrap.toml");
  assert.equal(packageJson.scripts?.["authoring:server"], "cargo run --manifest-path substrate/Cargo.toml -p witness-core -- --config witness-core-authoring.toml");
  assert.equal(packageJson.scripts?.["utility:engentus-worker"], "node scripts/run-app-engentus-with-core.mjs");
  assert.equal(packageJson.scripts?.["utility:demo"], "node scripts/run-example-app-worker.mjs examples/demo-todo-app --default-port 4012 --runtime-profile full");
  assert.equal(packageJson.scripts?.["utility:eden"], "node scripts/run-example-app-worker.mjs examples/eden --default-port 4013 --runtime-profile full");
  assert.equal(packageJson.scripts?.["utility:master"], "node scripts/run-example-app-worker.mjs examples/master --default-port 4014 --runtime-profile full");
  assert.equal(packageJson.scripts?.engentus, "npm run platform:supervised");
  assert.equal(packageJson.scripts?.["engentus:core"], "npm run platform:supervised");
  assert.equal(packageJson.scripts?.["engentus:mcp"], "cargo run --manifest-path substrate/Cargo.toml -p witness-core -- --config witness-core-engentus-mcp.toml");
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "app:engentus"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "engentus:worker"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "demo"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "eden"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(packageJson.scripts, "master"), false);

  const cliSource = await fs.readFile(path.join(repoRoot, "src", "cli.js"), "utf8");
  assert.match(cliSource, /const DEFAULT_DIRECT_SERVE_PORT = 4017;/);
  assert.match(cliSource, /const DEFAULT_DIRECT_BOOTSTRAP_PORT = 4015;/);
  assert.match(cliSource, /const DEFAULT_DIRECT_HTTP_MCP_PORT = 4018;/);
  assert.match(cliSource, /node src\/cli\.js utility-serve <app-dir\|app\.wtoml>/);
  assert.match(cliSource, /node src\/cli\.js utility-bootstrap \[--port <n>\]/);
  assert.match(cliSource, /node src\/cli\.js utility-mcp <app-dir\|app\.wtoml>/);
  assert.doesNotMatch(cliSource, /command === "serve"/);
  assert.doesNotMatch(cliSource, /command === "bootstrap"/);
  assert.doesNotMatch(cliSource, /command === "mcp"/);
  assert.doesNotMatch(cliSource, /LEGACY_UTILITY_COMMAND_ALIASES/);
  assert.doesNotMatch(cliSource, /Legacy compatibility aliases:/);
  assert.match(cliSource, /Ingress: loopback-only Node utility listener/);
  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /server\.listen\(port, "127\.0\.0\.1", resolve\)/);

  const workerScript = await fs.readFile(path.join(repoRoot, "scripts", "run-app-engentus-with-core.mjs"), "utf8");
  assert.match(workerScript, /WITNESS_WORKER_PORT/);
  assert.match(workerScript, /"utility-serve"/);
  assert.match(workerScript, /"--port", defaultWorkerPort/);

  const exampleWorkerScript = await fs.readFile(path.join(repoRoot, "scripts", "run-example-app-worker.mjs"), "utf8");
  assert.match(exampleWorkerScript, /--default-port/);
  assert.match(exampleWorkerScript, /"utility-serve"/);
  assert.match(exampleWorkerScript, /"--port", String\(defaultPort\)/);

  const liveCoreSmokeRunner = await fs.readFile(path.join(repoRoot, "test", "support", "live-core-smoke-runner.mjs"), "utf8");
  assert.match(liveCoreSmokeRunner, /"utility-serve"/);
  assert.doesNotMatch(liveCoreSmokeRunner, /"serve"/);

  const substrateReadme = await fs.readFile(path.join(repoRoot, "substrate", "README.md"), "utf8");
  assert.match(substrateReadme, /supported public app surface through the Rust frontdoor at `http:\/\/127\.0\.0\.1:3000`/);
  assert.match(substrateReadme, /npm run engentus:mcp.*Rust-supervised frontdoor config/i);
  assert.match(substrateReadme, /http:\/\/127\.0\.0\.1:8791\/mcp\/engentus_mcp/);
  assert.match(substrateReadme, /npm run bootstrap.*Rust-supervised frontdoor configs/i);
  assert.match(substrateReadme, /npm run authoring:server.*Rust-supervised frontdoor configs/i);
  assert.match(substrateReadme, /Utility worker-only flows from the repository root:/i);
  assert.match(substrateReadme, /npm run utility:engentus-worker/);
  assert.match(substrateReadme, /worker-only path is a development utility/i);
  assert.match(substrateReadme, /not the supported public ingress/i);
  assert.match(substrateReadme, /WITNESS_WORKER_PORT/);

  const specDoc = await fs.readFile(path.join(repoRoot, "docs", "witness-world-spec.md"), "utf8");
  assert.match(specDoc, /node src\/cli\.js utility-bootstrap \[--port <n>\]/i);
  assert.match(specDoc, /node src\/cli\.js utility-serve <app-dir\|app\.wtoml> \[--server <id>\] \[--port <n>\]/i);
  assert.match(specDoc, /node src\/cli\.js utility-mcp <app-dir\|app\.wtoml>/i);
  assert.match(specDoc, /worker-port example launches should prefer the explicit utility commands such as `npm run utility:demo` and `npm run utility:engentus-worker`/i);
  assert.match(specDoc, /npm run bootstrap.*checked-in convenience frontdoor paths/i);
  assert.match(specDoc, /npm run authoring:server.*checked-in convenience frontdoor paths/i);
  assert.match(specDoc, /npm run engentus:mcp.*checked-in convenience frontdoor path/i);
  assert.match(specDoc, /direct CLI startup remains available as a raw loopback-only Node utility path.*default listener ports are explicit utility ports/i);

  const readme = await fs.readFile(path.join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /Supported public\/browser-facing startup should prefer one Rust-frontdoored command at a time/i);
  assert.match(readme, /npm run engentus # start the supervised Engentus app through the Rust frontdoor/i);
  assert.match(readme, /npm run utility:demo  # start the demo example worker on its private utility port/i);
  assert.match(readme, /npm run utility:demo/);
  assert.match(readme, /npm run utility:engentus-worker/);
  assert.match(readme, /node src\/cli\.js utility-bootstrap/);
  assert.match(readme, /node src\/cli\.js utility-serve examples\/demo-todo-app --runtime-profile minimal/);
  assert.match(readme, /raw `serve`\/`bootstrap` startup binds the Node runtime on `127\.0\.0\.1` only/i);

  const handoff = await fs.readFile(path.join(repoRoot, "HANDOFF.md"), "utf8");
  assert.match(handoff, /Supported public\/browser-facing startup should prefer the checked-in Rust frontdoor wrappers/i);
  assert.match(handoff, /Worker-port utility flows are separate, for example `npm run utility:demo` or `npm run utility:engentus-worker`\./i);
  assert.match(handoff, /node src\/cli\.js utility-bootstrap \[--port <n>\]/i);
  assert.match(handoff, /node src\/cli\.js utility-serve <dslPath> \[--server <id>\] \[--port <n>\]/i);
  assert.match(handoff, /npm test && npm run utility:demo/i);
  assert.match(handoff, /Raw loopback utility CLI:/);

  const baseline = await fs.readFile(path.join(repoRoot, "BASELINE.md"), "utf8");
  assert.match(baseline, /Supported public\/browser-facing startup path:/);
  assert.match(baseline, /worker-port example launches belong under explicit utility commands such as `npm run utility:demo` and `npm run utility:engentus-worker`/i);
  assert.match(baseline, /node src\/cli\.js utility-bootstrap \[--port <n>\]/i);
  assert.match(baseline, /node src\/cli\.js utility-serve <dslPath> \[--server <id>\] \[--port <n>\]/i);
  const migrationPlan = await fs.readFile(path.join(repoRoot, "docs", "RUNTIME-BUNDLE-MIGRATION-PLAN.md"), "utf8");
  assert.match(migrationPlan, /node src\/cli\.js utility-bootstrap --runtime-profile minimal --runtime-plugin plugin\.inspect/i);
  assert.match(migrationPlan, /RUNTIME_PLUGINS=plugin\.inspect node src\/cli\.js utility-bootstrap --runtime-profile minimal/i);
  assert.match(baseline, /Raw loopback utility CLI:/);
});

test("transitional node external-boundary owners stay contained to the known exception set", async () => {
  const sqliteOwners = await matchSourceFiles(/\bnode:sqlite\b|\bDatabaseSync\b/g);
  const pluginSqliteOwners = await matchFilesUnder(path.join(repoRoot, "plugins"), /\bnode:sqlite\b|\bDatabaseSync\b/g);
  const directDbOwners = await matchFilesWithin(["plugins"], /import\("pg"\)|import\("mysql2\/promise"\)/g);
  const httpOwners = await matchSourceFiles(/\bnode:http\b|createServer\s*\(|server\.listen\s*\(/g);
  const canonicalWatcherOwners = await matchSourceFiles(/\bfsWatch\.watch\s*\(/g);

  assert.deepEqual(sqliteOwners, []);
  assert.deepEqual(pluginSqliteOwners, []);
  assert.deepEqual(directDbOwners, []);

  assert.deepEqual(httpOwners, [
    "src/operator-browser-example-server.js",
    "src/runtime-server.js"
  ]);

  assert.deepEqual(canonicalWatcherOwners, []);
});

test("runtime server keeps the remaining no-core dirty poller behind explicit opt-in only", async () => {
  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(
    runtimeServerSource,
    /watchersEnabled:\s*env\.WITNESS_RUNTIME_WATCHERS_ENABLED === "true"\s*\?\s*\(activeDevMode === true && !appContext\.witnessCoreUrl\)\s*:\s*false/
  );
  assert.match(
    runtimeServerSource,
    /const localSnapshotPollingEnabled = \(\) =>\s*activeDevMode === true\s*&& !appContext\.witnessCoreUrl\s*&& appContext\.runtimeSupervision\?\.watchersEnabled === true/
  );
});

test("node fs ownership stays split between canonical runtime paths, desktop/operator paths, and explicit utility exceptions", async () => {
  const fsOwners = await matchFilesUnder(srcRoot, /\bnode:fs(?:\/promises)?\b|\bfsWatch\b/g);

  const canonicalRuntimeOwners = [
    "src/app-project.js",
    "src/app-snapshot-manager.js",
    "src/desire/rvm.js",
    "src/desire/wtoml.js",
    "src/dsl.js",
    "src/runtime-plugin-loader.js",
    "src/runtime-plugin-utils.js",
    "src/runtime-server.js",
    "src/runtime-stable-source-cache.js",
    "src/runtime-wcss-adapter.js",
    "src/witness-core-build-worker.js"
  ];

  const desktopOperatorOwners = [
    "src/desktop-launcher-view.js",
    "src/desktop-main.js",
    "src/desktop-session-manager.js",
    "src/operator-browser-example-server.js",
    "src/operator-tui.js",
    "src/operator-workbench/main.js",
    "src/operator-workbench/settings.js",
    "src/runtime-local-launcher.js",
    "src/runtime-operator-contract.js",
    "src/runtime-operator-service.js"
  ];

  const utilityOwners = [
    "src/desire/host-operation.js",
    "src/runtime-store-seeds.js",
    "src/witness-log.js"
  ];

  assert.deepEqual(fsOwners, [
    ...canonicalRuntimeOwners,
    ...desktopOperatorOwners,
    ...utilityOwners
  ].sort((left, right) => left.localeCompare(right)));
});

test("canonical runtime file mutation stays limited to explicit scratch/cache outputs", async () => {
  const canonicalRuntimeOwners = new Set([
    "src/app-project.js",
    "src/app-snapshot-manager.js",
    "src/desire/rvm.js",
    "src/desire/wtoml.js",
    "src/dsl.js",
    "src/runtime-plugin-loader.js",
    "src/runtime-plugin-utils.js",
    "src/runtime-server.js",
    "src/runtime-stable-source-cache.js",
    "src/runtime-wcss-adapter.js",
    "src/witness-core-build-worker.js"
  ]);
  const writeOwners = await matchFilesUnder(
    srcRoot,
    /\b(?:fs|fsModule)\.(?:writeFile|appendFile|mkdir|rm|unlink|rename|copyFile|cp)\s*\(/g
  );
  const canonicalWriteOwners = writeOwners.filter(filePath => canonicalRuntimeOwners.has(filePath));
  assert.deepEqual(canonicalWriteOwners, [
    "src/runtime-plugin-loader.js",
    "src/runtime-stable-source-cache.js",
    "src/runtime-wcss-adapter.js",
    "src/witness-core-build-worker.js"
  ]);

  const pluginLoaderSource = await fs.readFile(path.join(repoRoot, "src", "runtime-plugin-loader.js"), "utf8");
  assert.match(pluginLoaderSource, /\.witness-core["', ]+["']runtime-plugin-modules/);
  assert.match(pluginLoaderSource, /fsModule\.writeFile/);

  const stableCacheSource = await fs.readFile(path.join(repoRoot, "src", "runtime-stable-source-cache.js"), "utf8");
  assert.match(stableCacheSource, /\.witness-core["', ]+["']stable-app-snapshots/);
  assert.match(stableCacheSource, /fsModule\.writeFile/);

  const runtimeWcssAdapterSource = await fs.readFile(path.join(repoRoot, "src", "runtime-wcss-adapter.js"), "utf8");
  assert.match(runtimeWcssAdapterSource, /\.witness-core["', ]+["']runtime-wcss-adapters/);
  assert.match(runtimeWcssAdapterSource, /fsModule\.writeFile/);

  const buildWorkerSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-build-worker.js"), "utf8");
  assert.match(buildWorkerSource, /\.witness-core["', ]+["']compute-modules/);
  assert.match(buildWorkerSource, /"--outFile"/);
});

test("node outbound network ownership stays frozen to the known server-side exception buckets", async () => {
  const directFetchOwners = await matchSourceFiles(/\bawait fetch\s*\(/g);
  const injectedFetchOwners = await matchSourceFiles(/fetchImpl:\s*typeof globalThis\.fetch === "function"/g);
  const coreChannelFetchOwners = await matchSourceFiles(/\bfetchImpl\s*=\s*globalThis\.fetch\b/g);

  assert.deepEqual(directFetchOwners, [
    "src/cli.js",
    "src/runtime-widget-page.js"
  ]);

  assert.deepEqual(injectedFetchOwners, [
    "src/runtime-app-context.js",
    "src/runtime-route-handlers.js"
  ]);

  assert.deepEqual(coreChannelFetchOwners, [
    "src/witness-core-http-transport.js"
  ]);
});

test("node outbound network ownership is classified into typed capability families", async () => {
  const directFetchOwners = await matchSourceFiles(/\bawait fetch\s*\(/g);
  const injectedFetchOwners = await matchSourceFiles(/fetchImpl:\s*typeof globalThis\.fetch === "function"/g);
  const coreChannelFetchOwners = await matchSourceFiles(/\bfetchImpl\s*=\s*globalThis\.fetch\b/g);
  const pluginServerFetchOwners = await matchFilesWithin([
    "plugins/oauth",
    "plugins/notifications",
    "plugins/http-outbound"
  ], /\bawait (?:fetch|fetchImpl|fetchFn)\s*\(/g);

  assert.deepEqual(
    directFetchOwners,
    [
      ...RUNTIME_NETWORK_CAPABILITY_INVENTORY.loopbackMcpBridge.ownerFiles,
      ...RUNTIME_NETWORK_CAPABILITY_INVENTORY.browserClientFetch.ownerFiles
    ].sort((left, right) => left.localeCompare(right))
  );

  assert.deepEqual(
    injectedFetchOwners,
    [...RUNTIME_NETWORK_CAPABILITY_INVENTORY.injectedServerFetch.ownerFiles].sort((left, right) => left.localeCompare(right))
  );

  assert.deepEqual(
    coreChannelFetchOwners,
    [...RUNTIME_NETWORK_CAPABILITY_INVENTORY.witnessCoreControlPlane.ownerFiles].sort((left, right) => left.localeCompare(right))
  );

  assert.deepEqual(
    pluginServerFetchOwners,
    [
      ...RUNTIME_NETWORK_CAPABILITY_INVENTORY.oauthIdentityExchange.ownerFiles,
      ...RUNTIME_NETWORK_CAPABILITY_INVENTORY.notificationEmailDelivery.ownerFiles,
      ...RUNTIME_NETWORK_CAPABILITY_INVENTORY.httpOutboundDelivery.ownerFiles
    ].sort((left, right) => left.localeCompare(right))
  );

  assert.deepEqual(runtimeNetworkCapabilityOwnerFiles(), [
    "plugins/http-outbound/glue.js",
    "plugins/notifications/email-transports.js",
    "plugins/oauth/oauth-providers.js",
    "src/cli.js",
    "src/runtime-app-context.js",
    "src/runtime-route-handlers.js",
    "src/runtime-widget-page.js",
    "src/witness-core-http-transport.js"
  ]);

  assert.equal(RUNTIME_NETWORK_CAPABILITY_INVENTORY.loopbackMcpBridge.scope, "utility-loopback");
  assert.equal(RUNTIME_NETWORK_CAPABILITY_INVENTORY.browserClientFetch.scope, "browser-client");
  assert.match(
    String(RUNTIME_NETWORK_CAPABILITY_INVENTORY.loopbackMcpBridge.note || ""),
    /temporary utility-only exception/i
  );
});

test("cli loopback MCP bridge remains constrained to local utility transport semantics", async () => {
  const cliSource = await fs.readFile(path.join(repoRoot, "src", "cli.js"), "utf8");
  assert.match(cliSource, /if \(parsed\.transport === "http"\)/);
  assert.match(cliSource, /startupMode: "mcp"/);
  assert.match(cliSource, /port: 0,/);
  assert.match(cliSource, /const endpoint = `\$\{server\.url\}\/mcp\/\$\{encodeURIComponent\(mcpServer\.id\)\}`;/);
  assert.match(cliSource, /"x-witness-mcp-transport": "stdio"/);
  assert.match(cliSource, /"x-witness-mcp-internal-token": internalToken/);
  assert.match(cliSource, /const response = await fetch\(endpoint, \{/);
});

test("worker protocol is versioned and the build worker emits the shared envelope contract", async () => {
  const protocolDoc = await fs.readFile(path.join(repoRoot, "docs", "WITNESS-WORKER-PROTOCOL.md"), "utf8");
  assert.match(protocolDoc, /witness-worker\/v1/);
  assert.match(protocolDoc, /`request`/);
  assert.match(protocolDoc, /`result`/);
  assert.match(protocolDoc, /`event`/);
  assert.match(protocolDoc, /`build`/);
  assert.match(protocolDoc, /`evaluate`/);
  assert.match(protocolDoc, /`render`/);
  assert.match(protocolDoc, /`inspect`/);
  assert.match(protocolDoc, /`bounded_compute`/);
  assert.match(protocolDoc, /delegated_read_only/i);
  assert.match(protocolDoc, /worker-local/i);
  assert.match(protocolDoc, /requestId/i);
  assert.match(protocolDoc, /WITNESS-CORE-TRANSPORT\.md/i);

  const protocolSource = await fs.readFile(path.join(repoRoot, "src", "witness-worker-protocol.js"), "utf8");
  assert.match(protocolSource, /WITNESS_WORKER_PROTOCOL_VERSION\s*=\s*"witness-worker\/v1"/);
  assert.match(protocolSource, /WITNESS_WORKER_CANONICAL_STATE_ACCESS/);
  assert.match(protocolSource, /WITNESS_WORKER_SCRATCH_STATE/);
  assert.match(protocolSource, /WITNESS_WORKER_OPERATION_PROFILES/);
  assert.match(protocolSource, /build:\s*"build"/);
  assert.match(protocolSource, /evaluate:\s*"evaluate"/);
  assert.match(protocolSource, /render:\s*"render"/);
  assert.match(protocolSource, /inspect:\s*"inspect"/);
  assert.match(protocolSource, /boundedCompute:\s*"bounded_compute"/);
  assert.match(protocolSource, /createWorkerRequestEnvelope/);
  assert.match(protocolSource, /createWorkerEventEnvelope/);
  assert.match(protocolSource, /requestId/);

  const buildWorkerSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-build-worker.js"), "utf8");
  assert.match(buildWorkerSource, /createBuildWorkerResultEnvelope/);
  assert.match(buildWorkerSource, /JSON\.stringify\(createBuildWorkerResultEnvelope\(result\)\)/);

  const controlTransportDoc = await fs.readFile(path.join(repoRoot, "docs", "WITNESS-CORE-TRANSPORT.md"), "utf8");
  assert.match(controlTransportDoc, /witness-core-transport\/v1/);
  assert.match(controlTransportDoc, /`call`/);
  assert.match(controlTransportDoc, /`subscribe`/);
  assert.match(controlTransportDoc, /`core\.events`/);
  assert.match(controlTransportDoc, /`generation\.publish`/);
  assert.match(controlTransportDoc, /`status\.read_health`/);
  assert.match(controlTransportDoc, /src\/witness-core-ipc-transport\.js/);
  assert.match(controlTransportDoc, /fallback\/manual adapter/i);

  const controlTransportSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-transport-contract.js"), "utf8");
  assert.match(controlTransportSource, /WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION\s*=\s*"witness-core-transport\/v1"/);
  assert.match(controlTransportSource, /WITNESS_CORE_TRANSPORT_METHODS/);
  assert.match(controlTransportSource, /WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS/);
  assert.match(controlTransportSource, /generationPublish:\s*"generation\.publish"/);
  assert.match(controlTransportSource, /statusReadHealth:\s*"status\.read_health"/);
  assert.match(controlTransportSource, /coreEvents:\s*"core\.events"/);
  assert.match(controlTransportSource, /createWitnessCoreTransportCall/);
  assert.match(controlTransportSource, /createWitnessCoreTransportSubscribe/);
});

test("supervised worker control is versioned and the checked-in control plane uses control_url", async () => {
  const controlContractSource = await fs.readFile(path.join(repoRoot, "src", "runtime-worker-control-contract.js"), "utf8");
  assert.match(controlContractSource, /RUNTIME_WORKER_CONTROL_PROTOCOL_VERSION\s*=\s*"witness-worker-control\/v1"/);
  assert.match(controlContractSource, /RUNTIME_WORKER_CONTROL_PATH\s*=\s*"\/api\/runtime\/worker-control"/);
  assert.match(controlContractSource, /createRuntimeWorkerControlDocument/);
  assert.match(controlContractSource, /activationUrl/);
  assert.match(controlContractSource, /quiesceUrl/);
  assert.match(controlContractSource, /reloadUrl/);
  assert.match(controlContractSource, /transport:\s*createRuntimeWorkerTransportDescriptor/);

  const workerTransportContractSource = await fs.readFile(path.join(repoRoot, "src", "runtime-worker-transport-contract.js"), "utf8");
  assert.match(workerTransportContractSource, /RUNTIME_WORKER_TRANSPORT_PROTOCOL_VERSION\s*=\s*"witness-runtime-worker-transport\/v1"/);
  assert.match(workerTransportContractSource, /RUNTIME_WORKER_TRANSPORT_METHODS/);
  assert.match(workerTransportContractSource, /controlDescribe:\s*"runtime\.control\.describe"/);
  assert.match(workerTransportContractSource, /processHealthRead:\s*"runtime\.process_health\.read"/);
  assert.match(workerTransportContractSource, /supervisionActivate:\s*"runtime\.supervision\.activate"/);
  assert.match(workerTransportContractSource, /supervisionQuiesce:\s*"runtime\.supervision\.quiesce"/);
  assert.match(workerTransportContractSource, /appSnapshotReload:\s*"runtime\.app_snapshot\.reload"/);
  assert.match(workerTransportContractSource, /createRuntimeWorkerTransportCall/);
  assert.match(workerTransportContractSource, /createRuntimeWorkerTransportResult/);
  assert.match(workerTransportContractSource, /parseRuntimeWorkerTransportMessage/);

  const workerTransportSource = await fs.readFile(path.join(repoRoot, "src", "runtime-worker-transport.js"), "utf8");
  assert.match(workerTransportSource, /export async function executeRuntimeWorkerTransportCall/);
  assert.match(workerTransportSource, /case RUNTIME_WORKER_TRANSPORT_METHODS\.controlDescribe:/);
  assert.match(workerTransportSource, /case RUNTIME_WORKER_TRANSPORT_METHODS\.processHealthRead:/);
  assert.match(workerTransportSource, /case RUNTIME_WORKER_TRANSPORT_METHODS\.supervisionActivate:/);
  assert.match(workerTransportSource, /case RUNTIME_WORKER_TRANSPORT_METHODS\.supervisionQuiesce:/);
  assert.match(workerTransportSource, /case RUNTIME_WORKER_TRANSPORT_METHODS\.appSnapshotReload:/);

  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /req\.method === "GET" && requestUrl\.pathname === RUNTIME_WORKER_CONTROL_PATH/);
  assert.match(runtimeServerSource, /executeRuntimeWorkerTransportCall/);
  assert.match(runtimeServerSource, /method:\s*RUNTIME_WORKER_TRANSPORT_METHODS\.controlDescribe/);
  assert.match(runtimeServerSource, /method:\s*RUNTIME_WORKER_TRANSPORT_METHODS\.processHealthRead/);
  assert.match(runtimeServerSource, /method:\s*RUNTIME_WORKER_TRANSPORT_METHODS\.supervisionActivate/);
  assert.match(runtimeServerSource, /method:\s*RUNTIME_WORKER_TRANSPORT_METHODS\.supervisionQuiesce/);

  const runtimeCoreHandlersSource = await fs.readFile(path.join(repoRoot, "src", "runtime-core-handlers.js"), "utf8");
  assert.match(runtimeCoreHandlersSource, /executeRuntimeWorkerTransportCall/);
  assert.match(runtimeCoreHandlersSource, /method:\s*RUNTIME_WORKER_TRANSPORT_METHODS\.appSnapshotReload/);

  const substrateReadme = await fs.readFile(path.join(repoRoot, "substrate", "README.md"), "utf8");
  assert.match(substrateReadme, /control_url = "http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/worker-control"/);
  assert.match(substrateReadme, /Legacy `health_url` and `reload_url` config fields still exist as compatibility fallback/i);
});

test("supervised startup app-project loading routes canonical manifest reads through witness-core when configured", async () => {
  const appProjectSource = await fs.readFile(path.join(repoRoot, "src", "app-project.js"), "utf8");
  assert.match(appProjectSource, /generationBridge\s*=\s*null/);
  assert.match(appProjectSource, /createAppProjectSourceFsModule/);
  assert.match(appProjectSource, /generationBridge\.readSource/);
  assert.match(appProjectSource, /generationBridge\.statSource/);
  assert.match(appProjectSource, /resolveAppProjectEntry\(entryPath,\s*options\)/);

  const cliSource = await fs.readFile(path.join(repoRoot, "src", "cli.js"), "utf8");
  assert.match(cliSource, /import\s+\{\s*createWitnessCoreBridge\s*\}\s+from "\.\/witness-core-bridge\.js"/);
  assert.match(cliSource, /function startupGenerationBridge/);
  assert.match(cliSource, /generationBridge\s*=\s*startupGenerationBridge\(process\.env\)/);
  assert.match(cliSource, /loadAppProjectWithStableFallback\(parsed\.appPath,\s*\{[\s\S]*generationBridge[\s\S]*\}\)/);
});

test("supervised runtime plugin catalog discovery routes plugin-root reads through witness-core when configured", async () => {
  const bridgeSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-bridge.js"), "utf8");
  assert.match(bridgeSource, /createWitnessCoreIpcTransport/);
  assert.match(bridgeSource, /createWitnessCoreHttpTransport/);
  assert.match(bridgeSource, /WITNESS_CORE_TRANSPORT_PIPE/);
  assert.match(bridgeSource, /createWitnessCoreTransportCall/);
  assert.match(bridgeSource, /createWitnessCoreTransportSubscribe/);
  assert.match(bridgeSource, /transport\s*=\s*null/);
  assert.match(bridgeSource, /async listSourceDirectory/);
  assert.match(bridgeSource, /WITNESS_CORE_TRANSPORT_METHODS\.sourceList/);

  const ipcTransportSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-ipc-transport.js"), "utf8");
  assert.match(ipcTransportSource, /kind:\s*"witness-core-ipc-transport\/v1"/);
  assert.match(ipcTransportSource, /createWitnessCoreTransportCall/);
  assert.match(ipcTransportSource, /createWitnessCoreTransportSubscribe/);
  assert.match(ipcTransportSource, /WITNESS_CORE_TRANSPORT_SUBSCRIPTIONS\.coreEvents/);

  const transportSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-http-transport.js"), "utf8");
  assert.match(transportSource, /fetchImpl\s*=\s*globalThis\.fetch/);
  assert.match(transportSource, /kind:\s*"witness-core-http-transport\/v1"/);
  assert.match(transportSource, /protocol:\s*WITNESS_CORE_TRANSPORT_PROTOCOL_VERSION/);
  assert.match(transportSource, /createWitnessCoreTransportCall/);
  assert.match(transportSource, /createWitnessCoreTransportSubscribe/);
  assert.match(transportSource, /case WITNESS_CORE_TRANSPORT_METHODS\.sourceList:/);
  assert.match(transportSource, /case WITNESS_CORE_TRANSPORT_METHODS\.statusReadHealth:/);
  assert.match(transportSource, /case WITNESS_CORE_TRANSPORT_METHODS\.statusReadServing:/);
  assert.match(transportSource, /case WITNESS_CORE_TRANSPORT_METHODS\.generationPublish:/);

  const pluginUtilsSource = await fs.readFile(path.join(repoRoot, "src", "runtime-plugin-utils.js"), "utf8");
  assert.match(pluginUtilsSource, /createRuntimePluginDiscoveryFsModule/);
  assert.match(pluginUtilsSource, /generationBridge\.listSourceDirectory/);
  assert.match(pluginUtilsSource, /generationBridge\.readSource/);
  assert.match(pluginUtilsSource, /generationBridge\.statSource/);
  assert.match(pluginUtilsSource, /readRuntimePluginCatalog\(\{[\s\S]*generationBridge[\s\S]*cwd/s);

  const dslSource = await fs.readFile(path.join(repoRoot, "src", "dsl.js"), "utf8");
  assert.match(dslSource, /readRuntimePluginCatalog[\s\S]*generationBridge:\s*options\.generationBridge/s);

  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /startupWitnessCoreBridge/);
  assert.match(runtimeServerSource, /readRuntimePluginCatalogImpl\(\{[\s\S]*generationBridge:\s*startupWitnessCoreBridge/s);
});

test("supervised runtime plugin module loading routes canonical imports through a witness-core scratch mirror when configured", async () => {
  const pluginLoaderSource = await fs.readFile(path.join(repoRoot, "src", "runtime-plugin-loader.js"), "utf8");
  assert.match(pluginLoaderSource, /materializePluginDirectoryFromWitnessCore/);
  assert.match(pluginLoaderSource, /generationBridge\.listSourceDirectory/);
  assert.match(pluginLoaderSource, /generationBridge\.readSource/);
  assert.match(pluginLoaderSource, /\.witness-core["', ]+["']runtime-plugin-modules/);
  assert.match(pluginLoaderSource, /pathToFileURL\(effectiveEntryPath\)/);
  assert.match(pluginLoaderSource, /resolvedPath:\s*effectiveEntryPath/);
  assert.match(pluginLoaderSource, /loadRuntimePluginModules\(\{[\s\S]*generationBridge[\s\S]*cwd/s);
  assert.doesNotMatch(pluginLoaderSource, /preferLocalWorkspaceImports/);

  const dslSource = await fs.readFile(path.join(repoRoot, "src", "dsl.js"), "utf8");
  assert.match(dslSource, /loadRuntimePluginModules[\s\S]*generationBridge:\s*options\.generationBridge/s);
  assert.match(dslSource, /loadRuntimePluginModules[\s\S]*cwd:\s*options\.cwd/s);

  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /loadRuntimePluginModulesImpl\(\{[\s\S]*generationBridge:\s*startupWitnessCoreBridge/s);
  assert.match(runtimeServerSource, /loadRuntimePluginModulesImpl\(\{[\s\S]*cwd:\s*startupWitnessCoreWorkspaceRoot/s);
});

test("core-connected startup and plugin source helpers fail closed instead of falling back to local canonical disk", async () => {
  const appProjectSource = await fs.readFile(path.join(repoRoot, "src", "app-project.js"), "utf8");
  assert.match(appProjectSource, /createCapabilityRequiredError/);
  assert.match(appProjectSource, /requireGenerationBridgeForCanonicalReads/);
  assert.match(appProjectSource, /if \(requireGenerationBridgeForCanonicalReads\) \{/);
  assert.match(appProjectSource, /if \(!sourceId && requireGenerationBridgeForCanonicalReads\) throw createCapabilityRequiredError/);
  assert.match(appProjectSource, /requireReadCapability:\s*options\?\.(?:requireGenerationBridgeForCanonicalReads|requireGenerationBridgeForCanonicalReads === true)/);

  const appSnapshotManagerSource = await fs.readFile(path.join(repoRoot, "src", "app-snapshot-manager.js"), "utf8");
  assert.match(appSnapshotManagerSource, /createSourceCapabilityRequiredError/);
  assert.match(appSnapshotManagerSource, /requireGenerationBridgeForCanonicalReads/);
  assert.match(appSnapshotManagerSource, /if \(requireGenerationBridgeForCanonicalReads\) \{/);
  assert.match(appSnapshotManagerSource, /if \(!sourceId && requireGenerationBridgeForCanonicalReads\) throw createSourceCapabilityRequiredError/);

  const pluginUtilsSource = await fs.readFile(path.join(repoRoot, "src", "runtime-plugin-utils.js"), "utf8");
  assert.match(pluginUtilsSource, /createCapabilityRequiredError/);
  assert.match(pluginUtilsSource, /requireGenerationBridgeForCanonicalReads/);
  assert.match(pluginUtilsSource, /if \(requireGenerationBridgeForCanonicalReads\) \{/);
  assert.match(pluginUtilsSource, /if \(!sourceId && requireGenerationBridgeForCanonicalReads\) throw createCapabilityRequiredError/);

  const pluginLoaderSource = await fs.readFile(path.join(repoRoot, "src", "runtime-plugin-loader.js"), "utf8");
  assert.match(pluginLoaderSource, /requireGenerationBridgeForCanonicalImports/);
  assert.match(pluginLoaderSource, /if \(requireGenerationBridgeForCanonicalImports\) \{/);
  assert.match(pluginLoaderSource, /if \(\(!pluginRootSourceId \|\| !entrySourceId\) && requireGenerationBridgeForCanonicalImports\)/);
  assert.match(pluginLoaderSource, /WITNESS_CORE_REQUIRED/);

  const dslSource = await fs.readFile(path.join(repoRoot, "src", "dsl.js"), "utf8");
  assert.match(dslSource, /requireReadCapability = false/);
  assert.match(dslSource, /if \(typeof readSource !== "function"\) \{/);
  assert.match(dslSource, /throw createReadCapabilityRequiredError\(resolved\);/);
  assert.match(dslSource, /await compileRvmFileToDesirePlus\(resolved,\s*\{[\s\S]*requireReadCapability[\s\S]*\}\)/s);
  assert.match(dslSource, /loadWitnessAppFile\(importedPath,\s*\{[\s\S]*requireReadCapability[\s\S]*\}\)/s);
  assert.match(dslSource, /requireGenerationBridgeForCanonicalReads:\s*options\.requireGenerationBridgeForCanonicalReads === true/);
  assert.match(dslSource, /requireGenerationBridgeForCanonicalImports:\s*options\.requireGenerationBridgeForCanonicalReads === true/);

  const desireRvmSource = await fs.readFile(path.join(repoRoot, "src", "desire", "rvm.js"), "utf8");
  assert.match(desireRvmSource, /requireReadCapability === true/);
  assert.match(desireRvmSource, /throw createReadCapabilityRequiredError\(resolved\);/);
  assert.match(desireRvmSource, /WITNESS_CORE_REQUIRED/);

  const desireWtomlSource = await fs.readFile(path.join(repoRoot, "src", "desire", "wtoml.js"), "utf8");
  assert.match(desireWtomlSource, /requireReadCapability === true/);
  assert.match(desireWtomlSource, /throw createReadCapabilityRequiredError\(resolved\);/);
  assert.match(desireWtomlSource, /WITNESS_CORE_REQUIRED/);

  const cliSource = await fs.readFile(path.join(repoRoot, "src", "cli.js"), "utf8");
  assert.match(cliSource, /requireGenerationBridgeForCanonicalReads:\s*Boolean\(generationBridge\)/);

  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /requireGenerationBridgeForCanonicalReads:\s*Boolean\(startupWitnessCoreUrl\)/);
  assert.match(runtimeServerSource, /requireGenerationBridgeForCanonicalImports:\s*Boolean\(startupWitnessCoreUrl\)/);
  assert.match(runtimeServerSource, /requireGenerationBridgeForCanonicalReads:\s*Boolean\(appContext\.witnessCoreUrl\)/);
});

test("core-connected runtime server request-path static reads route through witness-core source capabilities when configured", async () => {
  const runtimeServerSource = await fs.readFile(path.join(repoRoot, "src", "runtime-server.js"), "utf8");
  assert.match(runtimeServerSource, /readRuntimeSourceBytes/);
  assert.match(runtimeServerSource, /readRuntimeSourceText/);
  assert.match(runtimeServerSource, /requireWitnessCoreAuthority/);
  assert.match(runtimeServerSource, /if \(requireWitnessCoreAuthority && typeof witnessCoreBridge\?\.readSource !== "function"\)/);
  assert.match(runtimeServerSource, /witnessCoreBridge:\s*appContext\.witnessCoreBridge/);
  assert.match(runtimeServerSource, /readSource\(\{\s*path:\s*sourceId,\s*encoding:\s*"base64"\s*\}\)/);
  assert.match(runtimeServerSource, /req\.method === "GET" && appStaticRoot && requestUrl\.pathname\.startsWith\(APP_STATIC_PREFIX\)/);
  assert.match(runtimeServerSource, /req\.method === "GET" && req\.url\?\.startsWith\("\/canvas-lib\/"\)/);
  assert.match(runtimeServerSource, /requireWitnessCoreAuthority:\s*Boolean\(appContext\.witnessCoreUrl\)/);
});

test("core-connected WCSS adapter loading routes authored adapter modules through witness-core scratch materialization", async () => {
  const runtimeWcssAdapterSource = await fs.readFile(path.join(repoRoot, "src", "runtime-wcss-adapter.js"), "utf8");
  assert.match(runtimeWcssAdapterSource, /materializeWcssAdapterModuleFromWitnessCore/);
  assert.match(runtimeWcssAdapterSource, /generationBridge\?\.readSource/);
  assert.match(runtimeWcssAdapterSource, /generationBridge\?\.statSource/);
  assert.match(runtimeWcssAdapterSource, /\.witness-core["', ]+["']runtime-wcss-adapters/);
  assert.match(runtimeWcssAdapterSource, /requireGenerationBridgeForCanonicalImports/);

  const wcssRuntimeSource = await fs.readFile(path.join(repoRoot, "plugins", "wcss-runtime", "runtime.js"), "utf8");
  assert.match(wcssRuntimeSource, /generationBridge:\s*appContext\?\.witnessCoreBridge\s*\?\?\s*null/);
  assert.match(wcssRuntimeSource, /requireGenerationBridgeForCanonicalImports:\s*Boolean\(appContext\?\.witnessCoreUrl\)/);

  const wcssAuthoringSource = await fs.readFile(path.join(repoRoot, "plugins", "wcss-authoring", "runtime.js"), "utf8");
  assert.match(wcssAuthoringSource, /generationBridge:\s*appContext\?\.witnessCoreBridge\s*\?\?\s*null/);
  assert.match(wcssAuthoringSource, /requireGenerationBridgeForCanonicalImports:\s*Boolean\(appContext\?\.witnessCoreUrl\)/);
});

test("pipeline runtime model loaders expose an injected read-capability seam instead of hardcoding direct model compilation", async () => {
  const modelLoaderSource = await fs.readFile(path.join(repoRoot, "plugins", "pipeline-runtime", "rvm-model-loader.js"), "utf8");
  assert.match(modelLoaderSource, /createRvmModelBodyLoader/);
  assert.match(modelLoaderSource, /compileRvmFileToDesirePlus\(file,\s*\{[\s\S]*readFile[\s\S]*requireReadCapability[\s\S]*\}\)/s);
  assert.match(modelLoaderSource, /requireReadCapability = true/);

  for (const fileName of ["burst-fit-kernels.js", "health-kernels.js", "kalman-kernels.js"]) {
    const source = await fs.readFile(path.join(repoRoot, "plugins", "pipeline-runtime", fileName), "utf8");
    assert.match(source, /createRvmModelBodyLoader/);
    assert.match(source, /requireReadCapability = true/);
    assert.match(source, /loadModelBody = null/);
    assert.match(source, /const resolveModelBody = typeof loadModelBody === "function"/);
    assert.match(source, /readFile,\s*requireReadCapability/);
  }
});

test("non-test product call sites do not rely on ambient DESIRE or witness-app file-read fallback", async () => {
  const compileRvmOwners = await matchFilesWithin(["src", "plugins"], /await compileRvmFileToDesirePlus\(/g);
  assert.deepEqual(compileRvmOwners, [
    "plugins/pipeline-runtime/rvm-model-loader.js",
    "src/app-snapshot-manager.js",
    "src/dsl.js"
  ]);

  const appSnapshotManagerSource = await fs.readFile(path.join(repoRoot, "src", "app-snapshot-manager.js"), "utf8");
  assert.match(appSnapshotManagerSource, /compileRvmFileToDesirePlus\(record\.filePath,\s*\{[\s\S]*readFile:\s*\(target,\s*encoding\)\s*=>\s*readSourceText/s);

  const dslSource = await fs.readFile(path.join(repoRoot, "src", "dsl.js"), "utf8");
  assert.match(dslSource, /compileRvmFileToDesirePlus\(resolved,\s*\{[\s\S]*readFile:\s*readSource[\s\S]*requireReadCapability/s);

  const pipelineModelLoaderSource = await fs.readFile(path.join(repoRoot, "plugins", "pipeline-runtime", "rvm-model-loader.js"), "utf8");
  assert.match(pipelineModelLoaderSource, /readFile,\s*requireReadCapability/);
  assert.match(pipelineModelLoaderSource, /requireReadCapability = true/);

  const witnessLoaderOwners = await matchFilesWithin(["src", "plugins"], /loadWitnessAppFile\(/g);
  assert.deepEqual(witnessLoaderOwners, [
    "src/app-project.js",
    "src/dsl.js"
  ]);

  const appProjectSource = await fs.readFile(path.join(repoRoot, "src", "app-project.js"), "utf8");
  assert.match(appProjectSource, /loadWitnessAppFile\(manifestPath,\s*\{[\s\S]*readFile[\s\S]*requireReadCapability:\s*options\?\.(?:requireGenerationBridgeForCanonicalReads|requireGenerationBridgeForCanonicalReads === true)/s);
});
