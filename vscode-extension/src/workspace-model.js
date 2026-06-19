import fs from "node:fs/promises";
import path from "node:path";
import { listWorkspaceArtifacts } from "./workspace-artifacts.js";

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".agents",
  ".claude",
  ".codex",
  ".codex-extract",
  ".codex-tmp",
  "node_modules",
  "tmp"
]);

const AUTHORED_EXTENSIONS = new Map([
  [".wtoml", "wtoml"],
  [".rvm", "rvm"],
  [".wcss", "wcss"]
]);

function relativePath(workspaceRoot, targetPath) {
  return path.relative(workspaceRoot, targetPath).replace(/\\/g, "/");
}

function basename(filePath) {
  return path.basename(filePath || "");
}

function normalizeId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function docReference(doc) {
  const id = normalizeId(doc?.values?.id);
  if (id) return `doc:${doc.kind}:${id}`;
  return `doc:${doc.kind}:${relativePath(path.dirname(doc.file), doc.file)}:${doc.line ?? 0}`;
}

function targetReference(kind, id) {
  return `target:${kind}:${id}`;
}

function sourceReference(filePath, workspaceRoot) {
  return `source:${relativePath(workspaceRoot, filePath)}`;
}

async function walkWorkspace(rootPath, collector) {
  const queue = [rootPath];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const targetPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith(".tmp")) continue;
        queue.push(targetPath);
        continue;
      }
      await collector(targetPath, entry);
    }
  }
}

export async function discoverAppManifestPaths(workspaceRoot) {
  const manifests = [];
  await walkWorkspace(workspaceRoot, async (targetPath, entry) => {
    if (!entry.isFile()) return;
    if (entry.name !== "app.wtoml") return;
    manifests.push(path.resolve(targetPath));
  });
  return manifests.sort((left, right) => left.localeCompare(right));
}

async function discoverAuthoredSources(workspaceRoot) {
  const sources = [];
  await walkWorkspace(workspaceRoot, async (targetPath, entry) => {
    if (!entry.isFile()) return;
    const extension = path.extname(entry.name).toLowerCase();
    const sourceLanguage = AUTHORED_EXTENSIONS.get(extension);
    if (!sourceLanguage) return;
    sources.push({
      file: path.resolve(targetPath),
      relativePath: relativePath(workspaceRoot, targetPath),
      sourceLanguage,
      reference: sourceReference(targetPath, workspaceRoot)
    });
  });
  return sources.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function createTargetNode(kind, workspaceRoot, row) {
  return {
    reference: targetReference(kind, row.id),
    kind: "target",
    subtype: kind,
    id: row.id,
    label: row.label || row.id,
    description: kind,
    file: row.file ? path.resolve(row.file) : null,
    line: row.line ?? null,
    relativePath: row.file ? relativePath(workspaceRoot, row.file) : null
  };
}

function createDocNode(workspaceRoot, doc) {
  const id = normalizeId(doc?.values?.id);
  return {
    reference: docReference(doc),
    kind: "doc",
    subtype: doc.kind,
    id,
    label: id || `${doc.kind} @ ${basename(doc.file)}`,
    description: doc.kind,
    file: path.resolve(doc.file),
    line: doc.line ?? null,
    relativePath: relativePath(workspaceRoot, doc.file)
  };
}

function createSourceNode(source) {
  return {
    reference: source.reference,
    kind: "source",
    subtype: source.sourceLanguage,
    id: null,
    label: basename(source.file),
    description: source.sourceLanguage,
    file: source.file,
    line: null,
    relativePath: source.relativePath
  };
}

function addIndexRow(map, key, row) {
  if (!key) return;
  const current = map.get(key) ?? [];
  current.push(row);
  map.set(key, current);
}

function buildReferenceIndex(nodes) {
  const byReference = new Map();
  const byId = new Map();
  const byRelativePath = new Map();
  const byBasename = new Map();
  for (const node of nodes) {
    byReference.set(node.reference, node);
    addIndexRow(byId, node.id, node);
    addIndexRow(byRelativePath, node.relativePath, node);
    addIndexRow(byBasename, basename(node.file), node);
  }
  return { byReference, byId, byRelativePath, byBasename };
}

export async function loadOperatorWorkspaceModel({
  workspaceRoot,
  appManifestPath
}) {
  const [{ loadAppProject }, sources, artifacts] = await Promise.all([
    import("../../src/app-project.js"),
    discoverAuthoredSources(workspaceRoot),
    listWorkspaceArtifacts(workspaceRoot)
  ]);
  const appProject = await loadAppProject(appManifestPath, {
    pluginRoot: path.join(workspaceRoot, "plugins"),
    env: process.env
  });

  const docNodes = appProject.allDocs.map(doc => createDocNode(workspaceRoot, doc));
  const targetNodes = [
    ...appProject.targets.server.map(row => createTargetNode("server", workspaceRoot, row)),
    ...appProject.targets.mcp.map(row => createTargetNode("mcp", workspaceRoot, row)),
    ...appProject.targets.desktop.map(row => createTargetNode("desktop", workspaceRoot, row))
  ];
  const sourceNodes = sources.map(createSourceNode);
  const artifactNodes = [
    ...artifacts.notes,
    ...artifacts.processBlocks
  ];

  const docGroups = [...new Set(docNodes.map(node => node.subtype))].sort().map(kind => ({
    kind,
    items: docNodes.filter(node => node.subtype === kind)
      .sort((left, right) => left.label.localeCompare(right.label))
  }));

  const sourceGroups = [...new Set(sourceNodes.map(node => node.subtype))].sort().map(kind => ({
    kind,
    items: sourceNodes.filter(node => node.subtype === kind)
      .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  }));

  const allNodes = [...docNodes, ...targetNodes, ...sourceNodes, ...artifactNodes];

  return {
    workspaceRoot: path.resolve(workspaceRoot),
    appManifestPath: path.resolve(appManifestPath),
    appRoot: path.resolve(appProject.appRoot),
    appId: appProject.appId,
    diagnostics: appProject.diagnostics,
    targets: appProject.targets,
    docs: docGroups,
    sources: sourceGroups,
    notes: artifacts.notes,
    processBlocks: artifacts.processBlocks,
    index: buildReferenceIndex(allNodes),
    nodes: allNodes
  };
}
