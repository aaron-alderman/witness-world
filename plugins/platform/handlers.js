import path from "node:path";
import { relation } from "../../src/kernel.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";
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
import { buildPlatformSlice, filterPlatformModel } from "./platform-model.js";
import { renderPlatformPageFragment, renderPlatformShellPage, resolvePlatformLocation } from "./platform-page.js";
import { buildPlatformProposalCreateBody } from "./platform-proposals.js";
import { readPlatformTestRun, runPlatformTestCommand, runPlatformTestGate } from "./test-runs.js";

const PLATFORM_TEST_RUN_EVENT_PROCESSES = new Set(["platform.test.run.start", "platform.test.run.finish"]);

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

async function platformModelFor(appContext, sliceKey = "overview") {
  return buildPlatformSlice({
    sliceKey,
    appContext,
    diagnostics: diagnosticsFromPlatformAppContext(appContext),
    project: appContext?.project ?? null
  });
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
  sendJson
}) {
  const requireBootstrapActor = authoringServices?.requireBootstrapActor ?? (() => ({ ok: false, status: 503, reason: "bootstrap authoring services are not available" }));
  const executeBootstrapProposal = authoringServices?.executeBootstrapProposal ?? null;
  const requirePlatformMutationActor = (res, requestActor) => {
    const gate = requireBootstrapActor(requestActor);
    if (!gate.ok) {
      if (sendGateFailure) sendGateFailure(res, gate);
      else sendJson(res, gate.status || 403, { error: gate.reason || "platform proposal mutation is not authorized" });
      return null;
    }
    return gate.actor;
  };
  return {
    "platform.model.read": async ({ res, requestUrl, requestActor, appContext }) => {
      const location = resolvePlatformLocation(requestUrl);
      const model = await platformModelFor(appContext, location.section.sliceKey);
      world.observe({
        process: "backend.readPlatformModel",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformModel")],
        body: { area: location.ctx.area, section: location.ctx.section, nodes: model.nodes.length, gaps: model.gaps.length }
      });
      sendJson(res, 200, filterPlatformModel(model, location.section.modelView, location.ctx.id, {
        context: location.ctx.context,
        name: location.ctx.name,
        target: location.ctx.target
      }));
    },

    "platform.gaps.read": async ({ res, requestActor, appContext }) => {
      const model = await platformModelFor(appContext);
      world.observe({
        process: "backend.readPlatformGaps",
        actor: requestActor || backendHost,
        claims: [relation(backendHost, "projected", "platformGaps")],
        body: { gaps: model.gaps.length }
      });
      sendJson(res, 200, { gaps: model.gaps, summaries: model.summaries });
    },

    "platform.page.read": async ({ res, requestActor, requestUrl, appContext }) => {
      const location = resolvePlatformLocation(requestUrl);
      const model = await platformModelFor(appContext, location.section.sliceKey);
      world.observe({
        process: "frontend.renderPlatformPageFragment",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", "platformConsoleFragment")],
        body: { area: location.ctx.area, section: location.ctx.section, nodes: model.nodes.length, gaps: model.gaps.length }
      });
      send(res, 200, "text/html; charset=utf-8", renderPlatformPageFragment(model, { requestUrl }));
    },

    "platform.branch.list": async ({ res }) => {
      sendJson(res, 200, { branches: listPlatformBranches(world) });
    },

    "platform.branch.read": async ({ res, params }) => {
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
        validationHistory: result.validationHistory
      });
    },

    "platform.branch.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const result = createPlatformBranch(world, {
        actor,
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

    "platform.changeSet.list": async ({ res }) => {
      sendJson(res, 200, { changeSets: listPlatformChangeSets(world) });
    },

    "platform.changeSet.read": async ({ res, params }) => {
      const result = readPlatformChangeSet(world, params.id || "");
      if (!result.ok) {
        sendJson(res, result.status || 404, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        branch: result.branch,
        edits: result.edits,
        candidateSnapshots: result.candidateSnapshots,
        latestCandidateSnapshot: result.latestCandidateSnapshot,
        activeCandidateSnapshot: result.activeCandidateSnapshot
      });
    },

    "platform.changeSet.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const result = createPlatformChangeSet(world, {
        actor,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const edits = Array.isArray(body?.edits)
        ? body.edits
        : (body?.path || body?.content ? [{ path: body.path, content: body.content, previousHash: body.previousHash ?? null }] : []);
      const result = await stagePlatformChangeSetEdits(world, {
        actor,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = removePlatformChangeSetEdit(world, {
        actor,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = await validatePlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, { error: result.error });
        return;
      }
      sendJson(res, result.status, {
        changeSet: result.changeSet,
        candidateSnapshot: result.candidateSnapshot,
        activeCandidateSnapshotId: result.activeCandidateSnapshotId,
        witness: result.witness,
        revisionEvent: result.revisionEvent
      });
      appContext?.providerRuntimes?.["platform.testMonitor"]?.scheduleChangeSetValidation?.({
        branchId: result.changeSet?.branchId ?? null,
        changeSetId: result.changeSet?.id ?? null,
        candidateSnapshotId: result.candidateSnapshot?.id ?? null,
        status: result.candidateSnapshot?.status ?? null
      });
    },

    "platform.changeSet.apply": async ({ res, params, requestActor, requestSession, appContext }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const result = await applyPlatformChangeSet(world, {
        actor,
        changeSetId: params.id || "",
        session: requestSession ?? null
      });
      if (!result.ok) {
        sendJson(res, result.status || 400, {
          error: result.error,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = rejectPlatformChangeSet(world, {
        actor,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = abandonPlatformChangeSet(world, {
        actor,
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
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const model = await platformModelFor(appContext);
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
        const result = await runPlatformTestGate(world, {
          actor,
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
      const results = [];
      for (const selectedGateId of selectedGateIds) {
        const gate = gateById[selectedGateId] ?? null;
        if (!gate) continue;
        const gateCandidateSnapshotId = requestedCandidateSnapshotId && (gate.protectedObjects ?? []).includes("testEnvironment:platform-candidate-snapshot")
          ? requestedCandidateSnapshotId
          : null;
        const result = await runPlatformTestGate(world, {
          actor,
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

    "platform.testRun.events": async ({ req, res, appContext }) => {
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

    "platform.testRun.read": async ({ res, params, appContext }) => {
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

    "platform.testArtifact.content": async ({ res, params, appContext }) => {
      const artifactId = params.id || "";
      const persisted = await appContext?.verificationPersistence?.readArtifactContent?.(artifactId);
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

    "platform.proposal.create": async ({ req, res, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = await readJson(req);
      const proposalBody = buildPlatformProposalCreateBody(body);
      if (!proposalBody.ok) {
        sendJson(res, proposalBody.status || 400, { error: proposalBody.error });
        return;
      }
      const result = requestBootstrapProposalCreate(world, {
        actor,
        backendHost,
        body: proposalBody.value
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness, platformProposal: proposalBody.value });
    },

    "platform.proposal.approve": async ({ res, params, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      if (!executeBootstrapProposal) {
        sendJson(res, 503, { error: "proposal executor is not available" });
        return;
      }
      const result = await requestBootstrapProposalApprove(world, {
        actor,
        backendHost,
        proposalId: params.id || "",
        executeTarget: executeBootstrapProposal(actor)
      });
      if (!result.ok) {
        sendJson(res, result.status, { error: result.error, witness: result.witness });
        return;
      }
      sendJson(res, result.status, { proposal: result.proposal, witness: result.witness });
    },

    "platform.proposal.reject": async ({ req, res, params, requestActor }) => {
      const actor = requirePlatformMutationActor(res, requestActor);
      if (!actor) return;
      const body = req ? await readJson(req) : {};
      const result = requestBootstrapProposalReject(world, {
        actor,
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

    "page.platform": async ({ res, requestActor, requestUrl, appContext }) => {
      const location = resolvePlatformLocation(requestUrl);
      world.observe({
        process: "frontend.renderPlatformShellPage",
        actor: requestActor || frontendHost,
        claims: [relation(frontendHost, "rendered", "platformConsoleShell")],
        body: { area: location.ctx.area, section: location.ctx.section }
      });
      send(res, 200, "text/html; charset=utf-8", renderPlatformShellPage({ requestUrl }));
    }
  };
}
