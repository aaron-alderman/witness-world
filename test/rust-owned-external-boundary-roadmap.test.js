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

test("transitional node external-boundary owners stay contained to the known exception set", async () => {
  const sqliteOwners = await matchSourceFiles(/\bnode:sqlite\b|\bDatabaseSync\b/g);
  const pluginSqliteOwners = await matchFilesUnder(path.join(repoRoot, "plugins"), /\bnode:sqlite\b|\bDatabaseSync\b/g);
  const publicHttpOwners = await matchSourceFiles(/\bnode:http\b|createServer\s*\(|server\.listen\s*\(/g);
  const canonicalWatcherOwners = await matchSourceFiles(/\bfsWatch\.watch\s*\(/g);

  assert.deepEqual(sqliteOwners, []);
  assert.deepEqual(pluginSqliteOwners, [
    "plugins/sql/provider-runtime.js",
    "plugins/sqlite/provider-runtime.js"
  ]);

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
    "src/runtime-verification-persistence.js",
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
