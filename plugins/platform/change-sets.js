import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";
import { parseWitnessToml } from "../../src/dsl.js";
import { createThing, projectors, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..", "..");
const ALLOWED_ROOTS = Object.freeze(["docs", "plugins", "src", "store", "test"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

function pathHashFor(relativePath) {
  return crypto.createHash("sha256").update(normalizeSlashes(relativePath), "utf8").digest("hex").slice(0, 16);
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "draft";
}

function defaultChangeSetId() {
  return `changeset-${Date.now().toString(36)}`;
}

function defaultBranchId(changeSetId) {
  return `branch-${slugify(changeSetId)}`;
}

function sourceLanguageForPath(relativePath) {
  const ext = path.extname(String(relativePath || "")).toLowerCase();
  if (ext === ".rvm") return "rvm";
  if (ext === ".wcss") return "wcss";
  if (ext === ".wtoml") return "wtoml";
  if (ext === ".json") return "json";
  return "text";
}

function resolveEditPath(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) {
    return { ok: false, status: 400, error: "edit path is required" };
  }
  const absolute = path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(repoRoot, raw);
  const relative = normalizeSlashes(path.relative(repoRoot, absolute));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { ok: false, status: 400, error: "edit path must stay inside the workspace" };
  }
  const root = relative.split("/")[0] || "";
  if (!ALLOWED_ROOTS.includes(root)) {
    return {
      ok: false,
      status: 400,
      error: `edit path must stay inside allowed roots: ${ALLOWED_ROOTS.join(", ")}`
    };
  }
  return { ok: true, value: { absolute, relative } };
}

async function readUtf8OrNull(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function ensureThing(world, actor, id, owner = actor) {
  if (world.project(projectors.things).has(id)) return;
  createThing(world, { actor, id, owner });
}

function validateAssignment(trimmed, label) {
  const match = trimmed.match(/^([^=]+?)\s*=\s*(.+)$/);
  if (!match || !match[1]?.trim() || !match[2]?.trim()) {
    throw new Error(`${label} must be an assignment`);
  }
}

export function validateWcssSource(source, { file = "inline.wcss" } = {}) {
  const lines = String(source ?? "").replace(/\r\n/g, "\n").split("\n");
  let section = null;
  let sawTheme = false;
  let inStyle = false;
  let inStyleGroup = false;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (raw.includes("\t")) {
      throw new Error(`${file}:${index + 1} WCSS indentation must use spaces`);
    }
    const indent = raw.match(/^ */)?.[0]?.length ?? 0;
    if (indent % 2 !== 0) {
      throw new Error(`${file}:${index + 1} WCSS indentation must be multiples of two spaces`);
    }
    if (indent === 0) {
      inStyle = false;
      inStyleGroup = false;
      if (/^theme\s+\S+/.test(trimmed)) {
        sawTheme = true;
        section = null;
        continue;
      }
      if (trimmed === "tokens" || trimmed === "styles") {
        if (!sawTheme) throw new Error(`${file}:${index + 1} WCSS must declare a theme before sections`);
        section = trimmed;
        continue;
      }
      throw new Error(`${file}:${index + 1} unsupported top-level WCSS statement`);
    }
    if (section === "tokens") {
      if (indent !== 2) throw new Error(`${file}:${index + 1} token assignments must be indented by two spaces`);
      validateAssignment(trimmed, `${file}:${index + 1} token`);
      continue;
    }
    if (section === "styles") {
      if (indent === 2 && /^style\s+\S+/.test(trimmed)) {
        inStyle = true;
        inStyleGroup = false;
        continue;
      }
      if (!inStyle) throw new Error(`${file}:${index + 1} WCSS style content must start with a style declaration`);
      if (indent === 4 && /^selector\s*=\s*.+$/.test(trimmed)) continue;
      if (indent === 4 && /^[a-z][a-z0-9.-]*$/i.test(trimmed)) {
        inStyleGroup = true;
        continue;
      }
      if (indent === 6 && inStyleGroup) {
        validateAssignment(trimmed, `${file}:${index + 1} style property`);
        continue;
      }
      throw new Error(`${file}:${index + 1} unsupported WCSS style statement`);
    }
    throw new Error(`${file}:${index + 1} WCSS content is outside a supported section`);
  }
  if (!sawTheme) throw new Error(`${file} WCSS must declare a theme`);
}

export function validateOverlaySource(relativePath, content) {
  const sourceLanguage = sourceLanguageForPath(relativePath);
  switch (sourceLanguage) {
    case "rvm":
      compileRvmToDesirePlus(content, { file: relativePath });
      return sourceLanguage;
    case "wcss":
      validateWcssSource(content, { file: relativePath });
      return sourceLanguage;
    case "wtoml":
      parseWitnessToml(content);
      return sourceLanguage;
    case "json":
      JSON.parse(content);
      return sourceLanguage;
    default:
      throw new Error(`unsupported overlay source language for ${relativePath}`);
  }
}

function currentActiveCandidateForBranch(world, branchId) {
  return world.project(moduleProjectors.candidateSnapshotIndex).activeByBranch?.[branchId] ?? null;
}

export function createPlatformChangeSet(world, {
  actor,
  id = null,
  branchId = null,
  title = null,
  reason = null,
  session = null,
  runtimeProfile = "full"
}) {
  const changeSetId = String(id || defaultChangeSetId()).trim();
  if (!changeSetId) return { ok: false, status: 400, error: "change set id is required" };
  const existing = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (existing) return { ok: false, status: 409, error: "change set id already exists" };
  const resolvedBranchId = String(branchId || defaultBranchId(changeSetId)).trim();
  const branchIndex = world.project(moduleProjectors.branchIndex).byId ?? {};
  if (!branchIndex[resolvedBranchId]) {
    ensureThing(world, actor, resolvedBranchId);
    world.emit({
      process: "platform.branch.create",
      actor,
      claims: [relation(resolvedBranchId, "hasModuleKind", "branch")],
      body: {
        id: resolvedBranchId,
        title: title ? String(title) : resolvedBranchId,
        owner: actor,
        runtimeProfile,
        session: session?.id ?? null,
        status: "open",
        createdAt: nowIso()
      }
    });
  }
  ensureThing(world, actor, changeSetId);
  const witness = world.emit({
    process: "platform.changeSet.create",
    actor,
    claims: [
      relation(changeSetId, "hasModuleKind", "changeSet"),
      relation(resolvedBranchId, "containsChangeSet", changeSetId)
    ],
    body: {
      id: changeSetId,
      branchId: resolvedBranchId,
      title: title ? String(title) : changeSetId,
      reason: reason ? String(reason) : null,
      owner: actor,
      runtimeProfile,
      session: session?.id ?? null,
      status: "draft",
      createdAt: nowIso()
    }
  });
  return {
    ok: true,
    status: 201,
    witness,
    branch: world.project(moduleProjectors.branchIndex).byId?.[resolvedBranchId] ?? null,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null
  };
}

export async function stagePlatformChangeSetEdits(world, {
  actor,
  changeSetId,
  edits = [],
  session = null
}) {
  const changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!changeSet) return { ok: false, status: 404, error: "change set not found" };
  const staged = [];
  for (const rawEdit of Array.isArray(edits) ? edits : []) {
    const pathResult = resolveEditPath(rawEdit?.path);
    if (!pathResult.ok) return pathResult;
    if (typeof rawEdit?.content !== "string") {
      return { ok: false, status: 400, error: "edit content must be a string" };
    }
    if (rawEdit.content.includes("\u0000")) {
      return { ok: false, status: 400, error: "binary edits are not supported in platform change sets" };
    }
    const currentContent = await readUtf8OrNull(pathResult.value.absolute);
    const previousHash = currentContent == null ? null : hashText(currentContent);
    if (rawEdit.previousHash !== undefined && rawEdit.previousHash !== previousHash) {
      return {
        ok: false,
        status: 409,
        error: `base file hash changed for ${pathResult.value.relative}`
      };
    }
    const editId = `changeSetEdit:${changeSetId}:${pathHashFor(pathResult.value.relative)}`;
    ensureThing(world, actor, editId);
    const witness = world.emit({
      process: "platform.changeSet.edit.upsert",
      actor,
      claims: [
        relation(editId, "hasModuleKind", "changeSetEdit"),
        relation(changeSetId, "hasChangeSetEdit", editId)
      ],
      body: {
        id: editId,
        changeSetId,
        path: pathResult.value.relative,
        pathHash: pathHashFor(pathResult.value.relative),
        previousHash,
        nextContentHash: hashText(rawEdit.content),
        nextContent: rawEdit.content,
        sourceLanguage: sourceLanguageForPath(pathResult.value.relative),
        actor,
        session: session?.id ?? null,
        updatedAt: nowIso()
      }
    });
    staged.push({ witnessId: witness.id, id: editId });
  }
  return {
    ok: true,
    status: 200,
    staged,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null,
    edits: world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[changeSetId] ?? []
  };
}

export async function validatePlatformChangeSet(world, {
  actor,
  changeSetId,
  session = null
}) {
  const changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!changeSet) return { ok: false, status: 404, error: "change set not found" };
  const editRows = world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[changeSetId] ?? [];
  if (!editRows.length) return { ok: false, status: 400, error: "change set has no staged edits" };

  const currentSnapshotIndex = world.project(moduleProjectors.candidateSnapshotIndex);
  const previousActive = currentActiveCandidateForBranch(world, changeSet.branchId);
  const revision = (currentSnapshotIndex.byChangeSet?.[changeSetId]?.length ?? 0) + 1;
  const candidateSnapshotId = `candidateSnapshot:${changeSetId}:${revision}`;
  const files = [];
  const errors = [];

  for (const edit of editRows) {
    const pathResult = resolveEditPath(edit.path);
    if (!pathResult.ok) return pathResult;
    const currentContent = await readUtf8OrNull(pathResult.value.absolute);
    const currentHash = currentContent == null ? null : hashText(currentContent);
    if (currentHash !== (edit.previousHash ?? null)) {
      errors.push({
        path: edit.path,
        sourceLanguage: edit.sourceLanguage,
        message: "base file hash changed since the edit was staged"
      });
      continue;
    }
    try {
      validateOverlaySource(edit.path, edit.nextContent);
    } catch (error) {
      errors.push({
        path: edit.path,
        sourceLanguage: edit.sourceLanguage,
        message: error instanceof Error ? error.message : String(error)
      });
    }
    files.push({
      path: edit.path,
      sourceLanguage: edit.sourceLanguage,
      previousHash: edit.previousHash ?? null,
      nextContentHash: edit.nextContentHash
    });
  }

  const status = errors.length ? "invalid" : "valid";
  ensureThing(world, actor, candidateSnapshotId);
  const candidateSnapshot = {
    id: candidateSnapshotId,
    changeSetId,
    branchId: changeSet.branchId,
    status,
    revision,
    createdAt: nowIso(),
    files,
    errors,
    previousActiveCandidateSnapshotId: previousActive?.id ?? null
  };
  const witness = world.emit({
    process: "platform.changeSet.validate",
    actor,
    claims: [
      relation(candidateSnapshotId, "hasModuleKind", "candidateSnapshot"),
      relation(changeSetId, "producesCandidateSnapshot", candidateSnapshotId),
      relation(changeSet.branchId, "hasCandidateSnapshot", candidateSnapshotId)
    ],
    body: {
      id: changeSetId,
      branchId: changeSet.branchId,
      session: session?.id ?? null,
      status,
      validatedAt: candidateSnapshot.createdAt,
      candidateSnapshot,
      activeCandidateSnapshotId: errors.length ? (previousActive?.id ?? null) : candidateSnapshotId
    }
  });
  const revisionEvent = status === "valid"
    ? world.observe({
        process: "platform.candidateSnapshot.revision",
        actor,
        claims: [],
        body: {
          branchId: changeSet.branchId,
          changeSetId,
          candidateSnapshotId,
          revision
        }
      })
    : null;
  return {
    ok: true,
    status: 200,
    witness,
    revisionEvent,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? changeSet,
    candidateSnapshot,
    activeCandidateSnapshotId: errors.length ? (previousActive?.id ?? null) : candidateSnapshotId
  };
}
