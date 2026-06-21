import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import test from "node:test";

const runnerPath = path.join(process.cwd(), "test", "support", "live-core-smoke-runner.mjs");

async function runScenario(name, { timeoutMs = 180000 } = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath, name], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`live-core smoke scenario timed out: ${name}\n${output}`));
    }, timeoutMs);
    child.stdout.on("data", chunk => {
      output += String(chunk);
    });
    child.stderr.on("data", chunk => {
      output += String(chunk);
    });
    child.once("error", error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`live-core smoke scenario failed: ${name} (exit ${code ?? "unknown"})\n${output}`));
    });
  });
}

test("witness-core fixture continuity smoke proves pass, promote, failover, rollback, and restart persistence without Sourcery", { timeout: 240000 }, async () => {
  await runScenario("continuity", { timeoutMs: 220000 });
  assert.ok(true);
});

test("preview session edits publish witness-core generations and remain scoped behind previewSessionId on the fixture app", { timeout: 240000 }, async () => {
  await runScenario("preview", { timeoutMs: 220000 });
  assert.ok(true);
});

test("published app source writes flow through witness-core capability journaling and update the live fixture", { timeout: 180000 }, async () => {
  await runScenario("published-authoring", { timeoutMs: 160000 });
  assert.ok(true);
});

test("witness-core supervised fixture smoke proves process readiness, restart, generation continuity, and restart persistence", { timeout: 300000 }, async () => {
  await runScenario("supervised", { timeoutMs: 280000 });
  assert.ok(true);
});

test("witness-core supervised health containment smoke proves policy-triggered stable failover and restart", { timeout: 300000 }, async () => {
  await runScenario("supervised-health", { timeoutMs: 280000 });
  assert.ok(true);
});

test("witness-core frontdoor smoke proves rolling cutover, draining, and preview continuity through the Rust public port", { timeout: 300000 }, async () => {
  await runScenario("frontdoor", { timeoutMs: 280000 });
  assert.ok(true);
});

test("witness-core supervised MCP smoke proves HTTP MCP serving works through the Rust frontdoor with zero Node port binding", { timeout: 300000 }, async () => {
  await runScenario("supervised-mcp", { timeoutMs: 280000 });
  assert.ok(true);
});

test("witness-core soak smoke records durable telemetry across preview churn, restart, failover, recovery, and core restart", { timeout: 360000 }, async () => {
  await runScenario("soak", { timeoutMs: 340000 });
  assert.ok(true);
});
