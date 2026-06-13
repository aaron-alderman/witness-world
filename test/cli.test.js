import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { MCP_PROTOCOL_VERSION } from "../src/mcp.js";

test("bootstrap CLI starts a blank-world bootstrap server", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--port", "0"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const url = await waitForServerUrl(() => stdout);
    const html = await fetch(url).then(response => response.text());
    const diagnostics = await fetch(`${url}/api/runtime/diagnostics`).then(response => response.json());
    assert.match(html, /Recover And Author The App Boundary/);
    assert.equal(diagnostics.activeProfile, "authoring");
    assert.deepEqual(diagnostics.activeBundles.map(bundle => bundle.id), [
      "bundle-core-runtime",
      "bundle-tutorial",
      "bundle-authoring"
    ]);
    assert.equal(diagnostics.startupRunner?.bootstrapOnly, true);
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.authoring"]);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /Runtime root:\s+/);
  const runtimeRoot = stdout.match(/Runtime root:\s+([^\r\n]+)/)?.[1] || "";
  assert.ok(runtimeRoot, "expected bootstrap CLI to print runtime root");
  assert.notEqual(path.resolve(runtimeRoot), path.resolve(os.tmpdir()));
  assert.match(stdout, /Persistence:\s+cold/);
  assert.match(stdout, /World home:\s+/);
  assert.match(stdout, /Runtime profile:\s+authoring/);
  assert.match(stdout, /Active bundles:\s+bundle-core-runtime, bundle-tutorial, bundle-authoring/);
  assert.match(stdout, /Operator runtime plugins:\s+plugin\.authoring/);
  assert.match(stdout, /Activated runtime plugins:\s+plugin\.authoring/);
  assert.match(stdout, /Bundle counts:\s+capabilities=\d+ routes=\d+ surfaces=\d+/);
  assert.match(stdout, /Runtime diagnostics:\s+http:\/\/[^\s]+\/api\/runtime\/diagnostics/);
});

test("bootstrap CLI honors --world-home for a named warm world layout", async () => {
  const worldHome = path.join(os.tmpdir(), `witness-world-home-${Date.now()}`);
  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--port", "0", "--world-home", worldHome], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    await waitForServerUrl(() => stdout);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
    await fs.rm(worldHome, { recursive: true, force: true });
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, new RegExp(`World home:\\s+${escapeRegex(path.resolve(worldHome))}`));
  assert.match(stdout, /Persistence:\s+warm/);
});

test("mcp CLI bridges stdio JSON-RPC to the local MCP endpoint without stdout noise", async () => {
  const dslPath = path.join(os.tmpdir(), `witness-mcp-cli-${Date.now()}.wtoml`);
  await fs.writeFile(dslPath, `
[[serverRunner]]
actor = "system"
id = "demo_server"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[mcpServer]]
actor = "system"
id = "cli_world"
label = "CLI World"
serverRunner = "demo_server"
serviceIdentity = "system"
transports = ["stdio"]

[[mcpToolInstall]]
actor = "system"
server = "cli_world"
tool = "world.read"
actingMode = "service"
`);

  const child = spawn(process.execPath, ["src/cli.js", "mcp", dslPath, "--mcp", "cli_world", "--transport", "stdio"], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {} }
    })}\n`);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    })}\n`);
    child.stdin.write(`${JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "world.read",
        arguments: { view: "bootstrapState" }
      }
    })}\n`);

    const lines = await waitForJsonRpcLines(() => stdout, 3);
    const initialize = JSON.parse(lines[0]);
    const list = JSON.parse(lines[1]);
    const call = JSON.parse(lines[2]);

    assert.equal(initialize.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.deepEqual(list.result.tools.map(tool => tool.name), ["world.read"]);
    assert.equal(call.result.isError, false);
    assert.equal(call.result.structuredContent.serverRunners.some(row => row.id === "demo_server"), true);
    assert.equal(call.result.structuredContent.mcpServers.some(row => row.id === "cli_world"), true);
  } finally {
    child.stdin.end();
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
    await fs.rm(dslPath, { force: true });
  }

  assert.equal(normalizeCliStderr(stderr), "");
});

test("bootstrap CLI rejects explicitly unknown runtime profiles", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-profile", "nope"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const exitCode = await onceExitCode(child);

  assert.equal(exitCode, 1);
  assert.equal(stdout.trim(), "");
  assert.match(stderr, /Unknown runtime profile:\s+nope/);
  assert.match(stderr, /Valid runtime profiles:\s+minimal, authoring, inspect, practical-backend, full/);
});

test("bootstrap CLI activates local runtime plugins through --runtime-plugin", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.authoring", "--port", "0"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const url = await waitForServerUrl(() => stdout);
    const diagnostics = await fetch(`${url}/api/runtime/diagnostics`).then(response => response.json());
    assert.deepEqual(diagnostics.plugins.activePluginIds, ["plugin.authoring"]);
    assert.deepEqual(diagnostics.plugins.addedBundleIds, ["bundle-authoring", "bundle-tutorial"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-tutorial"), true);
    assert.equal((await fetch(`${url}/_bootstrap`)).status, 200);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /Configured runtime plugins:\s+plugin\.authoring/);
  assert.match(stdout, /Activated runtime plugins:\s+plugin\.authoring/);
  assert.match(stdout, /Plugin-added bundles:\s+bundle-authoring, bundle-tutorial/);
  assert.match(stdout, /Handler route kinds:\s+/);
});

test("serve CLI runs the maintained demo on minimal with authored runtime plugins", async () => {
  const child = spawn(process.execPath, [
    "src/cli.js",
    "serve",
    "examples/demo-todo-server.wtoml",
    "--server",
    "demo_server",
    "--runtime-profile",
    "minimal",
    "--port",
    "0"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const url = await waitForServerUrl(() => stdout);
    const diagnostics = await fetch(`${url}/api/runtime/diagnostics`).then(response => response.json());

    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual([...diagnostics.plugins.authoredPluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.inspect"]);
    assert.deepEqual(diagnostics.plugins.operatorPluginIds, []);
    assert.deepEqual([...diagnostics.plugins.effectivePluginIds].sort(), ["plugin.authoring", "plugin.canvas", "plugin.inspect"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-inspect"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-canvas"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-demo"), false);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-practical-backend"), false);
    assert.equal((await fetch(`${url}/world`)).status, 200);
    assert.equal((await fetch(`${url}/canvas`)).status, 200);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /Runtime profile:\s+minimal/);
  assert.match(stdout, /Authored runtime plugins:\s+plugin\.authoring, plugin\.canvas, plugin\.inspect/);
  assert.match(stdout, /Activated runtime plugins:\s+plugin\.authoring, plugin\.canvas, plugin\.inspect/);
});

test("bootstrap CLI rejects explicitly unknown runtime plugins with actionable reasons", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-plugin", "plugin.nope"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  const exitCode = await onceExitCode(child);

  assert.equal(exitCode, 1);
  assert.equal(stdout.trim(), "");
  assert.match(stderr, /runtime plugins unresolved/);
  assert.match(stderr, /Runtime plugin rejected:\s+plugin\.nope/);
  assert.match(stderr, /plugin package not found/);
});

test("bootstrap CLI rejects plugin-owned runtime plugins when runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-plugin-root-"));
  const inspectDir = path.join(pluginRoot, "inspect");
  await fs.mkdir(inspectDir, { recursive: true });
  await fs.writeFile(path.join(inspectDir, "plugin.json"), JSON.stringify({
    id: "plugin.inspect",
    version: "0.1.0",
    displayName: "Inspect Plugin",
    description: "Broken inspect plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-inspect"],
    contributes: {}
  }, null, 2));

  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.inspect"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RUNTIME_PLUGIN_ROOT: pluginRoot
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const exitCode = await onceExitCode(child);
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /runtime plugins unresolved/);
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.inspect/);
    assert.match(stderr, /runtime\.entry not found/);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("bootstrap CLI rejects plugin.practical-backend when runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-practical-backend-plugin-root-"));
  const backendDir = path.join(pluginRoot, "practical-backend");
  await fs.mkdir(backendDir, { recursive: true });
  await fs.writeFile(path.join(backendDir, "plugin.json"), JSON.stringify({
    id: "plugin.practical-backend",
    version: "0.1.0",
    displayName: "Practical Backend Plugin",
    description: "Broken practical backend plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-practical-backend"],
    contributes: {}
  }, null, 2));

  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.practical-backend"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RUNTIME_PLUGIN_ROOT: pluginRoot
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const exitCode = await onceExitCode(child);
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /runtime plugins unresolved/);
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.practical-backend/);
    assert.match(stderr, /runtime\.entry not found/);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("bootstrap CLI rejects plugin.mcp when runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-mcp-plugin-root-"));
  const mcpDir = path.join(pluginRoot, "mcp");
  await fs.mkdir(mcpDir, { recursive: true });
  await fs.writeFile(path.join(mcpDir, "plugin.json"), JSON.stringify({
    id: "plugin.mcp",
    version: "0.1.0",
    displayName: "MCP Plugin",
    description: "Broken MCP plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-mcp"],
    contributes: {}
  }, null, 2));

  const child = spawn(process.execPath, ["src/cli.js", "bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.mcp"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RUNTIME_PLUGIN_ROOT: pluginRoot
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const exitCode = await onceExitCode(child);
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /runtime plugins unresolved/);
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.mcp/);
    assert.match(stderr, /runtime\.entry not found/);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("bootstrap CLI default activation fails when plugin.authoring runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-authoring-plugin-root-"));
  const authoringDir = path.join(pluginRoot, "authoring");
  await fs.mkdir(authoringDir, { recursive: true });
  await fs.writeFile(path.join(authoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.authoring",
    version: "0.1.0",
    displayName: "Authoring Plugin",
    description: "Broken authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-authoring", "bundle-tutorial"],
    contributes: {}
  }, null, 2));

  const child = spawn(process.execPath, ["src/cli.js", "bootstrap"], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RUNTIME_PLUGIN_ROOT: pluginRoot
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const exitCode = await onceExitCode(child);
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /runtime plugins unresolved/);
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.authoring/);
    assert.match(stderr, /runtime\.entry not found/);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("serve CLI rejects authored plugin.canvas when runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-canvas-plugin-root-"));
  const writePlugin = async (directoryName, manifest, runtimeSource = null) => {
    const pluginDir = path.join(pluginRoot, directoryName);
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2));
    if (runtimeSource != null) {
      await fs.writeFile(path.join(pluginDir, "runtime.js"), runtimeSource, "utf8");
    }
  };
  await writePlugin("authoring", {
    id: "plugin.authoring",
    version: "0.1.0",
    displayName: "Authoring Plugin",
    description: "Authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-authoring", "bundle-tutorial"],
    contributes: {}
  }, `export default { bundles: { "bundle-authoring": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["bootstrap.page"], handlerMetadata: {} }, routes: [{ kind: "exact", method: "GET", path: "/_bootstrap", handler: "bootstrap.page", params: {} }], surfaces: [], createHandlers() { return { "bootstrap.page": async ({ send }) => send }; } }, "bundle-tutorial": { handlerCatalog: { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["tutorial.progress.read"], handlerMetadata: {} }, routes: [{ kind: "pattern", method: "GET", pattern: /^\\/api\\/tutorial-progress\\/([^/]+)$/, handler: "tutorial.progress.read", paramNames: ["tutorialId"] }], surfaces: [], createHandlers() { return { "tutorial.progress.read": async () => {} }; } } } };`);
  await writePlugin("inspect", {
    id: "plugin.inspect",
    version: "0.1.0",
    displayName: "Inspect Plugin",
    description: "Inspect plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-inspect"],
    contributes: {}
  }, `export const bundleId = "bundle-inspect"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["page.world"], handlerMetadata: {} }; export const routes = []; export const surfaces = []; export function createHandlers() { return { "page.world": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("canvas", {
    id: "plugin.canvas",
    version: "0.1.0",
    displayName: "Canvas Plugin",
    description: "Broken canvas plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-canvas"],
    contributes: {}
  });

  const child = spawn(process.execPath, [
    "src/cli.js",
    "serve",
    "examples/demo-todo-server.wtoml",
    "--server",
    "demo_server",
    "--runtime-profile",
    "minimal"
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      RUNTIME_PLUGIN_ROOT: pluginRoot
    }
  });

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });

  try {
    const exitCode = await onceExitCode(child);
    assert.equal(exitCode, 1);
    assert.equal(stdout.trim(), "");
    assert.match(stderr, /runtime plugins unresolved/);
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.canvas/);
    assert.match(stderr, /runtime\.entry not found/);
  } finally {
    await fs.rm(pluginRoot, { recursive: true, force: true });
  }
});

test("operator CLI creates backup and export artifacts under the active world home", async () => {
  const worldHome = await fs.mkdtemp(path.join(os.tmpdir(), "witness-cli-operator-"));
  const witnessLogPath = path.join(worldHome, "logs", "bootstrap.witnesses.jsonl");
  const observationLogPath = path.join(worldHome, "logs", "bootstrap.observations.jsonl");
  const world = createWorld({
    genesis: { system: "witness-world", mode: "bootstrap" },
    witnessLogPath,
    observationLogPath
  });
  world.emit({ process: "widget.define", actor: "system", claims: [], body: { id: "alpha_page" } });
  await fs.mkdir(path.join(worldHome, "runtime", "assets"), { recursive: true });
  await fs.writeFile(path.join(worldHome, "runtime", "assets", "note.txt"), "derived", "utf8");

  try {
    const backup = await runCli(["operator", "backup", "--world-home", worldHome, "--label", "snapshot", "--include-derived"]);
    assert.equal(backup.code, 0);
    assert.match(backup.stdout, /Backup complete/);
    assert.match(backup.stdout, /Includes derived:\s+yes/);

    const exportRun = await runCli(["operator", "export", "--world-home", worldHome, "--label", "portable"]);
    assert.equal(exportRun.code, 0);
    assert.match(exportRun.stdout, /Export complete/);
    assert.match(exportRun.stdout, /Includes derived:\s+no/);

    const backupDirs = await fs.readdir(path.join(worldHome, "backups"));
    const exportDirs = await fs.readdir(path.join(worldHome, "exports"));
    assert.equal(backupDirs.length, 1);
    assert.equal(exportDirs.length, 1);

    const backupManifest = JSON.parse(await fs.readFile(path.join(worldHome, "backups", backupDirs[0], "manifest.json"), "utf8"));
    const exportManifest = JSON.parse(await fs.readFile(path.join(worldHome, "exports", exportDirs[0], "manifest.json"), "utf8"));
    assert.equal(backupManifest.kind, "backup");
    assert.equal(backupManifest.includesDerived, true);
    assert.equal(exportManifest.kind, "export");
    assert.equal(exportManifest.includesDerived, false);
    assert.equal(await exists(path.join(worldHome, "backups", backupDirs[0], "runtime", "assets", "note.txt")), true);
    assert.equal(await exists(path.join(worldHome, "exports", exportDirs[0], "runtime")), false);
  } finally {
    await fs.rm(worldHome, { recursive: true, force: true });
  }
});

async function waitForServerUrl(readStdout, { timeoutMs = 20000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = readStdout().match(/Witness (?:bootstrap|server) running:\s+(http:\/\/[^\s]+)/);
    if (match) return match[1];
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for bootstrap CLI startup.\nSTDOUT:\n${readStdout()}`);
}

async function waitForJsonRpcLines(readStdout, count, { timeoutMs = 20000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const lines = readStdout()
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => {
        try {
          return JSON.parse(line)?.jsonrpc === "2.0";
        } catch {
          return false;
        }
      });
    if (lines.length >= count) return lines.slice(0, count);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${count} JSON-RPC lines.\nSTDOUT:\n${readStdout()}`);
}

function normalizeCliStderr(stderr) {
  return stderr
    .replace(/\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\r?\n?/g, "")
    .replace(/\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\r?\n?/g, "")
    .trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function onceExit(child) {
  if (child.exitCode != null) return;
  await new Promise(resolve => child.once("exit", resolve));
}

async function onceExitCode(child) {
  if (child.exitCode != null) return child.exitCode;
  return new Promise(resolve => child.once("exit", code => resolve(code)));
}

async function runCli(args) {
  const child = spawn(process.execPath, ["src/cli.js", ...args], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const code = await onceExitCode(child);
  return { code, stdout, stderr: normalizeCliStderr(stderr) };
}

async function exists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}
