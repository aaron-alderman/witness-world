import { renderPlatformConsoleCss } from "./platform-style.js";

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function countByKind(model, kind) {
  return model.nodes.filter(node => node.kind === kind).length;
}

function lifecycleColumn(model, lifecycle) {
  const nodes = model.nodes
    .filter(node => node.lifecycle.includes(lifecycle))
    .slice(0, 18);
  return `
    <section class="platform-column">
      <h3>${esc(lifecycle)}</h3>
      ${nodes.map(node => `<div class="platform-chip">${esc(node.title)} <span>${esc(node.kind)}</span></div>`).join("")}
    </section>
  `;
}

function branchBoardColumn(lane) {
  return `
    <section class="platform-column" data-branch-lane="${esc(lane.id)}">
      <h3>${esc(lane.title)}</h3>
      <div class="muted">${esc(lane.count)} branch${lane.count === 1 ? "" : "es"}</div>
      ${lane.branches.map(branch => `
        <div class="platform-chip">
          ${esc(branch.title)}
          <span>${esc(branch.status)}</span>
          <div class="muted">change sets ${esc(branch.changeSetCount)}${branch.reviewProposalCount ? `, review ${esc(branch.reviewProposalCount)}` : ""}</div>
        </div>
      `).join("")}
    </section>
  `;
}

function inlineSummary(items, labelKey = "label") {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) return "";
  return rows.map(row => typeof row === "string" ? row : row?.[labelKey] || row?.id || "").filter(Boolean).join(", ");
}

function tableRows(rows, cells) {
  return rows.map(row => `<tr>${cells.map(cell => `<td>${esc(cell(row))}</td>`).join("")}</tr>`).join("");
}

export function renderPlatformPage(model) {
  const lifecycle = model.lifecycleVocabulary ?? [];
  const topNodes = model.nodes.slice(0, 80);
  const gaps = model.gaps.slice(0, 80);
  const profiles = model.profiles ?? [];
  const branches = model.branches ?? [];
  const changeSets = model.changeSets ?? [];
  const candidateSnapshots = model.candidateSnapshots ?? [];
  const runtimeRevisions = model.runtimeRevisions ?? [];
  const activeRuntimeRevision = model.activeRuntimeRevision ?? null;
  const snapshotBuilds = model.snapshotBuilds ?? [];
  const snapshotBuildErrors = model.snapshotBuildErrors ?? [];
  const snapshotDiagnostics = model.snapshotDiagnostics ?? null;
  const docs = model.docs ?? [];
  const docSections = model.docSections ?? [];
  const docTasks = model.docTasks ?? [];
  const testGates = model.testGates ?? [];
  const affectedTestGatesByBranch = model.affectedTestGatesByBranch ?? {};
  const testRuns = model.testRuns ?? [];
  const latestTestResultsByGate = model.latestTestResultsByGate ?? {};
  const roadmapTasks = model.roadmapTasks ?? [];
  const proposalActions = model.proposalActions ?? [];
  const proposals = model.proposals ?? [];
  const branchBoard = model.branchBoard ?? [];
  const openProposals = proposals.filter(row => row.status === "open");
  const initialBranch = branches[0] ?? null;
  const initialRuntimeRevision = runtimeRevisions[0] ?? null;
  const initialRuntimeSnapshotBuilds = initialRuntimeRevision
    ? snapshotBuilds.filter(row => Number(row.revision || 0) === Number(initialRuntimeRevision.revision || 0))
    : [];
  const initialRuntimeBuildErrors = initialRuntimeRevision
    ? snapshotBuildErrors.filter(row => Number(row.revision || 0) === Number(initialRuntimeRevision.revision || 0))
    : [];
  const initialRuntimeCandidateSnapshots = initialRuntimeRevision
    ? candidateSnapshots.filter(row => Number(row.revision || 0) === Number(initialRuntimeRevision.revision || 0))
    : [];
  const initialState = JSON.stringify(model).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Platform Console</title>
  <style>${renderPlatformConsoleCss()}</style>
</head>
<body class="platform-console">
  <header>
    <h1>Platform Console</h1>
    <div class="muted">Self-model, lifecycle board, profile map, verification gates, and proposal lane.</div>
  </header>
  <main>
    <section class="summary" aria-label="Platform summary">
      <div class="card"><div class="metric">${countByKind(model, "plugin")}</div><div class="muted">Plugins</div></div>
      <div class="card"><div class="metric">${countByKind(model, "bundle")}</div><div class="muted">Bundles</div></div>
      <div class="card"><div class="metric">${countByKind(model, "route")}</div><div class="muted">Routes</div></div>
      <div class="card"><div class="metric">${countByKind(model, "handler")}</div><div class="muted">Handlers</div></div>
      <div class="card"><div class="metric">${countByKind(model, "gate")}</div><div class="muted">Verification Gates</div></div>
      <div class="card"><div class="metric">${changeSets.length}</div><div class="muted">Change Sets</div></div>
      <div class="card"><div class="metric">${model.gaps.length}</div><div class="muted">Gaps</div></div>
    </section>

    <section>
      <h2>Lifecycle Board</h2>
      <div class="board">${lifecycle.map(item => lifecycleColumn(model, item)).join("")}</div>
    </section>

    <section>
      <h2>Branch Board</h2>
      <div class="board">${branchBoard.map(lane => branchBoardColumn(lane)).join("")}</div>
    </section>

    <section class="grid2">
      <div>
        <h2>Platform Map</h2>
        <table>
          <thead><tr><th>Kind</th><th>Title</th><th>Lifecycle</th><th>Status</th><th>Source</th></tr></thead>
          <tbody>${tableRows(topNodes, [
            row => row.kind,
            row => row.title,
            row => row.lifecycle.join(", "),
            row => row.status,
            row => row.source
          ])}</tbody>
        </table>
      </div>
      <aside>
        <h2>Proposal Panel</h2>
        <form id="platform-proposal-form">
          <label>Action
            <select name="action">
              ${proposalActions.map(action => `<option value="${esc(action.action)}">${esc(action.action)}</option>`).join("")}
            </select>
          </label>
          <label>Proposal id <input name="id" value="proposal.platform.${Date.now().toString(36)}"></label>
          <label>Target kind override <input name="targetKind" placeholder="derived from body"></label>
          <label>Target id override <input name="targetId" placeholder="derived from body"></label>
          <label>Reason <input name="reason" value="Platform stewardship change"></label>
          <label>Body JSON <textarea name="bodyJson">${esc(JSON.stringify(proposalActions[0]?.sampleBody ?? {}, null, 2))}</textarea></label>
          <button type="submit">Create Proposal</button>
          <div id="proposal-status"></div>
        </form>

        <h2>Review Proposals</h2>
        <form id="platform-review-form">
          <label>Open proposal
            <select name="id">
              ${openProposals.map(proposal => `<option value="${esc(proposal.id)}">${esc(proposal.id)}</option>`).join("")}
            </select>
          </label>
          <label>Reject reason <input name="reason" placeholder="Only used when rejecting"></label>
          <div style="display:flex; gap:8px;">
            <button type="submit" name="reviewAction" value="approve">Approve</button>
            <button type="submit" name="reviewAction" value="reject">Reject</button>
          </div>
          <div id="review-status"></div>
        </form>

        <h2>Change Set Panel</h2>
        <form id="platform-branch-create-form">
          <label>Branch id <input name="id" value="branch:${Date.now().toString(36)}"></label>
          <label>Title <input name="title" value="Platform branch"></label>
          <label>Parent branch <input name="parentBranchId" placeholder="Optional parent branch id"></label>
          <label>Epic <input name="epic" placeholder="Optional epic tag"></label>
          <label>Feature <input name="feature" placeholder="Optional feature tag"></label>
          <label>Defect <input name="defect" placeholder="Optional defect tag"></label>
          <button type="submit">Create Branch</button>
          <div id="branch-create-status"></div>
        </form>

        <form id="platform-change-set-create-form">
          <label>Change set id <input name="id" value="changeSet:${Date.now().toString(36)}"></label>
          <label>Branch id <input name="branchId" value="branch:platform-console"></label>
          <label>Title <input name="title" value="Platform console change"></label>
          <label>Reason <input name="reason" value="Stage platform console edits"></label>
          <button type="submit">Create Change Set</button>
          <div id="change-set-create-status"></div>
        </form>

        <form id="platform-change-set-edit-form">
          <label>Change set
            <select name="changeSetId">
              ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
            </select>
          </label>
          <label>Path <input name="path" value="plugins/platform/platform-console.rvm"></label>
          <label>Content <textarea name="content"></textarea></label>
          <button type="submit">Stage Edit</button>
          <div id="change-set-edit-status"></div>
        </form>

        <form id="platform-change-set-validate-form">
          <label>Change set
            <select name="changeSetId">
              ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Validate Change Set</button>
          <div id="change-set-validate-status"></div>
        </form>

        <form id="platform-change-set-apply-form">
          <label>Change set
            <select name="changeSetId">
              ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
            </select>
          </label>
          <button type="submit">Apply Change Set</button>
          <div id="change-set-apply-status"></div>
        </form>

        <form id="platform-change-set-lifecycle-form">
          <label>Change set
            <select name="changeSetId">
              ${changeSets.map(changeSet => `<option value="${esc(changeSet.id)}">${esc(changeSet.id)}</option>`).join("")}
            </select>
          </label>
          <label>Action
            <select name="action">
              <option value="reject">reject</option>
              <option value="abandon">abandon</option>
            </select>
          </label>
          <label>Reason <input name="reason" placeholder="Optional lifecycle reason"></label>
          <button type="submit">Update Change Set</button>
          <div id="change-set-lifecycle-status"></div>
        </form>
      </aside>
    </section>

    <section class="grid2">
      <div>
        <h2>Branches</h2>
        <table>
          <thead><tr><th>Status</th><th>Lane</th><th>Branch</th><th>Docs</th><th>Affected Systems</th><th>Telemetry</th><th>Parent</th><th>Owner</th><th>Change Sets</th><th>Latest Candidate</th></tr></thead>
          <tbody>${tableRows(branches.slice(0, 80), [
            row => row.status,
            row => row.lifecycleLane || "",
            row => row.id,
            row => row.docsFreshness?.status || "",
            row => inlineSummary(row.affectedSystemSummaries),
            row => inlineSummary(row.telemetryImpactSummaries),
            row => row.parentBranchId || "",
            row => row.owner || "",
            row => (row.changeSetIds || []).join(", "),
            row => row.latestCandidateSnapshotId || ""
          ])}</tbody>
        </table>
      </div>
      <div>
        <h2>Change Sets</h2>
        <table>
          <thead><tr><th>Status</th><th>Change Set</th><th>Branch</th><th>Edits</th><th>Candidate</th></tr></thead>
          <tbody>${tableRows(changeSets.slice(0, 80), [
            row => row.status,
            row => row.id,
            row => row.branchId,
            row => row.editCount ?? 0,
            row => row.latestCandidateSnapshotId || ""
          ])}</tbody>
        </table>
      </div>
    </section>

    <section class="grid2">
      <div>
        <h2>Branch Detail</h2>
        <label>Branch
          <select id="platform-branch-detail-select">
            ${branches.map(branch => `<option value="${esc(branch.id)}">${esc(branch.id)}</option>`).join("")}
          </select>
        </label>
        <pre id="platform-branch-detail-output">${esc(JSON.stringify(initialBranch, null, 2))}</pre>
        <div class="platform-branch-summary">
          <div class="card">
            <h3>Docs freshness</h3>
            <div id="platform-branch-docs-status">${esc(initialBranch?.docsFreshness?.status || "")}</div>
            <div class="muted" id="platform-branch-docs-summary">${esc(initialBranch?.docsFreshness?.summary || "")}</div>
          </div>
          <div class="card">
            <h3>Affected systems</h3>
            <div id="platform-branch-systems-summary">${esc(inlineSummary(initialBranch?.affectedSystemSummaries))}</div>
          </div>
          <div class="card">
            <h3>Telemetry impacts</h3>
            <div id="platform-branch-telemetry-summary">${esc(inlineSummary(initialBranch?.telemetryImpactSummaries))}</div>
          </div>
          <div class="card">
            <h3>Selected test gates</h3>
            <div id="platform-branch-test-gates-count">${esc((affectedTestGatesByBranch[initialBranch?.id] ?? []).length)}</div>
            <div class="muted" id="platform-branch-test-gates-summary">${esc((affectedTestGatesByBranch[initialBranch?.id] ?? []).join(", "))}</div>
          </div>
        </div>
      </div>
      <div>
        <h2>Branch Validation History</h2>
        <pre id="platform-branch-history-output">${esc(JSON.stringify(candidateSnapshots.filter(snapshot => snapshot.branchId === initialBranch?.id).map(snapshot => ({
          candidateSnapshotId: snapshot.id,
          changeSetId: snapshot.changeSetId,
          status: snapshot.status,
          revision: snapshot.revision,
          errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : 0
        })), null, 2))}</pre>
      </div>
    </section>

    <section>
      <h2>Test Gates</h2>
      <table>
        <thead><tr><th>Gate</th><th>Runner</th><th>Environment</th><th>Timeout</th><th>Protected Objects</th><th>Selected Branches</th><th>Last Result</th><th>Cost</th></tr></thead>
        <tbody>${tableRows(testGates.slice(0, 80), [
          row => row.title,
          row => row.runner,
          row => row.environment,
          row => row.timeoutMs,
          row => row.protectedObjectLabels.join(", "),
          row => row.selectedByBranches.join(", "),
          row => row.lastResult ? `${row.lastResult.status} (${row.lastResult.exitCode ?? "n/a"})` : "",
          row => row.costEstimate
        ])}</tbody>
      </table>
      <div class="card">
        <h3>Affected Test Gates By Branch</h3>
        <pre>${esc(JSON.stringify(affectedTestGatesByBranch, null, 2))}</pre>
      </div>
    </section>

    <section class="grid2">
      <div>
        <h2>Test Runs</h2>
        <form id="platform-test-run-form">
          <label>Test gate
            <select name="gateId">
              ${testGates.map(gate => `<option value="${esc(gate.id)}">${esc(gate.title)}</option>`).join("")}
            </select>
          </label>
          <label>Branch id <input name="branchId" placeholder="Optional branch id"></label>
          <label>Change set id <input name="changeSetId" placeholder="Optional change set id"></label>
          <label>Candidate snapshot id <input name="candidateSnapshotId" placeholder="Optional candidate snapshot id"></label>
          <button type="submit">Run Test Gate</button>
          <div id="test-run-status"></div>
        </form>
        <table>
          <thead><tr><th>Status</th><th>Gate</th><th>Branch</th><th>Duration</th><th>Exit</th><th>Started</th></tr></thead>
          <tbody>${tableRows(testRuns.slice(0, 80), [
            row => row.status,
            row => row.title,
            row => row.branchId || "",
            row => row.durationMs ?? "",
            row => row.exitCode ?? "",
            row => row.startedAt || ""
          ])}</tbody>
        </table>
      </div>
      <div>
        <h2>Latest Test Results</h2>
        <pre>${esc(JSON.stringify(latestTestResultsByGate, null, 2))}</pre>
      </div>
    </section>

    <section>
      <h2>Live Test Run Events</h2>
      <div id="test-run-stream-status" class="muted">Connecting to /api/platform-test-runs/events…</div>
      <pre id="test-run-stream-log"></pre>
    </section>

    <section>
      <h2>Candidate Snapshots</h2>
      <table>
        <thead><tr><th>Status</th><th>Snapshot</th><th>Branch</th><th>Change Set</th><th>Revision</th></tr></thead>
        <tbody>${tableRows(candidateSnapshots.slice(0, 80), [
          row => row.status,
          row => row.id,
          row => row.branchId,
          row => row.changeSetId,
          row => row.revision
        ])}</tbody>
      </table>
    </section>

    <section class="grid2">
      <div>
        <h2>Runtime Revisions</h2>
        <div class="platform-branch-summary">
          <div class="card">
            <h3>Active Revision</h3>
            <div>${esc(activeRuntimeRevision?.revision ?? "")}</div>
            <div class="muted">${esc(activeRuntimeRevision?.trigger || "")}</div>
          </div>
          <div class="card">
            <h3>Last Good</h3>
            <div>${esc(snapshotDiagnostics?.lastGoodAppRevision ?? "")}</div>
            <div class="muted">${esc(snapshotDiagnostics?.devMode ? "dev-mode active" : "")}</div>
          </div>
          <div class="card">
            <h3>Pending Dirty</h3>
            <div>${esc((snapshotDiagnostics?.pendingDirtySources ?? []).length)}</div>
            <div class="muted">${esc((snapshotDiagnostics?.pendingDirtySources ?? []).join(", "))}</div>
          </div>
        </div>
        <table>
          <thead><tr><th>Status</th><th>Revision</th><th>Trigger</th><th>Changed Sources</th><th>Candidate Branches</th><th>Build Errors</th></tr></thead>
          <tbody>${tableRows(runtimeRevisions.slice(0, 40), [
            row => row.status,
            row => row.revision,
            row => row.trigger,
            row => row.changedSources.join(", "),
            row => row.candidateBranchCount,
            row => row.buildErrorCount
          ])}</tbody>
        </table>
        <label>Revision detail
          <select id="platform-runtime-revision-select">
            ${runtimeRevisions.length
              ? runtimeRevisions.map(row => `<option value="${esc(row.id)}">${esc(`${row.revision} ${row.trigger || "initial"}`)}</option>`).join("")
              : `<option value="">No runtime revisions</option>`}
          </select>
        </label>
        <div id="platform-runtime-revision-status" class="muted">${esc(initialRuntimeRevision ? `Loaded from /api/platform-model?view=runtimeRevisions&id=${initialRuntimeRevision.id}` : "No runtime revisions projected yet.")}</div>
        <pre id="platform-runtime-revision-detail-output">${esc(JSON.stringify(initialRuntimeRevision, null, 2))}</pre>
        <div class="platform-branch-summary">
          <div class="card">
            <h3>Revision candidate snapshots</h3>
            <div id="platform-runtime-revision-snapshot-count">${esc(initialRuntimeCandidateSnapshots.length)}</div>
          </div>
          <div class="card">
            <h3>Revision builds</h3>
            <div id="platform-runtime-revision-build-count">${esc(initialRuntimeSnapshotBuilds.length)}</div>
          </div>
          <div class="card">
            <h3>Revision build errors</h3>
            <div id="platform-runtime-revision-error-count">${esc(initialRuntimeBuildErrors.length)}</div>
          </div>
        </div>
        <h3>Revision Snapshot Builds</h3>
        <pre id="platform-runtime-revision-builds-output">${esc(JSON.stringify(initialRuntimeSnapshotBuilds, null, 2))}</pre>
        <h3>Revision Build Errors</h3>
        <pre id="platform-runtime-revision-errors-output">${esc(JSON.stringify(initialRuntimeBuildErrors, null, 2))}</pre>
        <div class="card">
          <h3>Backend Revision Stream</h3>
          <div id="backend-revision-stream-status" class="muted">Connecting to /api/runtime/backend-revisions/events…</div>
          <pre id="backend-revision-stream-output">[]</pre>
        </div>
      </div>
      <div>
        <h2>Snapshot Builds</h2>
        <table>
          <thead><tr><th>Status</th><th>Build</th><th>Branch</th><th>Change Set</th><th>Files</th><th>Errors</th></tr></thead>
          <tbody>${tableRows(snapshotBuilds.slice(0, 80), [
            row => row.status,
            row => row.id,
            row => row.branchId,
            row => row.changeSetId,
            row => row.fileCount,
            row => row.errorCount
          ])}</tbody>
        </table>
        <h3>Failed Snapshot Builds</h3>
        <pre>${esc(JSON.stringify(snapshotBuildErrors.slice(0, 40), null, 2))}</pre>
      </div>
    </section>

    <section>
      <h2>Existing Proposals</h2>
      <table>
        <thead><tr><th>Status</th><th>Proposal</th><th>Target Process</th><th>Target</th><th>Reason</th></tr></thead>
        <tbody>${tableRows(proposals.slice(0, 80), [
          row => row.status,
          row => row.id,
          row => row.targetProcess,
          row => `${row.targetKind || ""} ${row.targetId || ""}`,
          row => row.reason || ""
        ])}</tbody>
      </table>
    </section>

    <section>
      <h2>Gaps</h2>
      <table>
        <thead><tr><th>Severity</th><th>Kind</th><th>Target</th><th>Reason</th><th>Recommended Proposal</th></tr></thead>
        <tbody>${tableRows(gaps, [
          row => row.severity,
          row => row.kind,
          row => row.target,
          row => row.reason,
          row => row.recommendedProposal ? `${row.recommendedProposal.targetProcess} ${row.recommendedProposal.targetId}` : ""
        ])}</tbody>
      </table>
    </section>

    <section>
      <h2>Runtime Profiles</h2>
      <table>
        <thead><tr><th>Profile</th><th>Core Bundles</th><th>Plugins</th></tr></thead>
        <tbody>${tableRows(profiles, [
          row => row.id,
          row => row.coreBundles.join(", "),
          row => row.plugins.join(", ")
        ])}</tbody>
      </table>
    </section>

    <section class="grid2">
      <div>
        <h2>Governed Docs</h2>
        <table>
          <thead><tr><th>Status</th><th>Role</th><th>Doc</th><th>Owner</th><th>Updated</th><th>Freshness</th></tr></thead>
          <tbody>${tableRows(docs.slice(0, 80), [
            row => row.status,
            row => row.role,
            row => row.path,
            row => row.owner,
            row => row.updatedAt || "",
            row => row.freshness?.summary || ""
          ])}</tbody>
        </table>
      </div>
      <div>
        <h2>Doc Structure</h2>
        <div class="card">
          <h3>Sections</h3>
          <pre>${esc(JSON.stringify(docSections.slice(0, 40), null, 2))}</pre>
        </div>
        <div class="card">
          <h3>Doc Tasks</h3>
          <pre>${esc(JSON.stringify(docTasks.slice(0, 40), null, 2))}</pre>
        </div>
      </div>
    </section>

    <section>
      <h2>Roadmap Tasks</h2>
      <table>
        <thead><tr><th>Status</th><th>Task</th><th>Section</th><th>Source</th></tr></thead>
        <tbody>${tableRows(roadmapTasks.slice(0, 80), [
          row => row.status,
          row => row.title,
          row => row.section,
          row => `${row.doc}:${row.line}`
        ])}</tbody>
      </table>
    </section>
  </main>
  <script id="platform-initial-state" type="application/json">${initialState}</script>
  <script>
    const platformState = JSON.parse(document.getElementById("platform-initial-state").textContent);
    const platformActionTemplates = new Map((platformState.proposalActions || []).map(action => [action.action, action]));
    const platformBranches = platformState.branches || [];
    const platformCandidateSnapshots = platformState.candidateSnapshots || [];
    const platformRuntimeRevisions = platformState.runtimeRevisions || [];
    const platformSnapshotBuilds = platformState.snapshotBuilds || [];
    const platformSnapshotBuildErrors = platformState.snapshotBuildErrors || [];
    const platformAffectedTestGatesByBranch = platformState.affectedTestGatesByBranch || {};
    const backendRevisionEvents = [];
    function deriveRuntimeRevisionDetail(revisionId) {
      const runtimeRevision = platformRuntimeRevisions.find(entry => entry.id === revisionId || entry.backendRevisionId === revisionId) || null;
      const revision = Number(runtimeRevision?.revision || 0);
      return {
        runtimeRevisions: runtimeRevision ? [runtimeRevision] : [],
        candidateSnapshots: platformCandidateSnapshots.filter(row => Number(row.revision || 0) === revision),
        snapshotBuilds: platformSnapshotBuilds.filter(row => Number(row.revision || 0) === revision),
        snapshotBuildErrors: platformSnapshotBuildErrors.filter(row => Number(row.revision || 0) === revision)
      };
    }
    function syncRuntimeRevisionDetail(view, revisionId, sourceLabel) {
      const runtimeRevision = (view.runtimeRevisions || [])[0] || null;
      const detail = document.getElementById("platform-runtime-revision-detail-output");
      const builds = document.getElementById("platform-runtime-revision-builds-output");
      const errors = document.getElementById("platform-runtime-revision-errors-output");
      const snapshotCount = document.getElementById("platform-runtime-revision-snapshot-count");
      const buildCount = document.getElementById("platform-runtime-revision-build-count");
      const errorCount = document.getElementById("platform-runtime-revision-error-count");
      const status = document.getElementById("platform-runtime-revision-status");
      if (detail) detail.textContent = JSON.stringify(runtimeRevision, null, 2);
      if (builds) builds.textContent = JSON.stringify(view.snapshotBuilds || [], null, 2);
      if (errors) errors.textContent = JSON.stringify(view.snapshotBuildErrors || [], null, 2);
      if (snapshotCount) snapshotCount.textContent = String((view.candidateSnapshots || []).length);
      if (buildCount) buildCount.textContent = String((view.snapshotBuilds || []).length);
      if (errorCount) errorCount.textContent = String((view.snapshotBuildErrors || []).length);
      if (status) status.textContent = runtimeRevision
        ? "Loaded " + String(sourceLabel || "revision detail") + " for " + String(revisionId || runtimeRevision.id)
        : "Runtime revision detail unavailable.";
    }
    async function loadRuntimeRevisionDetail(revisionId) {
      if (!revisionId) {
        syncRuntimeRevisionDetail({ runtimeRevisions: [], candidateSnapshots: [], snapshotBuilds: [], snapshotBuildErrors: [] }, "", "empty state");
        return;
      }
      try {
        const response = await fetch("/api/platform-model?view=runtimeRevisions&id=" + encodeURIComponent(revisionId));
        const json = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(json.error || "runtime revision detail request failed");
        syncRuntimeRevisionDetail(json, revisionId, "/api/platform-model?view=runtimeRevisions&id=...");
      } catch {
        syncRuntimeRevisionDetail(deriveRuntimeRevisionDetail(revisionId), revisionId, "cached platform state");
      }
    }
    function syncBackendRevisionStream() {
      const output = document.getElementById("backend-revision-stream-output");
      if (output) output.textContent = JSON.stringify(backendRevisionEvents.slice(-12), null, 2);
    }
    function connectBackendRevisionStream() {
      const status = document.getElementById("backend-revision-stream-status");
      if (!status) return;
      if (typeof EventSource !== "function") {
        status.textContent = "Backend revision stream unavailable in this browser.";
        return;
      }
      const source = new EventSource("/api/runtime/backend-revisions/events");
      source.onmessage = event => {
        try {
          const payload = JSON.parse(event.data || "{}");
          backendRevisionEvents.push(payload);
          while (backendRevisionEvents.length > 12) backendRevisionEvents.shift();
          status.textContent = "Live revision " + String(payload.revision || "") + " via " + String(payload.trigger || "initial");
          syncBackendRevisionStream();
        } catch {
          status.textContent = "Backend revision stream decode failed.";
        }
      };
      source.onerror = () => {
        status.textContent = "Backend revision stream reconnecting…";
      };
    }
    function renderBranchDetail(branchId) {
      const branch = platformBranches.find(entry => entry.id === branchId) || null;
      const detail = document.getElementById("platform-branch-detail-output");
      const history = document.getElementById("platform-branch-history-output");
      const docsStatus = document.getElementById("platform-branch-docs-status");
      const docsSummary = document.getElementById("platform-branch-docs-summary");
      const systemsSummary = document.getElementById("platform-branch-systems-summary");
      const telemetrySummary = document.getElementById("platform-branch-telemetry-summary");
      const testGateCount = document.getElementById("platform-branch-test-gates-count");
      const testGateSummary = document.getElementById("platform-branch-test-gates-summary");
      const selectedTestGates = platformAffectedTestGatesByBranch[branchId] || [];
      if (detail) detail.textContent = JSON.stringify(branch, null, 2);
      if (docsStatus) docsStatus.textContent = branch?.docsFreshness?.status || "";
      if (docsSummary) docsSummary.textContent = branch?.docsFreshness?.summary || "";
      if (systemsSummary) systemsSummary.textContent = (branch?.affectedSystemSummaries || []).map(row => row.label || row.system || "").join(", ");
      if (telemetrySummary) telemetrySummary.textContent = (branch?.telemetryImpactSummaries || []).map(row => row.label || row.id || "").join(", ");
      if (testGateCount) testGateCount.textContent = String(selectedTestGates.length);
      if (testGateSummary) testGateSummary.textContent = selectedTestGates.join(", ");
      if (history) {
        history.textContent = JSON.stringify(platformCandidateSnapshots
          .filter(snapshot => snapshot.branchId === branchId)
          .map(snapshot => ({
            candidateSnapshotId: snapshot.id,
            changeSetId: snapshot.changeSetId,
            status: snapshot.status,
            revision: snapshot.revision,
            errorCount: Array.isArray(snapshot.errors) ? snapshot.errors.length : 0
          })), null, 2);
      }
    }
    const proposalForm = document.getElementById("platform-proposal-form");
    proposalForm.elements.action.addEventListener("change", () => {
      const template = platformActionTemplates.get(proposalForm.elements.action.value);
      if (template) proposalForm.elements.bodyJson.value = JSON.stringify(template.sampleBody || {}, null, 2);
    });
    const runtimeRevisionSelect = document.getElementById("platform-runtime-revision-select");
    if (runtimeRevisionSelect) {
      runtimeRevisionSelect.addEventListener("change", event => {
        loadRuntimeRevisionDetail(event.currentTarget.value);
      });
      if (runtimeRevisionSelect.value) loadRuntimeRevisionDetail(runtimeRevisionSelect.value);
    }
    document.getElementById("platform-branch-create-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("branch-create-status");
      const response = await fetch("/api/platform-branches", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.elements.id.value,
          title: form.elements.title.value || null,
          parentBranchId: form.elements.parentBranchId.value || null,
          epic: form.elements.epic.value || null,
          feature: form.elements.feature.value || null,
          defect: form.elements.defect.value || null
        })
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? "Branch created." : (json.error || "Branch creation failed.");
    });
    document.getElementById("platform-proposal-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("proposal-status");
      let body = {};
      try {
        body = JSON.parse(form.bodyJson.value || "{}");
      } catch (error) {
        status.textContent = "Body JSON is invalid.";
        return;
      }
      const payload = {
        id: form.elements.id.value,
        action: form.elements.action.value,
        targetKind: form.elements.targetKind.value || null,
        targetId: form.elements.targetId.value || null,
        body,
        reason: form.elements.reason.value || null
      };
      const response = await fetch("/api/platform-proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? "Proposal created." : (json.error || "Proposal failed.");
    });
    document.getElementById("platform-review-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("review-status");
      const submitter = event.submitter;
      const action = submitter && submitter.value === "reject" ? "reject" : "approve";
      const id = form.elements.id.value;
      if (!id) {
        status.textContent = "No open proposal selected.";
        return;
      }
      const response = await fetch("/api/platform-proposals/" + encodeURIComponent(id) + "/" + action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reject" ? { reason: form.elements.reason.value || null } : {})
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? (action === "approve" ? "Proposal approved." : "Proposal rejected.") : (json.error || "Review failed.");
    });
    document.getElementById("platform-change-set-create-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("change-set-create-status");
      const response = await fetch("/api/platform-change-sets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.elements.id.value || null,
          branchId: form.elements.branchId.value || null,
          title: form.elements.title.value || null,
          reason: form.elements.reason.value || null
        })
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? "Change set created." : (json.error || "Change set creation failed.");
    });
    document.getElementById("platform-change-set-edit-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("change-set-edit-status");
      const changeSetId = form.elements.changeSetId.value;
      if (!changeSetId) {
        status.textContent = "Select a change set first.";
        return;
      }
      const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/edits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          edits: [{
            path: form.elements.path.value,
            content: form.elements.content.value
          }]
        })
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? "Edit staged." : (json.error || "Edit staging failed.");
    });
    document.getElementById("platform-change-set-validate-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("change-set-validate-status");
      const changeSetId = form.elements.changeSetId.value;
      if (!changeSetId) {
        status.textContent = "Select a change set first.";
        return;
      }
      const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/validate", {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok
        ? (json.candidateSnapshot?.status === "valid" ? "Change set valid." : "Change set invalid.")
        : (json.error || "Validation failed.");
    });
    document.getElementById("platform-change-set-apply-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("change-set-apply-status");
      const changeSetId = form.elements.changeSetId.value;
      if (!changeSetId) {
        status.textContent = "Select a change set first.";
        return;
      }
      const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/apply", {
        method: "POST",
        headers: { "content-type": "application/json" }
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? "Change set applied." : (json.error || "Apply failed.");
    });
    document.getElementById("platform-change-set-lifecycle-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("change-set-lifecycle-status");
      const changeSetId = form.elements.changeSetId.value;
      const action = form.elements.action.value || "reject";
      const response = await fetch("/api/platform-change-sets/" + encodeURIComponent(changeSetId) + "/" + action, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: form.elements.reason.value || null })
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok ? ("Change set " + action + "ed.") : (json.error || "Lifecycle update failed.");
    });
    document.getElementById("platform-test-run-form").addEventListener("submit", async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = document.getElementById("test-run-status");
      const response = await fetch("/api/platform-test-runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gateId: form.elements.gateId.value || null,
          branchId: form.elements.branchId.value || null,
          changeSetId: form.elements.changeSetId.value || null,
          candidateSnapshotId: form.elements.candidateSnapshotId.value || null
        })
      });
      const json = await response.json().catch(() => ({}));
      status.textContent = response.ok
        ? ("Test run finished: " + String(json.latestResult?.status || json.testRun?.status || "unknown"))
        : (json.error || "Test run failed.");
    });
    if (window.EventSource) {
      const status = document.getElementById("test-run-stream-status");
      const log = document.getElementById("test-run-stream-log");
      const source = new EventSource("/api/platform-test-runs/events");
      source.addEventListener("ready", event => {
        try {
          const payload = JSON.parse(event.data || "{}");
          status.textContent = "Listening for test run events at cursor " + String(payload.cursor ?? 0) + ".";
        } catch {
          status.textContent = "Test run event stream ready.";
        }
      });
      source.addEventListener("testRun", event => {
        try {
          const payload = JSON.parse(event.data || "{}");
          const line = [
            payload.phase || "event",
            payload.runId || "run",
            payload.status || "unknown",
            payload.gateId || ""
          ].filter(Boolean).join(" ");
          status.textContent = "Latest test event: " + line;
          const existing = log.textContent ? (log.textContent + "\n") : "";
          log.textContent = (existing + JSON.stringify(payload)).trim();
        } catch {
          status.textContent = "Test run event decode failed.";
        }
      });
      source.onerror = () => {
        status.textContent = "Test run event stream reconnecting…";
      };
    } else {
      const status = document.getElementById("test-run-stream-status");
      status.textContent = "Test run event stream unavailable in this browser.";
    }
    const branchDetailSelect = document.getElementById("platform-branch-detail-select");
    if (branchDetailSelect) {
      branchDetailSelect.addEventListener("change", event => {
        renderBranchDetail(event.currentTarget.value);
      });
      if (branchDetailSelect.value) renderBranchDetail(branchDetailSelect.value);
    }
    connectBackendRevisionStream();
  </script>
</body>
</html>`;
}
