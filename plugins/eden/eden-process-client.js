function renderEdenProcessPanel(node, surface, deps) {
  const {
    state,
    processRuntime,
    academyState,
    actionById,
    renderTrackCard
  } = deps;
  const runtime = processRuntime(surface);
  const academy = academyState();
  const operatorTrack = (academy.tracks || []).find(track => track.id === 'operator') || null;
  const auth = node.querySelector('[data-eden-process-auth]');
  const editor = node.querySelector('[data-eden-process-editor]');
  const session = node.querySelector('[data-eden-process-session]');
  const status = node.querySelector('[data-eden-process-status]');
  const summary = node.querySelector('[data-eden-process-summary]');
  const quests = node.querySelector('[data-eden-process-quests]');
  const preview = node.querySelector('[data-eden-process-preview]');
  if (!auth || !editor || !session || !status || !summary || !quests || !preview) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  const alterAction = actionById(surface, 'process_alter');
  const surfaceQuests = Array.isArray(surface.questIds)
    ? surface.questIds
        .map(id => (academy.quests || []).find(quest => quest.id === id) || null)
        .filter(Boolean)
    : [];
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. The machine room will witness your practice.')
    : 'Sign in to make process practice and runtime drills count toward your academy path.';
  status.textContent = state.processStatus.text || '';
  status.classList.toggle('is-error', state.processStatus.tone === 'error');
  status.classList.toggle('is-ok', state.processStatus.tone === 'ok');

  summary.innerHTML = '';
  const practiceCard = document.createElement('div');
  practiceCard.className = 'eden-process-card';
  practiceCard.innerHTML =
    '<div class="eden-process-kicker">Operator Practice</div>'
    + '<div class="eden-process-line">Process views witnessed: ' + String(academy.practice?.processViews || 0) + '</div>'
    + '<div class="eden-process-line">Runtime drills witnessed: ' + String(academy.practice?.runtimeDrills || 0) + '</div>'
    + '<div class="eden-process-line">Version publishes witnessed: ' + String(academy.practice?.versionPublishes || 0) + '</div>';
  summary.appendChild(practiceCard);

  const gateCard = document.createElement('div');
  gateCard.className = 'eden-process-card';
  gateCard.innerHTML =
    '<div class="eden-process-kicker">Alter Runtime Gate</div>'
    + '<div class="eden-process-line">' + (alterAction?.state === 'open'
      ? 'Open. You can now run the failure drill from inside Eden.'
      : (alterAction?.requires || 'Locked.')) + '</div>';
  summary.appendChild(gateCard);
  if (operatorTrack) summary.appendChild(renderTrackCard(operatorTrack));

  quests.innerHTML = '';
  if (surfaceQuests.length) {
    for (const quest of surfaceQuests) {
      const card = document.createElement('div');
      card.className = 'eden-chapter-quest'
        + (quest.status === 'completed' ? ' is-completed' : '')
        + (quest.status === 'locked' ? ' is-locked' : '');
      const header = document.createElement('div');
      header.className = 'eden-chapter-quest-header';
      const title = document.createElement('div');
      title.className = 'eden-chapter-quest-title';
      title.textContent = quest.title || quest.id;
      const stateLabel = document.createElement('div');
      stateLabel.className = 'eden-chapter-quest-state';
      stateLabel.textContent = quest.statusLabel || quest.status || 'ready';
      header.appendChild(title);
      header.appendChild(stateLabel);
      card.appendChild(header);
      if (quest.description) {
        const body = document.createElement('div');
        body.className = 'eden-chapter-quest-body';
        body.textContent = quest.description;
        card.appendChild(body);
      }
      const notes = [];
      if (Array.isArray(quest.unlocks) && quest.unlocks.length) notes.push('Unlocks: ' + quest.unlocks.join(', '));
      if (Array.isArray(quest.missingDependencies) && quest.missingDependencies.length) notes.push('Needs: ' + quest.missingDependencies.join(', '));
      if (Array.isArray(quest.missingSignals) && quest.missingSignals.length && quest.status !== 'completed') notes.push('Practice signals: ' + quest.missingSignals.join(', '));
      if (notes.length) {
        const note = document.createElement('div');
        note.className = 'eden-chapter-quest-note';
        note.textContent = notes.join(' Â· ');
        card.appendChild(note);
      }
      quests.appendChild(card);
    }
  } else {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'eden-process-card';
    emptyCard.innerHTML =
      '<div class="eden-process-kicker">Operator Path</div>'
      + '<div class="eden-process-line">No local operator quests are authored for this surface yet.</div>';
    quests.appendChild(emptyCard);
  }

  const inspectButton = node.querySelector('[data-eden-process-inspect]');
  const drillButton = node.querySelector('[data-eden-process-drill]');
  if (inspectButton) inspectButton.disabled = !authenticated;
  if (drillButton) drillButton.disabled = !authenticated || alterAction?.state !== 'open';

  preview.innerHTML = '';
  if (runtime.preview?.selection?.program) {
    const graph = runtime.preview.graph || { nodes: [], layers: [] };
    const runs = Array.isArray(runtime.preview.runs) ? runtime.preview.runs : [];
    const previewCard = document.createElement('div');
    previewCard.className = 'eden-process-card';
    previewCard.innerHTML =
      '<div class="eden-process-kicker">Last Process Read</div>'
      + '<div class="eden-process-line">' + runtime.preview.selection.program + ' Â· ' + (runtime.preview.selection.event || 'load') + '</div>'
      + '<div class="eden-process-line">' + String(graph.nodes?.length || 0) + ' nodes Â· ' + String(graph.layers?.length || 0) + ' layers Â· ' + String(runs.length) + ' runs</div>';
    preview.appendChild(previewCard);
  } else {
    const emptyCard = document.createElement('div');
    emptyCard.className = 'eden-process-card';
    emptyCard.innerHTML =
      '<div class="eden-process-kicker">Inspect Flow</div>'
      + '<div class="eden-process-line">Read the real process graph here first. That witnessed read opens the operator gate when paired with a real publish.</div>';
    preview.appendChild(emptyCard);
  }
}

function createEdenProcessSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setProcessStatus,
    refreshSessionSurfaces,
    refreshProcessPreview,
    refreshAcademyState,
    processRuntime,
    academyState,
    actionById,
    renderTrackCard,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-process-auth" data-eden-process-auth><form class="eden-process-grid" data-eden-process-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-process-actions"><button type="submit">Open Machine Room</button></div></form></div><div class="eden-process-editor" data-eden-process-editor hidden><div class="eden-process-session" data-eden-process-session></div><div class="eden-process-actions"><button type="button" data-eden-process-inspect>Inspect Flow Here</button><button type="button" data-eden-process-drill>Run Failure Drill</button><a data-eden-process-open-full href="/process">Open full Process View</a><button type="button" data-eden-process-refresh>Refresh</button><button type="button" data-eden-process-logout>Logout</button></div></div><div class="eden-process-status" data-eden-process-status></div><div class="eden-process-summary" data-eden-process-summary></div><div class="eden-process-quests" data-eden-process-quests></div><div class="eden-process-preview" data-eden-process-preview></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-process-open-full]').href = surface.href || '/process';
  node.querySelector('[data-eden-process-login-form]').addEventListener('submit', async event => {
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
      setProcessStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setProcessStatus('Machine room unlocked for this session.', 'ok');
    await refreshSessionSurfaces();
  });
  node.querySelector('[data-eden-process-inspect]').addEventListener('click', async () => {
    await refreshProcessPreview(surface);
    setProcessStatus('Process graph read from the live runtime.', 'ok');
  });
  node.querySelector('[data-eden-process-drill]').addEventListener('click', async () => {
    const response = await requestJson('/api/simulate-network-error');
    if (response.status !== 503 || response.body?.error !== 'simulated network error') {
      setProcessStatus(response.body?.error || 'runtime drill failed', 'error');
      render();
      return;
    }
    setProcessStatus('Failure drill witnessed. The runtime answered honestly.', 'ok');
    await refreshAcademyState();
    render();
  });
  node.querySelector('[data-eden-process-refresh]').addEventListener('click', async () => {
    await refreshProcessPreview(surface);
    setProcessStatus('Reloaded process practice state.', 'ok');
  });
  node.querySelector('[data-eden-process-logout]').addEventListener('click', async () => {
    const response = await requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      setProcessStatus(response.body?.error || 'logout failed', 'error');
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    setProcessStatus('Signed out. Operator practice is read-only again.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenProcessPanel(node, surface, {
    state,
    processRuntime,
    academyState,
    actionById,
    renderTrackCard
  });
  return node;
}

export function renderEdenProcessClientPrelude() {
  return `
${renderEdenProcessPanel.toString()}
${createEdenProcessSurfaceNode.toString()}
`;
}
