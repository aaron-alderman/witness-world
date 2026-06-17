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
  const roadmapTasks = model.roadmapTasks ?? [];
  const proposalActions = model.proposalActions ?? [];
  const proposals = model.proposals ?? [];
  const branchBoard = model.branchBoard ?? [];
  const openProposals = proposals.filter(row => row.status === "open");
  const initialBranch = branches[0] ?? null;
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
          <label>Branch id <input name="id" value="branch-${Date.now().toString(36)}"></label>
          <label>Title <input name="title" value="Platform branch"></label>
          <label>Parent branch <input name="parentBranchId" placeholder="Optional parent branch id"></label>
          <label>Epic <input name="epic" placeholder="Optional epic tag"></label>
          <label>Feature <input name="feature" placeholder="Optional feature tag"></label>
          <label>Defect <input name="defect" placeholder="Optional defect tag"></label>
          <button type="submit">Create Branch</button>
          <div id="branch-create-status"></div>
        </form>

        <form id="platform-change-set-create-form">
          <label>Change set id <input name="id" value="changeset-${Date.now().toString(36)}"></label>
          <label>Branch id <input name="branchId" value="branch-platform-console"></label>
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
          <thead><tr><th>Status</th><th>Lane</th><th>Branch</th><th>Parent</th><th>Owner</th><th>Change Sets</th><th>Latest Candidate</th></tr></thead>
          <tbody>${tableRows(branches.slice(0, 80), [
            row => row.status,
            row => row.lifecycleLane || "",
            row => row.id,
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
    function renderBranchDetail(branchId) {
      const branch = platformBranches.find(entry => entry.id === branchId) || null;
      const detail = document.getElementById("platform-branch-detail-output");
      const history = document.getElementById("platform-branch-history-output");
      if (detail) detail.textContent = JSON.stringify(branch, null, 2);
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
    const branchDetailSelect = document.getElementById("platform-branch-detail-select");
    if (branchDetailSelect) {
      branchDetailSelect.addEventListener("change", event => {
        renderBranchDetail(event.currentTarget.value);
      });
      if (branchDetailSelect.value) renderBranchDetail(branchDetailSelect.value);
    }
  </script>
</body>
</html>`;
}
