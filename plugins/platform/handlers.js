import path from "node:path";
import { relation } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";
import {
  requestBootstrapProposalApprove,
  requestBootstrapProposalCreate,
  requestBootstrapProposalReject
} from "../proposals/proposal-processes.js";
import {
  abandonPlatformChangeSet,
  createPlatformBranch,
  listPlatformBranches,
  listPlatformChangeSets,
  readPlatformBranch,
  readPlatformChangeSet,
  rejectPlatformChangeSet,
  removePlatformChangeSetEdit,
  createPlatformChangeSet,
  applyPlatformChangeSet,
  stagePlatformChangeSetEdits,
  validatePlatformChangeSet
} from "./change-sets.js";
import { pushPlatformBranch } from "./git-push.js";
import { ensureAutomaticShipRollbackProposals, shipPlatformBranch } from "./git-ship.js";
import { buildPlatformSlice, filterPlatformModel, selectVerificationRequirementState } from "./platform-model.js";
import { readDeclaredPlatformSliceView } from "./materialized-platform-views.js";
import { renderPlatformPageFragment, renderPlatformShellPage, resolvePlatformLocation } from "./platform-page.js";
import { buildPlatformProposalCreateBody } from "./platform-proposals.js";
import {
  denyPlatformDecisionPayload,
  emitPlatformAuthorityDecision,
  evaluatePlatformPolicy
} from "./platform-security.js";
import { readPlatformTestRun, runPlatformTestCommand, runPlatformTestGate } from "./test-runs.js";

const PLATFORM_TEST_RUN_EVENT_PROCESSES = new Set(["platform.test.run.start", "platform.test.run.finish"]);
const pendingAutoRollbackProposalEnsures = new WeakMap();

function platformTestRunEventFrame(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function platformTestRunEventPayload(witness) {
  const body = witness?.body ?? {};
  const results = Array.isArray(body.results) ? body.results : [];
  return {
    witnessId: witness?.id ?? null,
    process: witness?.process ?? null,
    phase: witness?.process === "platform.test.run.start" ? "start" : "finish",
    runId: body.id ? String(body.id) : null,
    gateId: body.gateId ? String(body.gateId) : null,
    title: body.title ? String(body.title) : null,
    status: body.status ? String(body.status) : null,
    branchId: body.branchId ? String(body.branchId) : null,
    changeSetId: body.changeSetId ? String(body.changeSetId) : null,
    candidateSnapshotId: body.candidateSnapshotId ? String(body.candidateSnapshotId) : null,
    startedAt: body.startedAt ?? null,
    finishedAt: body.finishedAt ?? null,
    durationMs: typeof body.durationMs === "number" ? body.durationMs : null,
    exitCode: typeof body.exitCode === "number" ? body.exitCode : null,
    timedOut: body.timedOut === true,
    error: body.error ?? null,
    resultIds: results.map(result => String(result?.id || "")).filter(Boolean)
  };
}

function summarizePlatformTestBatch(results = []) {
  const latestResults = (Array.isArray(results) ? results : []).map(result => result?.latestResult).filter(Boolean);
  const counts = {
    totalRuns: latestResults.length,
    passed: 0,
    failed: 0,
    errors: 0,
    timedOut: 0,
    cached: 0
  };
  for (const result of latestResults) {
    const status = String(result.status || "");
    if (status === "passed") counts.passed += 1;
    else if (status === "failed") counts.failed += 1;
    else if (status === "error") counts.errors += 1;
    else if (status === "timed_out") counts.timedOut += 1;
    if (String(result.cacheStatus || "") === "hit") counts.cached += 1;
  }
  return counts;
}

function nowIso() {
  return new Date().toISOString();
}

function requestPathValue(requestUrl, fallbackPath) {
  if (typeof requestUrl === "string" && requestUrl.trim()) return requestUrl;
  const pathname = requestUrl?.pathname ?? fallbackPath ?? "";
  const search = requestUrl?.search ?? "";
  return `${pathname}${search}`;
}

function prefixedTargetId(prefix, value) {
  const text = typeof value === "string" && value.trim() ? value.trim() : "";
  if (!text) return null;
  return text.startsWith(`${prefix}:`) ? text : `${prefix}:${text}`;
}

function renderPlatformAccessDeniedHtml(payload, {
  title = "Platform Access Denied"
} = {}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${payload.reason || payload.error || "Platform access denied."}</p>
      <ul>
        <li>Policy: ${payload.policyId || "unknown"}</li>
        <li>Decision: ${payload.decisionId || "unknown"}</li>
        <li>Required authority: ${payload.requiredAuthority || "unknown"}</li>
      </ul>
    </main>
  </body>
</html>`;
}

function truthyFlag(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function platformSessionId(requestSession) {
  return requestSession?.id ? String(requestSession.id) : null;
}

function platformRequestAuditContext({
  access = null,
  requestSession = null,
  appContext = null
} = {}) {
  return {
    sessionId: platformSessionId(requestSession),
    authenticatedActor: access?.authority?.authenticatedActor ?? requestSession?.authenticatedActor ?? null,
    effectiveActor: access?.authority?.effectiveActor ?? requestSession?.effectiveActor ?? requestSession?.actor ?? null,
    authorityMode: access?.authority?.authorityMode ?? requestSession?.authorityMode ?? "direct",
    assumptionGrantId: access?.authority?.assumptionGrantId ?? requestSession?.assumptionGrantId ?? null,
    runtimeProfile: appContext?.runtimeProfile ?? null,
    authorityDecisionId: access?.decisionId ?? null,
    authorityPolicyId: access?.policyId ?? null
  };
}

function isWithinRoot(filePath, rootPath) {
  const relative = path.relative(rootPath, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function appSnapshotRoots(snapshotManager) {
  const appRoot = typeof snapshotManager?.appRoot === "string" && snapshotManager.appRoot.trim()
    ? path.resolve(snapshotManager.appRoot)
    : null;
  if (!appRoot) return [];
  return [
    appRoot,
    path.join(path.dirname(appRoot), "_lib")
  ];
}

async function refreshSnapshotAfterPlatformApply(snapshotManager, appliedFiles = [], eventMeta = {}) {
  if (!snapshotManager || !Array.isArray(appliedFiles) || !appliedFiles.length) {
    return { touchedRuntime: false, changedPaths: [], diagnostics: null, revisionEvent: null, refreshError: null };
  }
  const roots = appSnapshotRoots(snapshotManager);
  const changedPaths = appliedFiles
    .map(file => typeof file?.absolutePath === "string" ? path.resolve(file.absolutePath) : null)
    .filter(Boolean)
    .filter(filePath => roots.some(root => isWithinRoot(filePath, root)));
  if (!changedPaths.length) {
    return { touchedRuntime: false, changedPaths: [], diagnostics: null, revisionEvent: null, refreshError: null };
  }
  try {
    await snapshotManager.markDirtyPaths(changedPaths, {
      trigger: "platform-change-set-apply",
      branchId: eventMeta?.branchId ?? null,
      changeSetId: eventMeta?.changeSetId ?? null,
      status: "active"
    });
    return {
      touchedRuntime: true,
      changedPaths,
      diagnostics: snapshotManager.diagnostics?.() ?? null,
      revisionEvent: snapshotManager.getLastRevisionEvent?.() ?? null,
      refreshError: null
    };
  } catch (error) {
    return {
      touchedRuntime: true,
      changedPaths,
      diagnostics: snapshotManager.diagnostics?.() ?? null,
      revisionEvent: snapshotManager.getLastRevisionEvent?.() ?? null,
      refreshError: error instanceof Error ? error.message : "app snapshot refresh failed"
    };
  }
}

function scheduleAutomaticShipRollbackProposals(world, appContext, ensureAutomaticShipRollbackProposalsImpl) {
  const key = appContext && typeof appContext === "object"
    ? appContext
    : (world && typeof world === "object" ? world : null);
  if (!key || typeof ensureAutomaticShipRollbackProposalsImpl !== "function") return;
  if (pendingAutoRollbackProposalEnsures.has(key)) return;
  const task = Promise.resolve()
    .then(() => ensureAutomaticShipRollbackProposalsImpl(world, {
      actor: "platform.auto",
      appContext
    }))
    .catch(() => {})
    .finally(() => {
      pendingAutoRollbackProposalEnsures.delete(key);
    });
  pendingAutoRollbackProposalEnsures.set(key, task);
}

async function platformModelFor(
  world,
  appContext,
  sliceKey = "overview",
  {
    location = null,
    buildPlatformSliceImpl = buildPlatformSlice,
    ensureAutomaticShipRollbackProposalsImpl = ensureAutomaticShipRollbackProposals
  } = {}
) {
  scheduleAutomaticShipRollbackProposals(world, appContext, ensureAutomaticShipRollbackProposalsImpl);
  return readDeclaredPlatformSliceView(world, appContext, {
    sliceKey,
    sectionId: location?.section?.id ?? null,
    modelView: location?.section?.modelView ?? null,
    request: {
      id: `${location?.ctx?.area || "platform"}:${location?.ctx?.section || sliceKey}`,
      actor: "platform.cache",
      path: location?.requestPath ?? "/api/platform-page",
      view: location?.section?.modelView ?? null,
      area: location?.ctx?.area ?? null,
      section: location?.ctx?.section ?? null
    },
    buildPlatformSliceImpl
  });
}

function blockingVerificationRequirements(requirements = []) {
  return (Array.isArray(requirements) ? requirements : []).filter(row =>
    row?.blocking === true
    && ["failed", "stale", "missing", "running"].includes(String(row?.status || ""))
  );
}

export function createPlatformHandlers({
  world,
  backendHost,
  frontendHost,
  readJson,
  authoringServices,
  platformTestRunner = runPlatformTestCommand,
  sendGateFailure,
  send,
  sendJson,
  buildPlatformSliceImpl = buildPlatformSlice,
  ensureAutomaticShipRollbackProposalsImpl = ensureAutomaticShipRollbackProposals
}) {
  const requireBootstrapActor = authoringServices?.requireBootstrapActor ?? (() => ({ ok: false, status: 503, reason: "bootstrap authoring services are not available" }));
  const executeBootstrapProposal = authoringServices?.executeBootstrapProposal ?? null;
  const policyFailureStatus = evaluation => {
    if (!evaluation?.authority?.effectiveActor) return 401;
    if (evaluation?.policy?.policyKey === "platform.execute.operator" && evaluation?.operatorGate && !evaluation.operatorGate.ok) {
      return evaluation.operatorGate.status || 403;
    }
    return 403;
  };
  const authorizePlatformRequest = ({
    res,
    requestActor,
    requestSession,
    handlerId,
    routeId,
    requestPath,
    modelView = null,
    targetObjectId = null,
    kind = "read",
    html = false,
    htmlTitle = "Platform Access Denied"
  }) => {
    const evaluation = evaluatePlatformPolicy(world, {
      requireBootstrapActor,
      requestActor,
      requestSession,
      handlerId,
      routeId,
      requestPath,
      modelView,
      targetObjectId,
      kind,
      action: handlerId
    });
    const { decisionId } = emitPlatformAuthorityDecision(world, evaluation);
    if (!evaluation.ok) {
      const payload = denyPlatformDecisionPayload(evaluation, decisionId);
      const status = policyFailureStatus(evaluation);
      if (html) {
        send(res, status, "text/html; charset=utf-8", renderPlatformAccessDeniedHtml(payload, { title: htmlTitle }));
      } else {
        sendJson(res, status, payload);
      }
      return null;
    }
    return {
      actor: evaluation.authority.effectiveActor || evaluation.authority.authenticatedActor || requestActor || null,
      authority: evaluation.authority,
      decisionId,
      policyId: evaluation.policy?.id ?? null
    };
  };
  return {
    "platform.model.read": async ({ res, requestUrl, requestActor, requestSession, appContext }) => {
      const startedAt = nowIso();
      const startedAtMs = Date.now();
      const location = resolvePlatformLocation(requestUrl);
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.model.read",
        routeId: "route:GET /api/platform-model",
        requestPath: requestPathValue(requestUrl, "/api/platform-model"),
        modelView: location.ctx.requestedView || location.section.modelView,
        targetObjectId: location.ctx.id,
        kind: "read"
      });
      if (!access) return;
      const model = await platformModelFor(world, appContext, location.section.sliceKey, {
        location: { ...location, requestPath: requestPathValue(requestUrl, "/api/platform-model") },
        buildPlatformSliceImpl,
        ensureAutomaticShipRollbackProposalsImpl
      });
      const finishedAt = nowIso();
      world.observe({
        process: "backend.readPlatformModel",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformModel")],
        body: {
          area: location.ctx.area,
          section: location.ctx.section,
          routeId: "route:GET /api/platform-model",
          handlerId: "platform.model.read",
          view: location.ctx.requestedView || location.section.modelView,
          nodes: model.nodes.length,
          gaps: model.gaps.length,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedAtMs,
          ...platformRequestAuditContext({ access, requestSession, appContext })
        }
      });
      sendJson(res, 200, filterPlatformModel(model, location.section.modelView, location.ctx.id, {
        context: location.ctx.context,
        name: location.ctx.name,
        target: location.ctx.target
      }));
    },

    "platform.gaps.read": async ({ res, requestActor, requestSession, appContext }) => {
      const startedAt = nowIso();
      const startedAtMs = Date.now();
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.gaps.read",
        routeId: "route:GET /api/platform-gaps",
        requestPath: "/api/platform-gaps",
        modelView: "signalsGaps",
        kind: "read"
      });
      if (!access) return;
      const model = await platformModelFor(world, appContext, "overview", {
        location: { section: { id: "summary", modelView: "summary" }, ctx: { area: "overview", section: "summary" }, requestPath: "/api/platform-gaps" },
        buildPlatformSliceImpl,
        ensureAutomaticShipRollbackProposalsImpl
      });
      const finishedAt = nowIso();
      world.observe({
        process: "backend.readPlatformGaps",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformGaps")],
        body: {
          routeId: "route:GET /api/platform-gaps",
          handlerId: "platform.gaps.read",
          gaps: model.gaps.length,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedAtMs,
          ...platformRequestAuditContext({ access, requestSession, appContext })
        }
      });
      sendJson(res, 200, { gaps: model.gaps, summaries: model.summaries });
    },

    "platform.page.read": async ({ res, requestActor, requestSession, requestUrl, appContext }) => {
      const startedAt = nowIso();
      const startedAtMs = Date.now();
      const location = resolvePlatformLocation(requestUrl);
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.page.read",
        routeId: "route:GET /api/platform-page",
        requestPath: requestPathValue(requestUrl, "/api/platform-page"),
        modelView: location.ctx.requestedView || location.section.modelView,
        targetObjectId: location.ctx.id,
        kind: "read",
        html: true,
        htmlTitle: "Platform Fragment Access Denied"
      });
      if (!access) return;
      const model = await platformModelFor(world, appContext, location.section.sliceKey, {
        location: { ...location, requestPath: requestPathValue(requestUrl, "/api/platform-page") },
        buildPlatformSliceImpl,
        ensureAutomaticShipRollbackProposalsImpl
      });
      const finishedAt = nowIso();
      world.observe({
        process: "frontend.renderPlatformPageFragment",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", "platformConsoleFragment")],
        body: {
          area: location.ctx.area,
          section: location.ctx.section,
          routeId: "route:GET /api/platform-page",
          handlerId: "platform.page.read",
          view: location.ctx.requestedView || location.section.modelView,
          nodes: model.nodes.length,
          gaps: model.gaps.length,
          startedAt,
          finishedAt,
          durationMs: Date.now() - startedAtMs,
          ...platformRequestAuditContext({ access, requestSession, appContext })
        }
      });
      send(res, 200, "text/html; charset=utf-8", renderPlatformPageFragment(model, { requestUrl }));
    },

    "platform.branch.list": async ({ res, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.branch.list",
        routeId: "route:GET /api/platform-branches",
        requestPath: "/api/platform-branches",
        modelView: "workflowBranches",
        kind: "read"
      });
      if (!access) return;
      sendJson(res, 200, { branches: listPlatformBranches(world) });
    },

    "platform.branch.read": async ({ res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.branch.read",
        routeId: "route:GET /api/platform-branches/:id",
        requestPath: `/api/platform-branches/${encodeURIComponent(params.id || "")}`,
        modelView: "workflowBranches",
        targetObjectId: prefixedTargetId("branch", params.id),
        kind: "read"
      });
      if (!access) return;
      const result = readPlatformBranch(world, params.id || "");
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        changeSets: result.changeSets,
        edits: result.edits,
        candidateSnapshots: result.candidateSnapshots,
        latestCandidateSnapshot: result.latestCandidateSnapshot,
        validationHistory: result.validationHistory,
        pushRecords: result.pushRecords,
        latestPushRecord: result.latestPushRecord,
        shipRecords: result.shipRecords,
        latestShipRecord: result.latestShipRecord
      });
    },

    "platform.branch.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const body = await readJson(req);
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.branch.create",
        routeId: "route:POST /api/platform-branches",
        requestPath: "/api/platform-branches",
        targetObjectId: body?.id ? prefixedTargetId("branch", body.id) : null,
        kind: "mutation"
      });
      if (!access) return;
      const result = createPlatformBranch(world, {
        actor: access.actor,
        id: body?.id ?? null,
        title: body?.title ?? null,
        parentBranchId: body?.parentBranchId ?? null,
        epic: body?.epic ?? null,
        feature: body?.feature ?? null,
        defect: body?.defect ?? null,
        session: requestSession ?? null,
        runtimeProfile: appContext?.runtimeProfile ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        witness: result.witness
      });
    },

    "platform.branch.push": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.branch.push",
        routeId: "route:POST /api/platform-branches/:id/push",
        requestPath: `/api/platform-branches/${encodeURIComponent(params.id || "")}/push`,
        targetObjectId: prefixedTargetId("branch", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = await readJson(req);
      const result = await pushPlatformBranch(world, {
        actor: access.actor,
        branchId: params.id || "",
        remoteName: body?.remoteName ?? "origin",
        dryRun: truthyFlag(body?.dryRun),
        gitBranchName: body?.gitBranchName ?? null,
        session: requestSession ?? null,
        repoRoot: appContext?.platformGit?.repoRoot ?? null,
        mirrorRoot: appContext?.platformGit?.mirrorRoot ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
          branch: result.branch ?? null,
          pushRecord: result.pushRecord ?? null,
          remote: result.remote ?? null,
          ref: result.ref ?? null,
          defect: result.defect ?? null,
          proposal: result.proposal ?? null,
          witness: result.witness ?? null
        });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        pushRecord: result.pushRecord,
        remote: result.remote,
        ref: result.ref,
        witness: result.witness
      });
    },

    "platform.branch.ship": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.branch.ship",
        routeId: "route:POST /api/platform-branches/:id/ship",
        requestPath: `/api/platform-branches/${encodeURIComponent(params.id || "")}/ship`,
        targetObjectId: prefixedTargetId("branch", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = await readJson(req);
      const result = await shipPlatformBranch(world, {
        actor: access.actor,
        branchId: params.id || "",
        releaseChannelId: body?.releaseChannelId ?? "releaseChannel:local",
        proposalId: body?.proposalId ?? null,
        session: requestSession ?? null,
        appContext
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
          branch: result.branch ?? null,
          shipRecord: result.shipRecord ?? null,
          releaseChannel: result.releaseChannel ?? null,
          gateResults: result.gateResults ?? null,
          pushRecord: result.pushRecord ?? null,
          proposal: result.proposal ?? null,
          rollbackProposal: result.rollbackProposal ?? null,
          witness: result.witness ?? null
        });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        shipRecord: result.shipRecord,
        releaseChannel: result.releaseChannel,
        gateResults: result.gateResults,
        pushRecord: result.pushRecord,
        proposal: result.proposal,
        rollbackProposal: result.rollbackProposal ?? null,
        witness: result.witness
      });
    },

    "platform.changeSet.list": async ({ res, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.list",
        routeId: "route:GET /api/platform-change-sets",
        requestPath: "/api/platform-change-sets",
        modelView: "workflowChangeSets",
        kind: "read"
      });
      if (!access) return;
      sendJson(res, 200, { changeSets: listPlatformChangeSets(world) });
    },

    "platform.changeSet.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.read",
        routeId: "route:GET /api/platform-change-sets/:id",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}`,
        modelView: "workflowChangeSets",
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "read"
      });
      if (!access) return;
      const result = readPlatformChangeSet(world, params.id || "");
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      const model = await platformModelFor(world, appContext, "workflowChangeSets");
      const verificationState = selectVerificationRequirementState(model, {
        changeSetId: result.changeSet?.id ?? null,
        candidateSnapshotId: result.latestCandidateSnapshot?.id ?? result.activeCandidateSnapshot?.id ?? null
      });
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        branch: result.branch,
        edits: result.edits,
        candidateSnapshots: result.candidateSnapshots,
        latestCandidateSnapshot: result.latestCandidateSnapshot,
        activeCandidateSnapshot: result.activeCandidateSnapshot,
        verificationRequirements: verificationState.verificationRequirements,
        verificationRequirementSummary: verificationState.verificationRequirementSummary
      });
    },

    "platform.changeSet.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const body = await readJson(req);
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.create",
        routeId: "route:POST /api/platform-change-sets",
        requestPath: "/api/platform-change-sets",
        targetObjectId: body?.id ? prefixedTargetId("changeSet", body.id) : null,
        kind: "mutation"
      });
      if (!access) return;
      const result = createPlatformChangeSet(world, {
        actor: access.actor,
        id: body?.id ?? null,
        branchId: body?.branchId ?? null,
        title: body?.title ?? null,
        reason: body?.reason ?? null,
        session: requestSession ?? null,
        runtimeProfile: appContext?.runtimeProfile ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        branch: result.branch,
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.changeSet.edit": async ({ req, res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.edit",
        routeId: "route:POST /api/platform-change-sets/:id/edits",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/edits`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = await readJson(req);
      const edits = Array.isArray(body?.edits)
        ? body.edits
        : (body?.path || body?.content ? [{ path: body.path, content: body.content, previousHash: body.previousHash ?? null }] : []);
      const result = await stagePlatformChangeSetEdits(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        edits,
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        edits: result.edits,
        staged: result.staged
      });
    },

    "platform.changeSet.removeEdit": async ({ res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.removeEdit",
        routeId: "route:DELETE /api/platform-change-sets/:id/edits/:pathHash",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/edits/${encodeURIComponent(params.pathHash || "")}`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const result = removePlatformChangeSetEdit(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        pathHash: params.pathHash || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        edits: result.edits,
        witness: result.witness
      });
    },

    "platform.changeSet.validate": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.validate",
        routeId: "route:POST /api/platform-change-sets/:id/validate",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/validate`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const result = await validatePlatformChangeSet(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      appContext?.providerRuntimes?.["platform.testMonitor"]?.scheduleChangeSetValidation?.({
        branchId: result.changeSet?.branchId ?? null,
        changeSetId: result.changeSet?.id ?? null,
        candidateSnapshotId: result.candidateSnapshot?.id ?? null,
        status: result.candidateSnapshot?.status ?? null
      });
      const model = await platformModelFor(world, appContext, "workflowChangeSets");
      const verificationState = selectVerificationRequirementState(model, {
        changeSetId: result.changeSet?.id ?? null,
        candidateSnapshotId: result.candidateSnapshot?.id ?? null
      });
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        candidateSnapshot: result.candidateSnapshot,
        activeCandidateSnapshotId: result.activeCandidateSnapshotId,
        witness: result.witness,
        revisionEvent: result.revisionEvent,
        verificationRequirements: verificationState.verificationRequirements,
        verificationRequirementSummary: verificationState.verificationRequirementSummary
      });
    },

    "platform.changeSet.apply": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.apply",
        routeId: "route:POST /api/platform-change-sets/:id/apply",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/apply`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      let changeSet = world.project(moduleProjectors.changeSetIndex).byId?.[params.id || ""] ?? null;
      let candidateSnapshotId = changeSet?.latestCandidateSnapshotId ?? null;
      if (changeSet && (String(changeSet.status || "") !== "validated" || !candidateSnapshotId)) {
        const validation = await validatePlatformChangeSet(world, {
          actor: access.actor,
          changeSetId: params.id || "",
          session: requestSession ?? null
        });
        if (!validation.ok) {
          sendJson(res, validation.status || 400, { error: validation.error });
          return;
        }
        changeSet = validation.changeSet ?? changeSet;
        candidateSnapshotId = validation.candidateSnapshot?.id ?? candidateSnapshotId;
        appContext?.providerRuntimes?.["platform.testMonitor"]?.scheduleChangeSetValidation?.({
          branchId: validation.changeSet?.branchId ?? null,
          changeSetId: validation.changeSet?.id ?? null,
          candidateSnapshotId: validation.candidateSnapshot?.id ?? null,
          status: validation.candidateSnapshot?.status ?? null
        });
      }
      const verificationModel = await platformModelFor(world, appContext, "workflowChangeSets");
      const verificationState = selectVerificationRequirementState(verificationModel, {
        changeSetId: params.id || "",
        candidateSnapshotId
      });
      const verificationGatingEnabled = Boolean(
        appContext?.verificationPolicy
        || (verificationModel.verificationPolicies ?? []).some(row => row?.gateId)
      );
      const gatingRequirements = verificationState.verificationRequirementSummary
        ? verificationState.verificationRequirements.filter(row =>
            String(row?.targetKind || "") === String(verificationState.verificationRequirementSummary?.targetKind || "")
            && String(row?.targetId || "") === String(verificationState.verificationRequirementSummary?.targetId || "")
          )
        : verificationState.verificationRequirements;
      const blockingRequirements = blockingVerificationRequirements(gatingRequirements);
      if (verificationGatingEnabled && blockingRequirements.length) {
        const message = `Change set ${params.id || ""} cannot be applied until blocking verification requirements are satisfied.`;
        const witness = world.emit({
          process: "platform.changeSet.apply.blocked",
          actor: access.actor,
          claims: [],
          body: {
            changeSetId: params.id || "",
            candidateSnapshotId,
            verificationRequirementSummary: verificationState.verificationRequirementSummary,
            verificationRequirements: blockingRequirements,
            message,
            blockedAt: new Date().toISOString()
          }
        });
        sendJson(res, 409, {
          error: "verification requirements block apply",
          message,
          changeSetId: params.id || "",
          candidateSnapshotId,
          verificationRequirementSummary: verificationState.verificationRequirementSummary,
          verificationRequirements: blockingRequirements,
          witness
        });
        return;
      }
      const result = await applyPlatformChangeSet(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
          ...(result.message ? { message: result.message } : {}),
          ...(result.verificationRequirementSummary ? { verificationRequirementSummary: result.verificationRequirementSummary } : {}),
          ...(result.verificationRequirements ? { verificationRequirements: result.verificationRequirements } : {}),
          ...(Array.isArray(result.details) ? { details: result.details } : {})
        });
        return;
      }
      const snapshotRefresh = await refreshSnapshotAfterPlatformApply(
        appContext?.appSnapshotManager ?? null,
        result.appliedFiles ?? [],
        {
          branchId: result.changeSet?.branchId ?? null,
          changeSetId: result.changeSet?.id ?? null
        }
      );
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        candidateSnapshotId: result.candidateSnapshotId,
        verificationRequirementSummary: verificationState.verificationRequirementSummary,
        witness: result.witness,
        runtimeSnapshotRefresh: snapshotRefresh.touchedRuntime
          ? {
              changedPaths: snapshotRefresh.changedPaths,
              diagnostics: snapshotRefresh.diagnostics,
              revisionEvent: snapshotRefresh.revisionEvent,
              ...(snapshotRefresh.refreshError ? { error: snapshotRefresh.refreshError } : {})
            }
          : null
      });
    },

    "platform.changeSet.reject": async ({ req, res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.reject",
        routeId: "route:POST /api/platform-change-sets/:id/reject",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/reject`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = req ? await readJson(req) : {};
      const result = rejectPlatformChangeSet(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        session: requestSession ?? null,
        reason: typeof body?.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.changeSet.abandon": async ({ req, res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.changeSet.abandon",
        routeId: "route:POST /api/platform-change-sets/:id/abandon",
        requestPath: `/api/platform-change-sets/${encodeURIComponent(params.id || "")}/abandon`,
        targetObjectId: prefixedTargetId("changeSet", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = req ? await readJson(req) : {};
      const result = abandonPlatformChangeSet(world, {
        actor: access.actor,
        changeSetId: params.id || "",
        session: requestSession ?? null,
        reason: typeof body?.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        witness: result.witness
      });
    },

    "platform.testRun.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.testRun.create",
        routeId: "route:POST /api/platform-test-runs",
        requestPath: "/api/platform-test-runs",
        kind: "mutation"
      });
      if (!access) return;
      const body = await readJson(req);
      const model = await platformModelFor(world, appContext);
      const gateId = body?.gateId ? String(body.gateId) : "";
      if (!gateId && body?.id) {
        sendJson(res, 400, { error: "explicit run id requires a specific gate id" });
        return;
      }
      if (gateId) {
        const gate = model.testGates?.find(row => row.id === gateId) ?? null;
        if (!gate) {
          sendJson(res, 404, { error: "test gate not found" });
          return;
        }
        const queuedInvoke = appContext?.providerRuntimes?.["platform.testMonitor"]?.scheduleInvoke?.({
          gateId,
          branchId: body?.branchId ?? null,
          changeSetId: body?.changeSetId ?? null,
          candidateSnapshotId: body?.candidateSnapshotId ?? null
        }) ?? null;
        if (queuedInvoke?.ok) {
          sendJson(res, queuedInvoke.status || 202, {
            triggerKind: "invoke",
            gateId,
            branchId: body?.branchId ?? null,
            changeSetId: body?.changeSetId ?? null,
            candidateSnapshotId: body?.candidateSnapshotId ?? null,
            queueEntries: queuedInvoke.queueEntries ?? []
          });
          return;
        }
        const result = await runPlatformTestGate(world, {
          actor: access.actor,
          gate,
          id: body?.id ?? null,
          branchId: body?.branchId ?? null,
          changeSetId: body?.changeSetId ?? null,
          candidateSnapshotId: body?.candidateSnapshotId ?? null,
          session: requestSession ?? null,
          runtimeProfile: appContext?.runtimeProfile ?? null,
          runCommand: platformTestRunner,
          verificationPersistence: appContext?.verificationPersistence ?? null,
          appContext
        });
        if (!result.ok) {
          sendJson(res, result.status || 400, { error: result.error });
          return;
        }
        sendJson(res, result.status, {
          testRun: result.testRun,
          testResults: result.testResults,
          testArtifacts: result.testArtifacts,
          testSuites: result.testSuites,
          testCases: result.testCases,
          testReports: result.testReports,
          regressionSummary: result.regressionSummary,
          latestResult: result.latestResult,
          startWitness: result.startWitness,
          finishWitness: result.finishWitness
        });
        return;
      }
      const requestedChangeSetId = body?.changeSetId ? String(body.changeSetId) : "";
      const requestedBranchId = body?.branchId ? String(body.branchId) : "";
      if (!requestedChangeSetId && !requestedBranchId) {
        sendJson(res, 400, { error: "gate id, branch id, or change set id is required" });
        return;
      }
      const scopeType = requestedChangeSetId ? "changeSet" : "branch";
      const changeSet = requestedChangeSetId
        ? (model.changeSets?.find(row => row.id === requestedChangeSetId) ?? null)
        : null;
      if (requestedChangeSetId && !changeSet) {
        sendJson(res, 404, { error: "change set not found" });
        return;
      }
      const resolvedBranchId = requestedChangeSetId
        ? String(changeSet?.branchId || requestedBranchId || "")
        : requestedBranchId;
      if (!resolvedBranchId) {
        sendJson(res, 400, { error: "branch id is required for selected test execution" });
        return;
      }
      const selectedGateIds = requestedChangeSetId
        ? [...(model.selectedTestGatesByChangeSet?.[requestedChangeSetId] ?? [])]
        : [...(model.selectedTestGatesByBranch?.[resolvedBranchId] ?? [])];
      if (!selectedGateIds.length) {
        sendJson(res, 409, {
          error: "no selected test gates for scope",
          selectionScope: {
            scopeType,
            branchId: resolvedBranchId,
            changeSetId: requestedChangeSetId || null,
            selectedGateIds: []
          }
        });
        return;
      }
      const gateById = Object.fromEntries((model.testGates ?? []).map(row => [String(row.id || ""), row]));
      const requestedCandidateSnapshotId = body?.candidateSnapshotId ? String(body.candidateSnapshotId) : null;
      const queuedSelected = appContext?.providerRuntimes?.["platform.testMonitor"]?.scheduleInvoke?.({
        gateIds: selectedGateIds,
        branchId: resolvedBranchId,
        changeSetId: requestedChangeSetId || null,
        candidateSnapshotId: requestedCandidateSnapshotId,
        trigger: "platform.testRun.create.selected"
      }) ?? null;
      if (queuedSelected?.ok) {
        sendJson(res, queuedSelected.status || 202, {
          selectionScope: {
            scopeType,
            branchId: resolvedBranchId,
            changeSetId: requestedChangeSetId || null,
            requestedCandidateSnapshotId,
            selectedGateIds
          },
          triggerKind: "invoke",
          queueEntries: queuedSelected.queueEntries ?? []
        });
        return;
      }
      const results = [];
      for (const selectedGateId of selectedGateIds) {
        const gate = gateById[selectedGateId] ?? null;
        if (!gate) continue;
        const gateCandidateSnapshotId = requestedCandidateSnapshotId && (gate.protectedObjects ?? []).includes("testEnvironment:platform-candidate-snapshot")
          ? requestedCandidateSnapshotId
          : null;
        const result = await runPlatformTestGate(world, {
          actor: access.actor,
          gate,
          id: null,
          branchId: resolvedBranchId,
          changeSetId: requestedChangeSetId || null,
          candidateSnapshotId: gateCandidateSnapshotId,
          session: requestSession ?? null,
          runtimeProfile: appContext?.runtimeProfile ?? null,
          runCommand: platformTestRunner,
          verificationPersistence: appContext?.verificationPersistence ?? null,
          appContext
        });
        if (!result.ok) {
          sendJson(res, result.status || 400, {
            error: result.error,
            selectionScope: {
              scopeType,
              branchId: resolvedBranchId,
              changeSetId: requestedChangeSetId || null,
              selectedGateIds
            },
            completedRuns: results.map(entry => entry.testRun?.id).filter(Boolean)
          });
          return;
        }
        results.push(result);
      }
      sendJson(res, 201, {
        selectionScope: {
          scopeType,
          branchId: resolvedBranchId,
          changeSetId: requestedChangeSetId || null,
          requestedCandidateSnapshotId,
          selectedGateIds
        },
        summaries: summarizePlatformTestBatch(results),
        testRuns: results.map(result => result.testRun),
        latestResults: results.map(result => result.latestResult).filter(Boolean),
        testResults: results.flatMap(result => result.testResults ?? []),
        testArtifacts: results.flatMap(result => result.testArtifacts ?? []),
        testSuites: results.flatMap(result => result.testSuites ?? []),
        testCases: results.flatMap(result => result.testCases ?? []),
        testReports: results.flatMap(result => result.testReports ?? []),
        regressionSummaries: results
          .map(result => result.regressionSummary)
          .filter(Boolean)
      });
    },

    "platform.testRun.events": async ({ req, res, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.testRun.events",
        routeId: "route:GET /api/platform-test-runs/events",
        requestPath: "/api/platform-test-runs/events",
        modelView: "verificationRuns",
        kind: "read"
      });
      if (!access) return;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      let cursor = world.witnessCount();
      res.write(platformTestRunEventFrame("ready", {
        cursor,
        runtimeProfile: appContext?.runtimeProfile ?? null
      }));
      const interval = setInterval(() => {
        const next = world.witnessesSince(cursor);
        cursor += next.length;
        for (const witness of next) {
          if (!PLATFORM_TEST_RUN_EVENT_PROCESSES.has(String(witness?.process || ""))) continue;
          res.write(platformTestRunEventFrame("testRun", platformTestRunEventPayload(witness)));
        }
      }, 100);
      interval.unref?.();
      req.on("close", () => {
        clearInterval(interval);
        try { res.end(); } catch {}
      });
    },

    "platform.testRun.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.testRun.read",
        routeId: "route:GET /api/platform-test-runs/:id",
        requestPath: `/api/platform-test-runs/${encodeURIComponent(params.id || "")}`,
        modelView: "verificationRuns",
        targetObjectId: prefixedTargetId("testRun", params.id),
        kind: "read"
      });
      if (!access) return;
      const result = await readPlatformTestRun(world, params.id || "", {
        verificationPersistence: appContext?.verificationPersistence ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        testRun: result.testRun,
        testResults: result.testResults,
        testArtifacts: result.testArtifacts,
        testSuites: result.testSuites,
        testCases: result.testCases,
        testReports: result.testReports,
        regressionSummary: result.regressionSummary,
        latestResult: result.latestResult,
        freshnessAtRead: result.freshnessAtRead,
        invalidationReasons: result.invalidationReasons
      });
    },

    "platform.artifact.content": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.artifact.content",
        routeId: "route:GET /api/platform-artifacts/:id/content",
        requestPath: `/api/platform-artifacts/${encodeURIComponent(params.id || "")}/content`,
        modelView: "artifacts",
        targetObjectId: prefixedTargetId("artifact", params.id),
        kind: "read"
      });
      if (!access) return;
      const artifactId = params.id || "";
      const persisted = await appContext?.verificationPersistence?.readArtifactContent?.(artifactId);
      if (persisted?.ok) {
        send(res, 200, persisted.contentType || "text/plain; charset=utf-8", persisted.content);
        return;
      }
      const artifact = world.project(moduleProjectors.artifacts)?.find?.(row => String(row?.id || "") === String(artifactId)) ?? null;
      if (!artifact?.content) {
        sendJson(res, 404, { error: "artifact content not found" });
        return;
      }
      send(res, 200, artifact.contentType || "text/plain; charset=utf-8", artifact.content);
    },

    "platform.testArtifact.content": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.testArtifact.content",
        routeId: "route:GET /api/platform-test-artifacts/:id/content",
        requestPath: `/api/platform-test-artifacts/${encodeURIComponent(params.id || "")}/content`,
        modelView: "verificationRuns",
        targetObjectId: prefixedTargetId("testArtifact", params.id),
        kind: "read"
      });
      if (!access) return;
      const artifactId = params.id || "";
      const persisted = await appContext?.verificationPersistence?.readArtifactContent?.(artifactId, { compatibility: "testArtifact" });
      if (persisted?.ok) {
        send(res, 200, persisted.contentType || "text/plain; charset=utf-8", persisted.content);
        return;
      }
      const artifact = world.project(moduleProjectors.testArtifacts)?.find?.(row => String(row?.id || "") === String(artifactId)) ?? null;
      if (!artifact?.content) {
        sendJson(res, 404, { error: "artifact content not found" });
        return;
      }
      send(res, 200, artifact.contentType || "text/plain; charset=utf-8", artifact.content);
    },

    "platform.proposal.create": async ({ req, res, requestActor, requestSession }) => {
      const body = await readJson(req);
      const proposalBody = buildPlatformProposalCreateBody(body);
      if (!proposalBody.ok) {
        sendJson(res, proposalBody.status || 400, { error: proposalBody.error });
        return;
      }
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.proposal.create",
        routeId: "route:POST /api/platform-proposals",
        requestPath: "/api/platform-proposals",
        targetObjectId: proposalBody.value?.targetId ? String(proposalBody.value.targetId) : null,
        kind: "mutation"
      });
      if (!access) return;
      const result = requestBootstrapProposalCreate(world, {
        actor: access.actor,
        backendHost,
        body: proposalBody.value
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness, platformProposal: proposalBody.value });
    },

    "platform.proposal.approve": async ({ res, params, requestActor, requestSession, appContext }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.proposal.approve",
        routeId: "route:POST /api/platform-proposals/:id/approve",
        requestPath: `/api/platform-proposals/${encodeURIComponent(params.id || "")}/approve`,
        targetObjectId: prefixedTargetId("proposal", params.id),
        kind: "mutation"
      });
      if (!access) return;
      if (!executeBootstrapProposal) {
        sendJson(res, 503, { error: "proposal executor is not available" });
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor: access.actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: proposal => executeBootstrapProposal(access.actor)(proposal, { appContext })
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "platform.proposal.reject": async ({ req, res, params, requestActor, requestSession }) => {
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "platform.proposal.reject",
        routeId: "route:POST /api/platform-proposals/:id/reject",
        requestPath: `/api/platform-proposals/${encodeURIComponent(params.id || "")}/reject`,
        targetObjectId: prefixedTargetId("proposal", params.id),
        kind: "mutation"
      });
      if (!access) return;
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor: access.actor,
        backendHost,
        proposalId: params.id || "",
        reason: typeof body.reason === "string" ? body.reason : null
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "page.platform": async ({ res, requestActor, requestSession, requestUrl, appContext }) => {
      const location = resolvePlatformLocation(requestUrl);
      const access = authorizePlatformRequest({
        res,
        requestActor,
        requestSession,
        handlerId: "page.platform",
        routeId: "route:GET /platform",
        requestPath: requestPathValue(requestUrl, "/platform"),
        modelView: location.ctx.requestedView || location.section.modelView,
        targetObjectId: location.ctx.id,
        kind: "read",
        html: true,
        htmlTitle: "Platform Access Denied"
      });
      if (!access) return;
      world.observe({
        process: "frontend.renderPlatformShellPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", "platformConsoleShell")],
        body: {
          area: location.ctx.area,
          section: location.ctx.section,
          routeId: "route:GET /platform",
          handlerId: "page.platform",
          view: location.ctx.requestedView || location.section.modelView,
          ...platformRequestAuditContext({ access, requestSession, appContext })
        }
      });
      send(res, 200, "text/html; charset=utf-8", renderPlatformShellPage({ requestUrl }));
    }
  };
}
