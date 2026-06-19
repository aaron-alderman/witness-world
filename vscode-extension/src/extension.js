import fs from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { parseOperatorCommand } from "./command-parser.js";
import { buildOperatorDeepLink, parseOperatorDeepLink } from "./deep-links.js";
import {
  assignOperatorAlias,
  createOperatorSession,
  resolveOperatorReference,
  setOperatorSelection
} from "./operator-session.js";
import { RuntimeLauncher } from "./runtime-launcher.js";
import {
  createNoteArtifact,
  createProcessBlockArtifact
} from "./workspace-artifacts.js";
import { runRepoLocalSmokeTest } from "./smoke-test.js";
import {
  discoverAppManifestPaths,
  loadOperatorWorkspaceModel
} from "./workspace-model.js";

const EXTENSION_ID = "witness-world.witness-world-operator";
const STATE_KEY = "witnessWorld.operatorState";

function workspaceFolderRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

async function exists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function labelForPath(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).replace(/\\/g, "/");
}

function isAuthoredFile(fileName) {
  return [".wtoml", ".rvm", ".wcss", ".wwop", ".md"].includes(path.extname(fileName).toLowerCase());
}

function iconForNode(node) {
  const name = node?.kind === "target"
    ? "symbol-method"
    : node?.kind === "source"
      ? "file-code"
      : node?.kind === "note"
        ? "note"
        : node?.kind === "process"
          ? "terminal"
          : "symbol-object";
  return new vscode.ThemeIcon(name);
}

class WitnessTreeItem extends vscode.TreeItem {
  constructor({
    id,
    label,
    description = "",
    tooltip = "",
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    contextValue = "node",
    node = null
  }) {
    super(label, collapsibleState);
    this.id = id;
    this.description = description;
    this.tooltip = tooltip || label;
    this.contextValue = contextValue;
    this.node = node;
  }
}

class WitnessTreeProvider {
  constructor(controller) {
    this.controller = controller;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (!element) return this.controller.buildRootItems();
    return this.controller.buildChildrenForItem(element);
  }
}

class WitnessOperatorController {
  constructor(context) {
    this.context = context;
    this.output = vscode.window.createOutputChannel("Witness World Operator");
    this.repoRoot = path.resolve(context.extensionUri.fsPath, "..");
    this.tree = new WitnessTreeProvider(this);
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.statusBar.command = "witnessWorld.runOperatorCommand";
    this.session = createOperatorSession(context.workspaceState.get(STATE_KEY));
    this.model = null;
    this.selectedAppManifestPath = context.workspaceState.get(STATE_KEY)?.selectedAppManifestPath ?? null;
    this.runtime = new RuntimeLauncher({
      repoRoot: this.repoRoot,
      writeOutput: line => this.output.appendLine(line),
      onChange: () => {
        this.tree.refresh();
        this.updateStatusBar();
      }
    });
  }

  log(message) {
    this.output.appendLine(message);
  }

  async activate() {
    this.log("Witness World Operator activated as a repo-local development client.");
    this.log(`Repo root: ${this.repoRoot}`);
    this.statusBar.show();
    this.context.subscriptions.push(
      this.output,
      this.statusBar,
      vscode.window.registerTreeDataProvider("witnessWorld.operatorView", this.tree),
      vscode.window.registerUriHandler({
        handleUri: uri => this.openDeepLink(uri)
      }),
      vscode.commands.registerCommand("witnessWorld.refreshWorkspace", () => this.refreshWorkspace()),
      vscode.commands.registerCommand("witnessWorld.selectAppProject", () => this.selectAppProject()),
      vscode.commands.registerCommand("witnessWorld.runOperatorCommand", () => this.runOperatorCommand()),
      vscode.commands.registerCommand("witnessWorld.startPreviewRuntime", () => this.startPreviewRuntime()),
      vscode.commands.registerCommand("witnessWorld.stopPreviewRuntime", () => this.stopPreviewRuntime()),
      vscode.commands.registerCommand("witnessWorld.openPreviewRuntime", () => this.openPreviewRuntime()),
      vscode.commands.registerCommand("witnessWorld.createNote", () => this.createNote()),
      vscode.commands.registerCommand("witnessWorld.createProcessBlock", () => this.createProcessBlock()),
      vscode.commands.registerCommand("witnessWorld.openNode", item => this.openTreeItem(item)),
      vscode.commands.registerCommand("witnessWorld.selectNodeAsThis", item => this.selectTreeItem(item)),
      vscode.commands.registerCommand("witnessWorld.assignAliasFromNode", item => this.assignAliasFromTreeItem(item)),
      vscode.commands.registerCommand("witnessWorld.copyDeepLink", item => this.copyDeepLink(item)),
      vscode.workspace.onDidSaveTextDocument(document => this.onDidSaveDocument(document))
    );
    await this.refreshWorkspace({ quiet: true });
  }

  async deactivate() {
    await this.runtime.dispose();
  }

  persistState() {
    return this.context.workspaceState.update(STATE_KEY, {
      selectedAppManifestPath: this.selectedAppManifestPath,
      mode: this.session.mode,
      selectionReference: this.session.selectionReference,
      aliases: this.session.aliases
    });
  }

  updateStatusBar() {
    const runtimeStatus = this.runtime.getStatus();
    const appLabel = this.model?.appId || "no app";
    const mode = this.session.mode;
    const runtime = runtimeStatus.running ? "attached" : "detached";
    const selection = this.session.selectionReference ? ` ${this.session.selectionReference}` : "";
    this.statusBar.text = `$(layers) Witness ${mode}/${runtime}: ${appLabel}${selection}`;
    this.statusBar.tooltip = runtimeStatus.url
      ? `Preview runtime: ${runtimeStatus.url}`
      : (runtimeStatus.error || "Run an operator command");
  }

  async ensureWorkspaceRoot() {
    const root = workspaceFolderRoot();
    if (!root) {
      await vscode.window.showErrorMessage("Open a workspace folder before using Witness World Operator.");
      return null;
    }
    return root;
  }

  async resolveSelectedAppManifest({ preferredPath = null, quiet = false } = {}) {
    const root = await this.ensureWorkspaceRoot();
    if (!root) return null;
    if (preferredPath) {
      const resolved = path.resolve(root, preferredPath);
      const manifestPath = path.basename(resolved) === "app.wtoml" ? resolved : path.join(resolved, "app.wtoml");
      if (!(await exists(manifestPath))) {
        if (!quiet) await vscode.window.showErrorMessage(`App manifest not found: ${manifestPath}`);
        return null;
      }
      return manifestPath;
    }
    const manifests = await discoverAppManifestPaths(root);
    if (!manifests.length) {
      const message = "No app.wtoml files were found in this workspace. This repo-local extension only works against Witness World app projects in the current repository.";
      this.log(message);
      if (!quiet) await vscode.window.showWarningMessage(message);
      return null;
    }
    if (this.selectedAppManifestPath && manifests.includes(this.selectedAppManifestPath)) return this.selectedAppManifestPath;
    if (manifests.length === 1) return manifests[0];
    const picked = await vscode.window.showQuickPick(
      manifests.map(filePath => ({
        label: labelForPath(root, filePath),
        description: filePath,
        filePath
      })),
      { placeHolder: "Select the Witness World app project to attach in VS Code." }
    );
    return picked?.filePath ?? null;
  }

  async selectAppProject({ preferredPath = null } = {}) {
    const selected = await this.resolveSelectedAppManifest({ preferredPath });
    if (!selected) return;
    this.selectedAppManifestPath = selected;
    this.log(`Selected app project: ${selected}`);
    await this.refreshWorkspace();
  }

  async refreshWorkspace({ quiet = false } = {}) {
    const root = await this.ensureWorkspaceRoot();
    if (!root) return;
    const selectedManifest = await this.resolveSelectedAppManifest({ quiet: true });
    if (!selectedManifest) {
      this.model = null;
      this.log("Workspace refresh found no app project.");
      this.tree.refresh();
      this.updateStatusBar();
      return;
    }
    this.selectedAppManifestPath = selectedManifest;
    try {
      this.log(`Loading workspace model for ${selectedManifest}`);
      this.model = await loadOperatorWorkspaceModel({
        workspaceRoot: root,
        appManifestPath: selectedManifest
      });
      this.log(`Workspace model ready for ${this.model.appId} (${this.model.appManifestPath})`);
      await this.persistState();
    } catch (error) {
      this.model = null;
      this.log(`Workspace refresh failed: ${error instanceof Error ? error.message : String(error)}`);
      if (!quiet) {
        await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
    this.tree.refresh();
    this.updateStatusBar();
  }

  buildRootItems() {
    const rootItems = [];
    rootItems.push(new WitnessTreeItem({
      id: "session",
      label: "Session",
      description: this.session.mode,
      collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
      contextValue: "group"
    }));
    if (this.model) {
      rootItems.push(new WitnessTreeItem({
        id: "targets",
        label: "Targets",
        description: `${this.model.targets.server.length + this.model.targets.mcp.length + this.model.targets.desktop.length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
      rootItems.push(new WitnessTreeItem({
        id: "docs",
        label: "Objects",
        description: `${this.model.nodes.filter(node => node.kind === "doc").length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
      rootItems.push(new WitnessTreeItem({
        id: "sources",
        label: "Sources",
        description: `${this.model.nodes.filter(node => node.kind === "source").length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
      rootItems.push(new WitnessTreeItem({
        id: "notes",
        label: "Notes",
        description: `${this.model.notes.length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
      rootItems.push(new WitnessTreeItem({
        id: "processBlocks",
        label: "Process Blocks",
        description: `${this.model.processBlocks.length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
    }
    return rootItems;
  }

  buildChildrenForItem(item) {
    if (!this.model && item.id !== "session") return [];
    if (item.id === "session") return this.buildSessionItems();
    if (item.id === "targets") return this.buildTargetGroups();
    if (item.id === "docs") return this.buildDocGroups();
    if (item.id === "sources") return this.buildSourceGroups();
    if (item.id === "notes") return this.buildArtifactItems(this.model.notes);
    if (item.id === "processBlocks") return this.buildArtifactItems(this.model.processBlocks);
    if (item.id?.startsWith("target-group:")) return this.buildTargetItems(item.id.split(":")[1]);
    if (item.id?.startsWith("doc-group:")) return this.buildNodeItems(this.model.docs.find(group => group.kind === item.id.split(":")[1])?.items || []);
    if (item.id?.startsWith("source-group:")) return this.buildNodeItems(this.model.sources.find(group => group.kind === item.id.split(":")[1])?.items || []);
    if (item.id === "session-aliases") return this.buildAliasItems();
    return [];
  }

  buildSessionItems() {
    const runtimeStatus = this.runtime.getStatus();
    const items = [
      new WitnessTreeItem({
        id: "session-app",
        label: this.model?.appId || "No app selected",
        description: this.model ? labelForPath(this.model.workspaceRoot, this.model.appManifestPath) : "",
        contextValue: "group"
      }),
      new WitnessTreeItem({
        id: "session-mode",
        label: `Mode: ${this.session.mode}`,
        description: runtimeStatus.running ? "live runtime attached" : "source-first",
        contextValue: "group"
      }),
      new WitnessTreeItem({
        id: "session-selection",
        label: `this = ${this.session.selectionReference || "unset"}`,
        contextValue: "group"
      }),
      new WitnessTreeItem({
        id: "session-runtime",
        label: runtimeStatus.running ? "Preview runtime running" : "Preview runtime stopped",
        description: runtimeStatus.url || "",
        contextValue: "group"
      }),
      new WitnessTreeItem({
        id: "session-aliases",
        label: "Aliases",
        description: `${Object.keys(this.session.aliases).length}`,
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      })
    ];
    return items;
  }

  buildAliasItems() {
    return Object.entries(this.session.aliases)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([alias, reference]) => new WitnessTreeItem({
        id: `alias:${alias}`,
        label: alias,
        description: reference,
        contextValue: "group"
      }));
  }

  buildTargetGroups() {
    return [
      ["server", this.model.targets.server.length],
      ["mcp", this.model.targets.mcp.length],
      ["desktop", this.model.targets.desktop.length]
    ]
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => new WitnessTreeItem({
        id: `target-group:${kind}`,
        label: kind,
        description: String(count),
        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
        contextValue: "group"
      }));
  }

  buildTargetItems(kind) {
    const items = this.model.nodes.filter(node => node.kind === "target" && node.subtype === kind);
    return this.buildNodeItems(items);
  }

  buildDocGroups() {
    return this.model.docs.map(group => new WitnessTreeItem({
      id: `doc-group:${group.kind}`,
      label: group.kind,
      description: String(group.items.length),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: "group"
    }));
  }

  buildSourceGroups() {
    return this.model.sources.map(group => new WitnessTreeItem({
      id: `source-group:${group.kind}`,
      label: group.kind,
      description: String(group.items.length),
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      contextValue: "group"
    }));
  }

  buildArtifactItems(items) {
    return items.map(node => {
      const item = new WitnessTreeItem({
        id: node.reference,
        label: node.label,
        description: node.relativePath,
        tooltip: node.file,
        contextValue: "artifact",
        node
      });
      item.iconPath = iconForNode(node);
      item.command = {
        command: "witnessWorld.openNode",
        title: "Open",
        arguments: [item]
      };
      return item;
    });
  }

  buildNodeItems(nodes) {
    return nodes.map(node => {
      const item = new WitnessTreeItem({
        id: node.reference,
        label: node.label,
        description: node.relativePath || node.description,
        tooltip: node.file ? `${node.file}${node.line ? `:${node.line}` : ""}` : node.label,
        contextValue: "node",
        node
      });
      item.iconPath = iconForNode(node);
      item.command = {
        command: "witnessWorld.openNode",
        title: "Open",
        arguments: [item]
      };
      return item;
    });
  }

  async openFileAtNode(node) {
    if (!node?.file) return;
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(node.file));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    if (node.line && node.line > 0) {
      const targetLine = Math.max(node.line - 1, 0);
      const range = new vscode.Range(targetLine, 0, targetLine, 0);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    }
  }

  async openTreeItem(item) {
    const node = item?.node ?? item;
    if (!node) return;
    await this.openFileAtNode(node);
    if (node.reference) {
      this.session = setOperatorSelection(this.session, node);
      await this.persistState();
      this.tree.refresh();
      this.updateStatusBar();
    }
  }

  async selectTreeItem(item) {
    const node = item?.node ?? item;
    if (!node?.reference) return;
    this.session = setOperatorSelection(this.session, node);
    await this.persistState();
    this.tree.refresh();
    this.updateStatusBar();
  }

  async assignAliasFromTreeItem(item) {
    const node = item?.node ?? item;
    if (!node?.reference) return;
    const alias = await vscode.window.showInputBox({
      prompt: "Alias name",
      placeHolder: "a"
    });
    if (!alias) return;
    this.session = assignOperatorAlias(this.session, alias, node);
    await this.persistState();
    this.tree.refresh();
  }

  async copyDeepLink(item) {
    if (!this.model) return;
    const node = item?.node ?? item;
    if (!node?.reference) return;
    const deepLink = buildOperatorDeepLink({
      extensionId: EXTENSION_ID,
      workspaceRoot: this.model.workspaceRoot,
      appManifestPath: this.model.appManifestPath,
      reference: node.reference
    });
    await vscode.env.clipboard.writeText(deepLink);
    await vscode.window.showInformationMessage("Witness deep link copied to the clipboard.");
  }

  resolveReference(reference) {
    if (!this.model) return null;
    return resolveOperatorReference(this.session, this.model, reference);
  }

  async runOperatorCommand() {
    const source = await vscode.window.showInputBox({
      prompt: "Witness operator command",
      placeHolder: "inspect this"
    });
    if (!source) return;
    let parsed = null;
    try {
      parsed = parseOperatorCommand(source);
    } catch (error) {
      await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    try {
      await this.executeOperatorCommand(parsed);
    } catch (error) {
      await vscode.window.showErrorMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async executeOperatorCommand(command) {
    if (command.kind === "inspect") {
      const node = this.resolveReference(command.reference);
      if (!node) throw new Error(`unable to resolve ${command.reference}`);
      await this.openFileAtNode(node);
      await vscode.window.showInformationMessage(`${node.reference}\n${node.relativePath || node.description}`);
      return;
    }
    if (command.kind === "open") {
      const node = this.resolveReference(command.reference);
      if (!node) throw new Error(`unable to resolve ${command.reference}`);
      await this.openTreeItem(node);
      return;
    }
    if (command.kind === "select") {
      const node = this.resolveReference(command.reference);
      if (!node) throw new Error(`unable to resolve ${command.reference}`);
      await this.selectTreeItem(node);
      return;
    }
    if (command.kind === "alias") {
      const node = this.resolveReference(command.reference);
      if (!node) throw new Error(`unable to resolve ${command.reference}`);
      this.session = assignOperatorAlias(this.session, command.name, node);
      await this.persistState();
      this.tree.refresh();
      return;
    }
    if (command.kind === "note") {
      await this.createNote(command.title);
      return;
    }
    if (command.kind === "process") {
      await this.createProcessBlock(command.title);
      return;
    }
    if (command.kind === "preview") {
      if (command.action === "start") return this.startPreviewRuntime();
      if (command.action === "stop") return this.stopPreviewRuntime();
      if (command.action === "open") return this.openPreviewRuntime();
    }
    if (command.kind === "attach") {
      if (command.appPath) {
        this.selectedAppManifestPath = await this.resolveSelectedAppManifest({ preferredPath: command.appPath });
      }
      await this.refreshWorkspace();
      await this.startPreviewRuntime();
      return;
    }
    if (command.kind === "detach") {
      this.session = {
        ...this.session,
        mode: "detached"
      };
      await this.stopPreviewRuntime({ quiet: true });
      await this.persistState();
      this.tree.refresh();
      this.updateStatusBar();
      return;
    }
    throw new Error(`unsupported operator command: ${command.kind}`);
  }

  async startPreviewRuntime() {
    if (!this.selectedAppManifestPath) {
      await this.selectAppProject();
    }
    if (!this.selectedAppManifestPath) return;
    const previewPort = Number(process.env.WITNESS_WORLD_OPERATOR_PREVIEW_PORT ?? "3000");
    try {
      this.log(`Starting preview runtime for ${this.selectedAppManifestPath}`);
      this.runtime.start({
        appPath: this.selectedAppManifestPath,
        runtimeProfile: "full",
        port: Number.isFinite(previewPort) ? previewPort : 3000
      });
      const runtimeUrl = await this.runtime.waitForUrl({ timeoutMs: 15000 });
      this.session = {
        ...this.session,
        mode: "attached"
      };
      await this.persistState();
      this.tree.refresh();
      this.updateStatusBar();
      this.log(`Preview runtime ready at ${runtimeUrl}`);
      this.output.show(true);
      return this.runtime.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Preview runtime start failed: ${message}`);
      await vscode.window.showErrorMessage(`Preview runtime failed to start: ${message}`);
      throw error;
    }
  }

  async stopPreviewRuntime({ quiet = false } = {}) {
    await this.runtime.stop();
    this.log("Preview runtime stopped.");
    if (!quiet) {
      await vscode.window.showInformationMessage("Witness preview runtime stopped.");
    }
    this.tree.refresh();
    this.updateStatusBar();
  }

  async openPreviewRuntime() {
    const status = this.runtime.getStatus();
    if (!status.url) {
      const reason = status.running
        ? "Preview runtime is still starting. Watch the Witness World Operator output channel for readiness."
        : (status.error || "No preview runtime URL is available yet.");
      await vscode.window.showWarningMessage(reason);
      return;
    }
    await vscode.env.openExternal(vscode.Uri.parse(status.url));
  }

  async createNote(title = null) {
    const root = await this.ensureWorkspaceRoot();
    if (!root) return;
    const finalTitle = title || await vscode.window.showInputBox({
      prompt: "Note title",
      placeHolder: "Route provenance note"
    });
    if (!finalTitle) return;
    const artifact = await createNoteArtifact(root, finalTitle);
    await this.refreshWorkspace({ quiet: true });
    await this.openFileAtNode(artifact);
  }

  async createProcessBlock(title = null) {
    const root = await this.ensureWorkspaceRoot();
    if (!root) return;
    const finalTitle = title || await vscode.window.showInputBox({
      prompt: "Process block title",
      placeHolder: "Preview patch flow"
    });
    if (!finalTitle) return;
    const artifact = await createProcessBlockArtifact(root, finalTitle);
    await this.refreshWorkspace({ quiet: true });
    await this.openFileAtNode(artifact);
  }

  async openDeepLink(uri) {
    const parsed = parseOperatorDeepLink(uri.toString());
    if (parsed.appManifestPath) {
      this.selectedAppManifestPath = parsed.appManifestPath;
      await this.refreshWorkspace({ quiet: true });
    }
    if (!parsed.reference) return;
    const node = this.resolveReference(parsed.reference);
    if (!node) {
      await vscode.window.showWarningMessage(`Unable to resolve deep link target ${parsed.reference}.`);
      return;
    }
    await this.openTreeItem(node);
  }

  async onDidSaveDocument(document) {
    if (!isAuthoredFile(document.fileName)) return;
    if (workspaceFolderRoot() && document.fileName.startsWith(workspaceFolderRoot())) {
      await this.refreshWorkspace({ quiet: true });
    }
  }
}

let activeController = null;

export async function activate(context) {
  activeController = new WitnessOperatorController(context);
  await activeController.activate();
  if (process.env.WITNESS_WORLD_SMOKE_TEST === "1") {
    await runRepoLocalSmokeTest({
      controller: activeController,
      vscode,
      resultFile: process.env.WITNESS_WORLD_SMOKE_RESULT_FILE || ""
    });
  }
}

export async function deactivate() {
  if (activeController) {
    await activeController.deactivate();
    activeController = null;
  }
}
