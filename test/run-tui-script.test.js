import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { runTuiLauncher, shouldFallbackToShell } from "../scripts/run-tui.mjs";

function mockChild({ code = 0, stdout = "", stderr = "" } = {}) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", stdout);
    if (stderr) child.stderr.emit("data", stderr);
    child.emit("exit", code);
  });
  return child;
}

test("shouldFallbackToShell detects missing node:sqlite in rich workbench output", () => {
  assert.equal(shouldFallbackToShell({
    code: 1,
    output: "App threw an error during load\nError [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite"
  }), true);
  assert.equal(shouldFallbackToShell({ code: 0, output: "" }), false);
  assert.equal(shouldFallbackToShell({ code: 1, output: "some other failure" }), false);
});

test("runTuiLauncher falls back to raw shell when the rich host cannot load node:sqlite", async () => {
  const calls = [];
  const writes = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (calls.length === 1) {
      return mockChild({
        code: 1,
        stderr: "App threw an error during load\nError [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite\n"
      });
    }
    return mockChild({ code: 0 });
  };

  const code = await runTuiLauncher({
    args: ["examples/demo/app.wtoml"],
    cwd: "C:/repo",
    env: { TEST: "1" },
    spawnImpl,
    nodeExecutable: "node",
    stdout: { write() {} },
    stderr: { write(value) { writes.push(String(value)); } }
  });

  assert.equal(code, 0);
  assert.deepEqual(calls.map(call => call.args), [
    ["src/cli.js", "operator", "examples/demo/app.wtoml"],
    ["src/cli.js", "tui", "examples/demo/app.wtoml"]
  ]);
  assert.equal(writes.some(value => value.includes("falling back to raw shell TUI")), true);
});

test("runTuiLauncher falls back even when the rich host prints node:sqlite failure and hangs", async () => {
  const calls = [];
  const writes = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "taskkill") {
      return mockChild({ code: 0 });
    }
    if (calls.filter(call => call.command === "node").length === 1) {
      const child = new EventEmitter();
      child.pid = 4242;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stderr.emit("data", "App threw an error during load\nError [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite\n");
      });
      return child;
    }
    return mockChild({ code: 0 });
  };

  const code = await runTuiLauncher({
    args: [],
    cwd: "C:/repo",
    env: {},
    spawnImpl,
    nodeExecutable: "node",
    stdout: { write() {} },
    stderr: { write(value) { writes.push(String(value)); } }
  });

  assert.equal(code, 0);
  assert.equal(calls.some(call => call.command === "taskkill"), true);
  assert.equal(calls.filter(call => call.command === "node").length, 2);
  assert.equal(writes.some(value => value.includes("falling back to raw shell TUI")), true);
});

test("runTuiLauncher returns the rich host exit code when no sqlite fallback is needed", async () => {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    return mockChild({ code: 0, stdout: "ok\n" });
  };

  const code = await runTuiLauncher({
    args: [],
    cwd: "C:/repo",
    env: {},
    spawnImpl,
    nodeExecutable: "node",
    stdout: { write() {} },
    stderr: { write() {} }
  });

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ["src/cli.js", "operator"]);
});
