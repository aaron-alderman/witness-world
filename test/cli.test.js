import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

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

  assert.equal(stderr.trim(), "");
  assert.match(stdout, /Runtime root:\s+/);
  const runtimeRoot = stdout.match(/Runtime root:\s+([^\r\n]+)/)?.[1] || "";
  assert.ok(runtimeRoot, "expected bootstrap CLI to print runtime root");
  assert.notEqual(path.resolve(runtimeRoot), path.resolve(os.tmpdir()));
  assert.match(stdout, /Persistence:\s+cold start from a fresh temp runtime root/);
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

async function onceExit(child) {
  if (child.exitCode != null) return;
  await new Promise(resolve => child.once("exit", resolve));
}
