import assert from "node:assert/strict";
import test from "node:test";
import { AppSnapshotManager } from "../src/app-snapshot-manager.js";

function createManager(fsModule) {
  const manager = new AppSnapshotManager({
    manifestPath: "C:/tmp/app.wtoml",
    appRoot: "C:/tmp",
    runtimeProfile: "full",
    devMode: true,
    logger: null,
    fsModule
  });
  manager.activeSnapshot = {
    sourceIndex: [
      {
        filePath: "C:/tmp/app/shell.rvm",
        sourceLanguage: "rvm",
        contentHash: "abc",
        mtimeMs: 10,
        size: 100
      }
    ]
  };
  return manager;
}

test("AppSnapshotManager.detectChangedPaths uses file stat data rather than re-reading source contents", async () => {
  let readFileCalls = 0;
  let statCalls = 0;
  const manager = createManager({
    async readFile() {
      readFileCalls += 1;
      throw new Error("detectChangedPaths should not read file contents");
    },
    async stat() {
      statCalls += 1;
      return { mtimeMs: 10, size: 100 };
    }
  });

  const changed = await manager.detectChangedPaths();

  assert.deepEqual([...changed], []);
  assert.equal(statCalls, 1);
  assert.equal(readFileCalls, 0);
});

test("AppSnapshotManager.detectChangedPaths marks files dirty when stat metadata changes", async () => {
  const manager = createManager({
    async stat() {
      return { mtimeMs: 11, size: 100 };
    }
  });

  const changed = await manager.detectChangedPaths();

  assert.deepEqual([...changed], ["C:/tmp/app/shell.rvm"]);
});
