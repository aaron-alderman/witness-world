import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { parseOperatorCommand } from "../vscode-extension/src/command-parser.js";
import {
  assignOperatorAlias,
  createOperatorSession,
  resolveOperatorReference,
  setOperatorSelection
} from "../vscode-extension/src/operator-session.js";
import { buildOperatorDeepLink, parseOperatorDeepLink } from "../vscode-extension/src/deep-links.js";
import { loadOperatorWorkspaceModel } from "../vscode-extension/src/workspace-model.js";

const workspaceRoot = path.resolve(".");

test("operator command parser supports aliases, notes, and preview verbs", () => {
  assert.deepEqual(parseOperatorCommand("inspect this"), { kind: "inspect", reference: "this" });
  assert.deepEqual(parseOperatorCommand("alias a = target:server:demo_server"), {
    kind: "alias",
    name: "a",
    reference: "target:server:demo_server"
  });
  assert.deepEqual(parseOperatorCommand("preview open"), { kind: "preview", action: "open" });
  assert.deepEqual(parseOperatorCommand("note Route gap"), { kind: "note", title: "Route gap" });
});

test("deep links round-trip stable operator targets", () => {
  const link = buildOperatorDeepLink({
    extensionId: "witness-world.witness-world-operator",
    workspaceRoot,
    appManifestPath: path.join(workspaceRoot, "examples", "demo-todo-app", "app.wtoml"),
    reference: "target:desktop:demo_todo_desktop"
  });
  assert.deepEqual(parseOperatorDeepLink(link), {
    workspaceRoot,
    appManifestPath: path.join(workspaceRoot, "examples", "demo-todo-app", "app.wtoml"),
    reference: "target:desktop:demo_todo_desktop"
  });
});

test("operator session resolves this and aliases against the workspace index", async () => {
  const model = await loadOperatorWorkspaceModel({
    workspaceRoot,
    appManifestPath: path.join(workspaceRoot, "examples", "demo-todo-app", "app.wtoml")
  });
  const desktopNode = model.index.byReference.get("target:desktop:demo_todo_desktop");
  assert.ok(desktopNode);
  let session = createOperatorSession();
  session = setOperatorSelection(session, desktopNode);
  assert.equal(resolveOperatorReference(session, model, "this")?.reference, desktopNode.reference);
  session = assignOperatorAlias(session, "desk", desktopNode);
  assert.equal(resolveOperatorReference(session, model, "desk")?.reference, desktopNode.reference);
});

test("workspace model loads app structure and source-first operator nodes", async () => {
  const model = await loadOperatorWorkspaceModel({
    workspaceRoot,
    appManifestPath: path.join(workspaceRoot, "examples", "demo-todo-app", "app.wtoml")
  });
  assert.equal(model.appId, "demo_todo_app");
  assert.equal(model.targets.desktop.some(row => row.id === "demo_todo_desktop"), true);
  assert.equal(model.docs.some(group => group.kind === "app"), true);
  assert.equal(model.sources.some(group => group.kind === "wtoml"), true);
});
