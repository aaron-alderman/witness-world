import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createThing, projectors, relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

const pluginDir = path.dirname(fileURLToPath(import.meta.url));
const defaultWorkspaceRoot = path.resolve(pluginDir, "..", "..");
const gitBoundaryCache = new Map();
const DEFAULT_GIT_BOUNDARY_TTL_MS = 2000;

export const PLATFORM_GIT_BOUNDARY_ID = "boundary:git";

function nowIso() {
  return new Date().toISOString();
}

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function slash(value) {
  return String(value || "").replaceAll("\\", "/");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "branch";
}

function hashString(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function ensureThing(world, actor, id, owner = actor) {
  if (world.project(projectors.things).has(id)) return;
  createThing(world, { actor, id, owner });
}

function pushByKey(target, key, value) {
  if (!target[key]) target[key] = [];
  target[key].push(value);
}

function compareTimeline(left, right) {
  return String(left?.appliedAt || left?.createdAt || "").localeCompare(String(right?.appliedAt || right?.createdAt || ""))
    || String(left?.id || "").localeCompare(String(right?.id || ""));
}

function stableUnique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "")).filter(Boolean))];
}

function relativePathWithin(rootPath, targetPath) {
  const relative = slash(path.relative(path.resolve(rootPath), path.resolve(targetPath)));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative;
}

export function defaultGitBranchName(branchId) {
  const base = String(branchId || "")
    .replace(/^branch:/, "")
    .replace(/^branch\./, "")
    .replace(/^branch-/, "");
  return `platform/${slugify(base)}`;
}

function defaultPushRecordId(branchId, sequence) {
  return `pushRecord:${String(branchId || "")}:${sequence}`;
}

function inferProviderFromRemoteUrl(remoteUrl) {
  const raw = optionalText(remoteUrl);
  if (!raw) return { provider: "generic", remoteUrl: null, webUrl: null };
  const sshMatch = raw.match(/^git@([^:]+):(.+?)(?:\.git)?$/i);
  const httpsMatch = raw.match(/^(https?:\/\/[^/]+)\/(.+?)(?:\.git)?$/i);
  const host = sshMatch?.[1] || (httpsMatch ? new URL(`${httpsMatch[1]}/`).host : null);
  const repoPath = sshMatch?.[2] || httpsMatch?.[2] || null;
  const webUrl = host && repoPath
    ? `https://${host}/${repoPath.replace(/\.git$/i, "")}`
    : (raw.startsWith("http://") || raw.startsWith("https://") ? raw.replace(/\.git$/i, "") : null);
  const normalizedHost = String(host || "").toLowerCase();
  let provider = "generic";
  if (normalizedHost.includes("github")) provider = "github";
  else if (normalizedHost.includes("gitlab")) provider = "gitlab";
  return {
    provider,
    remoteUrl: raw,
    webUrl
  };
}

function compareUrlForProvider({ provider, webUrl, baseBranchName, gitBranchName }) {
  if (!webUrl || !baseBranchName || !gitBranchName) return null;
  if (provider === "github") {
    return `${webUrl}/compare/${encodeURIComponent(baseBranchName)}...${encodeURIComponent(gitBranchName)}?expand=1`;
  }
  if (provider === "gitlab") {
    return `${webUrl}/-/compare?from=${encodeURIComponent(baseBranchName)}&to=${encodeURIComponent(gitBranchName)}`;
  }
  return null;
}

function pullRequestUrlForProvider({ provider, webUrl, gitBranchName }) {
  if (!webUrl || !gitBranchName) return null;
  if (provider === "github") return `${webUrl}/pull/new/${encodeURIComponent(gitBranchName)}`;
  if (provider === "gitlab") return `${webUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(gitBranchName)}`;
  return null;
}

function gitEnvironment(overrides = {}) {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    ...overrides
  };
}

async function runGit(args, {
  cwd,
  env = {},
  allowedExitCodes = [0]
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "git.exe" : "git", args, {
      cwd,
      env: gitEnvironment(env),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { stdout += chunk; });
    child.stderr?.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => {
      const result = {
        code: typeof code === "number" ? code : 1,
        stdout,
        stderr
      };
      if (allowedExitCodes.includes(result.code)) {
        resolve(result);
        return;
      }
      const error = new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`);
      error.result = result;
      reject(error);
    });
  });
}

function parseGitRemoteRows(stdout) {
  const byName = Object.create(null);
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const match = line.match(/^([^\s]+)\s+(.+?)\s+\((fetch|push)\)$/);
    if (!match) continue;
    const [, name, url, role] = match;
    if (!byName[name]) byName[name] = { name, fetchUrl: null, pushUrl: null };
    if (role === "fetch") byName[name].fetchUrl = url;
    if (role === "push") byName[name].pushUrl = url;
  }
  return Object.values(byName)
    .map(row => {
      const derived = inferProviderFromRemoteUrl(row.pushUrl || row.fetchUrl || null);
      return {
        id: `gitRemote:${row.name}`,
        name: row.name,
        fetchUrl: row.fetchUrl,
        pushUrl: row.pushUrl,
        remoteUrl: row.pushUrl || row.fetchUrl || null,
        provider: derived.provider,
        webUrl: derived.webUrl
      };
    })
    .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")));
}

function parseGitRefRows(stdout) {
  const rows = [];
  for (const line of String(stdout || "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [objectId, refName, upstream, symref] = line.split("\t");
    const normalizedRefName = optionalText(refName);
    if (!normalizedRefName) continue;
    const branchMatch = normalizedRefName.match(/^refs\/heads\/(.+)$/);
    const remoteBranchMatch = normalizedRefName.match(/^refs\/remotes\/([^/]+)\/(.+)$/);
    rows.push({
      id: `gitRef:${normalizedRefName}`,
      refName: normalizedRefName,
      shortName: branchMatch?.[1] || remoteBranchMatch?.[2] || normalizedRefName,
      remoteName: remoteBranchMatch?.[1] || null,
      scope: branchMatch ? "localBranch" : (remoteBranchMatch ? "remoteBranch" : "ref"),
      objectId: optionalText(objectId),
      upstream: optionalText(upstream),
      symref: optionalText(symref)
    });
  }
  return rows.sort((left, right) => String(left.refName || "").localeCompare(String(right.refName || "")));
}

function remoteDefaultBranchName(refRows = [], remoteName = "origin") {
  const remoteHead = refRows.find(row => row.refName === `refs/remotes/${remoteName}/HEAD`) ?? null;
  if (remoteHead?.symref) {
    const match = String(remoteHead.symref).match(new RegExp(`^refs/remotes/${remoteName}/(.+)$`));
    if (match) return match[1];
  }
  const upstreamMatch = refRows.find(row => row.scope === "localBranch" && row.upstream?.startsWith(`refs/remotes/${remoteName}/`)) ?? null;
  if (upstreamMatch?.upstream) return upstreamMatch.upstream.replace(`refs/remotes/${remoteName}/`, "");
  const localMain = refRows.find(row => row.refName === "refs/heads/main" || row.refName === "refs/heads/master") ?? null;
  if (localMain) return localMain.shortName;
  const remoteMain = refRows.find(row => row.refName === `refs/remotes/${remoteName}/main` || row.refName === `refs/remotes/${remoteName}/master`) ?? null;
  if (remoteMain) return remoteMain.shortName;
  return null;
}

function branchExists(refRows = [], gitBranchName) {
  return refRows.some(row => row.refName === `refs/heads/${gitBranchName}`);
}

function remoteBranchExists(refRows = [], remoteName, gitBranchName) {
  return refRows.some(row => row.refName === `refs/remotes/${remoteName}/${gitBranchName}`);
}

function currentBranchName(refRows = []) {
  const localBranch = refRows.find(row => row.scope === "localBranch" && row.upstream);
  if (localBranch?.shortName) return localBranch.shortName;
  const main = refRows.find(row => row.refName === "refs/heads/main" || row.refName === "refs/heads/master") ?? null;
  return main?.shortName ?? null;
}

async function inspectGitRepository(repoRoot) {
  const remoteResult = await runGit(["remote", "-v"], { cwd: repoRoot });
  const refResult = await runGit(["for-each-ref", "--format=%(objectname)%09%(refname)%09%(upstream)%09%(symref)", "refs/heads", "refs/remotes"], { cwd: repoRoot });
  const remotes = parseGitRemoteRows(remoteResult.stdout);
  const refs = parseGitRefRows(refResult.stdout);
  return {
    remotes,
    refs,
    currentBranchName: currentBranchName(refs)
  };
}

export async function readGitBoundaryState({ repoRoot = defaultWorkspaceRoot } = {}) {
  const cacheKey = path.resolve(repoRoot);
  const cached = gitBoundaryCache.get(cacheKey) ?? null;
  const nowMs = Date.now();
  if (cached && nowMs - cached.readAtMs <= DEFAULT_GIT_BOUNDARY_TTL_MS) {
    return cached.value;
  }
  try {
    const value = await inspectGitRepository(repoRoot);
    gitBoundaryCache.set(cacheKey, {
      readAtMs: nowMs,
      value
    });
    return value;
  } catch {
    return { remotes: [], refs: [], currentBranchName: null };
  }
}

function appliedChangeSetsForBranch(world, branchId) {
  const changeSetIndex = world.project(moduleProjectors.changeSetIndex);
  const branch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null;
  const rows = (branch?.changeSetIds ?? [])
    .map(id => changeSetIndex.byId?.[id] ?? null)
    .filter(Boolean)
    .filter(row => String(row.status || "") === "applied")
    .sort(compareTimeline);
  return rows;
}

function stagedPathsForAppliedBranch(world, branchId) {
  const editIndex = world.project(moduleProjectors.changeSetEditIndex);
  const paths = [];
  for (const changeSet of appliedChangeSetsForBranch(world, branchId)) {
    for (const edit of editIndex.byChangeSet?.[changeSet.id] ?? []) {
      paths.push(String(edit.path || ""));
    }
  }
  return stableUnique(paths).sort((left, right) => left.localeCompare(right));
}

function repoRelativeSelectedPaths(selectedPaths = [], repoRoot) {
  const rows = [];
  const outsidePaths = [];
  for (const selectedPath of selectedPaths) {
    const absolutePath = path.resolve(defaultWorkspaceRoot, String(selectedPath || ""));
    const repoRelativePath = relativePathWithin(repoRoot, absolutePath);
    if (!repoRelativePath) {
      outsidePaths.push(String(selectedPath || ""));
      continue;
    }
    rows.push({
      workspacePath: String(selectedPath || ""),
      repoRelativePath,
      absolutePath
    });
  }
  return {
    rows,
    outsidePaths
  };
}

function latestAppliedChangeSet(world, branchId) {
  const rows = appliedChangeSetsForBranch(world, branchId);
  return rows.at(-1) ?? null;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureMirrorRepo({ repoRoot, mirrorRoot }) {
  const gitDir = path.join(mirrorRoot, ".git");
  if (!(await pathExists(gitDir))) {
    await fs.mkdir(path.dirname(mirrorRoot), { recursive: true });
    await runGit(["clone", repoRoot, mirrorRoot], { cwd: path.dirname(mirrorRoot) });
  }
  await runGit(["fetch", "--all", "--prune"], { cwd: mirrorRoot, allowedExitCodes: [0, 1] }).catch(() => {});
  return inspectGitRepository(mirrorRoot);
}

async function syncMirrorRemote({ mirrorRoot, remote }) {
  if (!remote?.name || !remote?.remoteUrl) return;
  const currentRemotes = await inspectGitRepository(mirrorRoot);
  const existing = currentRemotes.remotes.find(row => row.name === remote.name) ?? null;
  if (!existing) {
    await runGit(["remote", "add", remote.name, remote.remoteUrl], { cwd: mirrorRoot });
    return;
  }
  await runGit(["remote", "set-url", remote.name, remote.remoteUrl], { cwd: mirrorRoot });
  await runGit(["remote", "set-url", "--push", remote.name, remote.remoteUrl], { cwd: mirrorRoot });
}

function mirrorRootForRepo(repoRoot) {
  const token = hashString(path.resolve(repoRoot)).slice(0, 12);
  return path.join(os.tmpdir(), `platform-git-mirror-${token}`);
}

async function checkoutMirrorBranch({ mirrorRoot, remoteName, gitBranchName, refRows = [] }) {
  if (branchExists(refRows, gitBranchName)) {
    await runGit(["checkout", gitBranchName], { cwd: mirrorRoot });
    return;
  }
  if (remoteBranchExists(refRows, remoteName, gitBranchName)) {
    await runGit(["checkout", "-b", gitBranchName, "--track", `${remoteName}/${gitBranchName}`], { cwd: mirrorRoot });
    return;
  }
  const defaultBranch = remoteDefaultBranchName(refRows, remoteName) || "main";
  const baseRef = remoteBranchExists(refRows, remoteName, defaultBranch)
    ? `${remoteName}/${defaultBranch}`
    : defaultBranch;
  await runGit(["checkout", "-b", gitBranchName, baseRef], { cwd: mirrorRoot });
}

async function mirrorBranchFiles({ mirrorRoot, selectedPaths = [] }) {
  const appliedPaths = [];
  for (const selectedPath of selectedPaths) {
    const sourcePath = selectedPath.absolutePath;
    const destinationPath = path.join(mirrorRoot, selectedPath.repoRelativePath);
    if (await pathExists(sourcePath)) {
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
    } else if (await pathExists(destinationPath)) {
      await fs.rm(destinationPath, { force: true });
    }
    appliedPaths.push(selectedPath.repoRelativePath);
  }
  return appliedPaths;
}

async function commitMirrorBranch({ mirrorRoot, gitBranchName, selectedPaths = [], actor }) {
  if (!selectedPaths.length) return null;
  await runGit(["add", "--", ...selectedPaths], { cwd: mirrorRoot });
  const status = await runGit(["status", "--porcelain", "--", ...selectedPaths], { cwd: mirrorRoot });
  const commitMessage = `platform push ${gitBranchName}`;
  if (!String(status.stdout || "").trim()) {
    const head = await runGit(["rev-parse", "HEAD"], { cwd: mirrorRoot });
    return {
      commitSha: String(head.stdout || "").trim() || null,
      commitMessage,
      createdCommit: false
    };
  }
  await runGit(["commit", "-m", commitMessage], {
    cwd: mirrorRoot,
    env: {
      GIT_AUTHOR_NAME: actor || "platform",
      GIT_AUTHOR_EMAIL: "platform@example.local",
      GIT_COMMITTER_NAME: actor || "platform",
      GIT_COMMITTER_EMAIL: "platform@example.local"
    }
  });
  const head = await runGit(["rev-parse", "HEAD"], { cwd: mirrorRoot });
  return {
    commitSha: String(head.stdout || "").trim() || null,
    commitMessage,
    createdCommit: true
  };
}

function defectForFailedPush(pushRecord) {
  const branchId = String(pushRecord?.branchId || "");
  const remoteName = String(pushRecord?.remoteName || "origin");
  const provider = String(pushRecord?.provider || "generic");
  const defectId = `defect:branch-push:${slugify(branchId)}:${slugify(remoteName)}`;
  return {
    id: defectId,
    title: `Push failure for ${branchId}`,
    defectKind: "branchPushFailed",
    status: "open",
    clusterId: `defectCluster:${slugify(`branch-push:${provider}:${remoteName}`)}`,
    clusterKey: `branch-push:${provider}:${remoteName}`,
    metricId: null,
    gateId: null,
    branchId,
    changeSetId: pushRecord?.changeSetId ?? null,
    candidateSnapshotId: null,
    ownerId: pushRecord?.remoteBranchRef ?? pushRecord?.gitBranchName ?? branchId,
    summary: pushRecord?.error || "Git push failed",
    observedAt: pushRecord?.createdAt ?? null,
    pushRecordId: pushRecord?.id ?? null
  };
}

function proposalForPushDefect(defect) {
  return {
    id: `proposal.platform.${String(defect.id || "").replace(/[^a-zA-Z0-9]+/g, ".").replace(/^\.+|\.+$/g, "")}`,
    status: "open",
    targetProcess: "defect.create",
    targetKind: "defect",
    targetId: defect.id,
    reason: defect.summary || defect.title || defect.id,
    title: `Create defect record for ${defect.title || defect.id}`,
    body: {
      defectId: defect.id,
      defectKind: defect.defectKind,
      clusterId: defect.clusterId,
      branchId: defect.branchId,
      changeSetId: defect.changeSetId
    },
    origin: "derived-defect"
  };
}

export async function pushPlatformBranch(world, {
  actor,
  branchId,
  remoteName = "origin",
  dryRun = false,
  gitBranchName = null,
  session = null,
  repoRoot = defaultWorkspaceRoot,
  mirrorRoot = null
}) {
  const branch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null;
  if (!branch) return { ok: false, status: 404, error: "branch not found" };
  const appliedChangeSet = latestAppliedChangeSet(world, branchId);
  if (!appliedChangeSet) {
    return { ok: false, status: 409, error: "branch has no applied change set to push" };
  }
  const selectedPaths = stagedPathsForAppliedBranch(world, branchId);
  if (!selectedPaths.length) {
    return { ok: false, status: 409, error: "branch has no applied paths to push" };
  }
  const resolvedRepoRoot = path.resolve(optionalText(repoRoot) || defaultWorkspaceRoot);
  const resolvedMirrorRoot = path.resolve(optionalText(mirrorRoot) || mirrorRootForRepo(resolvedRepoRoot));
  const selectedRepoPaths = repoRelativeSelectedPaths(selectedPaths, resolvedRepoRoot);
  if (selectedRepoPaths.outsidePaths.length) {
    return {
      ok: false,
      status: 409,
      error: `applied paths are outside the configured git repo root: ${selectedRepoPaths.outsidePaths.join(", ")}`
    };
  }
  const pushSequence = (world.project(moduleProjectors.pushRecordIndex).byBranch?.[branchId]?.length ?? 0) + 1;
  const resolvedGitBranchName = optionalText(gitBranchName)
    || optionalText(branch.gitBranchName)
    || defaultGitBranchName(branchId);
  const repositoryState = await readGitBoundaryState({ repoRoot: resolvedRepoRoot });
  const remote = repositoryState.remotes.find(row => row.name === String(remoteName || "origin")) ?? null;
  if (!remote) return { ok: false, status: 404, error: `git remote not found: ${remoteName}` };
  const mirrorState = await ensureMirrorRepo({ repoRoot: resolvedRepoRoot, mirrorRoot: resolvedMirrorRoot });
  await syncMirrorRemote({ mirrorRoot: resolvedMirrorRoot, remote });
  await checkoutMirrorBranch({
    mirrorRoot: resolvedMirrorRoot,
    remoteName: remote.name,
    gitBranchName: resolvedGitBranchName,
    refRows: mirrorState.refs
  });
  await mirrorBranchFiles({
    mirrorRoot: resolvedMirrorRoot,
    selectedPaths: selectedRepoPaths.rows
  });
  const commit = await commitMirrorBranch({
    mirrorRoot: resolvedMirrorRoot,
    gitBranchName: resolvedGitBranchName,
    selectedPaths: selectedRepoPaths.rows.map(row => row.repoRelativePath),
    actor
  });
  const providerMeta = inferProviderFromRemoteUrl(remote.remoteUrl);
  const baseBranchName = remoteDefaultBranchName(mirrorState.refs, remote.name) || repositoryState.currentBranchName || "main";
  const localBranchRef = `refs/heads/${resolvedGitBranchName}`;
  const remoteBranchRef = `refs/heads/${resolvedGitBranchName}`;
  const createdAt = nowIso();
  const baseBody = {
    id: defaultPushRecordId(branchId, pushSequence),
    branchId,
    changeSetId: appliedChangeSet.id,
    status: dryRun ? "dryRun" : "pushed",
    remoteName: remote.name,
    remoteUrl: remote.remoteUrl,
    provider: providerMeta.provider,
    gitBranchName: resolvedGitBranchName,
    localBranchRef,
    remoteBranchRef,
    commitSha: commit?.commitSha ?? null,
    commitMessage: commit?.commitMessage ?? null,
    compareUrl: compareUrlForProvider({
      provider: providerMeta.provider,
      webUrl: providerMeta.webUrl,
      baseBranchName,
      gitBranchName: resolvedGitBranchName
    }),
    pullRequestUrl: pullRequestUrlForProvider({
      provider: providerMeta.provider,
      webUrl: providerMeta.webUrl,
      gitBranchName: resolvedGitBranchName
    }),
    dryRun: dryRun === true,
    owner: actor,
    runtimeProfile: branch.runtimeProfile ?? null,
    session: session?.id ?? null,
    createdAt,
    baseBranchName,
    mirrorRoot: resolvedMirrorRoot
  };
  try {
    await runGit(
      dryRun
        ? ["push", "--dry-run", remote.name, `${localBranchRef}:${remoteBranchRef}`]
        : ["push", remote.name, `${localBranchRef}:${remoteBranchRef}`],
      { cwd: resolvedMirrorRoot }
    );
    if (!dryRun) {
      await runGit(["fetch", remote.name], { cwd: resolvedRepoRoot, allowedExitCodes: [0, 1] }).catch(() => {});
    }
    ensureThing(world, actor, baseBody.id);
    const witness = world.emit({
      process: "platform.branch.push",
      actor,
      claims: [
        relation(branchId, "pushesTo", `gitRemote:${remote.name}`),
        relation(baseBody.id, "hasModuleKind", "pushRecord")
      ],
      body: baseBody
    });
    const pushRecord = world.project(moduleProjectors.pushRecordIndex).byId?.[baseBody.id] ?? baseBody;
    const updatedBranch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? null;
    const branchResponse = updatedBranch ? {
      ...updatedBranch,
      gitBranchName: resolvedGitBranchName,
      latestPushRecordId: pushRecord.id,
      latestPushStatus: pushRecord.status,
      pushRecordIds: stableUnique([...(updatedBranch.pushRecordIds ?? []), pushRecord.id]),
      status: pushRecord.status === "pushed" ? "pushed" : updatedBranch.status
    } : null;
    const refreshedGit = await readGitBoundaryState({ repoRoot: resolvedRepoRoot });
    const ref = refreshedGit.refs.find(row => row.refName === `refs/remotes/${remote.name}/${resolvedGitBranchName}`)
      ?? refreshedGit.refs.find(row => row.refName === localBranchRef)
      ?? null;
    return {
      ok: true,
      status: 200,
      branch: branchResponse,
      pushRecord,
      remote,
      ref,
      witness
    };
  } catch (error) {
    const failedBody = {
      ...baseBody,
      status: "failed",
      error: error instanceof Error ? (error.result?.stderr?.trim() || error.message) : String(error)
    };
    ensureThing(world, actor, failedBody.id);
    const witness = world.emit({
      process: "platform.branch.push",
      actor,
      claims: [
        relation(branchId, "pushesTo", `gitRemote:${remote.name}`),
        relation(failedBody.id, "hasModuleKind", "pushRecord")
      ],
      body: failedBody
    });
    const defect = defectForFailedPush(failedBody);
    const proposal = proposalForPushDefect(defect);
    ensureThing(world, actor, proposal.id);
    world.emit({
      process: "createProposal",
      actor,
      claims: [relation(proposal.id, "proposes", defect.id)],
      body: {
        id: proposal.id,
        proposer: actor,
        targetProcess: "defect.create",
        targetKind: "defect",
        targetId: defect.id,
        body: proposal.body,
        reason: proposal.reason,
        status: proposal.status
      }
    });
    return {
      ok: false,
      status: 409,
      error: failedBody.error,
      branch: (() => {
        const currentBranch = world.project(moduleProjectors.branchIndex).byId?.[branchId] ?? branch;
        return currentBranch ? {
          ...currentBranch,
          gitBranchName: resolvedGitBranchName,
          latestPushRecordId: failedBody.id,
          latestPushStatus: failedBody.status,
          pushRecordIds: stableUnique([...(currentBranch.pushRecordIds ?? []), failedBody.id])
        } : null;
      })(),
      pushRecord: world.project(moduleProjectors.pushRecordIndex).byId?.[failedBody.id] ?? failedBody,
      remote,
      ref: null,
      defect,
      proposal,
      witness
    };
  }
}
