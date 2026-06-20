import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildOperatorTuiState,
  buildOperatorWorkbenchSnapshot,
  createOperatorTuiEngine,
  loadOperatorTuiRuntimeContext
} from "../src/operator-tui.js";
import { sanitizeOperatorWorkbenchSnapshot } from "../examples/operator/browser/operator-snapshot-adapter.js";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleRoot = path.join(workspaceRoot, "examples", "operator");
const browserRoot = path.join(exampleRoot, "browser");
const fixturePath = path.join(browserRoot, "operator.snapshot.json");

export async function generateOperatorBrowserSnapshotFixture({
  appPath = exampleRoot,
  outputPath = fixturePath
} = {}) {
  const runtimeContext = await loadOperatorTuiRuntimeContext({
    appPath,
    runtimePluginIds: ["plugin.operator-workbench"],
    cwd: workspaceRoot
  });
  try {
    const state = await buildOperatorTuiState(runtimeContext);
    const engine = createOperatorTuiEngine(state);
    const snapshot = await buildOperatorWorkbenchSnapshot(state, engine.session, {});
    const sanitized = sanitizeOperatorWorkbenchSnapshot(snapshot);
    await fs.writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
    return { outputPath, snapshot: sanitized };
  } finally {
    await runtimeContext.close?.();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await generateOperatorBrowserSnapshotFixture();
  console.log(`Wrote ${path.relative(workspaceRoot, result.outputPath)}`);
}
