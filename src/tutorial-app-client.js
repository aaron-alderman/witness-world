import { tutorialDefinition } from "./tutorials.js";

export function renderTutorialClient(tutorialConfig) {
  const tutorial = tutorialDefinition(tutorialConfig?.id);
  if (!tutorial) return "";
  const json = JSON.stringify(tutorial).replace(/</g, "\\u003c");
  const configJson = JSON.stringify(tutorialConfig || {}).replace(/</g, "\\u003c");
  const engine = String.raw`(() => {
  const tutorial = ${json};
  const tutorialConfig = ${configJson};
  const currentSurfacePage = typeof tutorialConfig.surfacePage === "string" && tutorialConfig.surfacePage.trim() ? tutorialConfig.surfacePage.trim() : "app";
  const currentSurfaceContext = typeof tutorialConfig.surfaceContext === "string" && tutorialConfig.surfaceContext.trim() ? tutorialConfig.surfaceContext.trim() : null;
  const currentSurfaceRouteId = typeof tutorialConfig.surfaceRouteId === "string" && tutorialConfig.surfaceRouteId.trim() ? tutorialConfig.surfaceRouteId.trim() : null;
  const currentSurfaceRootWidgetId = typeof tutorialConfig.surfaceRootWidgetId === "string" && tutorialConfig.surfaceRootWidgetId.trim() ? tutorialConfig.surfaceRootWidgetId.trim() : null;
  const currentSurfaceProgramId = typeof tutorialConfig.surfaceProgramId === "string" && tutorialConfig.surfaceProgramId.trim() ? tutorialConfig.surfaceProgramId.trim() : null;
  const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
  const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
  const dimmer = document.createElement('div');
  dimmer.className = 'tutorial-dimmer';
  dimmer.hidden = true;
  document.body.appendChild(dimmer);
  const overlay = document.createElement('aside');
  overlay.className = 'tutorial-overlay';
  overlay.hidden = true;
  overlay.innerHTML = '<div class="tutorial-overlay-handle" id="tutorial-overlay-handle"><div class="tutorial-handle-copy"><div class="tutorial-overlay-meta" id="tutorial-overlay-meta"></div><div class="tutorial-handle-kicker">Drag tutorial window</div></div><div class="tutorial-handle-grip" aria-hidden="true">::</div></div><h3 id="tutorial-overlay-title"></h3><p id="tutorial-overlay-body"></p><div class="tutorial-concept-list" id="tutorial-overlay-concepts"></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" id="tutorial-next">Next</button><button type="button" id="tutorial-back">Back</button><button type="button" id="tutorial-restart-chapter">Restart Chapter</button><button type="button" id="tutorial-restart-step">Restart From This Scope</button><button type="button" id="tutorial-show-current-control">Show Current Control</button><button type="button" id="tutorial-disable-page">Disable Sourcery Here</button><button type="button" id="tutorial-disable-context">Disable Sourcery In This Context</button><button type="button" id="tutorial-exit">Exit</button><button type="button" id="tutorial-reset">Reset</button></div>';
  document.body.appendChild(overlay);
  const resumeButton = document.createElement('button');
  resumeButton.type = 'button';
  resumeButton.id = 'tutorial-resume-page';
  resumeButton.textContent = 'Resume Tutorial';
  resumeButton.className = 'tutorial-resume';
  resumeButton.hidden = true;
  document.body.appendChild(resumeButton);
  const disabledScopesToggle = document.createElement('button');
  disabledScopesToggle.type = 'button';
  disabledScopesToggle.id = 'tutorial-disabled-scopes-toggle';
  disabledScopesToggle.textContent = 'Show Disabled Sourcery Scopes';
  disabledScopesToggle.className = 'tutorial-resume';
  disabledScopesToggle.style.bottom = '72px';
  disabledScopesToggle.hidden = true;
  document.body.appendChild(disabledScopesToggle);
  const disabledScopesPanel = document.createElement('aside');
  disabledScopesPanel.id = 'tutorial-disabled-scopes-panel';
  disabledScopesPanel.className = 'tutorial-overlay';
  disabledScopesPanel.hidden = true;
  disabledScopesPanel.style.width = '320px';
  disabledScopesPanel.style.maxWidth = 'calc(100vw - 24px)';
  disabledScopesPanel.style.right = '16px';
  disabledScopesPanel.style.left = 'auto';
  disabledScopesPanel.style.top = '72px';
  disabledScopesPanel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px"><div><div class="tutorial-overlay-meta">Disabled Sourcery Scopes</div><h3 style="margin:4px 0 0">Recover guidance on real surfaces</h3></div><button type="button" id="tutorial-disabled-scopes-close" class="secondary">Close</button></div><div id="tutorial-disabled-scopes-list" style="display:grid;gap:8px;margin-top:10px"></div>';
  document.body.appendChild(disabledScopesPanel);
  const overlayDrag = { active: false, manual: false, left: 16, top: 16, offsetX: 0, offsetY: 0 };
  const pulseTimers = new WeakMap();
  let progress = null;
  let lastRenderedStepId = null;
  let activeHighlightTarget = null;
  let activeFocusScope = null;
  let disabledScopesOpen = false;
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
  const tutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const tutorialContextLabel = contextId => typeof contextId === 'string' && contextId.trim()
    ? (contextId.trim().charAt(0).toUpperCase() + contextId.trim().slice(1) + ' context')
    : null;
  const tutorialPageScopeKey = page => typeof page === 'string' && page.trim() ? ('page:' + page.trim()) : null;
  const tutorialChapterScopeKey = chapterId => typeof chapterId === 'string' && chapterId.trim() ? ('chapter:' + chapterId.trim()) : null;
  const tutorialStepScope = step => {
    if (!step) return null;
    const key = typeof step.scopeKey === 'string' && step.scopeKey.trim()
      ? step.scopeKey.trim()
      : (step.page === 'world' ? 'world' : tutorialPageScopeKey(step.page));
    if (!key) return null;
    const kind = typeof step.scopeKind === 'string' && step.scopeKind.trim()
      ? step.scopeKind.trim()
      : (key === 'world'
          ? 'world'
          : (key.startsWith('section:')
              ? 'section'
              : (key.startsWith('widget:')
                  ? 'widget'
                  : (key.startsWith('chapter:')
                      ? 'chapter'
                      : 'page'))));
    return {
      key,
      kind,
      page: typeof step.scopePage === 'string' && step.scopePage.trim() ? step.scopePage.trim() : (kind === 'world' ? 'world' : (step.page || null)),
      label: typeof step.scopeLabel === 'string' && step.scopeLabel.trim() ? step.scopeLabel.trim() : (step.title || ''),
      chapterId: step.chapterId || null,
      target: typeof step.target === 'string' && step.target.trim() ? step.target.trim() : null
    };
  };
  const tutorialScopeCatalog = new Map();
  const tutorialContextCatalog = new Map();
  const addScopeInfo = info => {
    if (!info?.key) return;
    if (!tutorialScopeCatalog.has(info.key)) {
      tutorialScopeCatalog.set(info.key, { ...info });
      return;
    }
    tutorialScopeCatalog.set(info.key, {
      ...tutorialScopeCatalog.get(info.key),
      ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ''))
    });
  };
  const addContextInfo = info => {
    if (!info?.id) return;
    if (!tutorialContextCatalog.has(info.id)) tutorialContextCatalog.set(info.id, { ...info });
  };
  const tutorialStepSurfaceContext = step => {
    if (!step) return null;
    const contextId = typeof step.surfaceContextId === 'string' && step.surfaceContextId.trim() ? step.surfaceContextId.trim() : '';
    if (!contextId) return null;
    return {
      id: contextId,
      label: typeof step.surfaceContextLabel === 'string' && step.surfaceContextLabel.trim() ? step.surfaceContextLabel.trim() : tutorialContextLabel(contextId)
    };
  };
  for (const scope of tutorial.scopes || []) addScopeInfo(tutorialStepScope(scope));
  for (const step of tutorial.steps) {
    const stepScope = tutorialStepScope(step);
    addScopeInfo(stepScope);
    addContextInfo(tutorialStepSurfaceContext(step));
    if (step.page) addScopeInfo({ key: tutorialPageScopeKey(step.page), kind: 'page', page: step.page, label: tutorialPageLabel(step.page) });
    if (step.page === 'world') addScopeInfo({ key: 'world', kind: 'world', page: 'world', label: 'World surface' });
    if (step.chapterId) addScopeInfo({ key: tutorialChapterScopeKey(step.chapterId), kind: 'chapter', chapterId: step.chapterId, label: step.chapterId });
  }
  const tutorialScopeInfo = scopeKey => tutorialScopeCatalog.get(typeof scopeKey === 'string' ? scopeKey.trim() : '') || null;
  const tutorialContextInfo = contextId => tutorialContextCatalog.get(typeof contextId === 'string' ? contextId.trim() : '') || null;
  const tutorialScopeTargetName = scopeKey => {
    const key = typeof scopeKey === 'string' ? scopeKey.trim() : '';
    if (!key) return null;
    const authored = tutorialScopeInfo(key);
    if (authored?.target && (!authored.page || authored.page === currentSurfacePage)) return authored.target;
    const preferred = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && step.page === currentSurfacePage && typeof step.target === 'string' && step.target.trim());
    if (preferred?.target) return preferred.target.trim();
    const fallback = tutorial.steps.find(step => tutorialStepScope(step)?.key === key && typeof step.target === 'string' && step.target.trim());
    return fallback?.target?.trim() || null;
  };
  const tutorialDisabledScopeKeys = current => {
    const keys = [];
    if (Array.isArray(current?.disabledScopeKeys)) {
      for (const key of current.disabledScopeKeys.map(String).map(value => value.trim()).filter(Boolean)) keys.push(key);
    }
    const disabledPages = Array.isArray(current?.disabledPages) ? current.disabledPages : [];
    for (const page of disabledPages.map(String).map(value => value.trim()).filter(Boolean)) {
      const pageKey = tutorialPageScopeKey(page);
      if (pageKey) keys.push(pageKey);
      if (page === 'world') keys.push('world');
    }
    return [...new Set(keys.filter(key => tutorialScopeInfo(key)))];
  };
  const tutorialDisabledPages = current => {
    const pages = [];
    for (const key of tutorialDisabledScopeKeys(current)) {
      const scope = tutorialScopeInfo(key);
      if (!scope) continue;
      if (scope.kind === 'page' && scope.page) pages.push(scope.page);
      if (scope.kind === 'world') pages.push('world');
    }
    return [...new Set(pages)];
  };
  const tutorialDisabledContextIds = current => {
    const ids = Array.isArray(current?.disabledContextIds)
      ? current.disabledContextIds.map(String).map(value => value.trim()).filter(Boolean)
      : [];
    return [...new Set(ids.filter(id => tutorialContextInfo(id)))];
  };
  const tutorialReplayScopeKey = current => {
    const step = tutorial.steps.find(candidate => candidate.id === current?.stepId) || null;
    const stepScopeKey = tutorialStepScope(step)?.key || null;
    const chapterScopeKey = tutorialChapterScopeKey(step?.chapterId);
    const explicitKey = typeof current?.replayScopeKey === 'string' ? current.replayScopeKey.trim() : '';
    if (explicitKey) {
      const explicitScope = tutorialScopeInfo(explicitKey);
      if (explicitScope && (explicitScope.key === stepScopeKey || explicitScope.key === chapterScopeKey)) return explicitScope.key;
    }
    const legacyReplayStepId = typeof current?.replayStepId === 'string' ? current.replayStepId : '';
    if (legacyReplayStepId && legacyReplayStepId === step?.id) return stepScopeKey;
    return null;
  };
  const tutorialReplayStepId = current => {
    const step = tutorial.steps.find(candidate => candidate.id === current?.stepId) || null;
    return tutorialReplayScopeKey(current) && step ? step.id : null;
  };
  const tutorialScopeAncestors = scopeKey => {
    const scope = tutorialScopeInfo(scopeKey);
    if (!scope?.key) return [];
    const keys = [scope.key];
    if (scope.kind === 'widget' || scope.kind === 'section') {
      const pageKey = tutorialPageScopeKey(scope.page);
      if (pageKey) keys.push(pageKey);
      if (scope.page === 'world') keys.push('world');
    } else if (scope.kind === 'page' && scope.page === 'world') {
      keys.push('world');
    } else if (scope.kind === 'world') {
      keys.push(tutorialPageScopeKey('world'));
    }
    return [...new Set(keys.filter(Boolean))];
  };
  const isTutorialScopeDisabled = (current, scopeKey) => {
    const disabled = new Set(tutorialDisabledScopeKeys(current));
    return tutorialScopeAncestors(scopeKey).some(key => disabled.has(key));
  };
  const isTutorialContextDisabled = (current, contextId) => {
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    return Boolean(normalizedContextId) && tutorialDisabledContextIds(current).includes(normalizedContextId);
  };
  const normalizeProgress = current => {
    if (!current || typeof current !== 'object') return null;
    const step = tutorial.steps.find(candidate => candidate.id === current.stepId) || tutorial.steps[0] || null;
    const disabledScopeKeys = tutorialDisabledScopeKeys(current);
    const disabledContextIds = tutorialDisabledContextIds(current);
    const normalized = {
      tutorialId: tutorial.id,
      chapterId: step?.chapterId || null,
      stepId: step?.id || null,
      chapterStatus: typeof current.chapterStatus === 'string' ? current.chapterStatus : (step ? 'in_progress' : 'idle'),
      draftInputs: current.draftInputs && typeof current.draftInputs === 'object' ? current.draftInputs : {},
      completedAt: typeof current.completedAt === 'string' ? current.completedAt : null,
      hidden: current.hidden === true,
      disabledScopeKeys,
      disabledContextIds,
      replayScopeKey: null
    };
    normalized.replayScopeKey = tutorialReplayScopeKey({ ...current, stepId: normalized.stepId }) || null;
    normalized.disabledPages = tutorialDisabledPages(normalized);
    normalized.replayStepId = normalized.replayScopeKey && normalized.stepId ? normalized.stepId : null;
    return normalized;
  };
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
    const currentContext = tutorialStepSurfaceContext(step);
    if (currentContext?.id && isTutorialContextDisabled(progress, currentContext.id)) return { kind: 'disabled-context', page: step.page || null, contextId: currentContext.id };
    const currentScope = tutorialStepScope(step);
    if (currentScope?.key && isTutorialScopeDisabled(progress, currentScope.key)) return { kind: 'disabled', page: step.page || null, scopeKey: currentScope.key };
    return { kind: 'active', page: step.page || null, scopeKey: currentScope?.key || null };
  };
  const tutorialDisabledGuidanceRows = current => {
    const currentScopeKey = tutorialStepScope(currentStep())?.key || null;
    const currentScopeAncestors = tutorialScopeAncestors(currentScopeKey);
    const currentContextId = tutorialStepSurfaceContext(currentStep())?.id || null;
    const rows = tutorialDisabledContextIds(current).map(contextId => {
      const context = tutorialContextInfo(contextId);
      const matchingStep = (currentContextId && currentContextId === contextId ? currentStep() : null)
        || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId && step.page === currentSurfacePage)
        || tutorial.steps.find(step => tutorialStepSurfaceContext(step)?.id === contextId)
        || null;
      const scopeKey = tutorialStepScope(matchingStep)?.key || null;
      return {
        type: 'context',
        contextId,
        page: matchingStep?.page || null,
        label: context?.label || tutorialContextLabel(contextId) || contextId,
        currentStepTitle: currentContextId === contextId ? currentStep()?.title || null : null,
        focusScopeKey: scopeKey,
        target: matchingStep?.page === currentSurfacePage && scopeKey ? tutorialScopeTargetName(scopeKey) : null
      };
    });
    for (const scopeKey of tutorialDisabledScopeKeys(current)) {
      const scope = tutorialScopeInfo(scopeKey);
      rows.push({
        type: 'scope',
        scopeKey,
        page: scope?.page || null,
        label: scope?.kind === 'page' && scope?.page ? tutorialPageLabel(scope.page) : (scope?.label || scopeKey),
        currentStepTitle: currentScopeAncestors.includes(scopeKey) ? currentStep()?.title || null : null,
        target: scope?.page === currentSurfacePage ? tutorialScopeTargetName(scopeKey) : null
      });
    }
    return rows;
  };
  const clearTutorialScopeDisabled = (current, scopeKey) => {
    const keysToRemove = new Set(tutorialScopeAncestors(scopeKey));
    const disabledScopeKeys = tutorialDisabledScopeKeys(current).filter(key => !keysToRemove.has(key));
    return normalizeProgress({ ...current, disabledScopeKeys, disabledPages: [] });
  };
  const clearTutorialContextDisabled = (current, contextId = currentSurfaceContext) => {
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    if (!normalizedContextId) return normalizeProgress(current);
    return normalizeProgress({
      ...current,
      disabledContextIds: tutorialDisabledContextIds(current).filter(id => id !== normalizedContextId)
    });
  };
  const disableTutorialOnCurrentScope = current => {
    const scopeKey = tutorialStepScope(currentStep())?.key || tutorialPageScopeKey(currentSurfacePage);
    const disabledScopeKeys = [...new Set([...tutorialDisabledScopeKeys(current), scopeKey])];
    return normalizeProgress({ ...current, hidden: false, disabledScopeKeys, disabledPages: [] });
  };
  const disableTutorialOnCurrentContext = current => {
    const contextId = typeof currentSurfaceContext === 'string' ? currentSurfaceContext.trim() : '';
    if (!contextId) return normalizeProgress(current);
    const disabledContextIds = [...new Set([...tutorialDisabledContextIds(current), contextId])];
    return normalizeProgress({ ...current, hidden: false, disabledContextIds });
  };
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
  const focusTutorialTarget = targetName => {
    const target = byTarget(targetName);
    if (!target) return false;
    clearHighlight();
    target.setAttribute('data-tutorial-current', 'true');
    activeHighlightTarget = target;
    const scope = focusScopeFor(target);
    if (scope) {
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      activeFocusScope = scope;
    }
    pulseNode(target, 900);
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = target.matches?.('input,button,select,textarea,a[href]') ? target : target.querySelector?.('input,button,select,textarea,a[href]');
    focusable?.focus?.({ preventScroll: true });
    return true;
  };
  const focusTutorialScopeTarget = scopeKey => {
    const targetName = tutorialScopeTargetName(scopeKey);
    const target = targetName ? byTarget(targetName) : null;
    if (!target) return false;
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute('data-tutorial-focus-scope');
    document.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
    const scope = focusScopeFor(target);
    if (scope) {
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      activeFocusScope = scope;
    }
    pulseNode(target, 900);
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const focusable = target.matches?.('input,button,select,textarea,a[href]') ? target : target.querySelector?.('input,button,select,textarea,a[href]');
    focusable?.focus?.({ preventScroll: true });
    return true;
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
    progress = normalizeProgress(next);
    if (!next) await api('DELETE');
    else await api('PUT', progress);
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
      replayScopeKey: null
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
      replayScopeKey: tutorialStepScope(step)?.key || null
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
  const renderDisabledScopes = () => {
    const rows = tutorialDisabledGuidanceRows(progress);
    const list = document.getElementById('tutorial-disabled-scopes-list');
    const visible = Boolean(progress && !progress.completedAt && rows.length);
    disabledScopesToggle.hidden = !visible;
    if (!visible) {
      disabledScopesPanel.hidden = true;
      disabledScopesOpen = false;
      if (list) list.innerHTML = '';
      return;
    }
    if (list) {
      list.innerHTML = rows.map(row =>
        '<div style="border:1px solid rgba(122,77,42,.18);border-radius:12px;padding:10px 12px;background:rgba(255,255,255,.82);display:grid;gap:8px">' +
          '<strong style="font-size:14px">' + row.label + '</strong>' +
          '<p style="margin:0;font-size:13px;line-height:1.45;color:#5d544d">' + (row.currentStepTitle ? ('Current step there: ' + row.currentStepTitle + '.') : (row.type === 'context' ? 'Sourcery is disabled for this context, but you can re-enable it without losing progress.' : 'Sourcery is disabled for this scope, but you can re-enable it without losing progress.')) + '</p>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
            (row.target ? '<button type="button" class="secondary" data-disabled-scope-focus="' + (row.focusScopeKey || row.scopeKey || '') + '">Show This Control</button>' : '') +
            (row.type === 'context'
              ? '<button type="button" class="secondary" data-disabled-context-enable="' + row.contextId + '">' + (row.page && row.page !== currentSurfacePage ? 'Enable Sourcery' : 'Enable This Context') + '</button>'
              : '<button type="button" class="secondary" data-disabled-scope-enable="' + row.scopeKey + '">' + (row.page && row.page !== currentSurfacePage ? 'Enable Sourcery' : 'Enable Sourcery Here') + '</button>') +
            (row.page && row.page !== currentSurfacePage ? '<button type="button" class="secondary" data-disabled-scope-open="' + row.page + '">Open ' + tutorialPageLabel(row.page) + '</button>' : '') +
          '</div>' +
        '</div>'
      ).join('');
    }
    disabledScopesPanel.hidden = !disabledScopesOpen;
    if (disabledScopesOpen) {
      disabledScopesPanel.style.right = '16px';
      disabledScopesPanel.style.left = 'auto';
      disabledScopesPanel.style.top = '72px';
    }
  };
  const render = () => {
    clearHighlight();
    const step = currentStep();
    const surface = tutorialSurfaceState();
    if (!progress || progress.completedAt || !step) {
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = true;
      disabledScopesToggle.hidden = true;
      disabledScopesPanel.hidden = true;
      return;
    }
    if (surface.kind === 'hidden' || surface.kind === 'disabled' || surface.kind === 'disabled-context' || surface.kind === 'offpage') {
      document.getElementById('tutorial-disable-context').hidden = true;
      overlay.hidden = true;
      dimmer.hidden = true;
      resumeButton.hidden = false;
      resumeButton.textContent = surface.kind === 'offpage'
        ? ('Continue On ' + tutorialPageLabel(surface.page))
        : (surface.kind === 'disabled-context' ? 'Enable Sourcery In This Context' : (surface.kind === 'disabled' ? 'Enable Sourcery Here' : 'Resume Tutorial'));
      renderDisabledScopes();
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
    document.getElementById('tutorial-overlay-body').textContent = tutorialReplayScopeKey(progress)
      ? (step.body + ' Replaying this scope does not roll back app state.')
      : step.body;
    renderConceptList('tutorial-overlay-concepts', tutorialStepConcepts(step), 'This step keeps working through the visible app without unlocking a new concept.');
    document.getElementById('tutorial-next').textContent = step.nextLabel || 'Next';
    document.getElementById('tutorial-back').disabled = !previousStep();
    document.getElementById('tutorial-restart-chapter').disabled = !firstStepInChapter(step.chapterId);
    document.getElementById('tutorial-restart-step').disabled = false;
    document.getElementById('tutorial-show-current-control').disabled = !step.target;
    document.getElementById('tutorial-disable-context').hidden = !currentSurfaceContext;
    document.getElementById('tutorial-disable-context').disabled = !currentSurfaceContext;
    dimmer.hidden = false;
    overlay.hidden = false;
    position(target);
    lastRenderedStepId = step.id;
    renderDisabledScopes();
  };
  const advance = async () => {
    const index = currentStepIndex();
    const next = tutorial.steps[index + 1] || null;
    if (!next) {
      await saveProgress({ ...progress, chapterStatus: 'completed', completedAt: new Date().toISOString(), hidden: false, replayScopeKey: null });
    } else {
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, hidden: false, replayScopeKey: null });
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
      await saveProgress({ ...progress, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, replayScopeKey: null });
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
    progress = normalizeProgress({ ...progress, replayScopeKey: null });
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
      await saveProgress(clearTutorialScopeDisabled(progress, surface.scopeKey || tutorialStepScope(currentStep())?.key));
    } else if (surface.kind === 'disabled-context') {
      await saveProgress(clearTutorialContextDisabled(progress, surface.contextId || tutorialStepSurfaceContext(currentStep())?.id || currentSurfaceContext));
    } else {
      await saveProgress({ ...progress, hidden: false, replayScopeKey: null });
    }
    render();
  });
  disabledScopesToggle.addEventListener('click', () => {
    disabledScopesOpen = !disabledScopesOpen;
    renderDisabledScopes();
  });
  document.getElementById('tutorial-disabled-scopes-close').addEventListener('click', () => {
    disabledScopesOpen = false;
    renderDisabledScopes();
  });
  disabledScopesPanel.addEventListener('click', event => {
    const focusButton = event.target?.closest?.('[data-disabled-scope-focus]');
    const contextEnableButton = event.target?.closest?.('[data-disabled-context-enable]');
    const enableButton = event.target?.closest?.('[data-disabled-scope-enable]');
    const openButton = event.target?.closest?.('[data-disabled-scope-open]');
    if (focusButton) {
      event.preventDefault();
      const scopeKey = focusButton.getAttribute('data-disabled-scope-focus') || '';
      const row = tutorialDisabledGuidanceRows(progress).find(candidate => candidate.scopeKey === scopeKey);
      if (scopeKey) focusTutorialScopeTarget(scopeKey);
      else if (row?.target) focusTutorialTarget(row.target);
      return;
    }
    if (contextEnableButton && progress) {
      event.preventDefault();
      void saveProgress(clearTutorialContextDisabled(progress, contextEnableButton.getAttribute('data-disabled-context-enable') || '')).then(() => render());
      return;
    }
    if (enableButton && progress) {
      event.preventDefault();
      void saveProgress(clearTutorialScopeDisabled(progress, enableButton.getAttribute('data-disabled-scope-enable') || '')).then(() => render());
      return;
    }
    if (openButton) {
      event.preventDefault();
      void continueTutorialOnPage(openButton.getAttribute('data-disabled-scope-open') || '');
    }
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
      await saveProgress({ ...progress, draftInputs: step.payload, hidden: false, replayScopeKey: null });
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
      replayScopeKey: await isComplete(step) ? (tutorialStepScope(step)?.key || null) : null
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
  document.getElementById('tutorial-show-current-control').addEventListener('click', () => {
    const step = currentStep();
    if (!step?.target) return;
    focusTutorialTarget(step.target);
  });
  document.getElementById('tutorial-disable-page').addEventListener('click', async () => {
    const step = currentStep();
    if (!progress || !step || step.page !== currentSurfacePage) return;
    await saveProgress(disableTutorialOnCurrentScope(progress));
    render();
  });
  document.getElementById('tutorial-disable-context').addEventListener('click', async () => {
    const step = currentStep();
    if (!progress || !step || step.page !== currentSurfacePage || !currentSurfaceContext) return;
    await saveProgress(disableTutorialOnCurrentContext(progress));
    render();
  });
  document.getElementById('tutorial-exit').addEventListener('click', async () => {
    if (!progress) return;
    await saveProgress({ ...progress, hidden: true, replayScopeKey: null });
    render();
  });
  document.getElementById('tutorial-reset').addEventListener('click', async () => {
    overlayDrag.manual = false;
    progress = null;
    disabledScopesOpen = false;
    await api('DELETE');
    render();
  });
  const boot = async () => {
    const data = await api('GET');
    progress = normalizeProgress(data.progress);
    await alignProgressToAppPage();
    render();
    await requestMaybeAdvance();
    render();
    window.__witnessTutorialApp = {
      get currentStepId() { return progress?.stepId || null; },
      get currentChapterId() { return progress?.chapterId || null; },
      get currentPage() { return currentStep()?.page || null; },
      get currentScopeKey() { return tutorialStepScope(currentStep())?.key || null; },
      get currentConceptIds() { return tutorialStepConcepts(currentStep()).map(concept => concept.id); },
      get revealedConceptIds() { return tutorialRevealedConcepts(progress).map(concept => concept.id); },
      get replayScopeKey() { return tutorialReplayScopeKey(progress); },
      get replayStepId() { return tutorialReplayStepId(progress); },
      get completedAt() { return progress?.completedAt || null; },
      get hidden() { return progress?.hidden === true; },
      get disabledScopeKeys() { return tutorialDisabledScopeKeys(progress); },
      get disabledContextIds() { return tutorialDisabledContextIds(progress); },
      get disabledPages() { return tutorialDisabledPages(progress); },
      get disabledScopesOpen() { return disabledScopesOpen; },
      get surfacePage() { return currentSurfacePage; },
      get surfaceContext() { return currentSurfaceContext; },
      get surfaceRouteId() { return currentSurfaceRouteId; },
      get surfaceRootWidgetId() { return currentSurfaceRootWidgetId; },
      get surfaceProgramId() { return currentSurfaceProgramId; },
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
