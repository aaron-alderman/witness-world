function renderEdenTheoryPanel(node, surface, deps) {
  const {
    state,
    theoryAnnexRuntime,
    academyState,
    actionById,
    renderTrackCard
  } = deps;
  const runtime = theoryAnnexRuntime(surface);
  const academy = academyState();
  const auth = node.querySelector('[data-eden-tree-auth]');
  const editor = node.querySelector('[data-eden-tree-editor]');
  const session = node.querySelector('[data-eden-tree-session]');
  const status = node.querySelector('[data-eden-tree-status]');
  const summary = node.querySelector('[data-eden-tree-summary]');
  const quests = node.querySelector('[data-eden-tree-quests]');
  const lessons = node.querySelector('[data-eden-tree-lessons]');
  if (!auth || !editor || !session || !status || !summary || !quests || !lessons) return;
  const authenticated = Boolean(state.session?.authenticated && state.session?.actor);
  const theoryAction = actionById(surface, 'tree_theory');
  const pathOpen = theoryAction?.state === 'open';
  const stewardshipTrack = (academy.tracks || []).find(track => track.id === 'stewardship') || null;
  const teachingTrack = (academy.tracks || []).find(track => track.id === 'teaching') || null;
  const surfaceQuests = Array.isArray(surface.questIds)
    ? surface.questIds
        .map(id => (academy.quests || []).find(quest => quest.id === id) || null)
        .filter(Boolean)
    : [];
  auth.hidden = authenticated;
  editor.hidden = !authenticated;
  session.textContent = authenticated
    ? ('Signed in as ' + (state.session.label || state.session.actor || 'user') + '. The annex will witness optional theory work and, eventually, the trained mark.')
    : 'Sign in to make optional theory work and the trained mark count toward your academy path.';
  status.textContent = state.theoryStatus.text || '';
  status.classList.toggle('is-error', state.theoryStatus.tone === 'error');
  status.classList.toggle('is-ok', state.theoryStatus.tone === 'ok');

  summary.innerHTML = '';
  const summaryCard = document.createElement('div');
  summaryCard.className = 'eden-tree-card';
  summaryCard.innerHTML =
    '<div class="eden-tree-kicker">Theory Annex</div>'
    + '<div class="eden-tree-line">' + (pathOpen
      ? 'Open. The optional theory path can now be practiced here.'
      : (theoryAction?.requires || 'Locked.')) + '</div>'
    + '<div class="eden-tree-line">Lessons studied: ' + String(runtime.completedLessonCount || 0) + ' / ' + String((runtime.lessons || []).length) + '</div>'
    + '<div class="eden-tree-line">Trained mark: ' + (runtime.trained ? 'earned' : 'not yet earned') + '</div>'
    + '<div class="eden-tree-line">Teach-backs witnessed: ' + String(runtime.teachBackCount || 0) + '</div>';
  summary.appendChild(summaryCard);
  if (stewardshipTrack) summary.appendChild(renderTrackCard(stewardshipTrack));
  if (teachingTrack) summary.appendChild(renderTrackCard(teachingTrack));

  quests.innerHTML = '';
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
    quests.appendChild(card);
  }

  lessons.innerHTML = '';
  for (const lesson of runtime.lessons || []) {
    const card = document.createElement('div');
    card.className = 'eden-tree-card';
    card.dataset.edenTheoryLesson = lesson.id;
    card.innerHTML =
      '<div class="eden-tree-kicker"></div>'
      + '<div class="eden-tree-line" data-eden-tree-lesson-title></div>'
      + '<div class="eden-tree-line" data-eden-tree-lesson-summary></div>'
      + '<div class="eden-tree-actions"><button type="button" data-eden-theory-study></button></div>';
    card.querySelector('.eden-tree-kicker').textContent = lesson.concept ? ('Theory · ' + lesson.concept) : 'Theory';
    card.querySelector('[data-eden-tree-lesson-title]').textContent = lesson.title;
    card.querySelector('[data-eden-tree-lesson-summary]').textContent = lesson.summary || 'Optional lesson.';
    const button = card.querySelector('[data-eden-theory-study]');
    button.textContent = lesson.completed ? 'Studied' : 'Study';
    button.disabled = !authenticated || !pathOpen || lesson.completed;
    button.addEventListener('click', async () => {
      const response = await deps.requestJson('/api/eden/theory/lessons/' + encodeURIComponent(lesson.id) + '/study', {
        method: 'POST'
      });
      surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
      if (!response.ok) {
        deps.setTheoryStatus(response.body?.error || ('study failed for ' + lesson.title), 'error');
        deps.render();
        return;
      }
      deps.setTheoryStatus('Studied ' + lesson.title + '.', 'ok');
      await deps.refreshAcademyState();
      deps.render();
    });
    lessons.appendChild(card);
  }

  const assessCard = document.createElement('div');
  assessCard.className = 'eden-tree-card';
  assessCard.innerHTML =
    '<div class="eden-tree-kicker">Assessment</div>'
    + '<div class="eden-tree-line">Complete every lesson, then take the witnessed assessment to earn the optional trained mark.</div>'
    + '<div class="eden-tree-actions"><button type="button" data-eden-theory-assess>Earn trained mark</button><button type="button" data-eden-theory-logout>Logout</button></div>';
  const assess = assessCard.querySelector('[data-eden-theory-assess]');
  assess.disabled = !authenticated || !pathOpen || !runtime.allLessonsCompleted || runtime.trained;
  if (runtime.trained) assess.textContent = 'trained mark earned';
  assess.addEventListener('click', async () => {
    const response = await deps.requestJson('/api/eden/theory/assessment', { method: 'POST' });
    surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
    if (!response.ok) {
      deps.setTheoryStatus(response.body?.error || 'assessment failed', 'error');
      deps.render();
      return;
    }
    deps.setTheoryStatus('The trained mark is now witnessed on your path.', 'ok');
    await deps.refreshAcademyState();
    deps.render();
  });
  assessCard.querySelector('[data-eden-theory-logout]').addEventListener('click', async () => {
    const response = await deps.requestJson('/api/session', { method: 'DELETE' });
    if (!response.ok) {
      deps.setTheoryStatus(response.body?.error || 'logout failed', 'error');
      deps.render();
      return;
    }
    state.session = { authenticated: false, actor: null, identity: null, label: null };
    state.theoryTeachBackDraft = '';
    deps.setTheoryStatus('Signed out. The annex keeps its notes.', 'ok');
    await deps.refreshSessionSurfaces();
  });
  lessons.appendChild(assessCard);

  const teachBackCard = document.createElement('div');
  teachBackCard.className = 'eden-tree-card';
  teachBackCard.innerHTML =
    '<div class="eden-tree-kicker">Teach Back</div>'
    + '<div class="eden-tree-line">After the trained mark, say the world back in your own words so theory becomes something you can carry for someone else.</div>'
    + '<textarea class="eden-tree-textarea" data-eden-theory-teachback-note placeholder="What did you just learn, and how would you explain it to another builder?"></textarea>'
    + '<div class="eden-tree-actions"><button type="button" data-eden-theory-teachback>Witness teach-back</button></div>'
    + '<div class="eden-tree-teachback-list" data-eden-theory-teachback-list></div>';
  const teachBackInput = teachBackCard.querySelector('[data-eden-theory-teachback-note]');
  const teachBackButton = teachBackCard.querySelector('[data-eden-theory-teachback]');
  const teachBackList = teachBackCard.querySelector('[data-eden-theory-teachback-list]');
  teachBackInput.value = state.theoryTeachBackDraft || '';
  const syncTeachBackButton = () => {
    const hasNote = Boolean(String(teachBackInput.value || '').trim());
    teachBackButton.disabled = !authenticated || !runtime.trained || !hasNote;
    if (!authenticated) teachBackButton.textContent = 'Sign in to teach back';
    else if (!runtime.trained) teachBackButton.textContent = 'Earn trained mark first';
    else teachBackButton.textContent = runtime.teachBackCount ? 'Witness another teach-back' : 'Witness teach-back';
  };
  teachBackInput.addEventListener('input', () => {
    state.theoryTeachBackDraft = teachBackInput.value;
    syncTeachBackButton();
  });
  syncTeachBackButton();
  teachBackButton.addEventListener('click', async () => {
    const note = String(teachBackInput.value || '').trim();
    const response = await deps.requestJson('/api/eden/theory/teach-back', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ note })
    });
    surface.runtime = response.body?.theoryState || theoryAnnexRuntime(surface);
    if (!response.ok) {
      deps.setTheoryStatus(response.body?.error || 'teach-back failed', 'error');
      deps.render();
      return;
    }
    state.theoryTeachBackDraft = '';
    deps.setTheoryStatus('Teach-back witnessed. Teaching now counts too.', 'ok');
    await deps.refreshAcademyState();
    deps.render();
  });
  teachBackList.innerHTML = '';
  const teachBacks = Array.isArray(runtime.teachBacks) ? runtime.teachBacks : [];
  if (!teachBacks.length) {
    const empty = document.createElement('div');
    empty.className = 'eden-tree-line';
    empty.textContent = runtime.trained
      ? 'No teach-backs yet. Explain one lesson in your own words.'
      : 'Teach-back unlocks after the trained mark.';
    teachBackList.appendChild(empty);
  } else {
    for (const row of teachBacks) {
      const item = document.createElement('div');
      item.className = 'eden-tree-teachback-item';
      const meta = document.createElement('div');
      meta.className = 'eden-tree-teachback-meta';
      meta.textContent = row.title || 'Witnessed teach-back';
      const note = document.createElement('div');
      note.className = 'eden-tree-line';
      note.textContent = row.note;
      item.appendChild(meta);
      item.appendChild(note);
      teachBackList.appendChild(item);
    }
  }
  lessons.appendChild(teachBackCard);
}

function createEdenTheorySurfaceNode(surface, deps) {
  const {
    renderActions,
    requestJson,
    state,
    setTheoryStatus,
    refreshSessionSurfaces,
    refreshAcademyState,
    theoryAnnexRuntime,
    academyState,
    actionById,
    renderTrackCard,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface eden-surface-tree';
  node.innerHTML = '<div class="eden-tree-shell"><div><div class="eden-surface-title"></div><small></small></div><div class="eden-surface-body"><p></p></div><div class="eden-tree-auth" data-eden-tree-auth><form class="eden-tree-grid" data-eden-tree-login-form><input name="username" placeholder="Username" autocomplete="username" /><input name="password" type="password" placeholder="Password" autocomplete="current-password" /><div class="eden-tree-actions"><button type="submit">Open Theory Annex</button></div></form></div><div class="eden-tree-editor" data-eden-tree-editor hidden><div class="eden-tree-session" data-eden-tree-session></div></div><div class="eden-tree-status" data-eden-tree-status></div><div class="eden-tree-summary" data-eden-tree-summary></div><div class="eden-tree-quests" data-eden-tree-quests></div><div class="eden-tree-lessons" data-eden-tree-lessons></div><div class="eden-surface-actions"></div></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('small').textContent = surface.subtitle || 'Landmark';
  node.querySelector('.eden-surface-body p').textContent = surface.body || 'Growth, authorship, and return.';
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('[data-eden-tree-login-form]').addEventListener('submit', async event => {
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
      setTheoryStatus(response.body?.error || 'invalid credentials', 'error');
      render();
      return;
    }
    state.session = response.body || { authenticated: false, actor: null, identity: null, label: null };
    setTheoryStatus('Theory annex open. Optional study now counts.', 'ok');
    await refreshSessionSurfaces();
  });
  renderEdenTheoryPanel(node, surface, {
    state,
    theoryAnnexRuntime,
    academyState,
    actionById,
    renderTrackCard,
    requestJson,
    setTheoryStatus,
    refreshSessionSurfaces,
    refreshAcademyState,
    render
  });
  return node;
}

export function renderEdenTheoryClientPrelude() {
  return `
${renderEdenTheoryPanel.toString()}
${createEdenTheorySurfaceNode.toString()}
`;
}
