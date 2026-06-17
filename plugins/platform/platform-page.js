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

function tableRows(rows, cells) {
  return rows.map(row => `<tr>${cells.map(cell => `<td>${esc(cell(row))}</td>`).join("")}</tr>`).join("");
}

export function renderPlatformPage(model) {
  const lifecycle = model.lifecycleVocabulary ?? [];
  const topNodes = model.nodes.slice(0, 80);
  const gaps = model.gaps.slice(0, 80);
  const profiles = model.profiles ?? [];
  const proposalActions = model.proposalActions ?? [];
  const proposals = model.proposals ?? [];
  const openProposals = proposals.filter(row => row.status === "open");
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
      <div class="card"><div class="metric">${model.gaps.length}</div><div class="muted">Gaps</div></div>
    </section>

    <section>
      <h2>Lifecycle Board</h2>
      <div class="board">${lifecycle.map(item => lifecycleColumn(model, item)).join("")}</div>
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
      </aside>
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
  </main>
  <script id="platform-initial-state" type="application/json">${initialState}</script>
  <script>
    const platformState = JSON.parse(document.getElementById("platform-initial-state").textContent);
    const platformActionTemplates = new Map((platformState.proposalActions || []).map(action => [action.action, action]));
    const proposalForm = document.getElementById("platform-proposal-form");
    proposalForm.elements.action.addEventListener("change", () => {
      const template = platformActionTemplates.get(proposalForm.elements.action.value);
      if (template) proposalForm.elements.bodyJson.value = JSON.stringify(template.sampleBody || {}, null, 2);
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
  </script>
</body>
</html>`;
}
