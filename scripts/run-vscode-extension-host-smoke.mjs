import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(path.join(import.meta.dirname, ".."));
const extensionPath = path.join(repoRoot, "vscode-extension");
const workspacePath = repoRoot;
const codeCliPath = process.env.WITNESS_WORLD_VSCODE_CLI
  || path.join(process.env.LOCALAPPDATA || "", "Programs", "Microsoft VS Code", "bin", "code.cmd");

async function exists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResult(resultPath, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await exists(resultPath)) {
      const text = await fs.readFile(resultPath, "utf8");
      return JSON.parse(text);
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for smoke result: ${resultPath}`);
}

async function terminateProcessTree(pid) {
  await new Promise(resolve => {
    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore"
    });
    killer.once("exit", () => resolve());
    killer.once("error", () => resolve());
  });
}

async function main() {
  if (!(await exists(codeCliPath))) {
    throw new Error(`VS Code CLI not found: ${codeCliPath}`);
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "witness-vscode-smoke-"));
  const resultPath = path.join(tempRoot, "result.json");
  const userDataDir = path.join(tempRoot, "user-data");
  const extensionsDir = path.join(tempRoot, "extensions");
  const logs = [];

  const psCommand = `& '${codeCliPath.replace(/'/g, "''")}' --new-window --user-data-dir '${userDataDir.replace(/'/g, "''")}' --extensions-dir '${extensionsDir.replace(/'/g, "''")}' --extensionDevelopmentPath '${extensionPath.replace(/'/g, "''")}' '${workspacePath.replace(/'/g, "''")}'`;

  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-Command",
    psCommand
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      WITNESS_WORLD_SMOKE_TEST: "1",
      WITNESS_WORLD_SMOKE_RESULT_FILE: resultPath,
      WITNESS_WORLD_SMOKE_APP: "examples/demo-todo-app/app.wtoml",
      WITNESS_WORLD_OPERATOR_PREVIEW_PORT: "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", chunk => logs.push(chunk.toString()));
  child.stderr?.on("data", chunk => logs.push(chunk.toString()));
  const exitState = { code: null, signal: null };
  child.once("exit", (code, signal) => {
    exitState.code = code;
    exitState.signal = signal;
  });

  try {
    const result = await waitForResult(resultPath, 90000);
    if (result?.status !== "passed") {
      throw new Error(`VS Code smoke failed:\n${JSON.stringify(result, null, 2)}`);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return { tempRoot, logs, exitState };
  } catch (error) {
    const debug = {
      tempRoot,
      exitState,
      logs: logs.join("")
    };
    console.error(JSON.stringify(debug, null, 2));
    throw error;
  } finally {
    if (!child.killed) await terminateProcessTree(child.pid);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  if (error?.stack) console.error(error.stack);
  process.exit(1);
});
