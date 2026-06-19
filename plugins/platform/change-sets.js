import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";
import { parseWitnessToml } from "../../src/dsl.js";
import { createThing, projectors, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import { platformBranchInsights } from "./branch-insights.js";
import { parseWcssSource } from "./wcss-source.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pluginDir, "..", "..");
const ALLOWED_ROOTS = Object.freeze(["docs", "plugins", "src", "store", "test"]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeSlashes(value) {
  return String(value || "").replaceAll("\\", "/");
}

function safeProjectRows(world, projector) {
  try {
    const rows = world.project(projector);
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
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
  return `changeSet:${Date.now().toString(36)}`;
}

function defaultBranchId(seed = null) {
  if (!seed) return `branch:${Date.now().toString(36)}`;
  const value = String(seed)
    .replace(/^changeSet:/, "")
    .replace(/^changeset[-.:]?/i, "");
  return `branch:${slugify(value)}`;
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
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

export function validateWcssSource(source, { file = "inline.wcss" } = {}) {
  parseWcssSource(source, { file });
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfPresent(filePath) {
  try {
    await fs.rm(filePath, { force: true });
  } catch {}
}

async function syncFileIfPossible(filePath) {
  let handle = null;
  try {
    handle = await fs.open(filePath, "r");
    await handle.sync();
  } catch {
    // Best-effort sync only.
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function writeTempFile(tempPath, content) {
  await fs.mkdir(path.dirname(tempPath), { recursive: true });
  await fs.writeFile(tempPath, content, "utf8");
  await syncFileIfPossible(tempPath);
}

function applyNonce() {
  return `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

function emitPlatformBranchCreate(world, {
  actor,
  id,
  title = null,
  parentBranchId = null,
  epic = null,
  feature = null,
  defect = null,
  session = null,
  runtimeProfile = "full"
}) {
  ensureThing(world, actor, id);
  const claims = [relation(id, "hasModuleKind", "branch")];
  if (parentBranchId) claims.push(relation(id, "dependsOnBranch", parentBranchId));
  return world.emit({
    process: "platform.branch.create",
    actor,
    claims,
    body: {
      id,
      title: title ? String(title) : id,
      parentBranchId,
      epic,
      feature,
      defect,
      owner: actor,
      runtimeProfile,
      session: session?.id ?? null,
      status: "open",
      createdAt: nowIso()
    }
  });
}

export function createPlatformBranch(world, {
  actor,
  id = null,
  title = null,
  parentBranchId = null,
  epic = null,
  feature = null,
  defect = null,
  session = null,
  runtimeProfile = "full"
}) {
  const branchId = String(id || defaultBranchId(title || null)).trim();
  const existing = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null;
  if (existing) return { ok: false, status: 409, error: "branch id already exists" };
  const normalizedParentBranchId = optionalText(parentBranchId);
  if (normalizedParentBranchId === branchId) {
    return { ok: false, status: 400, error: "branch cannot depend on itself" };
  }
  if (normalizedParentBranchId && !world.project(moduleProjectors.branchIndex).byId?.[normalizedParentBranchId]) {
    return { ok: false, status: 404, error: "parent branch not found" };
  }
  const witness = emitPlatformBranchCreate(world, {
    actor,
    id: branchId,
    title,
    parentBranchId: normalizedParentBranchId,
    epic: optionalText(epic),
    feature: optionalText(feature),
    defect: optionalText(defect),
    session,
    runtimeProfile
  });
  return {
    ok: true,
    status: 201,
    witness,
    branch: world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null
  };
}

function ensurePlatformBranch(world, {
  actor,
  id,
  title = null,
  parentBranchId = null,
  epic = null,
  feature = null,
  defect = null,
  session = null,
  runtimeProfile = "full"
}) {
  const existing = world.project(moduleProjectors.branchIndex).byId?.[id] ?? null;
  if (existing) {
    return { ok: true, created: false, witness: null, branch: existing };
  }
  const created = createPlatformBranch(world, {
    actor,
    id,
    title,
    parentBranchId,
    epic,
    feature,
    defect,
    session,
    runtimeProfile
  });
  return {
    ...created,
    created: true
  };
}

async function inspectPlatformChangeSet(world, changeSetId) {
  const changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!changeSet) return { ok: false, status: 404, error: "change set not found" };
  const editRows = world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[changeSetId] ?? [];
  if (!editRows.length) return { ok: false, status: 400, error: "change set has no staged edits" };

  const currentSnapshotIndex = world.project(moduleProjectors.candidateSnapshotIndex);
  const previousActive = currentActiveCandidateForBranch(world, changeSet.branchId);
  const revision = (currentSnapshotIndex.byChangeSet?.[changeSetId]?.length ?? 0) + 1;
  const candidateSnapshotId = `candidateSnapshot:${changeSetId}:${revision}`;
  const files = [];
  const materializedFiles = [];
  const errors = [];

  for (const edit of editRows) {
    const pathResult = resolveEditPath(edit.path);
    if (!pathResult.ok) return pathResult;
    const currentContent = await readUtf8OrNull(pathResult.value.absolute);
    const currentHash = currentContent == null ? null : hashText(currentContent);
    if (currentHash !== (edit.previousHash ?? null)) {
      errors.push({
        id: `conflict:${changeSetId}:${edit.pathHash}`,
        kind: "conflict",
        changeSetId,
        branchId: changeSet.branchId,
        path: edit.path,
        pathHash: edit.pathHash,
        sourceLanguage: edit.sourceLanguage,
        previousHash: edit.previousHash ?? null,
        currentHash,
        message: "base file hash changed since the edit was staged"
      });
    } else {
      try {
        validateOverlaySource(edit.path, edit.nextContent);
      } catch (error) {
        errors.push({
          kind: "invalidSource",
          path: edit.path,
          sourceLanguage: edit.sourceLanguage,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    files.push({
      path: edit.path,
      sourceLanguage: edit.sourceLanguage,
      previousHash: edit.previousHash ?? null,
      nextContentHash: edit.nextContentHash
    });
    materializedFiles.push({
      ...edit,
      absolutePath: pathResult.value.absolute,
      relativePath: pathResult.value.relative,
      currentHash
    });
  }

  return {
    ok: true,
    changeSet,
    editRows,
    currentSnapshotIndex,
    previousActive,
    revision,
    candidateSnapshotId,
    files,
    materializedFiles,
    errors
  };
}

function snapshotMatchesEdits(snapshot, files) {
  if (!snapshot || snapshot.status !== "valid") return false;
  const left = Array.isArray(snapshot.files) ? snapshot.files : [];
  if (left.length !== files.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const snapshotFile = left[index];
    const file = files[index];
    if (snapshotFile.path !== file.path) return false;
    if (snapshotFile.nextContentHash !== file.nextContentHash) return false;
    if ((snapshotFile.previousHash ?? null) !== (file.previousHash ?? null)) return false;
  }
  return true;
}

function immutableChangeSetStatusError(changeSet, action) {
  const status = String(changeSet?.status || "draft");
  if (status === "rejected" || status === "abandoned") {
    return {
      ok: false,
      status: 409,
      error: `cannot ${action} a ${status} change set`
    };
  }
  if (status === "applied" && action !== "read") {
    return {
      ok: false,
      status: 409,
      error: `cannot ${action} an applied change set`
    };
  }
  return null;
}

function changeSetDetail(world, changeSetId) {
  const changeSetIndex = world.project(moduleProjectors.changeSetIndex);
  const branchIndex = world.project(moduleProjectors.branchIndex);
  const editIndex = world.project(moduleProjectors.changeSetEditIndex);
  const snapshotIndex = world.project(moduleProjectors.candidateSnapshotIndex);
  const changeSet = changeSetIndex.byId?.[changeSetId] ?? null;
  if (!changeSet) return null;
  return {
    changeSet: { ...changeSet },
    branch: changeSet.branchId ? (branchIndex.byId?.[changeSet.branchId] ? { ...branchIndex.byId[changeSet.branchId] } : null) : null,
    edits: (editIndex.byChangeSet?.[changeSetId] ?? []).map(edit => ({ ...edit })),
    candidateSnapshots: (snapshotIndex.byChangeSet?.[changeSetId] ?? []).map(snapshot => ({ ...snapshot })),
    latestCandidateSnapshot: changeSet.latestCandidateSnapshotId
      ? (snapshotIndex.byId?.[changeSet.latestCandidateSnapshotId] ? { ...snapshotIndex.byId[changeSet.latestCandidateSnapshotId] } : null)
      : null,
    activeCandidateSnapshot: changeSet.activeCandidateSnapshotId
      ? (snapshotIndex.byId?.[changeSet.activeCandidateSnapshotId] ? { ...snapshotIndex.byId[changeSet.activeCandidateSnapshotId] } : null)
      : null
  };
}

export function listPlatformChangeSets(world) {
  return world.project(moduleProjectors.changeSets).map(row => ({ ...row }));
}

function branchDetail(world, branchId) {
  const branchIndex = world.project(moduleProjectors.branchIndex);
  const changeSetIndex = world.project(moduleProjectors.changeSetIndex);
  const editIndex = world.project(moduleProjectors.changeSetEditIndex);
  const snapshotIndex = world.project(moduleProjectors.candidateSnapshotIndex);
  const pushRecordIndex = world.project(moduleProjectors.pushRecordIndex);
  const shipRecordIndex = world.project(moduleProjectors.shipRecordIndex);
  const proposals = safeProjectRows(world, moduleProjectors.proposals);
  const branch = branchIndex.byId?.[branchId] ?? null;
  if (!branch) return null;
  const changeSets = (branch.changeSetIds ?? [])
    .map(id => changeSetIndex.byId?.[id] ?? null)
    .filter(Boolean)
    .map(row => ({ ...row }));
  const edits = changeSets.flatMap(changeSet => editIndex.byChangeSet?.[changeSet.id] ?? []).map(row => ({ ...row }));
  const insights = platformBranchInsights(branch, { changeSets, edits, proposals });
  const candidateSnapshots = (snapshotIndex.byBranch?.[branchId] ?? []).map(row => ({ ...row }));
  const latestCandidateSnapshot = branch.latestCandidateSnapshotId
    ? (snapshotIndex.byId?.[branch.latestCandidateSnapshotId] ? { ...snapshotIndex.byId[branch.latestCandidateSnapshotId] } : null)
    : null;
  const validationHistory = candidateSnapshots.map(snapshot => ({
    candidateSnapshotId: snapshot.id,
    status: snapshot.status,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
    changeSetId: snapshot.changeSetId,
    errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : 0
  }));
  const pushRecords = (pushRecordIndex.byBranch?.[branchId] ?? []).map(row => ({ ...row }));
  const latestPushRecord = branch.latestPushRecordId
    ? (pushRecordIndex.byId?.[branch.latestPushRecordId] ? { ...pushRecordIndex.byId[branch.latestPushRecordId] } : null)
    : (pushRecords.at(-1) ?? null);
  const shipRecords = (shipRecordIndex.byBranch?.[branchId] ?? []).map(row => ({ ...row }));
  const latestShipRecord = branch.latestShipRecordId
    ? (shipRecordIndex.byId?.[branch.latestShipRecordId] ? { ...shipRecordIndex.byId[branch.latestShipRecordId] } : null)
    : (shipRecords.at(-1) ?? null);
  const branchRow = {
    ...branch,
    latestPushRecordId: latestPushRecord?.id ?? branch.latestPushRecordId ?? null,
    latestPushStatus: latestPushRecord?.status ?? branch.latestPushStatus ?? null,
    pushRecordIds: latestPushRecord
      ? [...new Set([...(branch.pushRecordIds ?? []), latestPushRecord.id])]
      : [...(branch.pushRecordIds ?? [])],
    latestShipRecordId: latestShipRecord?.id ?? branch.latestShipRecordId ?? null,
    latestShipStatus: latestShipRecord?.status ?? branch.latestShipStatus ?? null,
    latestReleaseChannelId: latestShipRecord?.releaseChannelId ?? branch.latestReleaseChannelId ?? null,
    shipRecordIds: latestShipRecord
      ? [...new Set([...(branch.shipRecordIds ?? []), latestShipRecord.id])]
      : [...(branch.shipRecordIds ?? [])],
    status: latestShipRecord?.status === "shipped" && latestShipRecord?.releaseChannelId === "releaseChannel:local"
      ? "shipped"
      : latestPushRecord?.status === "pushed"
      ? "pushed"
      : (branch.status ?? "open")
  };
  return {
    branch: { ...branchRow, ...insights },
    changeSets,
    edits,
    candidateSnapshots,
    latestCandidateSnapshot,
    validationHistory,
    pushRecords,
    latestPushRecord,
    shipRecords,
    latestShipRecord
  };
}

export function listPlatformBranches(world) {
  const changeSetIndex = world.project(moduleProjectors.changeSetIndex);
  const editIndex = world.project(moduleProjectors.changeSetEditIndex);
  const proposals = safeProjectRows(world, moduleProjectors.proposals);
  return world.project(moduleProjectors.branches).map(row => {
    const changeSets = (row.changeSetIds ?? [])
      .map(id => changeSetIndex.byId?.[id] ?? null)
      .filter(Boolean);
    const edits = changeSets.flatMap(changeSet => editIndex.byChangeSet?.[changeSet.id] ?? []).filter(Boolean);
    return {
      ...row,
      ...platformBranchInsights(row, { changeSets, edits, proposals })
    };
  });
}

export function readPlatformBranch(world, branchId) {
  const detail = branchDetail(world, branchId);
  if (!detail) return { ok: false, status: 404, error: "branch not found" };
  return {
    ok: true,
    status: 200,
    ...detail
  };
}

export function readPlatformChangeSet(world, changeSetId) {
  const detail = changeSetDetail(world, changeSetId);
  if (!detail) return { ok: false, status: 404, error: "change set not found" };
  return {
    ok: true,
    status: 200,
    ...detail
  };
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
  const branchResult = ensurePlatformBranch(world, {
    actor,
    id: resolvedBranchId,
    title: title ? String(title) : resolvedBranchId,
    session,
    runtimeProfile
  });
  if (!branchResult.ok) {
    return branchResult;
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
    branchWitness: branchResult.witness,
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
  const immutable = immutableChangeSetStatusError(changeSet, "edit");
  if (immutable) return immutable;
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
  session = null,
  hooks = null
}) {
  const current = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!current) return { ok: false, status: 404, error: "change set not found" };
  const immutable = immutableChangeSetStatusError(current, "validate");
  if (immutable) return immutable;
  const startedAt = nowIso();
  const startedAtMs = Date.now();
  const startWitness = world.emit({
    process: "platform.changeSet.validate.start",
    actor,
    claims: [],
    body: {
      id: changeSetId,
      branchId: current.branchId,
      session: session?.id ?? null,
      status: "validating",
      startedAt
    }
  });
  if (typeof hooks?.beforeInspect === "function") {
    await hooks.beforeInspect({
      startWitness,
      changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? current
    });
  }
  const inspected = await inspectPlatformChangeSet(world, changeSetId);
  if (!inspected.ok) return inspected;
  const { changeSet, previousActive, revision, candidateSnapshotId, files, errors } = inspected;
  const status = errors.length ? "invalid" : "valid";
  ensureThing(world, actor, candidateSnapshotId);
  const conflictIds = [];
  for (const error of errors) {
    if (error?.kind !== "conflict" || !error.id) continue;
    conflictIds.push(String(error.id));
    ensureThing(world, actor, String(error.id));
  }
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
    ].concat(conflictIds.flatMap(conflictId => ([
      relation(conflictId, "hasModuleKind", "conflict"),
      relation(changeSetId, "hasConflict", conflictId)
    ]))),
    body: {
      id: changeSetId,
      branchId: changeSet.branchId,
      session: session?.id ?? null,
      status,
      startedAt,
      finishedAt: candidateSnapshot.createdAt,
      durationMs: Date.now() - startedAtMs,
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
    startWitness,
    witness,
    revisionEvent,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? changeSet,
    candidateSnapshot,
    activeCandidateSnapshotId: errors.length ? (previousActive?.id ?? null) : candidateSnapshotId
  };
}

export async function applyPlatformChangeSet(world, {
  actor,
  changeSetId,
  session = null,
  hooks = null
}) {
  const current = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!current) return { ok: false, status: 404, error: "change set not found" };
  const immutable = immutableChangeSetStatusError(current, "apply");
  if (immutable) return immutable;
  const inspected = await inspectPlatformChangeSet(world, changeSetId);
  if (!inspected.ok) return inspected;
  const { changeSet, materializedFiles, files, errors } = inspected;
  if (errors.length) {
    return {
      ok: false,
      status: 409,
      error: "change set is not valid for apply",
      details: errors
    };
  }

  const snapshotIndex = world.project(moduleProjectors.candidateSnapshotIndex);
  let candidateSnapshotId = changeSet.latestCandidateSnapshotId ?? null;
  const latestSnapshot = candidateSnapshotId ? (snapshotIndex.byId?.[candidateSnapshotId] ?? null) : null;
  if (!snapshotMatchesEdits(latestSnapshot, files)) {
    const validation = await validatePlatformChangeSet(world, {
      actor,
      changeSetId,
      session
    });
    if (!validation.ok || validation.candidateSnapshot?.status !== "valid") {
      return validation.ok
        ? { ok: false, status: 409, error: "change set is not valid for apply" }
        : validation;
    }
    candidateSnapshotId = validation.candidateSnapshot.id;
  }

  const nonce = applyNonce();
  const prepared = materializedFiles.map((file, index) => ({
    index,
    path: file.path,
    sourceLanguage: file.sourceLanguage,
    previousHash: file.previousHash ?? null,
    nextContentHash: file.nextContentHash,
    nextContent: file.nextContent,
    absolutePath: file.absolutePath,
    tempPath: `${file.absolutePath}.platform-apply-${nonce}.tmp`,
    backupPath: `${file.absolutePath}.platform-backup-${nonce}`
  }));
  const promoted = [];

  try {
    for (const file of prepared) {
      await writeTempFile(file.tempPath, file.nextContent);
    }
    for (const file of prepared) {
      await hooks?.beforePromote?.(file);
      if (await pathExists(file.absolutePath)) {
        await removeIfPresent(file.backupPath);
        await fs.rename(file.absolutePath, file.backupPath);
        file.hadBackup = true;
      } else {
        file.hadBackup = false;
      }
      await fs.rename(file.tempPath, file.absolutePath);
      promoted.push(file);
      await hooks?.afterPromote?.(file);
    }
    for (const file of prepared) {
      const writtenContent = await readUtf8OrNull(file.absolutePath);
      const writtenHash = writtenContent == null ? null : hashText(writtenContent);
      if (writtenHash !== file.nextContentHash) {
        throw new Error(`applied content hash mismatch for ${file.path}`);
      }
    }
  } catch (error) {
    for (const file of [...promoted].reverse()) {
      if (file.hadBackup) {
        await removeIfPresent(file.absolutePath);
        await fs.rename(file.backupPath, file.absolutePath).catch(() => {});
      } else {
        await removeIfPresent(file.absolutePath);
      }
    }
    for (const file of prepared) {
      if (file.hadBackup && await pathExists(file.backupPath)) {
        const destinationExists = await pathExists(file.absolutePath);
        if (!destinationExists) await fs.rename(file.backupPath, file.absolutePath).catch(() => {});
      }
      await removeIfPresent(file.tempPath);
      await removeIfPresent(file.backupPath);
    }
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : "change set apply failed"
    };
  }

  for (const file of prepared) {
    await removeIfPresent(file.backupPath);
  }

  const witness = world.emit({
    process: "platform.changeSet.apply",
    actor,
    claims: [
      relation(changeSetId, "appliedCandidateSnapshot", candidateSnapshotId),
      relation(changeSet.branchId, "appliedChangeSet", changeSetId)
    ],
    body: {
      id: changeSetId,
      branchId: changeSet.branchId,
      candidateSnapshotId,
      status: "applied",
      session: session?.id ?? null,
      appliedAt: nowIso(),
      files: prepared.map(file => ({
        path: file.path,
        sourceLanguage: file.sourceLanguage,
        previousHash: file.previousHash,
        nextContentHash: file.nextContentHash
      }))
    }
  });

  return {
    ok: true,
    status: 200,
    witness,
    candidateSnapshotId,
    appliedFiles: prepared.map(file => ({
      path: file.path,
      absolutePath: file.absolutePath,
      sourceLanguage: file.sourceLanguage,
      previousHash: file.previousHash,
      nextContentHash: file.nextContentHash
    })),
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? changeSet
  };
}

export function removePlatformChangeSetEdit(world, {
  actor,
  changeSetId,
  pathHash,
  session = null
}) {
  const changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!changeSet) return { ok: false, status: 404, error: "change set not found" };
  const immutable = immutableChangeSetStatusError(changeSet, "remove edits from");
  if (immutable) return immutable;
  const edit = (world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[changeSetId] ?? [])
    .find(row => row.pathHash === String(pathHash || ""));
  if (!edit) return { ok: false, status: 404, error: "change set edit not found" };
  const witness = world.emit({
    process: "platform.changeSet.edit.remove",
    actor,
    claims: [relation(changeSetId, "removedChangeSetEdit", edit.id)],
    body: {
      id: edit.id,
      changeSetId,
      path: edit.path,
      pathHash: edit.pathHash,
      actor,
      session: session?.id ?? null,
      removedAt: nowIso()
    }
  });
  return {
    ok: true,
    status: 200,
    witness,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null,
    edits: world.project(moduleProjectors.changeSetEditIndex).byChangeSet?.[changeSetId] ?? []
  };
}

function transitionPlatformChangeSet(world, {
  actor,
  changeSetId,
  process,
  nextStatus,
  session = null,
  reason = null
}) {
  const changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null;
  if (!changeSet) return { ok: false, status: 404, error: "change set not found" };
  const immutable = immutableChangeSetStatusError(changeSet, nextStatus);
  if (immutable && changeSet.status !== nextStatus) return immutable;
  if (String(changeSet.status || "") === nextStatus) {
    return {
      ok: true,
      status: 200,
      witness: null,
      changeSet
    };
  }
  const bodyField = nextStatus === "rejected" ? "rejectedAt" : "abandonedAt";
  const witness = world.emit({
    process,
    actor,
    claims: [relation(changeSetId, "hasStatus", nextStatus)],
    body: {
      id: changeSetId,
      branchId: changeSet.branchId,
      status: nextStatus,
      reason: reason ? String(reason) : null,
      session: session?.id ?? null,
      [bodyField]: nowIso()
    }
  });
  return {
    ok: true,
    status: 200,
    witness,
    changeSet: world.project(moduleProjectors.changeSetIndex).byId?.[changeSetId] ?? null
  };
}

export function rejectPlatformChangeSet(world, {
  actor,
  changeSetId,
  session = null,
  reason = null
}) {
  return transitionPlatformChangeSet(world, {
    actor,
    changeSetId,
    process: "platform.changeSet.reject",
    nextStatus: "rejected",
    session,
    reason
  });
}

export function abandonPlatformChangeSet(world, {
  actor,
  changeSetId,
  session = null,
  reason = null
}) {
  return transitionPlatformChangeSet(world, {
    actor,
    changeSetId,
    process: "platform.changeSet.abandon",
    nextStatus: "abandoned",
    session,
    reason
  });
}
