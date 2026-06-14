function renderEdenOrganizationPanel(node, surface, deps) {
  const { state, academyState, organizationRuntime, renderTrackCard } = deps;
  const runtime = organizationRuntime(surface);
  const academy = academyState();
  const governanceTrack = (academy.tracks || []).find(track => track.id === "governance") || null;
  const auth = node.querySelector("[data-eden-organization-auth]");
  const editor = node.querySelector("[data-eden-organization-editor]");
  const session = node.querySelector("[data-eden-organization-session]");
  const status = node.querySelector("[data-eden-organization-status]");
  const summary = node.querySelector("[data-eden-organization-summary]");
  const list = node.querySelector("[data-eden-organization-list]");
  if (!auth || !editor || !session || !status || !summary || !list) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? `Signed in as ${state.session.label || state.session.actor || "user"}. Start a group, delegate care, and run a proposal loop inside the commons.`
    : "Sign in to practice real context, stewardship, and proposal work inside Eden.";
  status.textContent = state.organizationStatus.text || "";
  status.classList.toggle("is-error", state.organizationStatus.tone === "error");
  status.classList.toggle("is-ok", state.organizationStatus.tone === "ok");

  summary.innerHTML = "";
  const summaryCard = document.createElement("div");
  summaryCard.className = "eden-capability-card";
  summaryCard.innerHTML = '<div class="eden-capability-kicker">Commons status</div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
  summaryCard.querySelector(".eden-capability-title").textContent = runtime.contextLabel || "Guild context";
  summaryCard.querySelector(".eden-capability-body").textContent = runtime.contextExists
    ? `Context ${runtime.contextId || "guild"} exists under ${runtime.contextParent || "the shared parent"}.`
    : `No commons context yet. Start the group under ${runtime.contextParent || "the shared parent"}.`;
  const summaryBadges = summaryCard.querySelector(".eden-capability-badges");
  const contextBadge = document.createElement("span");
  contextBadge.className = "eden-capability-badge" + (runtime.contextExists ? " is-installed" : "");
  contextBadge.textContent = runtime.contextExists ? "Group started" : "Group not started";
  summaryBadges.appendChild(contextBadge);
  const stewardBadge = document.createElement("span");
  stewardBadge.className = "eden-capability-badge" + (runtime.hasGuestStewardship ? " is-installed" : "");
  stewardBadge.textContent = runtime.hasGuestStewardship
    ? `Steward: ${runtime.guestSteward || "callan"}`
    : `Delegate ${runtime.guestSteward || "callan"}`;
  summaryBadges.appendChild(stewardBadge);
  const noticeBadge = document.createElement("span");
  noticeBadge.className = "eden-capability-badge" + (runtime.noticeWidgetExists ? " is-installed" : "");
  noticeBadge.textContent = runtime.noticeWidgetExists ? "Notice authored" : "No notice yet";
  summaryBadges.appendChild(noticeBadge);
  summary.appendChild(summaryCard);
  if (governanceTrack) summary.appendChild(renderTrackCard(governanceTrack));

  list.innerHTML = "";
  const quests = Array.isArray(surface.quests) ? surface.quests : [];
  if (quests.length) {
    const questCard = document.createElement("div");
    questCard.className = "eden-capability-card";
    questCard.innerHTML = '<div class="eden-capability-kicker">Quest family</div><div class="eden-capability-body" data-eden-organization-quests></div>';
    const body = questCard.querySelector("[data-eden-organization-quests]");
    body.innerHTML = quests.map(quest =>
      `<div><strong>${quest.title || quest.id}</strong>: ${quest.statusLabel || quest.status || "ready"}</div>`
    ).join("");
    list.appendChild(questCard);
  }

  const proposalCard = document.createElement("div");
  proposalCard.className = "eden-capability-card";
  proposalCard.innerHTML = '<div class="eden-capability-kicker">Proposal loop</div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
  proposalCard.querySelector(".eden-capability-body").textContent = runtime.openProposal
    ? `Open proposal: ${runtime.openProposal.id}. Approve it to witness one governance loop.`
    : (runtime.approvedProposal
        ? `Latest approved proposal: ${runtime.approvedProposal.id}.`
        : "No governance proposal yet.");
  const proposalBadges = proposalCard.querySelector(".eden-capability-badges");
  const openBadge = document.createElement("span");
  openBadge.className = "eden-capability-badge" + (runtime.openProposal ? " is-installed" : "");
  openBadge.textContent = runtime.openProposal ? "Open proposal" : "No open proposal";
  proposalBadges.appendChild(openBadge);
  const approvedBadge = document.createElement("span");
  approvedBadge.className = "eden-capability-badge" + (runtime.approvedProposalCount ? " is-installed" : "");
  approvedBadge.textContent = runtime.approvedProposalCount
    ? `Approved: ${String(runtime.approvedProposalCount)}`
    : "Approved: 0";
  proposalBadges.appendChild(approvedBadge);
  list.appendChild(proposalCard);

  const createContext = node.querySelector("[data-eden-organization-create-context]");
  const grantStewardship = node.querySelector("[data-eden-organization-grant-stewardship]");
  const createProposal = node.querySelector("[data-eden-organization-create-proposal]");
  const approveProposal = node.querySelector("[data-eden-organization-approve-proposal]");
  if (createContext) createContext.disabled = !authenticated || runtime.contextExists;
  if (grantStewardship) grantStewardship.disabled = !authenticated || !runtime.contextExists || runtime.hasGuestStewardship;
  if (createProposal) createProposal.disabled = !authenticated || !runtime.contextExists || !runtime.hasGuestStewardship;
  if (approveProposal) approveProposal.disabled = !authenticated || !runtime.openProposal;
}

function createEdenOrganizationSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setOrganizationStatus,
    refreshSessionSurfaces,
    refreshAcademyState,
    refreshOrganization,
    organizationRuntime,
    academyState,
    renderTrackCard,
    render
  } = deps;
  const node = document.createElement("section");
  node.className = "eden-surface";
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-capability-auth" data-eden-organization-auth><form class="eden-capability-grid" data-eden-organization-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-capability-actions"><button type="submit">Open Commons</button></div></form></div><div class="eden-capability-editor" data-eden-organization-editor hidden><div class="eden-capability-session" data-eden-organization-session></div><div class="eden-capability-actions"><button type="button" data-eden-organization-create-context>Start A Group</button><button type="button" data-eden-organization-grant-stewardship>Set The Rules</button><button type="button" data-eden-organization-create-proposal>Open Proposal</button><button type="button" data-eden-organization-approve-proposal>Approve Proposal</button><button type="button" data-eden-organization-refresh>Refresh</button><button type="button" data-eden-organization-logout>Logout</button></div></div><div class="eden-capability-status" data-eden-organization-status></div><div class="eden-capability-summary" data-eden-organization-summary></div><div class="eden-capability-list" data-eden-organization-list></div></div><div class="eden-surface-actions"></div>';
  node.querySelector(".eden-surface-title").textContent = surface.title;
  node.querySelector(".eden-surface-subtitle").textContent = surface.subtitle || "";
  node.querySelector(".eden-surface-body p").textContent = surface.body || "";
  applySurfaceMeta(node.querySelector(".eden-surface-meta"), surface);
  renderActions(node.querySelector(".eden-surface-actions"), surface);
  node.querySelector("[data-eden-organization-login-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await requestJson("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: form.querySelector('[name="username"]').value,
        password: form.querySelector('[name="password"]').value
      })
    });
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "invalid credentials", "error");
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setOrganizationStatus("Commons unlocked for this session.", "ok");
    await refreshSessionSurfaces();
  });
  node.querySelector("[data-eden-organization-create-context]").addEventListener("click", async () => {
    const response = await requestJson("/api/eden/organization/context", { method: "POST" });
    surface.runtime = response.body?.organizationState || organizationRuntime(surface);
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "group start failed", "error");
      render();
      return;
    }
    setOrganizationStatus("Group started under the commons.", "ok");
    await refreshAcademyState();
    render();
  });
  node.querySelector("[data-eden-organization-grant-stewardship]").addEventListener("click", async () => {
    const response = await requestJson("/api/eden/organization/stewardship", { method: "POST" });
    surface.runtime = response.body?.organizationState || organizationRuntime(surface);
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "stewardship grant failed", "error");
      render();
      return;
    }
    const steward = surface.runtime?.guestSteward || "callan";
    setOrganizationStatus(`Delegated commons stewardship to ${steward}.`, "ok");
    await refreshAcademyState();
    render();
  });
  node.querySelector("[data-eden-organization-create-proposal]").addEventListener("click", async () => {
    const response = await requestJson("/api/eden/organization/proposals", { method: "POST" });
    surface.runtime = response.body?.organizationState || organizationRuntime(surface);
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "proposal create failed", "error");
      render();
      return;
    }
    setOrganizationStatus("Governance proposal opened in the commons.", "ok");
    await refreshAcademyState();
    render();
  });
  node.querySelector("[data-eden-organization-approve-proposal]").addEventListener("click", async () => {
    const response = await requestJson("/api/eden/organization/proposals/approve", { method: "POST" });
    surface.runtime = response.body?.organizationState || organizationRuntime(surface);
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "proposal approval failed", "error");
      render();
      return;
    }
    setOrganizationStatus("Open organization witnessed through approval.", "ok");
    await refreshAcademyState();
    render();
  });
  node.querySelector("[data-eden-organization-refresh]").addEventListener("click", async () => {
    await refreshOrganization(surface);
    setOrganizationStatus("Reloaded commons state.", "ok");
  });
  node.querySelector("[data-eden-organization-logout]").addEventListener("click", async () => {
    const response = await requestJson("/api/session", { method: "DELETE" });
    if (!response.ok) {
      setOrganizationStatus(response.body?.error || "logout failed", "error");
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    setOrganizationStatus("Signed out. The commons stays visible but inactive.", "ok");
    await refreshSessionSurfaces();
  });
  renderEdenOrganizationPanel(node, surface, {
    state,
    academyState,
    organizationRuntime,
    renderTrackCard
  });
  return node;
}

export function renderEdenOrganizationClientPrelude() {
  return `
${renderEdenOrganizationPanel.toString()}
${createEdenOrganizationSurfaceNode.toString()}
`;
}
