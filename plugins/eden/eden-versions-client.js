function renderEdenVersionsPanel(node, surface, deps) {
  const { state, versionsRuntime } = deps;
  const runtime = versionsRuntime(surface);
  const auth = node.querySelector('[data-eden-version-auth]');
  const editor = node.querySelector('[data-eden-version-editor]');
  const session = node.querySelector('[data-eden-version-session]');
  const status = node.querySelector('[data-eden-version-status]');
  const summary = node.querySelector('[data-eden-version-summary]');
  const list = node.querySelector('[data-eden-version-list]');
  if (!auth || !editor || !session || !status || !summary || !list) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  const authority = runtime.authority && typeof runtime.authority === 'object'
    ? runtime.authority
    : {
        authenticated,
        canMutate: false,
        canPropose: false,
        reason: authenticated ? 'direct version changes are guarded here' : 'sign in to change versions'
      };
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = !authenticated
    ? 'Sign in to move between draft, published, and last good from inside Eden.'
    : (authority.canMutate
        ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These recovery controls mutate the live Todo board.')
        : ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. Direct version changes are guarded here, but you can create real proposals for the shared board.'));
  status.textContent = state.versionStatus.text || '';
  status.classList.toggle('is-error', state.versionStatus.tone === 'error');
  status.classList.toggle('is-ok', state.versionStatus.tone === 'ok');

  const summaries = [
    { kicker: 'Current live', version: runtime.activeVersion, preview: runtime.compare?.activePreview || 'No active version yet.', current: true },
    { kicker: 'Published', version: runtime.publishedVersion, preview: runtime.compare?.publishedPreview || 'No published version yet.' },
    { kicker: 'Draft candidate', version: runtime.draftVersion, preview: runtime.compare?.draftPreview || 'No draft candidate yet.' }
  ];
  summary.innerHTML = '';
  for (const entry of summaries) {
    const card = document.createElement('div');
    card.className = 'eden-version-card' + (entry.current ? ' is-current' : '');
    const kicker = document.createElement('div');
    kicker.className = 'eden-version-card-kicker';
    kicker.textContent = entry.kicker;
    const title = document.createElement('div');
    title.className = 'eden-version-card-title';
    title.textContent = entry.version || 'None';
    const body = document.createElement('div');
    body.className = 'eden-version-card-body';
    body.textContent = entry.preview || 'No preview.';
    card.appendChild(kicker);
    card.appendChild(title);
    card.appendChild(body);
    summary.appendChild(card);
  }

  const comparePublished = Array.isArray(runtime.compare?.activeToPublished) ? runtime.compare.activeToPublished : [];
  const compareDraft = Array.isArray(runtime.compare?.activeToDraft) ? runtime.compare.activeToDraft : [];
  const publishedDiff = node.querySelector('[data-eden-version-diff-published]');
  const draftDiff = node.querySelector('[data-eden-version-diff-draft]');
  if (publishedDiff) {
    publishedDiff.innerHTML = '';
    if (!comparePublished.length) {
      publishedDiff.textContent = 'Current live version already matches published.';
    } else {
      for (const row of comparePublished) {
        const line = document.createElement('div');
        line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
        publishedDiff.appendChild(line);
      }
    }
  }
  if (draftDiff) {
    draftDiff.innerHTML = '';
    if (!compareDraft.length) {
      draftDiff.textContent = 'Current live version already matches the draft candidate.';
    } else {
      for (const row of compareDraft) {
        const line = document.createElement('div');
        line.textContent = row.key + ': ' + String(row.from ?? '') + ' -> ' + String(row.to ?? '');
        draftDiff.appendChild(line);
      }
    }
  }

  list.innerHTML = '';
  const rows = Array.isArray(runtime.versions) ? runtime.versions : [];
  if (!rows.length) {
    const empty = document.createElement('div');
    empty.className = 'eden-version-item';
    empty.textContent = 'No authored versions are attached to this recovery seam yet.';
    list.appendChild(empty);
  } else {
    for (const row of rows) {
      const item = document.createElement('div');
      item.className = 'eden-version-item' + (row.isActive ? ' is-active' : '');
      const header = document.createElement('div');
      header.className = 'eden-version-item-header';
      const title = document.createElement('div');
      title.innerHTML = '<div class="eden-version-item-meta">Version ' + String(row.index ?? 0) + '</div><div class="eden-version-item-title"></div>';
      title.querySelector('.eden-version-item-title').textContent = row.version;
      const badges = document.createElement('div');
      badges.className = 'eden-version-badges';
      if (row.isActive) {
        const badge = document.createElement('span');
        badge.className = 'eden-version-badge';
        badge.textContent = 'live';
        badges.appendChild(badge);
      }
      if (row.isPublished) {
        const badge = document.createElement('span');
        badge.className = 'eden-version-badge is-published';
        badge.textContent = 'published';
        badges.appendChild(badge);
      }
      if (row.isDraft) {
        const badge = document.createElement('span');
        badge.className = 'eden-version-badge is-draft';
        badge.textContent = 'draft';
        badges.appendChild(badge);
      }
      header.appendChild(title);
      header.appendChild(badges);
      item.appendChild(header);
      const preview = document.createElement('div');
      preview.className = 'eden-version-item-preview';
      preview.textContent = row.preview || 'No preview.';
      item.appendChild(preview);
      list.appendChild(item);
    }
  }

  const activatePublished = node.querySelector('[data-eden-version-open-published]');
  const activateDraft = node.querySelector('[data-eden-version-open-draft]');
  const restore = node.querySelector('[data-eden-version-restore]');
  const publish = node.querySelector('[data-eden-version-publish]');
  if (activatePublished) activatePublished.textContent = authority.canPropose ? 'Propose Published In Board' : 'View published in board';
  if (activateDraft) activateDraft.textContent = authority.canPropose ? 'Propose Draft In Board' : 'Open draft in board';
  if (restore) restore.textContent = authority.canPropose ? 'Propose Restore Last Good' : 'Restore last good';
  if (publish) publish.textContent = authority.canPropose ? 'Propose Publish Current' : 'Publish current';
  if (activatePublished) activatePublished.disabled = !runtime.publishedVersion || runtime.activeVersion === runtime.publishedVersion;
  if (activateDraft) activateDraft.disabled = !runtime.draftVersion || runtime.activeVersion === runtime.draftVersion;
  if (restore) restore.disabled = !runtime.rollbackAvailable;
  if (publish) publish.disabled = !runtime.activeVersion || runtime.activeVersion === runtime.publishedVersion;
}

function createEdenVersionsSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setVersionStatus,
    refreshSessionSurfaces,
    createEdenVersionProposal,
    versionsRuntime,
    reloadEmbeddedTodoPage,
    refreshAcademyState,
    refreshVersions,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-version-auth" data-eden-version-auth><form class="eden-version-grid" data-eden-version-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-version-actions"><button type="submit">Open Versions</button></div></form></div><div class="eden-version-editor" data-eden-version-editor hidden><div class="eden-version-session" data-eden-version-session></div><div class="eden-version-actions"><button type="button" data-eden-version-open-published>View published in board</button><button type="button" data-eden-version-open-draft>Open draft in board</button><button type="button" data-eden-version-restore>Restore last good</button><button type="button" data-eden-version-publish>Publish current</button><button type="button" data-eden-version-refresh>Refresh</button><button type="button" data-eden-version-logout>Logout</button></div></div><div class="eden-version-status" data-eden-version-status></div><div class="eden-version-summary" data-eden-version-summary></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to published</div><div class="eden-version-diff" data-eden-version-diff-published></div></div><div class="eden-version-card"><div class="eden-version-card-kicker">Compare to draft</div><div class="eden-version-diff" data-eden-version-diff-draft></div></div><div class="eden-version-list" data-eden-version-list></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-version-login-form]').addEventListener('submit', async event => {
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
      setVersionStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setVersionStatus('Versions unlocked for this session.', 'ok');
    await refreshSessionSurfaces();
  });
  node.querySelector('[data-eden-version-open-published]').addEventListener('click', async () => {
    const runtime = versionsRuntime(surface);
    if (runtime.authority?.canPropose) {
      await createEdenVersionProposal(surface, {
        processName: 'widgetVersion.activate',
        version: runtime.publishedVersion,
        reason: 'Load the published shared version into the live board through proposal review',
        statusText: 'Proposed loading the published version into the board'
      });
      render();
      return;
    }
    const response = await requestJson('/api/eden/versions/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: runtime.publishedVersion })
    });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'published activation failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || runtime;
    setVersionStatus('Published version loaded into the board.', 'ok');
    reloadEmbeddedTodoPage();
    await refreshAcademyState();
    render();
  });
  node.querySelector('[data-eden-version-open-draft]').addEventListener('click', async () => {
    const runtime = versionsRuntime(surface);
    if (runtime.authority?.canPropose) {
      await createEdenVersionProposal(surface, {
        processName: 'widgetVersion.activate',
        version: runtime.draftVersion,
        reason: 'Open the draft shared version in the live board through proposal review',
        statusText: 'Proposed opening the draft version in the board'
      });
      render();
      return;
    }
    const response = await requestJson('/api/eden/versions/activate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: runtime.draftVersion })
    });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'draft activation failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || runtime;
    setVersionStatus('Draft version opened in the live board.', 'ok');
    reloadEmbeddedTodoPage();
    await refreshAcademyState();
    render();
  });
  node.querySelector('[data-eden-version-restore]').addEventListener('click', async () => {
    const runtime = versionsRuntime(surface);
    if (runtime.authority?.canPropose) {
      await createEdenVersionProposal(surface, {
        processName: 'widgetVersion.rollback',
        reason: 'Restore the last good shared version through proposal review',
        statusText: 'Proposed restoring the last good version'
      });
      render();
      return;
    }
    const response = await requestJson('/api/eden/versions/rollback', {
      method: 'POST'
    });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'restore failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || versionsRuntime(surface);
    setVersionStatus('Restored the last good version.', 'ok');
    reloadEmbeddedTodoPage();
    await refreshAcademyState();
    render();
  });
  node.querySelector('[data-eden-version-publish]').addEventListener('click', async () => {
    const runtime = versionsRuntime(surface);
    if (runtime.authority?.canPropose) {
      await createEdenVersionProposal(surface, {
        processName: 'edenVersions.publish',
        version: runtime.activeVersion,
        reason: 'Publish the current shared version through proposal review',
        statusText: 'Proposed publishing the current live version'
      });
      render();
      return;
    }
    const response = await requestJson('/api/eden/versions/publish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: runtime.activeVersion })
    });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'publish failed', 'error');
      render();
      return;
    }
    surface.runtime = response.body?.versionState || runtime;
    setVersionStatus('Current live version is now published.', 'ok');
    await refreshAcademyState();
    render();
  });
  node.querySelector('[data-eden-version-refresh]').addEventListener('click', async () => {
    await refreshVersions(surface);
    setVersionStatus('Reloaded version state.', 'ok');
  });
  node.querySelector('[data-eden-version-logout]').addEventListener('click', async () => {
    const response = await requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      setVersionStatus(response.body?.error || 'logout failed', 'error');
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    setVersionStatus('Signed out. Versions are read-only again.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenVersionsPanel(node, surface, {
    state,
    versionsRuntime
  });
  return node;
}

export function renderEdenVersionsClientPrelude() {
  return `
${renderEdenVersionsPanel.toString()}
${createEdenVersionsSurfaceNode.toString()}
`;
}
