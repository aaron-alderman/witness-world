import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createWorld } from "../src/kernel.js";
import { MCP_PROTOCOL_VERSION } from "../plugins/mcp/mcp-tools.js";

test("bootstrap CLI starts a blank-world bootstrap server", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--port", "0"], {
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
    assert.equal(diagnostics.activeProfile, "minimal");
    assert.deepEqual([...diagnostics.activeBundles.map(bundle => bundle.id)].sort(), [
      "bundle-core-runtime",
      "bundle-bootstrap",
      "bundle-authoring-core",
      "bundle-capability-authoring",
      "bundle-program-authoring",
      "bundle-server-runner-authoring",
      "bundle-mcp-authoring",
      "bundle-proposals",
      "bundle-starter",
      "bundle-tutorial"
    ].sort());
    assert.equal(diagnostics.startupRunner?.bootstrapOnly, true);
    assert.equal(diagnostics.startupRunner?.startupOwned, true);
    assert.deepEqual([...diagnostics.plugins.startupPluginIds].sort(), ["plugin.authoring", "plugin.starter", "plugin.tutorial"]);
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.authoring", "plugin.authoring-core", "plugin.bootstrap", "plugin.capability-authoring", "plugin.mcp-authoring", "plugin.program-authoring", "plugin.proposals", "plugin.server-runner-authoring", "plugin.starter", "plugin.tutorial"]);
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
  assert.match(stdout, /Runtime profile:\s+minimal/);
  assert.deepEqual(cliListLine(stdout, "Active bundles").sort(), [
    "bundle-core-runtime",
    "bundle-bootstrap",
    "bundle-authoring-core",
    "bundle-capability-authoring",
    "bundle-program-authoring",
    "bundle-server-runner-authoring",
    "bundle-mcp-authoring",
    "bundle-proposals",
    "bundle-starter",
    "bundle-tutorial"
  ].sort());
  assert.match(stdout, /Startup default runtime plugins:\s+plugin\.authoring, plugin\.starter, plugin\.tutorial/);
  assert.match(stdout, /Configured runtime plugins:\s+\(none\)/);
  assert.match(stdout, /Activated runtime plugins:\s+.*plugin\.mcp-authoring/);
  assert.match(stdout, /Bundle counts:\s+capabilities=\d+ routes=\d+ surfaces=\d+/);
  assert.match(stdout, /Runtime diagnostics:\s+http:\/\/[^\s]+\/api\/runtime\/diagnostics/);
});

test("bootstrap CLI honors --world-home for a named warm world layout", async () => {
  const worldHome = path.join(os.tmpdir(), `witness-world-home-${Date.now()}`);
  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--port", "0", "--world-home", worldHome], {
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
  const appRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-mcp-cli-"));
  const dslPath = path.join(appRoot, "app.wtoml");
  await fs.writeFile(dslPath, `
[[serverRunner]]
actor = "system"
id = "demo_server"
backendHost = "backendHost"
frontendHost = "frontendHost"

[[runtimePluginInstall]]
actor = "system"
serverRunner = "demo_server"
plugin = "plugin.mcp"

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

  const child = spawn(process.execPath, ["src/cli.js", "utility-mcp", appRoot, "--mcp", "cli_world", "--transport", "stdio"], {
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
        arguments: { view: "witnesses" }
      }
    })}\n`);

    const lines = await waitForJsonRpcLines(() => stdout, 3);
    const initialize = JSON.parse(lines[0]);
    const list = JSON.parse(lines[1]);
    const call = JSON.parse(lines[2]);

    assert.equal(initialize.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.deepEqual(list.result.tools.map(tool => tool.name), ["world.read"]);
    assert.equal(call.result.isError, false);
    assert.equal(call.result.structuredContent.witnesses.some(row => row.process === "defineServerRunner" && row.body?.id === "demo_server"), true);
    assert.equal(call.result.structuredContent.witnesses.some(row => row.process === "defineMcpServer" && row.body?.id === "cli_world"), true);
  } finally {
    child.stdin.end();
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
    await fs.rm(appRoot, { recursive: true, force: true });
  }

  assert.equal(normalizeCliStderr(stderr), "");
});

test("bootstrap CLI rejects explicitly unknown runtime profiles", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-profile", "nope"], {
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
  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.authoring", "--port", "0"], {
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
    assert.deepEqual(diagnostics.plugins.startupPluginIds, []);
    assert.deepEqual([...diagnostics.plugins.activePluginIds].sort(), ["plugin.authoring", "plugin.authoring-core", "plugin.bootstrap", "plugin.capability-authoring", "plugin.mcp-authoring", "plugin.program-authoring", "plugin.proposals", "plugin.server-runner-authoring"]);
    assert.deepEqual([...diagnostics.plugins.addedBundleIds].sort(), ["bundle-authoring-core", "bundle-bootstrap", "bundle-capability-authoring", "bundle-mcp-authoring", "bundle-program-authoring", "bundle-proposals", "bundle-server-runner-authoring"]);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-authoring-core"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-bootstrap"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-capability-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-program-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-server-runner-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-mcp-authoring"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-proposals"), true);
    assert.equal(diagnostics.activeBundles.some(bundle => bundle.id === "bundle-tutorial"), false);
    assert.equal((await fetch(`${url}/_bootstrap`)).status, 200);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /Startup default runtime plugins:\s+\(none\)/);
  assert.match(stdout, /Configured runtime plugins:\s+plugin\.authoring/);
  assert.match(stdout, /Activated runtime plugins:\s+.*plugin\.mcp-authoring/);
  assert.match(stdout, /plugin\.mcp-authoring -> bundle-mcp-authoring/);
  assert.match(stdout, /Handler route kinds:\s+/);
});

test("serve CLI runs the maintained demo on minimal with authored runtime plugins", async () => {
  const child = spawn(process.execPath, [
    "src/cli.js",
    "utility-serve",
    "examples/demo-todo-app/app.wtoml",
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
    const url = await waitForServerUrl(() => stdout, { timeoutMs: 60000 });
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.equal(child.exitCode, null);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /App root:\s+.*examples[\\/]+demo-todo-app/);
  assert.match(stdout, /Manifest:\s+.*examples[\\/]+demo-todo-app[\\/]+app\.wtoml/);
  assert.match(stdout, /Server runner:\s+demo_server/);
  assert.match(stdout, /Selected target:\s+demo_server/);
  assert.match(stdout, /Runtime profile:\s+minimal/);
  assert.match(stdout, /Authored runtime plugins:\s+plugin\.authoring, plugin\.canvas, plugin\.demo, plugin\.inspect/);
  assert.match(stdout, /Activated runtime plugins:\s+.*plugin\.mcp-authoring/);
});

test("bootstrap CLI rejects explicitly unknown runtime plugins with actionable reasons", async () => {
  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-plugin", "plugin.nope"], {
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

  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.inspect"], {
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

test("bootstrap CLI rejects plugin.assets when runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-assets-plugin-root-"));
  const assetsDir = path.join(pluginRoot, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  await fs.writeFile(path.join(assetsDir, "plugin.json"), JSON.stringify({
    id: "plugin.assets",
    version: "0.1.0",
    displayName: "Assets Plugin",
    description: "Broken assets plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-assets"],
    contributes: {}
  }, null, 2));

  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.assets"], {
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
    assert.match(stderr, /Runtime plugin rejected:\s+plugin\.assets/);
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

  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap", "--runtime-profile", "minimal", "--runtime-plugin", "plugin.mcp"], {
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

test("bootstrap CLI default activation fails when plugin.authoring-core runtime.js is missing", async () => {
  const pluginRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-broken-authoring-plugin-root-"));
  const authoringDir = path.join(pluginRoot, "authoring");
  await fs.mkdir(authoringDir, { recursive: true });
  await fs.writeFile(path.join(authoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.authoring",
    version: "0.1.0",
    displayName: "Authoring Plugin",
    description: "Broken authoring plugin",
    kind: "plugin",
    dependsOnPlugins: ["plugin.authoring-core", "plugin.bootstrap", "plugin.capability-authoring", "plugin.program-authoring", "plugin.server-runner-authoring", "plugin.mcp-authoring", "plugin.proposals", "plugin.tutorial"],
    contributes: {}
  }, null, 2));
  const authoringCoreDir = path.join(pluginRoot, "authoring-core");
  await fs.mkdir(authoringCoreDir, { recursive: true });
  await fs.writeFile(path.join(authoringCoreDir, "plugin.json"), JSON.stringify({
    id: "plugin.authoring-core",
    version: "0.1.0",
    displayName: "Authoring Core Plugin",
    description: "Authoring core plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-authoring-core"],
    contributes: {}
  }, null, 2));
  const bootstrapDir = path.join(pluginRoot, "bootstrap");
  await fs.mkdir(bootstrapDir, { recursive: true });
  await fs.writeFile(path.join(bootstrapDir, "plugin.json"), JSON.stringify({
    id: "plugin.bootstrap",
    version: "0.1.0",
    displayName: "Bootstrap Plugin",
    description: "Bootstrap plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-bootstrap"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(bootstrapDir, "runtime.js"), `export const bundleId = "bundle-bootstrap"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["bootstrap.page"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "GET", path: "/_bootstrap", handler: "bootstrap.page", params: {} }]; export const surfaces = [{ id: "surface:bootstrap", title: "Bootstrap", href: "/_bootstrap", action: null, search: "bootstrap", type: "surface", tier: "harness", contexts: ["app-command"] }]; export function createHandlers() { return { "bootstrap.page": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const capabilityAuthoringDir = path.join(pluginRoot, "capability-authoring");
  await fs.mkdir(capabilityAuthoringDir, { recursive: true });
  await fs.writeFile(path.join(capabilityAuthoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.capability-authoring",
    version: "0.1.0",
    displayName: "Capability Authoring Plugin",
    description: "Capability authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-capability-authoring"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(capabilityAuthoringDir, "runtime.js"), `export const bundleId = "bundle-capability-authoring"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["capability.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/capabilities", handler: "capability.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "capability.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const programAuthoringDir = path.join(pluginRoot, "program-authoring");
  await fs.mkdir(programAuthoringDir, { recursive: true });
  await fs.writeFile(path.join(programAuthoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.program-authoring",
    version: "0.1.0",
    displayName: "Program Authoring Plugin",
    description: "Program authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-program-authoring"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(programAuthoringDir, "runtime.js"), `export const bundleId = "bundle-program-authoring"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["frontendProgram.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/frontend-programs", handler: "frontendProgram.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "frontendProgram.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const serverRunnerAuthoringDir = path.join(pluginRoot, "server-runner-authoring");
  await fs.mkdir(serverRunnerAuthoringDir, { recursive: true });
  await fs.writeFile(path.join(serverRunnerAuthoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.server-runner-authoring",
    version: "0.1.0",
    displayName: "Server Runner Authoring Plugin",
    description: "Server runner authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-server-runner-authoring"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(serverRunnerAuthoringDir, "runtime.js"), `export const bundleId = "bundle-server-runner-authoring"; export const handlerCatalog = { authorableHandlers: ["runtimePlugin.install", "runtimePlugin.remove"], pageHandlers: [], dispatchHandlers: ["serverRunner.create", "runtimePlugin.install", "runtimePlugin.remove"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/server-runners", handler: "serverRunner.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "serverRunner.create": async () => {}, "runtimePlugin.install": async () => {}, "runtimePlugin.remove": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const mcpAuthoringDir = path.join(pluginRoot, "mcp-authoring");
  await fs.mkdir(mcpAuthoringDir, { recursive: true });
  await fs.writeFile(path.join(mcpAuthoringDir, "plugin.json"), JSON.stringify({
    id: "plugin.mcp-authoring",
    version: "0.1.0",
    displayName: "MCP Authoring Plugin",
    description: "MCP authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-mcp-authoring"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(mcpAuthoringDir, "runtime.js"), `export const bundleId = "bundle-mcp-authoring"; export const handlerCatalog = { authorableHandlers: ["mcpServer.create", "mcpTool.install", "mcpTool.remove"], pageHandlers: [], dispatchHandlers: ["mcpServer.create", "mcpTool.install", "mcpTool.remove"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/mcp-servers", handler: "mcpServer.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "mcpServer.create": async () => {}, "mcpTool.install": async () => {}, "mcpTool.remove": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const proposalsDir = path.join(pluginRoot, "proposals");
  await fs.mkdir(proposalsDir, { recursive: true });
  await fs.writeFile(path.join(proposalsDir, "plugin.json"), JSON.stringify({
    id: "plugin.proposals",
    version: "0.1.0",
    displayName: "Proposals Plugin",
    description: "Proposals plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-proposals"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(proposalsDir, "runtime.js"), `export const bundleId = "bundle-proposals"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["proposal.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/proposals", handler: "proposal.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "proposal.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const starterDir = path.join(pluginRoot, "starter");
  await fs.mkdir(starterDir, { recursive: true });
  await fs.writeFile(path.join(starterDir, "plugin.json"), JSON.stringify({
    id: "plugin.starter",
    version: "0.1.0",
    displayName: "Starter Plugin",
    description: "Starter plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-starter"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(starterDir, "runtime.js"), `export const bundleId = "bundle-starter"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["starter.blueprints.read"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "GET", path: "/api/starter-blueprints", handler: "starter.blueprints.read", params: {} }]; export const surfaces = []; export function createHandlers() { return { "starter.blueprints.read": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  const tutorialDir = path.join(pluginRoot, "tutorial");
  await fs.mkdir(tutorialDir, { recursive: true });
  await fs.writeFile(path.join(tutorialDir, "plugin.json"), JSON.stringify({
    id: "plugin.tutorial",
    version: "0.1.0",
    displayName: "Tutorial Plugin",
    description: "Tutorial plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-tutorial"],
    contributes: {}
  }, null, 2));
  await fs.writeFile(path.join(tutorialDir, "runtime.js"), `export const bundleId = "bundle-tutorial"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["tutorial.progress.read"], handlerMetadata: {} }; export const routes = [{ kind: "pattern", method: "GET", pattern: /^\\/api\\/tutorial-progress\\/([^/]+)$/, handler: "tutorial.progress.read", paramNames: ["tutorialId"] }]; export const surfaces = []; export function createHandlers() { return { "tutorial.progress.read": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);

  const child = spawn(process.execPath, ["src/cli.js", "utility-bootstrap"], {
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
    dependsOnPlugins: ["plugin.authoring-core", "plugin.bootstrap", "plugin.capability-authoring", "plugin.program-authoring", "plugin.server-runner-authoring", "plugin.mcp-authoring", "plugin.proposals", "plugin.tutorial"],
    contributes: {}
  }, null);
  await writePlugin("authoring-core", {
    id: "plugin.authoring-core",
    version: "0.1.0",
    displayName: "Authoring Core Plugin",
    description: "Authoring core plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-authoring-core"],
    contributes: {}
  }, `export const bundleId = "bundle-authoring-core"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["context.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/contexts", handler: "context.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "context.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("bootstrap", {
    id: "plugin.bootstrap",
    version: "0.1.0",
    displayName: "Bootstrap Plugin",
    description: "Bootstrap plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-bootstrap"],
    contributes: {}
  }, `export const bundleId = "bundle-bootstrap"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["bootstrap.page"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "GET", path: "/_bootstrap", handler: "bootstrap.page", params: {} }]; export const surfaces = [{ id: "surface:bootstrap", title: "Bootstrap", href: "/_bootstrap", action: null, search: "bootstrap", type: "surface", tier: "harness", contexts: ["app-command"] }]; export function createHandlers() { return { "bootstrap.page": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("capability-authoring", {
    id: "plugin.capability-authoring",
    version: "0.1.0",
    displayName: "Capability Authoring Plugin",
    description: "Capability authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-capability-authoring"],
    contributes: {}
  }, `export const bundleId = "bundle-capability-authoring"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["capability.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/capabilities", handler: "capability.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "capability.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("program-authoring", {
    id: "plugin.program-authoring",
    version: "0.1.0",
    displayName: "Program Authoring Plugin",
    description: "Program authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-program-authoring"],
    contributes: {}
  }, `export const bundleId = "bundle-program-authoring"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["frontendProgram.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/frontend-programs", handler: "frontendProgram.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "frontendProgram.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("server-runner-authoring", {
    id: "plugin.server-runner-authoring",
    version: "0.1.0",
    displayName: "Server Runner Authoring Plugin",
    description: "Server runner authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-server-runner-authoring"],
    contributes: {}
  }, `export const bundleId = "bundle-server-runner-authoring"; export const handlerCatalog = { authorableHandlers: ["runtimePlugin.install", "runtimePlugin.remove"], pageHandlers: [], dispatchHandlers: ["serverRunner.create", "runtimePlugin.install", "runtimePlugin.remove"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/server-runners", handler: "serverRunner.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "serverRunner.create": async () => {}, "runtimePlugin.install": async () => {}, "runtimePlugin.remove": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("mcp-authoring", {
    id: "plugin.mcp-authoring",
    version: "0.1.0",
    displayName: "MCP Authoring Plugin",
    description: "MCP authoring plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-mcp-authoring"],
    contributes: {}
  }, `export const bundleId = "bundle-mcp-authoring"; export const handlerCatalog = { authorableHandlers: ["mcpServer.create", "mcpTool.install", "mcpTool.remove"], pageHandlers: [], dispatchHandlers: ["mcpServer.create", "mcpTool.install", "mcpTool.remove"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/mcp-servers", handler: "mcpServer.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "mcpServer.create": async () => {}, "mcpTool.install": async () => {}, "mcpTool.remove": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("proposals", {
    id: "plugin.proposals",
    version: "0.1.0",
    displayName: "Proposals Plugin",
    description: "Proposals plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-proposals"],
    contributes: {}
  }, `export const bundleId = "bundle-proposals"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["proposal.create"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "POST", path: "/api/proposals", handler: "proposal.create", params: {} }]; export const surfaces = []; export function createHandlers() { return { "proposal.create": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("starter", {
    id: "plugin.starter",
    version: "0.1.0",
    displayName: "Starter Plugin",
    description: "Starter plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-starter"],
    contributes: {}
  }, `export const bundleId = "bundle-starter"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["starter.blueprints.read"], handlerMetadata: {} }; export const routes = [{ kind: "exact", method: "GET", path: "/api/starter-blueprints", handler: "starter.blueprints.read", params: {} }]; export const surfaces = []; export function createHandlers() { return { "starter.blueprints.read": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("tutorial", {
    id: "plugin.tutorial",
    version: "0.1.0",
    displayName: "Tutorial Plugin",
    description: "Tutorial plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-tutorial"],
    contributes: {}
  }, `export const bundleId = "bundle-tutorial"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["tutorial.progress.read"], handlerMetadata: {} }; export const routes = [{ kind: "pattern", method: "GET", pattern: /^\\/api\\/tutorial-progress\\/([^/]+)$/, handler: "tutorial.progress.read", paramNames: ["tutorialId"] }]; export const surfaces = []; export function createHandlers() { return { "tutorial.progress.read": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("inspect", {
    id: "plugin.inspect",
    version: "0.1.0",
    displayName: "Inspect Plugin",
    description: "Inspect plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-inspect"],
    contributes: {}
  }, `export const bundleId = "bundle-inspect"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: ["events.stream"], handlerMetadata: {} }; export const routes = []; export const surfaces = []; export function createHandlers() { return { "events.stream": async () => {} }; } export default { bundleId, handlerCatalog, routes, surfaces, createHandlers };`);
  await writePlugin("demo", {
    id: "plugin.demo",
    version: "0.1.0",
    displayName: "Demo Plugin",
    description: "Demo plugin",
    kind: "plugin",
    runtime: { entry: "./runtime.js" },
    activatesBundles: ["bundle-demo"],
    contributes: {}
  }, `export const bundleId = "bundle-demo"; export const handlerCatalog = { authorableHandlers: [], pageHandlers: [], dispatchHandlers: [], handlerMetadata: {} }; export const routes = []; export const surfaces = []; export const providers = []; export function createHandlers() { return {}; } export default { bundleId, handlerCatalog, routes, surfaces, providers, createHandlers };`);
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
    "examples/demo-todo-app",
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

async function waitForJsonRpcLines(readStdout, count, { timeoutMs = 30000 } = {}) {
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

function cliListLine(stdout, label) {
  const match = stdout.match(new RegExp(`^${escapeRegex(label)}:\\s+([^\\r\\n]+)`, "m"));
  assert.ok(match, `expected ${label} line`);
  return match[1].split(",").map(value => value.trim()).filter(Boolean);
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

