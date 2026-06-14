export function renderTutorialClientInteractionsFactory() {
  return String.raw`
    const createTutorialClientInteractions = ${createTutorialClientInteractions.toString()};
  `;
}

export function createTutorialClientInteractions({
  documentTarget = globalThis?.document || null,
  windowTarget = globalThis?.window || null,
  cssEscapeFn = value => globalThis.CSS?.escape ? globalThis.CSS.escape(value) : String(value),
  overlay = null,
  overlayDrag = {},
  tutorialScopeTargetNameFn = () => "",
  getActiveHighlightTarget = () => null,
  setActiveHighlightTarget = () => {},
  getActiveFocusScope = () => null,
  setActiveFocusScope = () => {},
  clearTutorialOverlayHighlightFn = payload => payload,
  pulseTutorialNodeFn = payload => payload?.node,
  flashTutorialAutoClickFn = payload => payload?.node,
  fillTutorialFormFn = payload => payload?.target,
  focusTutorialOverlayTargetFn = payload => ({ focused: false, activeHighlightTarget: payload.activeHighlightTarget, activeFocusScope: payload.activeFocusScope }),
  focusTutorialOverlayScopeTargetFn = payload => ({ focused: false, activeFocusScope: payload.activeFocusScope }),
  setTutorialOverlayPositionFn = payload => payload,
  positionTutorialOverlayFn = payload => payload?.target
} = {}) {
  const pulseTimers = new WeakMap();
  const byTarget = target => documentTarget?.querySelector?.(
    '[data-guidance-target="' + cssEscapeFn(target) + '"], [data-tutorial-target="' + cssEscapeFn(target) + '"]'
  );
  const focusScopeFor = target => target?.matches?.("form,section,main") ? target : target?.closest?.("form,section,main") || target || null;
  const clearHighlight = () => {
    const next = clearTutorialOverlayHighlightFn({
      activeHighlightTarget: getActiveHighlightTarget(),
      activeFocusScope: getActiveFocusScope(),
      document: documentTarget
    });
    setActiveHighlightTarget(next.activeHighlightTarget);
    setActiveFocusScope(next.activeFocusScope);
  };
  const pulseNode = (node, duration = 1200) => pulseTutorialNodeFn({
    node,
    duration,
    pulseTimers,
    scheduleTimeout: (fn, ms) => setTimeout(fn, ms)
  });
  const flashAutoClick = node => flashTutorialAutoClickFn({
    node,
    pulseTutorialNodeFn: ({ node: targetNode, duration }) => pulseNode(targetNode, duration),
    document: documentTarget,
    scheduleTimeout: (fn, ms) => setTimeout(fn, ms)
  });
  const fillForm = (target, payload) => fillTutorialFormFn({
    target,
    payload,
    pulseTutorialNodeFn: ({ node: targetNode, duration }) => pulseNode(targetNode, duration)
  });
  const focusTutorialTarget = targetName => {
    const next = focusTutorialOverlayTargetFn({
      targetName,
      byTarget,
      clearHighlightFn: clearHighlight,
      focusScopeFor,
      pulseTutorialNodeFn: ({ node: targetNode, duration }) => pulseNode(targetNode, duration)
    });
    setActiveHighlightTarget(next.activeHighlightTarget);
    setActiveFocusScope(next.activeFocusScope);
    return next.focused;
  };
  const focusTutorialScopeTarget = scopeKey => {
    const next = focusTutorialOverlayScopeTargetFn({
      scopeKey,
      tutorialScopeTargetNameFn,
      byTarget,
      activeFocusScope: getActiveFocusScope(),
      focusScopeFor,
      pulseTutorialNodeFn: ({ node: targetNode, duration }) => pulseNode(targetNode, duration),
      document: documentTarget
    });
    setActiveFocusScope(next.activeFocusScope);
    return next.focused;
  };
  const setOverlayPosition = (left, top, manual = false) => setTutorialOverlayPositionFn({
    overlay,
    overlayDrag,
    left,
    top,
    manual,
    innerWidth: windowTarget?.innerWidth,
    innerHeight: windowTarget?.innerHeight
  });
  const position = target => positionTutorialOverlayFn({
    overlay,
    overlayDrag,
    target,
    innerWidth: windowTarget?.innerWidth,
    innerHeight: windowTarget?.innerHeight,
    setTutorialOverlayPositionFn: setOverlayPosition
  });

  return {
    byTarget,
    focusScopeFor,
    clearHighlight,
    pulseNode,
    flashAutoClick,
    fillForm,
    focusTutorialTarget,
    focusTutorialScopeTarget,
    setOverlayPosition,
    position
  };
}
