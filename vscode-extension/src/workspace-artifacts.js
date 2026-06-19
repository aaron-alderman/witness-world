import fs from "node:fs/promises";
import path from "node:path";

export const OPERATOR_ROOT = ".witness-operator";
export const NOTES_DIR = path.join(OPERATOR_ROOT, "notes");
export const PROCESS_BLOCKS_DIR = path.join(OPERATOR_ROOT, "process-blocks");

function slugify(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function timestamp(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

async function statOrNull(targetPath) {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

function relativePath(workspaceRoot, filePath) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}

async function listFiles(rootPath) {
  const stat = await statOrNull(rootPath);
  if (!stat?.isDirectory()) return [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  return entries
    .filter(entry => entry.isFile())
    .map(entry => path.join(rootPath, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function artifactRow(kind, workspaceRoot, filePath) {
  const name = path.basename(filePath, path.extname(filePath));
  return {
    kind,
    file: path.resolve(filePath),
    relativePath: relativePath(workspaceRoot, filePath),
    label: name.replace(/^[0-9TZ-]+-/, "").replace(/-/g, " "),
    reference: `${kind}:${relativePath(workspaceRoot, filePath)}`
  };
}

export async function listWorkspaceArtifacts(workspaceRoot) {
  const notesRoot = path.join(workspaceRoot, NOTES_DIR);
  const processBlocksRoot = path.join(workspaceRoot, PROCESS_BLOCKS_DIR);
  const [noteFiles, processBlockFiles] = await Promise.all([
    listFiles(notesRoot),
    listFiles(processBlocksRoot)
  ]);
  return {
    notes: noteFiles.map(filePath => artifactRow("note", workspaceRoot, filePath)),
    processBlocks: processBlockFiles.map(filePath => artifactRow("process", workspaceRoot, filePath))
  };
}

export async function createNoteArtifact(workspaceRoot, title) {
  const notesRoot = path.join(workspaceRoot, NOTES_DIR);
  await ensureDirectory(notesRoot);
  const stem = `${timestamp()}-${slugify(title, "note")}`;
  const filePath = path.join(notesRoot, `${stem}.md`);
  const body = `# ${title}\n\n- Linked app: \n- Linked object: \n- Provenance: \n\n`;
  await fs.writeFile(filePath, body, "utf8");
  return artifactRow("note", workspaceRoot, filePath);
}

export async function createProcessBlockArtifact(workspaceRoot, title) {
  const processBlocksRoot = path.join(workspaceRoot, PROCESS_BLOCKS_DIR);
  await ensureDirectory(processBlocksRoot);
  const stem = `${timestamp()}-${slugify(title, "process-block")}`;
  const filePath = path.join(processBlocksRoot, `${stem}.wwop`);
  const body = `# ${title}\n\ninspect this\n`;
  await fs.writeFile(filePath, body, "utf8");
  return artifactRow("process", workspaceRoot, filePath);
}
