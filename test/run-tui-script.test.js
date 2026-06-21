import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { pathToFileURL } from "node:url";
import path from "node:path";

function mockChild({ code = 0 } = {}) {
  const child = new EventEmitter();
  queueMicrotask(() => child.emit("exit", code));
  return child;
}

test("operator example launcher boots Electron against the plugin-owned workbench entry script", async () => {
  const calls = [];
  const electronModuleUrl = pathToFileURL(path.resolve("scripts", "run-operator-workbench.mjs")).href;
  const desktopCliUrl = pathToFileURL(path.resolve("src", "desktop-cli.js")).href;
  const { launchDesktopProcess } = await import(desktopCliUrl);

  const code = await launchDesktopProcess({
    args: [
      path.resolve("examples", "operator"),
      "--runtime-plugin",
      "plugin.operator-workbench"
    ],
    cwd: "C:/repo",
    env: { TEST: "1" },
    spawnImpl(command, args, options) {
      calls.push({ command, args, options });
      return mockChild({ code: 0 });
    },
    loadElectronModule: async () => ({ default: "electron" }),
    entryScript: path.resolve("plugins", "operator-workbench", "workbench", "main.js")
  });

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "electron");
  assert.deepEqual(calls[0].args, [
    path.resolve("plugins", "operator-workbench", "workbench", "main.js"),
    path.resolve("examples", "operator"),
    "--runtime-plugin",
    "plugin.operator-workbench"
  ]);
});
