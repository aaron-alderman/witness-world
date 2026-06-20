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
  assert.match(config, /health_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/process-health"/);
  assert.match(config, /reload_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/app-snapshot\/reload"/);

  const bootstrapConfig = await fs.readFile(path.join(repoRoot, "witness-core-bootstrap.toml"), "utf8");
  assert.match(bootstrapConfig, /\[frontdoor\]/);
  assert.match(bootstrapConfig, /public_addr\s*=\s*"127\.0\.0\.1:3000"/);
  assert.match(bootstrapConfig, /command\s*=\s*"node src\/cli\.js utility-bootstrap --port \{runtime_port\}"/);
  assert.match(bootstrapConfig, /health_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/process-health"/);

  const authoringConfig = await fs.readFile(path.join(repoRoot, "witness-core-authoring.toml"), "utf8");
  assert.match(authoringConfig, /\[frontdoor\]/);
  assert.match(authoringConfig, /public_addr\s*=\s*"127\.0\.0\.1:3000"/);
  assert.match(authoringConfig, /command\s*=\s*"node src\/cli\.js utility-bootstrap --port \{runtime_port\} --runtime-profile authoring --runtime-plugin plugin\.mcp"/);
  assert.match(authoringConfig, /health_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/process-health"/);

  const engentusMcpConfig = await fs.readFile(path.join(repoRoot, "witness-core-engentus-mcp.toml"), "utf8");
  assert.match(engentusMcpConfig, /\[frontdoor\]/);
  assert.match(engentusMcpConfig, /public_addr\s*=\s*"127\.0\.0\.1:8791"/);
  assert.match(engentusMcpConfig, /command\s*=\s*"node src\/cli\.js utility-mcp examples\/engentus --mcp engentus_mcp --server engentus_server --transport http --port \{runtime_port\} --runtime-profile full"/);
  assert.match(engentusMcpConfig, /health_url\s*=\s*"http:\/\/127\.0\.0\.1:\{runtime_port\}\/api\/runtime\/process-health"/);

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
  assert.match(workerScript, /"--port", defaultWorkerPort/);

  const exampleWorkerScript = await fs.readFile(path.join(repoRoot, "scripts", "run-example-app-worker.mjs"), "utf8");
  assert.match(exampleWorkerScript, /--default-port/);
  assert.match(exampleWorkerScript, /"--port", String\(defaultPort\)/);

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
  const publicHttpOwners = await matchSourceFiles(/\bnode:http\b|createServer\s*\(|server\.listen\s*\(/g);
  const canonicalWatcherOwners = await matchSourceFiles(/\bfsWatch\.watch\s*\(/g);

  assert.deepEqual(sqliteOwners, []);
  assert.deepEqual(pluginSqliteOwners, []);

  assert.deepEqual(publicHttpOwners, [
    "src/runtime-server.js"
  ]);

  assert.deepEqual(canonicalWatcherOwners, []);
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
    "src/operator-tui.js",
    "src/operator-workbench-main.js",
    "src/operator-workbench-settings.js",
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
    "src/runtime-stable-source-cache.js",
    "src/witness-core-build-worker.js"
  ]);

  const stableCacheSource = await fs.readFile(path.join(repoRoot, "src", "runtime-stable-source-cache.js"), "utf8");
  assert.match(stableCacheSource, /\.witness-core["', ]+["']stable-app-snapshots/);
  assert.match(stableCacheSource, /fsModule\.writeFile/);

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
    "src/runtime-verification-persistence.js",
    "src/witness-core-bridge.js"
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
    "src/runtime-verification-persistence.js",
    "src/runtime-widget-page.js",
    "src/witness-core-bridge.js"
  ]);
});

test("worker protocol is versioned and the build worker emits the shared envelope contract", async () => {
  const protocolDoc = await fs.readFile(path.join(repoRoot, "docs", "WITNESS-WORKER-PROTOCOL.md"), "utf8");
  assert.match(protocolDoc, /witness-worker\/v1/);
  assert.match(protocolDoc, /`build`/);
  assert.match(protocolDoc, /`evaluate`/);
  assert.match(protocolDoc, /`render`/);
  assert.match(protocolDoc, /`inspect`/);
  assert.match(protocolDoc, /`bounded_compute`/);
  assert.match(protocolDoc, /worker-local/i);

  const protocolSource = await fs.readFile(path.join(repoRoot, "src", "witness-worker-protocol.js"), "utf8");
  assert.match(protocolSource, /WITNESS_WORKER_PROTOCOL_VERSION\s*=\s*"witness-worker\/v1"/);
  assert.match(protocolSource, /build:\s*"build"/);
  assert.match(protocolSource, /evaluate:\s*"evaluate"/);
  assert.match(protocolSource, /render:\s*"render"/);
  assert.match(protocolSource, /inspect:\s*"inspect"/);
  assert.match(protocolSource, /boundedCompute:\s*"bounded_compute"/);

  const buildWorkerSource = await fs.readFile(path.join(repoRoot, "src", "witness-core-build-worker.js"), "utf8");
  assert.match(buildWorkerSource, /createBuildWorkerResultEnvelope/);
  assert.match(buildWorkerSource, /JSON\.stringify\(createBuildWorkerResultEnvelope\(result\)\)/);
});
