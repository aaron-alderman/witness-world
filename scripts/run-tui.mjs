import { spawn } from "node:child_process";

function directModuleExecution() {
  return process.argv[1] && process.argv[1].endsWith("run-tui.mjs");
}

export function shouldFallbackToShell({ code = 0, output = "" } = {}) {
  const text = String(output || "");
  return (
    text.includes("ERR_UNKNOWN_BUILTIN_MODULE")
    && text.includes("node:sqlite")
  ) || text.includes("No such built-in module: node:sqlite");
}

function pipeIfPresent(stream, target, chunks, onText = null) {
  stream?.on?.("data", chunk => {
    const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    chunks.push(text);
    target?.write?.(text);
    onText?.(text);
  });
}

async function terminateProcessTree(spawnImpl, child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    await new Promise(resolve => {
      const killer = spawnImpl("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore"
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }
  try {
    child.kill("SIGTERM");
  } catch {}
}

function spawnCaptured(spawnImpl, command, args, {
  cwd,
  env,
  stdout = null,
  stderr = null,
  fallbackMatcher = null
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: ["inherit", "pipe", "pipe"]
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let fallbackTriggered = false;
    const finalize = payload => {
      if (settled) return;
      settled = true;
      resolve(payload);
    };
    const maybeFallback = async () => {
      if (fallbackTriggered || !fallbackMatcher) return;
      const output = `${stdoutChunks.join("")}\n${stderrChunks.join("")}`;
      if (!fallbackMatcher({ output })) return;
      fallbackTriggered = true;
      await terminateProcessTree(spawnImpl, child);
      finalize({
        code: 1,
        output,
        fallbackTriggered: true
      });
    };
    pipeIfPresent(child.stdout, stdout, stdoutChunks, () => {
      void maybeFallback();
    });
    pipeIfPresent(child.stderr, stderr, stderrChunks, () => {
      void maybeFallback();
    });
    child.once("error", reject);
    child.once("exit", code => {
      finalize({
        code: code ?? 0,
        output: `${stdoutChunks.join("")}\n${stderrChunks.join("")}`,
        fallbackTriggered
      });
    });
  });
}

function spawnInherited(spawnImpl, command, args, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", code => resolve(code ?? 0));
  });
}

export async function runTuiLauncher({
  args = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  stdout = process.stdout,
  stderr = process.stderr,
  nodeExecutable = process.execPath
} = {}) {
  const rich = await spawnCaptured(
    spawnImpl,
    nodeExecutable,
    ["src/cli.js", "operator", ...args],
    {
      cwd,
      env,
      stdout: null,
      stderr: null,
      fallbackMatcher: ({ output }) => shouldFallbackToShell({ output })
    }
  );
  if (!shouldFallbackToShell(rich)) {
    if (rich.code !== 0 && rich.output.trim()) stderr?.write?.(rich.output);
    return rich.code;
  }
  stderr?.write?.("\n[operator workbench unavailable: Electron runtime does not support node:sqlite; falling back to raw shell TUI]\n");
  return spawnInherited(
    spawnImpl,
    nodeExecutable,
    ["src/cli.js", "tui", ...args],
    { cwd, env }
  );
}

if (directModuleExecution()) {
  runTuiLauncher().then(
    code => process.exit(code ?? 0),
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  );
}
