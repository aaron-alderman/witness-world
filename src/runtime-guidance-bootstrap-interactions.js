export function createBootstrapGuidanceInteractionRuntime({
  document,
  window,
  byId,
  byTarget,
  formField,
  revealTarget
} = {}) {
  const pulseTimers = new WeakMap();
  const overlayDrag = { active: false, manual: false, left: 24, top: 24, offsetX: 0, offsetY: 0 };
  let activeFocusScope = null;
  let activeHighlightTarget = null;

  const clearTutorialScope = () => {
    if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute("data-tutorial-current");
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
    activeHighlightTarget = null;
    activeFocusScope = null;
  };

  const clearTutorialHighlight = () => {
    clearTutorialScope();
    document.querySelectorAll("[data-tutorial-current]").forEach(node => node.removeAttribute("data-tutorial-current"));
    document.querySelectorAll("[data-tutorial-focus-scope]").forEach(node => node.removeAttribute("data-tutorial-focus-scope"));
  };

  const pulseNode = (node, duration = 1400) => {
    if (!node) return;
    node.setAttribute("data-tutorial-changed", "true");
    const pending = pulseTimers.get(node);
    if (pending) clearTimeout(pending);
    pulseTimers.set(node, setTimeout(() => {
      if (node.isConnected) node.removeAttribute("data-tutorial-changed");
    }, duration));
  };

  const flashAutoClick = node => {
    if (!node) return;
    pulseNode(node, 720);
    node.classList.add("tutorial-auto-click");
    setTimeout(() => node.classList.remove("tutorial-auto-click"), 520);
    const rect = node.getBoundingClientRect();
    const pulse = document.createElement("div");
    pulse.className = "tutorial-click-pulse";
    pulse.style.left = (rect.left + (rect.width / 2)) + "px";
    pulse.style.top = (rect.top + (rect.height / 2)) + "px";
    document.body.append(pulse);
    setTimeout(() => pulse.remove(), 620);
  };

  const focusScopeFor = target => target?.matches?.("form,details,.card,.surface-card") ? target : target?.closest?.("form,details,.card,.surface-card") || target || null;

  const setOverlayPosition = (left, top, { manual = false } = {}) => {
    const overlay = byId("tutorial-overlay");
    if (!overlay) return;
    const maxLeft = Math.max(12, window.innerWidth - overlay.offsetWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - overlay.offsetHeight - 12);
    const nextLeft = Math.max(12, Math.min(maxLeft, left));
    const nextTop = Math.max(12, Math.min(maxTop, top));
    overlay.style.left = nextLeft + "px";
    overlay.style.top = nextTop + "px";
    overlay.style.right = "auto";
    overlayDrag.left = nextLeft;
    overlayDrag.top = nextTop;
    if (manual) overlayDrag.manual = true;
  };

  const positionOverlay = target => {
    const overlay = byId("tutorial-overlay");
    if (!overlay) return;
    if (overlayDrag.manual) {
      setOverlayPosition(overlayDrag.left, overlayDrag.top);
      return;
    }
    if (!target) {
      setOverlayPosition(window.innerWidth - overlay.offsetWidth - 24, 24);
      return;
    }
    const rect = target.getBoundingClientRect();
    const top = Math.max(18, Math.min(window.innerHeight - overlay.offsetHeight - 18, rect.bottom + 12));
    const left = rect.left + overlay.offsetWidth + 18 > window.innerWidth ? Math.max(12, rect.right - overlay.offsetWidth) : Math.max(12, rect.left);
    setOverlayPosition(left, top);
  };

  const setFieldValue = (field, value) => {
    if (!field) return;
    if (field.type === "checkbox") field.checked = value === true;
    else field.value = value == null ? "" : String(value);
  };

  const fillForm = (target, payload) => {
    revealTarget(target);
    const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
    if (!form || !payload) return;
    for (const [key, value] of Object.entries(payload)) {
      const field = formField(form, key);
      if (!field) continue;
      setFieldValue(field, value);
      pulseNode(field, 960);
    }
  };

  const focusTutorialTarget = targetName => {
    const target = byTarget(targetName);
    if (!target) return false;
    revealTarget(target);
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    pulseNode(target, 1200);
    const focusable = target.matches?.("input,select,textarea,button,a,summary")
      ? target
      : target.querySelector?.("input,select,textarea,button,a,summary,[tabindex]");
    focusable?.focus?.({ preventScroll: true });
    return true;
  };

  const focusTutorialScopeTarget = targetName => {
    const target = byTarget(targetName);
    if (!target) return false;
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
    document.querySelectorAll("[data-tutorial-focus-scope]").forEach(node => node.removeAttribute("data-tutorial-focus-scope"));
    revealTarget(target);
    const focusScope = focusScopeFor(target);
    if (focusScope) {
      focusScope.setAttribute("data-tutorial-focus-scope", "true");
      activeFocusScope = focusScope;
    }
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    pulseNode(target, 1200);
    const focusable = target.matches?.("input,select,textarea,button,a,summary")
      ? target
      : target.querySelector?.("input,select,textarea,button,a,summary,[tabindex]");
    focusable?.focus?.({ preventScroll: true });
    return true;
  };

  const focusDisabledGuidance = () => {
    const target = byId("tutorial-disabled-pages");
    if (!target) return false;
    clearTutorialHighlight();
    revealTarget(target);
    target.setAttribute("data-tutorial-focus-scope", "true");
    activeFocusScope = target;
    target.scrollIntoView({ block: "center", behavior: "smooth" });
    const focusable = target.querySelector?.("button, [tabindex]");
    focusable?.focus?.({ preventScroll: true });
    return true;
  };

  const setActiveTutorialStepTarget = target => {
    if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute("data-tutorial-focus-scope");
    if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute("data-tutorial-current");
    const focusScope = focusScopeFor(target);
    if (focusScope) {
      revealTarget(focusScope);
      focusScope.setAttribute("data-tutorial-focus-scope", "true");
      activeFocusScope = focusScope;
    } else {
      activeFocusScope = null;
    }
    if (target) {
      revealTarget(target);
      target.setAttribute("data-tutorial-current", "true");
      activeHighlightTarget = target;
    } else {
      activeHighlightTarget = null;
    }
  };

  return {
    overlayDrag,
    clearTutorialScope,
    clearTutorialHighlight,
    pulseNode,
    flashAutoClick,
    positionOverlay,
    fillForm,
    focusTutorialTarget,
    focusTutorialScopeTarget,
    focusDisabledGuidance,
    setActiveTutorialStepTarget
  };
}
