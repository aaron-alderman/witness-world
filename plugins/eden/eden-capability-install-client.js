function renderEdenCapabilityInstallPanel(node, surface, deps) {
  const { state, capabilityInstallRuntime, setCapabilityStatus, requestJson, refreshAcademyState, render, createEdenCapabilityInstallProposal } = deps;
  const runtime = capabilityInstallRuntime(surface);
  const authority = runtime.authority || {
    authenticated: Boolean(state.session?.authenticated && state.session?.actor),
    canMutate: false,
    canPropose: false,
    reason: state.session?.authenticated ? 'direct capability installs are guarded here' : 'sign in to install capabilities'
  };
  const auth = node.querySelector('[data-eden-capability-auth]');
  const editor = node.querySelector('[data-eden-capability-editor]');
  const session = node.querySelector('[data-eden-capability-session]');
  const status = node.querySelector('[data-eden-capability-status]');
  const summary = node.querySelector('[data-eden-capability-summary]');
  const list = node.querySelector('[data-eden-capability-list]');
  if (!auth || !editor || !session || !status || !summary || !list) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? (authority.canMutate
      ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Install curated capabilities directly onto ' + (runtime.targetLabel || runtime.target || 'this target') + '.')
      : (authority.canPropose
        ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. You can create real install proposals for ' + (runtime.targetLabel || runtime.target || 'this target') + '.')
        : ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Capability installs here are read-only right now.')))
    : 'Sign in to install capabilities from the place where the missing power is discovered.';
  status.textContent = state.capabilityStatus.text || '';
  status.classList.toggle('is-error', state.capabilityStatus.tone === 'error');
  status.classList.toggle('is-ok', state.capabilityStatus.tone === 'ok');

  summary.innerHTML = '';
  const summaryCard = document.createElement('div');
  summaryCard.className = 'eden-capability-card';
  summaryCard.innerHTML = '<div class="eden-capability-kicker">Install target</div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-badges"></div>';
  summaryCard.querySelector('.eden-capability-title').textContent = runtime.targetLabel || runtime.target || 'frontend';
  summaryCard.querySelector('.eden-capability-body').textContent = 'Target kind: ' + (runtime.targetKind || 'context') + '. Installed here: ' + (runtime.installedCapabilities?.length || 0) + '.';
  const installedBadges = summaryCard.querySelector('.eden-capability-badges');
  for (const row of runtime.installedCapabilities || []) {
    const badge = document.createElement('span');
    badge.className = 'eden-capability-badge is-installed';
    badge.textContent = row.label || row.id;
    installedBadges.appendChild(badge);
  }
  if (!installedBadges.childElementCount) {
    const badge = document.createElement('span');
    badge.className = 'eden-capability-badge';
    badge.textContent = 'No installs yet';
    installedBadges.appendChild(badge);
  }
  summary.appendChild(summaryCard);

  list.innerHTML = '';
  const rows = Array.isArray(runtime.suggestedCapabilities) ? runtime.suggestedCapabilities : [];
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'eden-capability-card';
    empty.textContent = 'No curated capabilities are recommended for this target yet.';
    list.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const card = document.createElement('div');
    card.className = 'eden-capability-card';
    card.dataset.edenCapability = row.id;
    card.innerHTML = '<div class="eden-capability-kicker"></div><div class="eden-capability-title"></div><div class="eden-capability-body"></div><div class="eden-capability-meta"></div><div class="eden-capability-badges"></div><div class="eden-capability-actions"><button type="button" data-eden-capability-install>Install here</button></div>';
    card.querySelector('.eden-capability-kicker').textContent = row.version ? ('Capability Â· ' + row.version) : 'Capability';
    card.querySelector('.eden-capability-title').textContent = row.label || row.id;
    card.querySelector('.eden-capability-body').textContent = row.summary || 'Inspectable capability object.';
    const metaParts = [];
    if (Array.isArray(row.dependsOn) && row.dependsOn.length) metaParts.push('Depends on: ' + row.dependsOn.join(', '));
    if (Array.isArray(row.providerAdapters) && row.providerAdapters.length) metaParts.push('Adapters: ' + row.providerAdapters.join(', '));
    if (row.context) metaParts.push('Context: ' + row.context);
    if (Array.isArray(row.missingDependencies) && row.missingDependencies.length) metaParts.push('Missing on target: ' + row.missingDependencies.join(', '));
    card.querySelector('.eden-capability-meta').textContent = metaParts.join(' Â· ');
    const badges = card.querySelector('.eden-capability-badges');
    for (const placement of row.placement || []) {
      const badge = document.createElement('span');
      badge.className = 'eden-capability-badge';
      badge.textContent = placement;
      badges.appendChild(badge);
    }
    if (row.installed) {
      const badge = document.createElement('span');
      badge.className = 'eden-capability-badge is-installed';
      badge.textContent = 'Installed';
      badges.appendChild(badge);
    }
    const install = card.querySelector('[data-eden-capability-install]');
    const unavailable = !authority.canMutate && !authority.canPropose;
    install.disabled = row.installed || !authenticated || Boolean(row.missingDependencies?.length) || unavailable;
    if (row.installed) install.textContent = 'Installed';
    if (!authenticated) install.textContent = 'Sign in to install';
    if (row.missingDependencies?.length) install.textContent = 'Dependencies first';
    if (authenticated && authority.canPropose && !row.installed && !row.missingDependencies?.length) install.textContent = 'Propose install';
    if (authenticated && unavailable && !row.installed && !row.missingDependencies?.length) install.textContent = 'Read only';
    install.addEventListener('click', async () => {
      if (authority.canPropose) {
        await createEdenCapabilityInstallProposal(surface, row);
        render();
        return;
      }
      const response = await requestJson('/api/eden/capability-installs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capability: row.id })
      });
      surface.runtime = response.body?.capabilityState || capabilityInstallRuntime(surface);
      if (!response.ok) {
        setCapabilityStatus(response.body?.error || ('install failed for ' + row.id), 'error');
        render();
        return;
      }
      setCapabilityStatus('Installed ' + (row.label || row.id) + ' on ' + (runtime.targetLabel || runtime.target || 'this target') + '.', 'ok');
      await refreshAcademyState();
      render();
    });
    list.appendChild(card);
  }
}

function createEdenCapabilityInstallSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setCapabilityStatus,
    refreshSessionSurfaces,
    refreshCapabilityInstall,
    capabilityInstallRuntime,
    refreshAcademyState,
    render,
    createEdenCapabilityInstallProposal
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-capability-auth" data-eden-capability-auth><form class="eden-capability-grid" data-eden-capability-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-capability-actions"><button type="submit">Open Capability Shelf</button></div></form></div><div class="eden-capability-editor" data-eden-capability-editor hidden><div class="eden-capability-session" data-eden-capability-session></div><div class="eden-capability-actions"><button type="button" data-eden-capability-refresh>Refresh</button><button type="button" data-eden-capability-logout>Logout</button></div></div><div class="eden-capability-status" data-eden-capability-status></div><div class="eden-capability-summary" data-eden-capability-summary></div><div class="eden-capability-list" data-eden-capability-list></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-capability-login-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await requestJson('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: form.querySelector('[name="username"]').value,
        password: form.querySelector('[name="password"]').value
      })
    });
    if (!response.ok) {
      setCapabilityStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setCapabilityStatus('Capability shelf unlocked for this session.', 'ok');
    await refreshSessionSurfaces();
  });
  node.querySelector('[data-eden-capability-refresh]').addEventListener('click', async () => {
    await refreshCapabilityInstall(surface);
    setCapabilityStatus('Reloaded capability state.', 'ok');
  });
  node.querySelector('[data-eden-capability-logout]').addEventListener('click', async () => {
    const response = await requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      setCapabilityStatus(response.body?.error || 'logout failed', 'error');
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    setCapabilityStatus('Signed out. Capability installs are read-only again.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenCapabilityInstallPanel(node, surface, {
    state,
    capabilityInstallRuntime,
    setCapabilityStatus,
    requestJson,
    refreshAcademyState,
    render,
    createEdenCapabilityInstallProposal
  });
  return node;
}

export function renderEdenCapabilityInstallClientPrelude() {
  return `
${renderEdenCapabilityInstallPanel.toString()}
${createEdenCapabilityInstallSurfaceNode.toString()}
`;
}
