import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
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
    assert.match(html, /Recover And Author The App Boundary/);
  } finally {
    if (!child.killed) child.kill("SIGINT");
    await onceExit(child);
  }

  assert.equal(normalizeCliStderr(stderr), "");
  assert.match(stdout, /Runtime root:\s+/);
  const runtimeRoot = stdout.match(/Runtime root:\s+([^\r\n]+)/)?.[1] || "";
  assert.ok(runtimeRoot, "expected bootstrap CLI to print runtime root");
  assert.notEqual(path.resolve(runtimeRoot), path.resolve(os.tmpdir()));
  assert.match(stdout, /Persistence:\s+cold start from a fresh temp runtime root/);
  assert.match(stdout, /Runtime profile:\s+full/);
  assert.match(stdout, /Active bundles:\s+bundle-core-runtime, bundle-tutorial, bundle-authoring, bundle-inspect, bundle-canvas, bundle-mcp, bundle-practical-backend, bundle-demo, bundle-eden/);
  assert.match(stdout, /Bundle counts:\s+capabilities=\d+ routes=\d+ surfaces=\d+/);
  assert.match(stdout, /Runtime diagnostics:\s+http:\/\/[^\s]+\/api\/runtime\/diagnostics/);
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

async function waitForServerUrl(readStdout, { timeoutMs = 10000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = readStdout().match(/Witness bootstrap running:\s+(http:\/\/[^\s]+)/);
    if (match) return match[1];
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for bootstrap CLI startup.\nSTDOUT:\n${readStdout()}`);
}

async function waitForJsonRpcLines(readStdout, count, { timeoutMs = 10000 } = {}) {
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

async function onceExit(child) {
  if (child.exitCode != null) return;
  await new Promise(resolve => child.once("exit", resolve));
}

async function onceExitCode(child) {
  if (child.exitCode != null) return child.exitCode;
  return new Promise(resolve => child.once("exit", code => resolve(code)));
}
