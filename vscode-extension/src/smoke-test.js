import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_COMMANDS = Object.freeze([
  "witnessWorld.refreshWorkspace",
  "witnessWorld.selectAppProject",
  "witnessWorld.runOperatorCommand",
  "witnessWorld.startPreviewRuntime",
  "witnessWorld.stopPreviewRuntime",
  "witnessWorld.openPreviewRuntime"
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeResult(resultFile, payload) {
  if (!resultFile) return;
  await fs.mkdir(path.dirname(resultFile), { recursive: true });
  await fs.writeFile(resultFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function quitWorkbench(vscode) {
  try {
    await vscode.commands.executeCommand("workbench.action.quit");
  } catch {
    // Ignore quit failures in automation; the outer runner will kill the process tree.
  }
}

export async function runRepoLocalSmokeTest({ controller, vscode, resultFile }) {
  const output = [];
  const record = message => {
    output.push(message);
    controller.log(`[smoke] ${message}`);
  };

  const summary = {
    status: "failed",
    appId: null,
    commandsChecked: [],
    rootItems: [],
    previewUrl: null,
    selectionReference: null,
    aliasReference: null,
    activeEditor: null,
    output
  };

  try {
    record("starting repo-local smoke test");
    const commandIds = new Set(await vscode.commands.getCommands(true));
    for (const id of REQUIRED_COMMANDS) {
      assert(commandIds.has(id), `missing command registration: ${id}`);
      summary.commandsChecked.push(id);
    }

    record("selecting demo app project");
    await controller.selectAppProject({
      preferredPath: process.env.WITNESS_WORLD_SMOKE_APP || "examples/demo-todo-app/app.wtoml"
    });

    assert(controller.model?.appId === "demo_todo_app", `unexpected app id: ${controller.model?.appId || "(missing)"}`);
    summary.appId = controller.model.appId;
    record(`workspace model ready for ${summary.appId}`);

    const rootItems = controller.buildRootItems();
    summary.rootItems = rootItems.map(item => String(item.label));
    assert(summary.rootItems.includes("Session"), "missing Session root item");
    assert(summary.rootItems.includes("Targets"), "missing Targets root item");
    assert(summary.rootItems.includes("Objects"), "missing Objects root item");
    assert(summary.rootItems.includes("Sources"), "missing Sources root item");

    record("selecting desktop target");
    await controller.executeOperatorCommand({
      kind: "select",
      reference: "target:desktop:demo_todo_desktop"
    });
    summary.selectionReference = controller.session.selectionReference;
    assert(summary.selectionReference === "target:desktop:demo_todo_desktop", "selection did not update this");

    record("assigning desk alias");
    await controller.executeOperatorCommand({
      kind: "alias",
      name: "desk",
      reference: "target:desktop:demo_todo_desktop"
    });
    summary.aliasReference = controller.resolveReference("desk")?.reference ?? null;
    assert(summary.aliasReference === "target:desktop:demo_todo_desktop", "alias resolution failed");

    record("opening selected source");
    await controller.openTreeItem(controller.resolveReference("desk"));
    summary.activeEditor = vscode.window.activeTextEditor?.document?.uri?.fsPath ?? null;
    assert(summary.activeEditor && summary.activeEditor.endsWith(path.join("examples", "demo-todo-app", "app.wtoml")), "inspect did not open the selected source file");

    record("starting preview runtime");
    await controller.startPreviewRuntime({ quiet: true });
    const runtimeStatus = controller.runtime.getStatus();
    summary.previewUrl = runtimeStatus.url;
    assert(typeof summary.previewUrl === "string" && summary.previewUrl.startsWith("http"), "preview runtime did not expose a URL");
    record(`preview runtime ready at ${summary.previewUrl}`);
    await controller.stopPreviewRuntime({ quiet: true });
    assert(controller.runtime.getStatus().running === false, "preview runtime did not stop cleanly");
    record("preview runtime stopped");

    summary.status = "passed";
    await writeResult(resultFile, summary);
    await quitWorkbench(vscode);
  } catch (error) {
    const failure = {
      ...summary,
      status: "failed",
      error: error instanceof Error ? error.message : String(error)
    };
    await writeResult(resultFile, failure);
    await quitWorkbench(vscode);
    throw error;
  }
}
