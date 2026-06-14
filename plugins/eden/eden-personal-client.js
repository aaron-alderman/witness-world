function fillEdenPersonalEditor(form, runtime, itemId = null) {
  if (!form) return;
  const item = runtime.items.find(entry => entry.id === itemId) || null;
  form.dataset.mode = item ? 'edit' : 'create';
  form.dataset.itemId = item?.id || '';
  form.querySelector('[name="kind"]').value = item?.kind || 'note';
  form.querySelector('[name="text"]').value = item?.text || '';
  form.querySelector('[name="href"]').value = item?.href || '';
  const submit = form.querySelector('[data-eden-personal-submit]');
  if (submit) submit.textContent = item ? 'Save widget' : 'Add widget';
  const cancel = form.querySelector('[data-eden-personal-cancel]');
  if (cancel) cancel.hidden = !item;
}

function renderEdenPersonalBoxPanel(node, surface, deps) {
  const { state, personalBoxRuntime, setPersonalStatus, requestJson, refreshPersonalBox, refreshAcademyState, render } = deps;
  const runtime = personalBoxRuntime(surface);
  const auth = node.querySelector('[data-eden-personal-auth]');
  const editor = node.querySelector('[data-eden-personal-editor]');
  const session = node.querySelector('[data-eden-personal-session]');
  const status = node.querySelector('[data-eden-personal-status]');
  const list = node.querySelector('[data-eden-personal-items]');
  if (!auth || !editor || !session || !status || !list) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. This patch is yours.')
    : 'Sign in to claim your room and edit the box from inside Eden.';
  status.textContent = state.personalStatus.text || '';
  status.classList.toggle('is-error', state.personalStatus.tone === 'error');
  status.classList.toggle('is-ok', state.personalStatus.tone === 'ok');
  list.innerHTML = '';
  const items = Array.isArray(runtime.items) ? runtime.items : [];
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'eden-personal-empty';
    empty.textContent = authenticated
      ? 'No widgets yet. Add one below.'
      : 'Your widgets appear here after you sign in and plant something.';
    list.appendChild(empty);
  } else {
    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'eden-personal-item';
      li.innerHTML = '<div class="eden-personal-item-header"><span class="eden-personal-item-kind"></span><div class="eden-personal-item-controls"><button type="button" data-eden-personal-edit>Edit</button><button type="button" data-eden-personal-delete>Delete</button></div></div><div class="eden-personal-item-text"></div>';
      li.querySelector('.eden-personal-item-kind').textContent = item.kind;
      const text = li.querySelector('.eden-personal-item-text');
      if (item.kind === 'link' && item.href) {
        text.innerHTML = '<a class="eden-personal-item-link" target="_blank" rel="noreferrer noopener"></a>';
        const link = text.querySelector('a');
        link.href = item.href;
        link.textContent = item.text;
      } else {
        text.textContent = item.text;
      }
      li.querySelector('[data-eden-personal-edit]').addEventListener('click', () => {
        state.personalEditingId = item.id;
        fillEdenPersonalEditor(editor.querySelector('form'), runtime, item.id);
        setPersonalStatus('Editing ' + item.text, 'ok');
      });
      li.querySelector('[data-eden-personal-delete]').addEventListener('click', async () => {
        const response = await requestJson('/api/eden/personal-box/items/' + encodeURIComponent(item.id), { method: 'DELETE' });
        if (!response.ok) {
          setPersonalStatus(response.body?.error || 'delete failed', 'error');
          render();
          return;
        }
        setPersonalStatus('Deleted widget.', 'ok');
        if (state.personalEditingId === item.id) state.personalEditingId = null;
        await refreshPersonalBox(surface);
        await refreshAcademyState();
      });
      list.appendChild(li);
    }
  }
  fillEdenPersonalEditor(editor.querySelector('form'), runtime, state.personalEditingId);
}

function createEdenPersonalBoxSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    requestJson,
    state,
    setPersonalStatus,
    refreshSessionSurfaces,
    refreshPersonalBox,
    refreshAcademyState,
    personalBoxRuntime,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div><div class="eden-personal-auth" data-eden-personal-auth><form class="eden-personal-grid" data-eden-login-form><input name="username" placeholder="Username" autocomplete="username" data-eden-personal-username /><input name="password" type="password" placeholder="Password" autocomplete="current-password" data-eden-personal-password /><div class="eden-personal-actions"><button type="submit">Claim Your Room</button></div></form></div><div class="eden-personal-editor" data-eden-personal-editor hidden><div class="eden-personal-session" data-eden-personal-session></div><form class="eden-personal-grid" data-eden-personal-form><select name="kind"><option value="note">Note</option><option value="check">Check</option><option value="link">Link</option></select><input name="text" placeholder="Widget text" /><input name="href" placeholder="Optional link for link widgets" /><div class="eden-personal-actions"><button type="submit" data-eden-personal-submit>Add widget</button><button type="button" data-eden-personal-cancel hidden>Cancel edit</button><button type="button" data-eden-personal-logout>Logout</button></div></form></div><div class="eden-personal-status" data-eden-personal-status></div><div class="eden-personal-items" data-eden-personal-items></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-login-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const username = form.querySelector('[name="username"]').value;
    const password = form.querySelector('[name="password"]').value;
    const response = await requestJson('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      setPersonalStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setPersonalStatus('Room claimed. Your box is live.', 'ok');
    await refreshSessionSurfaces();
  });
  node.querySelector('[data-eden-personal-form]').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      kind: form.querySelector('[name="kind"]').value,
      text: form.querySelector('[name="text"]').value,
      href: form.querySelector('[name="href"]').value
    };
    const editingId = form.dataset.itemId || '';
    const response = await requestJson(editingId ? ('/api/eden/personal-box/items/' + encodeURIComponent(editingId)) : '/api/eden/personal-box/items', {
      method: editingId ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      setPersonalStatus(response.body?.error || 'save failed', 'error');
      render();
      return;
    }
    state.personalEditingId = null;
    setPersonalStatus(editingId ? 'Widget updated.' : 'Widget added.', 'ok');
    await refreshPersonalBox(surface);
    await refreshAcademyState();
  });
  node.querySelector('[data-eden-personal-cancel]').addEventListener('click', event => {
    state.personalEditingId = null;
    fillEdenPersonalEditor(event.currentTarget.closest('form'), personalBoxRuntime(surface), null);
    setPersonalStatus('Edit cancelled.', 'ok');
  });
  node.querySelector('[data-eden-personal-logout]').addEventListener('click', async () => {
    const response = await requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      setPersonalStatus(response.body?.error || 'logout failed', 'error');
      render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    state.personalEditingId = null;
    setPersonalStatus('Signed out. The room is waiting.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenPersonalBoxPanel(node, surface, {
    state,
    personalBoxRuntime,
    setPersonalStatus,
    requestJson,
    refreshPersonalBox,
    refreshAcademyState,
    render
  });
  return node;
}

export function renderEdenPersonalClientPrelude() {
  return `
${fillEdenPersonalEditor.toString()}
${renderEdenPersonalBoxPanel.toString()}
${createEdenPersonalBoxSurfaceNode.toString()}
`;
}
