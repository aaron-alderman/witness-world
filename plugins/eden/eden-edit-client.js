function renderEdenEditPagePanel(node, surface, deps) {
  const { state, pageThemeRuntime } = deps;
  const runtime = pageThemeRuntime(surface);
  const auth = node.querySelector('[data-eden-edit-auth]');
  const editor = node.querySelector('[data-eden-edit-editor]');
  const session = node.querySelector('[data-eden-edit-session]');
  const status = node.querySelector('[data-eden-edit-status]');
  const preview = node.querySelector('[data-eden-edit-preview]');
  if (!auth || !editor || !session || !status || !preview) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. These page treatments now write to the live Todo surface.')
    : 'Sign in to personalize the live Todo page from inside Eden.';
  status.textContent = state.editStatus.text || '';
  status.classList.toggle('is-error', state.editStatus.tone === 'error');
  status.classList.toggle('is-ok', state.editStatus.tone === 'ok');
  const form = editor.querySelector('form');
  if (form) {
    form.querySelector('[name="themeId"]').value = runtime.pageTheme?.themeId || 'paper';
    form.querySelector('[name="material"]').value = runtime.pageTheme?.material || 'linen';
    form.querySelector('[name="typography"]').value = runtime.pageTheme?.typography || 'sans';
  }
  preview.innerHTML = '<div class="eden-edit-preview-card"><div class="eden-edit-preview-kicker">Current treatment</div><div class="eden-edit-preview-line">Theme: ' + (runtime.pageTheme?.themeId || 'paper') + '</div><div class="eden-edit-preview-line">Material: ' + (runtime.pageTheme?.material || 'linen') + '</div><div class="eden-edit-preview-line">Typography: ' + (runtime.pageTheme?.typography || 'sans') + '</div></div>';
}

function createEdenEditPageSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setEditStatus,
    refreshSessionSurfaces,
    refreshPageTheme,
    reloadEmbeddedTodoPage,
    refreshAcademyState,
    pageThemeRuntime,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-edit-auth" data-eden-edit-auth><form class="eden-edit-grid" data-eden-edit-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-edit-actions"><button type="submit">Open Edit Page</button></div></form></div><div class="eden-edit-editor" data-eden-edit-editor hidden><div class="eden-edit-session" data-eden-edit-session></div><form class="eden-edit-grid" data-eden-edit-form><select name="themeId"><option value="paper">Paper Cream</option><option value="straw">Straw</option><option value="moss">Moss</option></select><select name="material"><option value="linen">Linen</option><option value="wood">Wood</option><option value="stone">Stone</option></select><select name="typography"><option value="sans">Sans</option><option value="serif">Serif</option><option value="mono">Mono</option></select><div class="eden-edit-actions"><button type="submit">Apply to Todo</button><button type="button" data-eden-edit-reset>Reset View</button><button type="button" data-eden-edit-logout>Logout</button></div></form></div><div class="eden-edit-status" data-eden-edit-status></div><div class="eden-edit-preview" data-eden-edit-preview></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-edit-login-form]').addEventListener('submit', async event => {
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
      setEditStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setEditStatus('Edit page unlocked for this session.', 'ok');
    await refreshSessionSurfaces();
  });
  node.querySelector('[data-eden-edit-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const response = await requestJson('/api/eden/page-theme', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        themeId: form.querySelector('[name="themeId"]').value,
        material: form.querySelector('[name="material"]').value,
        typography: form.querySelector('[name="typography"]').value
      })
    });
    if (!response.ok) {
      setEditStatus(response.body?.error || 'page theme save failed', 'error');
      render();
      return;
    }
    surface.runtime = { ...(surface.runtime || {}), mode: 'pageTheme', pageId: surface.pageId || 'todo_app_widget', pageTheme: response.body?.pageTheme || null };
    setEditStatus('Todo page treatment updated.', 'ok');
    reloadEmbeddedTodoPage();
    await refreshPageTheme(surface);
    await refreshAcademyState();
  });
  node.querySelector('[data-eden-edit-reset]').addEventListener('click', async () => {
    await refreshPageTheme(surface);
    setEditStatus('Reloaded current page treatment.', 'ok');
  });
  node.querySelector('[data-eden-edit-logout]').addEventListener('click', async () => {
    const response = await requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      setEditStatus(response.body?.error || 'logout failed', 'error');
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    setEditStatus('Signed out. Edit Page is dormant again.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenEditPagePanel(node, surface, {
    state,
    pageThemeRuntime
  });
  return node;
}

export function renderEdenEditClientPrelude() {
  return `
${renderEdenEditPagePanel.toString()}
${createEdenEditPageSurfaceNode.toString()}
`;
}
