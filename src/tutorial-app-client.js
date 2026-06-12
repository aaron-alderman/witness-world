import { tutorialDefinition } from "./tutorials.js";

export function renderTutorialClient(tutorialConfig) {
  const tutorial = tutorialDefinition(tutorialConfig?.id);
  if (!tutorial) return "";
  const json = JSON.stringify(tutorial).replace(/</g, "\\u003c");
  const engine = String.raw`(() => {
  const tutorial = ${json};
  const currentSurfacePage = "app";
  const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
  const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
  const dimmer = document.createElement('div');
  dimmer.className = 'tutorial-dimmer';
  dimmer.hidden = true;
  document.body.appendChild(dimmer);
  const overlay = document.createElement('aside');
  overlay.className = 'tutorial-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="tutorial-overlay-handle" id="tutorial-overlay-handle"><div class="tutorial-handle-copy"><div class="tutorial-overlay-meta" id="tutorial-overlay-meta"></div><div class="tutorial-handle-kicker">Drag tutorial window</div></div><div class="tutorial-handle-grip" aria-hidden="true">::</div></div><h3 id="tutorial-overlay-title"></h3><p id="tutorial-overlay-body"></p><div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="tutorial-next">Next</button><button type="button" id="tutorial-back">Back</button><button type="button" id="tutorial-restart-chapter">Restart Chapter</button><button type="button" id="tutorial-restart-step">Restart From Here</button><button type="button" id="tutorial-disable-page">Disable On This Page</button><button type="button" id="tutorial-exit">Exit</button><button type="button" id="tutorial-reset">Reset</button></div>';
  document.body.appendChild(overlay);
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.id = 'tutorial-resume-page';
  resumeButton.textContent = 'Resume Tutorial';
  resumeButton.className = 'tutorial-resume';
  resumeButton.hidden = true;
  document.body.appendChild(resumeButton);
  const overlayDrag = { active: false, manual: false, left: 16, top: 16, offsetX: 0, offsetY: 0 };
  const pulseTimers = new WeakMap();
  let progress = null;
  let lastRenderedStepId = null;
  let activeHighlightTarget = null;
  let activeFocusScope = null;
  const api = async (method, body = null) => {
    const options = { method };
    if (body != null) {
      options.headers = { 'content-type': 'application/json' };
      options.body = JSON.stringify(body);
    }
    const res = await fetch('/api/tutorial-progress/' + encodeURIComponent(tutorial.id), options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'tutorial request failed');
    return data;
  };
  const currentStep = () => tutorial.steps.find(step => step.id === progress?.stepId) || null;
  const currentStepIndex = () => stepIndex.get(progress?.stepId || '') ?? -1;
  const conceptMap = new Map((tutorial.concepts || []).map(concept => [concept.id, concept]));
  const knownTutorialPages = [...new Set(tutorial.steps.map(step => typeof step.page === 'string' ? step.page : '').filter(Boolean))];
  const tutorialDisabledPages = current => [...new Set((Array.isArray(current?.disabledPages) ? current.disabledPages : []).map(String).filter(page => knownTutorialPages.includes(page)))];
  const tutorialReplayStepId = current => {
    const id = typeof current?.replayStepId === 'string' ? current.replayStepId : '';
    return tutorial.steps.some(step => step.id === id) ? id : null;
  };
  const tutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const tutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => conceptMap.get(id)).filter(Boolean);
  const tutorialRevealedConcepts = current => {
    const lastIndex = current?.completedAt ? ((tutorial.steps?.length || 1) - 1) : currentStepIndex();
    if (lastIndex < 0) return [];
    const conceptIds = [];
    for (const step of tutorial.steps.slice(0, lastIndex + 1)) {
      for (const concept of tutorialStepConcepts(step)) {
        if (!conceptIds.includes(concept.id)) conceptIds.push(concept.id);
      }
    }
    return conceptIds.map(id => conceptMap.get(id)).filter(Boolean);
  };
  const tutorialSurfaceState = () => {
    const step = currentStep();
    if (!progress || !step) return { kind: 'idle', page: null };
    if (progress.completedAt) return { kind: 'completed', page: step.page || null };
    if (progress.hidden) return { kind: 'hidden', page: step.page || null };
    if ((step.page || null) !== currentSurfacePage) return { kind: 'offpage', page: step.page || null };
    if (tutorialDisabledPages(progress).includes(currentSurfacePage)) return { kind: 'disabled', page: step.page || null };
    return { kind: 'active', page: step.page || null };
  };
  const clearTutorialPageDisabled = current => ({
    ...current,
    disabledPages: tutorialDisabledPages(current).filter(page => page !== currentSurfacePage)
  });
  const disableTutorialOnCurrentPage = current => ({
    ...current,
    hidden: false,
    disabledPages: [...new Set([...tutorialDisabledPages(current), currentSurfacePage])]
  });
  const continueTutorialOnPage = async page => {
    if (page === 'bootstrap') {
      const target = new URL('/_bootstrap', window.location.href);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
      return;
    }
    if (page === 'app') {
      window.location.assign(new URL('/', window.location.href).toString());
      return;
    }
    if (page === 'world') {
      const target = new URL('/world', window.location.href);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    }
  };
  const clearHighlight = () => {
    if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute('data-tutorial-current');
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute('data-tutorial-focus-scope');
    activeHighlightTarget = null;
    activeFocusScope = null;
    document.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
    document.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
  };
  const previousStep = () => {
    const index = currentStepIndex();
    return index > 0 ? tutorial.steps[index - 1] : null;
  };
  const firstStepInChapter = chapterId => tutorial.steps.find(step => step.chapterId === chapterId) || null;
  const flashAutoClick = node => {
    if (!node) return;
    pulseNode(node, 720);
    node.classList.add('tutorial-auto-click');
    setTimeout(() => node.classList.remove('tutorial-auto-click'), 520);
    const rect = node.getBoundingClientRect();
    const pulse = document.createElement('div');
    pulse.className = 'tutorial-click-pulse';
    pulse.style.left = (rect.left + (rect.width / 2)) + 'px';
    pulse.style.top = (rect.top + (rect.height / 2)) + 'px';
    document.body.appendChild(pulse);
    setTimeout(() => pulse.remove(), 620);
  };
  const pulseNode = (node, duration = 1200) => {
    if (!node) return;
    node.setAttribute('data-tutorial-changed', 'true');
    const pending = pulseTimers.get(node);
    if (pending) clearTimeout(pending);
    pulseTimers.set(node, setTimeout(() => {
      if (node.isConnected) node.removeAttribute('data-tutorial-changed');
    }, duration));
  };
  const fillForm = (target, payload) => {
    const form = target?.matches?.('form') ? target : target?.closest?.('form') || target?.querySelector?.('form');
    if (!form || !payload) return;
    for (const [key, value] of Object.entries(payload)) {
      const field = form.elements.namedItem(key) || form.querySelector('[name="' + CSS.escape(key) + '"]');
      if (!field) continue;
      if (field.type === 'checkbox') field.checked = value === true;
      else field.value = value == null ? '' : String(value);
      pulseNode(field, 900);
    }
  };
  const renderConceptList = (id, concepts, emptyText) => {
    const root = document.getElementById(id);
    if (!root) return;
    root.innerHTML = '';
    if (!concepts.length) {
      const empty = document.createElement('div');
      empty.className = 'tutorial-concept';
      const copy = document.createElement('span');
      copy.textContent = emptyText;
      empty.append(copy);
      root.append(empty);
      return;
    }
    for (const concept of concepts) {
      const item = document.createElement('div');
      item.className = 'tutorial-concept';
      const title = document.createElement('strong');
      title.textContent = concept.label;
      const summary = document.createElement('span');
      summary.textContent = concept.summary;
      item.append(title, summary);
      root.append(item);
    }
  };
  const submitTutorialForm = async target => {
    const form = target?.matches?.('form') ? target : target?.closest?.('form') || target?.querySelector?.('form');
    if (!form) return false;
    const submitter = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
    if (!submitter) return false;
    flashAutoClick(submitter);
    await new Promise(resolve => setTimeout(resolve, 120));
    submitter.click();
    return true;
  };
  const focusScopeFor = target => target?.matches?.('form,section,main') ? target : target?.closest?.('form,section,main') || target || null;
  const setOverlayPosition = (left, top, manual = false) => {
    const maxLeft = Math.max(12, window.innerWidth - overlay.offsetWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - overlay.offsetHeight - 12);
    const nextLeft = Math.max(12, Math.min(maxLeft, left));
    const nextTop = Math.max(12, Math.min(maxTop, top));
    overlay.style.left = nextLeft + 'px';
    overlay.style.top = nextTop + 'px';
    overlay.style.right = 'auto';
    overlayDrag.left = nextLeft;
    overlayDrag.top = nextTop;
    if (manual) overlayDrag.manual = true;
  };
  const saveProgress = async next => {
    progress = next;
    if (!next) await api('DELETE');
    else await api('PUT', next);
  };
  const restartCurrentChapter = async () => {
    const chapterId = progress?.chapterId || currentStep()?.chapterId || null;
    const first = firstStepInChapter(chapterId);
    if (!progress || !first) return;
    await saveProgress({
      ...progress,
      chapterId: first.chapterId,
      stepId: first.id,
      chapterStatus: 'in_progress',
      draftInputs: {},
      completedAt: null,
      hidden: false,
      replayStepId: null
    });
    render();
  };
  const restartFromHere = async () => {
    const step = currentStep();
    if (!progress || !step) return;
    await saveProgress({
      ...progress,
      chapterId: step.chapterId,
      stepId: step.id,
      chapterStatus: 'in_progress',
      draftInputs: {},
      completedAt: null,
      hidden: false,
      replayStepId: step.id
    });
    render();
  };
  const readTodos = async () => fetch('/api/todos').then(res => res.json().catch(() => ({ todos: [] })));
  const readNotes = async () => fetch('/api/private-notes').then(res => res.json().catch(() => ({ notes: [] })));
  const isComplete = async step => {
    const check = step?.completeWhen || {};
    switch (check.kind) {
      case 'manualAdvance':
      case 'complete':
        return false;
      case 'todoExists': {
        const todos = await readTodos();
        return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title);
      }
      case 'todoDone': {
        const todos = await readTodos();
        return Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title && todo.done === true);
      }
      case 'todoMissing': {
        const todos = await readTodos();
        return !(Array.isArray(todos.todos) && todos.todos.some(todo => todo.title === check.title));
      }
      case 'noteExists': {
        const notes = await readNotes();
        return Array.isArray(notes.notes) && notes.notes.some(note => note.text === check.text);
      }
      default:
        return false;
    }
  };
  const position = target => {
    if (overlayDrag.manual) {
      setOverlayPosition(overlayDrag.left, overlayDrag.top);
      return;
    }
    if (!target) {
      setOverlayPosition(window.innerWidth - overlay.offsetWidth - 16, 16);
      return;
    }
    const rect = target.getBoundingClientRect();
    const top = Math.max(14, Math.min(window.innerHeight - overlay.offsetHeight - 14, rect.bottom + 12));
    const left = rect.left + overlay.offsetWidth + 18 > window.innerWidth ? Math.max(12, rect.right - overlay.offsetWidth) : Math.max(12, rect.left);
    setOverlayPosition(left, top);
  };
  const render = () => {
    clearHighlight();
    const step = currentStep();
    const surface = tutorialSurfaceState();
    if (!progress || progress.completedAt || !step) {
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = true;
      return;
    }
    if (surface.kind === 'hidden' || surface.kind === 'disabled' || surface.kind === 'offpage') {
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = false;
      resumeButton.textContent = surface.kind === 'offpage'
        ? ('Continue On ' + tutorialPageLabel(surface.page))
        : (surface.kind === 'disabled' ? 'Enable On This Page' : 'Resume Tutorial');
      return;
    }
    resumeButton.hidden = true;
    const target = step.target ? byTarget(step.target) : null;
    const scope = focusScopeFor(target);
    if (scope) {
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      activeFocusScope = scope;
    }
    if (target) {
      target.setAttribute('data-tutorial-current', 'true');
      activeHighlightTarget = target;
      if (lastRenderedStepId !== step.id) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    document.getElementById('tutorial-overlay-meta').textContent = step.chapterId.toUpperCase();
    document.getElementById('tutorial-overlay-title').textContent = step.title;
    document.getElementById('tutorial-overlay-body').textContent = tutorialReplayStepId(progress) === step.id
      ? (step.body + ' Replaying this step does not roll back app state.')
      : step.body;
    renderConceptList('tutorial-overlay-concepts', tutorialStepConcepts(step), 'This step keeps working through the visible app without unlocking a new concept.');
    document.getElementById('tutorial-next').textContent = step.nextLabel || 'Next';
    document.getElementById('tutorial-back').disabled = !previousStep();
    document.getElementById('tutorial-restart-chapter').disabled = !firstStepInChapter(step.chapterId);
    document.getElementById('tutorial-restart-step').disabled = false;
    dimmer.hidden = false;
    overlay.hidden = false;
    position(target);
    lastRenderedStepId = step.id;
  };
  const advance = async () => {
    const index = currentStepIndex();
    const next = tutorial.steps[index + 1] || null;
    if (!next) {
      await saveProgress({ ...progress, chapterStatus: 'completed', completedAt: new Date().toISOString(), hidden: false, replayStepId: null });
    } else {
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, hidden: false, replayStepId: null });
    }
    render();
  };
  const maybeAdvance = async () => {
    let step = currentStep();
    while (progress && step && !progress.hidden && !progress.completedAt && step.page === 'app' && tutorialReplayStepId(progress) !== step.id && await isComplete(step)) {
      await advance();
      step = currentStep();
    }
  };
  let maybeAdvanceRunning = false;
  let maybeAdvanceQueued = false;
  const requestMaybeAdvance = async () => {
    if (maybeAdvanceRunning) {
      maybeAdvanceQueued = true;
      return;
    }
    maybeAdvanceRunning = true;
    try {
      do {
        maybeAdvanceQueued = false;
        await maybeAdvance();
      } while (maybeAdvanceQueued);
    } finally {
      maybeAdvanceRunning = false;
    }
  };
  const alignProgressToAppPage = async () => {
    let step = currentStep();
    while (progress && step && !progress.completedAt && step.page !== 'app') {
      const next = tutorial.steps[currentStepIndex() + 1] || null;
      if (!next || next.page !== 'app') break;
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, replayStepId: null });
      step = currentStep();
    }
  };
  const clearReplayForInteraction = async eventTarget => {
    const step = currentStep();
    const replayStepId = tutorialReplayStepId(progress);
    if (!step || replayStepId !== step.id) return;
    const target = step.target ? byTarget(step.target) : null;
    const element = eventTarget?.nodeType === Node.ELEMENT_NODE ? eventTarget : eventTarget?.parentElement || null;
    if (!target || !element) return;
    if (!(element === target || target.contains(element) || element.closest?.('[data-tutorial-target="' + CSS.escape(step.target) + '"]'))) return;
    progress = { ...progress, replayStepId: null };
    await api('PUT', progress).catch(() => {});
  };
  resumeButton.addEventListener('click', async () => {
    if (!progress) return;
    const surface = tutorialSurfaceState();
    if (surface.kind === 'offpage') {
      await continueTutorialOnPage(surface.page);
      return;
    }
    if (surface.kind === 'disabled') {
      await saveProgress(clearTutorialPageDisabled(progress));
    } else {
      await saveProgress({ ...progress, hidden: false, replayStepId: null });
    }
    render();
  });
  document.getElementById('tutorial-overlay-handle').addEventListener('pointerdown', event => {
    if (overlay.hidden) return;
    const rect = overlay.getBoundingClientRect();
    overlayDrag.active = true;
    overlayDrag.manual = true;
    overlayDrag.left = rect.left;
    overlayDrag.top = rect.top;
    overlayDrag.offsetX = event.clientX - rect.left;
    overlayDrag.offsetY = event.clientY - rect.top;
    document.body.classList.add('tutorial-dragging');
    event.preventDefault();
  });
  window.addEventListener('pointermove', event => {
    if (!overlayDrag.active) return;
    setOverlayPosition(event.clientX - overlayDrag.offsetX, event.clientY - overlayDrag.offsetY, true);
  });
  window.addEventListener('pointerup', () => {
    overlayDrag.active = false;
    document.body.classList.remove('tutorial-dragging');
  });
  document.getElementById('tutorial-next').addEventListener('click', async () => {
    const step = currentStep();
    if (!step) return;
    if (step.completeWhen?.kind === 'manualAdvance') {
      await advance();
      return;
    }
    const target = step.target ? byTarget(step.target) : null;
    if (step.payload && target) {
      fillForm(target, step.payload);
      await saveProgress({ ...progress, draftInputs: step.payload, hidden: false, replayStepId: null });
      const submitted = await submitTutorialForm(target);
      if (submitted) return;
      render();
      return;
    }
  });
  document.getElementById('tutorial-back').addEventListener('click', async () => {
    const step = previousStep();
    if (!step || !progress) return;
    await saveProgress({
      ...progress,
      chapterId: step.chapterId,
      stepId: step.id,
      completedAt: null,
      hidden: false,
      replayStepId: await isComplete(step) ? step.id : null
    });
    render();
  });
  document.getElementById('tutorial-restart-chapter').addEventListener('click', async () => {
    overlayDrag.manual = false;
    await restartCurrentChapter();
  });
  document.getElementById('tutorial-restart-step').addEventListener('click', async () => {
    overlayDrag.manual = false;
    await restartFromHere();
  });
  document.getElementById('tutorial-disable-page').addEventListener('click', async () => {
    const step = currentStep();
    if (!progress || !step || step.page !== currentSurfacePage) return;
    await saveProgress(disableTutorialOnCurrentPage(progress));
    render();
  });
  document.getElementById('tutorial-exit').addEventListener('click', async () => {
    if (!progress) return;
    await saveProgress({ ...progress, hidden: true, replayStepId: null });
    render();
  });
  document.getElementById('tutorial-reset').addEventListener('click', async () => {
    overlayDrag.manual = false;
    progress = null;
    await api('DELETE');
    render();
  });
  const boot = async () => {
    const data = await api('GET');
    progress = data.progress || null;
    await alignProgressToAppPage();
    render();
    await requestMaybeAdvance();
    render();
    window.__witnessTutorialApp = {
      get currentStepId() { return progress?.stepId || null; },
      get currentChapterId() { return progress?.chapterId || null; },
      get currentPage() { return currentStep()?.page || null; },
      get currentConceptIds() { return tutorialStepConcepts(currentStep()).map(concept => concept.id); },
      get revealedConceptIds() { return tutorialRevealedConcepts(progress).map(concept => concept.id); },
      get replayStepId() { return tutorialReplayStepId(progress); },
      get completedAt() { return progress?.completedAt || null; },
      get hidden() { return progress?.hidden === true; },
      get disabledPages() { return tutorialDisabledPages(progress); },
      get surfacePage() { return currentSurfacePage; },
      get surfaceStatus() { return tutorialSurfaceState().kind; }
    };
  };
  document.addEventListener('click', event => {
    void clearReplayForInteraction(event.target).catch(() => {});
    setTimeout(() => requestMaybeAdvance().catch(() => {}), 150);
  });
  document.addEventListener('submit', event => {
    void clearReplayForInteraction(event.target).catch(() => {});
    setTimeout(() => requestMaybeAdvance().catch(() => {}), 150);
  }, true);
  window.addEventListener('resize', render);
  window.addEventListener('scroll', render, { passive: true });
  setInterval(() => { void requestMaybeAdvance().catch(() => {}); }, 1200);
  void boot();
})();`;
  return `\n<script>\n${engine}\n</script>`;
}
