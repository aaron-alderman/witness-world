import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import process from "node:process";

export const REPO_ROOT = process.cwd();
export const LIVE_CORE_FIXTURE_ROOT = path.join(REPO_ROOT, "test", "fixtures", "live-core-app");
export const WITNESS_CORE_MANIFEST = path.join(REPO_ROOT, "substrate", "Cargo.toml");
export const WITNESS_CORE_BINARY = path.join(
  REPO_ROOT,
  "substrate",
  "target",
  "debug",
  process.platform === "win32" ? "witness-core.exe" : "witness-core"
);

let witnessCoreBuildPromise = null;

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function ensureWitnessCoreBuilt() {
  if (!witnessCoreBuildPromise) {
    witnessCoreBuildPromise = new Promise((resolve, reject) => {
      const child = spawn("cargo", ["build", "--manifest-path", WITNESS_CORE_MANIFEST, "-p", "witness-core"], {
        cwd: REPO_ROOT,
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stdout.on("data", chunk => {
        output += String(chunk);
      });
      child.stderr.on("data", chunk => {
        output += String(chunk);
      });
      child.once("error", reject);
      child.once("exit", code => {
        if (code === 0) {
          resolve(WITNESS_CORE_BINARY);
          return;
        }
        reject(new Error(`cargo build witness-core failed (${code ?? "unknown"})\n${output}`));
      });
    });
  }
  return witnessCoreBuildPromise;
}

export async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(error => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

function tomlString(value) {
  return JSON.stringify(String(value ?? ""));
}

function serializeRuntimeConfigEntries(entries = null) {
  if (!entries || typeof entries !== "object") return "";
  const rows = Object.entries(entries)
    .filter(([key]) => typeof key === "string" && key.trim())
    .map(([key, value]) => {
      if (typeof value === "boolean") return `${JSON.stringify(key)} = ${value ? "true" : "false"}`;
      if (typeof value === "number" && Number.isFinite(value)) return `${JSON.stringify(key)} = ${value}`;
      return `${JSON.stringify(key)} = ${tomlString(value)}`;
    });
  return rows.length ? `runtimeConfig = { ${rows.join(", ")} }\n` : "";
}

export async function createLiveCoreWorkspace({
  fixtureRoot = LIVE_CORE_FIXTURE_ROOT,
  proofDelayMs = 1000,
  supervise = null,
  runtimeConfig = null,
  frontdoor = null,
  buildWorker = null,
  transaction = null
} = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-core-fixture-"));
  const appDirName = path.basename(fixtureRoot);
  const appRoot = path.join(tempRoot, appDirName);
  const manifestPath = path.join(appRoot, "app.wtoml");
  const watchedSourcePath = path.join(appRoot, "app", "content.wtoml");
  const proofScriptPath = path.join(tempRoot, "proof-check.mjs");
  const configPath = path.join(tempRoot, "witness-core.toml");
  const journalPath = path.join(tempRoot, ".witness-core", "events.jsonl");
  await fs.cp(fixtureRoot, appRoot, { recursive: true });
  if (runtimeConfig && typeof runtimeConfig === "object") {
    const manifestText = await fs.readFile(manifestPath, "utf8");
    const runtimeConfigLine = serializeRuntimeConfigEntries(runtimeConfig);
    await fs.writeFile(
      manifestPath,
      manifestText.replace("allowActorHeader = false\n", `allowActorHeader = false\n${runtimeConfigLine}`),
      "utf8"
    );
  }
  const superviseConfig = typeof supervise === "function"
    ? supervise({ tempRoot, appRoot, appDirName, manifestPath, watchedSourcePath, configPath, journalPath })
    : supervise;
  const frontdoorConfig = typeof frontdoor === "function"
    ? frontdoor({ tempRoot, appRoot, appDirName, manifestPath, watchedSourcePath, configPath, journalPath })
    : frontdoor;
  const buildWorkerConfig = typeof buildWorker === "function"
    ? buildWorker({ tempRoot, appRoot, appDirName, manifestPath, watchedSourcePath, configPath, journalPath })
    : buildWorker;
  const transactionConfig = typeof transaction === "function"
    ? transaction({ tempRoot, appRoot, appDirName, manifestPath, watchedSourcePath, configPath, journalPath })
    : transaction;

  const proofCommand = `${process.execPath} proof-check.mjs`;
  await fs.writeFile(proofScriptPath, `
import fs from "node:fs/promises";
import path from "node:path";

await new Promise(resolve => setTimeout(resolve, ${Number(proofDelayMs)}));
const target = path.join(process.cwd(), ${JSON.stringify(appDirName)}, "app", "content.wtoml");
const text = await fs.readFile(target, "utf8");
if (text.includes("FAIL_PROOF_TOKEN")) process.exit(1);
process.exit(0);
`.trimStart(), "utf8");
  const superviseToml = superviseConfig ? `

[supervise]
command = ${tomlString(superviseConfig.command)}
working_dir = ${tomlString(superviseConfig.workingDir ?? ".")}
restart_on_exit = ${superviseConfig.restartOnExit === false ? "false" : "true"}
${superviseConfig.healthUrl ? `health_url = ${tomlString(superviseConfig.healthUrl)}\n` : ""}${superviseConfig.reloadUrl ? `reload_url = ${tomlString(superviseConfig.reloadUrl)}\n` : ""}${Number.isFinite(superviseConfig.healthIntervalMs) ? `health_interval_ms = ${Number(superviseConfig.healthIntervalMs)}\n` : ""}${Number.isFinite(superviseConfig.healthTimeoutMs) ? `health_timeout_ms = ${Number(superviseConfig.healthTimeoutMs)}\n` : ""}${superviseConfig.restartOnUnhealthy === true ? "restart_on_unhealthy = true\n" : superviseConfig.restartOnUnhealthy === false ? "restart_on_unhealthy = false\n" : ""}${Number.isFinite(superviseConfig.degradedGracePolls) ? `degraded_grace_polls = ${Number(superviseConfig.degradedGracePolls)}\n` : ""}${Number.isFinite(superviseConfig.unhealthyGracePolls) ? `unhealthy_grace_polls = ${Number(superviseConfig.unhealthyGracePolls)}\n` : ""}` : "";
  const buildWorkerToml = buildWorkerConfig ? `

[build_worker]
command = ${tomlString(buildWorkerConfig.command)}
${buildWorkerConfig.workingDir ? `working_dir = ${tomlString(buildWorkerConfig.workingDir)}\n` : ""}` : "";
  const transactionToml = transactionConfig ? `

[transaction]
${Number.isFinite(transactionConfig.buildTimeoutMs) ? `build_timeout_ms = ${Number(transactionConfig.buildTimeoutMs)}\n` : ""}${transactionConfig.stageRoot ? `stage_root = ${tomlString(transactionConfig.stageRoot)}\n` : ""}` : "";
  const frontdoorToml = frontdoorConfig ? `

[frontdoor]
public_addr = ${tomlString(frontdoorConfig.publicAddr)}
${Number.isFinite(frontdoorConfig.drainTimeoutMs) ? `drain_timeout_ms = ${Number(frontdoorConfig.drainTimeoutMs)}\n` : ""}${Number.isFinite(frontdoorConfig.startupCutoverTimeoutMs) ? `startup_cutover_timeout_ms = ${Number(frontdoorConfig.startupCutoverTimeoutMs)}\n` : ""}` : "";

  await fs.writeFile(configPath, `
[watch]
roots = [${tomlString(appDirName)}]
ignore = ["node_modules", "target", ".git", ".witness-core"]

[proof]
fast = ${tomlString(proofCommand)}
slow_ms = 250

[package]
include = [${tomlString(`${appDirName}/**`)}]
${superviseToml}${buildWorkerToml}${transactionToml}${frontdoorToml}
`.trimStart(), "utf8");

  return {
    tempRoot,
    appRoot,
    appDirName,
    manifestPath,
    watchedSourcePath,
    servedRoutePath: "/live-core",
    proofScriptPath,
    configPath,
    journalPath,
    async cleanup() {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        try {
          await delay(100);
          await fs.rm(tempRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
          return;
        } catch (error) {
          if (!["EBUSY", "EPERM"].includes(error?.code)) throw error;
        }
      }
      // Windows can keep watch roots busy briefly after child shutdown. The
      // fixture workspaces are unique temp directories, so best-effort cleanup
      // is sufficient when the OS still holds the handle.
    }
  };
}

export async function startWitnessCoreProcess({ cwd, configPath, port }) {
  const binaryPath = await ensureWitnessCoreBuilt();
  const logs = [];
  const child = spawn(binaryPath, ["--config", configPath, "--addr", `127.0.0.1:${port}`], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => {
    logs.push(String(chunk));
  });
  child.stderr.on("data", chunk => {
    logs.push(String(chunk));
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForWitnessCoreHealth(url, { logs });
  return {
    child,
    url,
    logs,
    async stop() {
      if (child.exitCode != null) return;
      if (process.platform === "win32") {
        await new Promise(resolve => {
          const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore"
          });
          killer.once("exit", () => resolve());
          killer.once("error", () => resolve());
        });
      } else {
        child.kill("SIGTERM");
      }
      await new Promise(resolve => {
        child.once("exit", () => resolve());
        setTimeout(resolve, 5000).unref?.();
      });
    }
  };
}

export async function waitForWitnessCoreHealth(coreUrl, { timeoutMs = 20000, logs = [] } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${coreUrl}/health`, { cache: "no-store" });
      if (response.ok) return await response.json();
    } catch {}
    await delay(100);
  }
  throw new Error(`witness-core did not become healthy at ${coreUrl}\n${logs.join("")}`);
}

export async function readWitnessCoreHealth(coreUrl) {
  const response = await fetch(`${coreUrl}/health`, { cache: "no-store" });
  assert.equal(response.status, 200);
  return await response.json();
}

export async function waitForWitnessCoreHealthState(coreUrl, predicate, {
  timeoutMs = 20000,
  description = "witness core health condition"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    try {
      last = await readWitnessCoreHealth(coreUrl);
      if (await predicate(last)) return last;
    } catch {}
    await delay(100);
  }
  assert.fail(`${description} not met\n${JSON.stringify(last, null, 2)}`);
}

export async function readWitnessCoreStatus(coreUrl) {
  const response = await fetch(`${coreUrl}/generations`, { cache: "no-store" });
  assert.equal(response.status, 200);
  return await response.json();
}

export async function killPid(pid) {
  assert.equal(Number.isInteger(pid), true, `expected integer pid, got ${pid}`);
  await new Promise((resolve, reject) => {
    const child = process.platform === "win32"
      ? spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: ["ignore", "pipe", "pipe"] })
      : spawn("kill", ["-TERM", String(pid)], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", chunk => {
      output += String(chunk);
    });
    child.stderr.on("data", chunk => {
      output += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) resolve();
      else reject(new Error(`failed to kill pid ${pid} (exit ${code ?? "unknown"})\n${output}`));
    });
  });
}

export async function waitForWitnessCoreStatus(coreUrl, predicate, {
  timeoutMs = 20000,
  description = "witness core status condition"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readWitnessCoreStatus(coreUrl);
    if (await predicate(last)) return last;
    await delay(150);
  }
  assert.fail(`${description} not met\n${JSON.stringify(last, null, 2)}`);
}

export async function waitForJournalPattern(journalPath, pattern, {
  timeoutMs = 20000,
  description = "journal pattern"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    try {
      last = await fs.readFile(journalPath, "utf8");
      if (pattern.test(last)) return last;
    } catch {}
    await delay(100);
  }
  assert.fail(`${description} not found in ${journalPath}\n${last}`);
}

export async function replaceFileText(filePath, fromText, toText) {
  const current = await fs.readFile(filePath, "utf8");
  assert.equal(current.includes(fromText), true, `expected ${filePath} to contain ${fromText}`);
  const next = current.replace(fromText, toText);
  assert.notEqual(next, current, `expected replacement to change ${filePath}`);
  await fs.writeFile(filePath, next, "utf8");
}

export async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  assert.equal(response.status, 200);
  return await response.text();
}

export async function waitForText(url, predicate, {
  timeoutMs = 20000,
  description = "text condition"
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = await fetchText(url);
    if (await predicate(last)) return last;
    await delay(150);
  }
  assert.fail(`${description} not met for ${url}\n${last}`);
}
