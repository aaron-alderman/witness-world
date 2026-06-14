export function renderTutorialOverlayInteractionsFactory() {
  return String.raw`
    const clearTutorialOverlayHighlight = ${clearTutorialOverlayHighlight.toString()};
    const pulseTutorialNode = ${pulseTutorialNode.toString()};
    const flashTutorialAutoClick = ${flashTutorialAutoClick.toString()};
    const fillTutorialForm = ${fillTutorialForm.toString()};
    const focusTutorialOverlayTarget = ${focusTutorialOverlayTarget.toString()};
    const focusTutorialOverlayScopeTarget = ${focusTutorialOverlayScopeTarget.toString()};
  `;
}

export function clearTutorialOverlayHighlight({
  activeHighlightTarget = null,
  activeFocusScope = null,
  document = globalThis?.document || null
} = {}) {
  if (activeHighlightTarget?.isConnected) activeHighlightTarget.removeAttribute?.("data-tutorial-current");
  if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute?.("data-tutorial-focus-scope");
  document?.querySelectorAll?.("[data-tutorial-current]")?.forEach?.(node => node.removeAttribute?.("data-tutorial-current"));
  document?.querySelectorAll?.("[data-tutorial-focus-scope]")?.forEach?.(node => node.removeAttribute?.("data-tutorial-focus-scope"));
  return {
    activeHighlightTarget: null,
    activeFocusScope: null
  };
}

export function pulseTutorialNode({
  node = null,
  duration = 1200,
  pulseTimers = new WeakMap(),
  scheduleTimeout = (fn, ms) => setTimeout(fn, ms)
} = {}) {
  if (!node) return false;
  node.setAttribute?.("data-tutorial-changed", "true");
  const pending = pulseTimers.get(node);
  if (pending) clearTimeout(pending);
  pulseTimers.set(node, scheduleTimeout(() => {
    if (node.isConnected) node.removeAttribute?.("data-tutorial-changed");
  }, duration));
  return true;
}

export function flashTutorialAutoClick({
  node = null,
  pulseTutorialNodeFn = payload => pulseTutorialNode(payload),
  document = globalThis?.document || null,
  scheduleTimeout = (fn, ms) => setTimeout(fn, ms)
} = {}) {
  if (!node) return false;
  pulseTutorialNodeFn({ node, duration: 720 });
  node.classList?.add?.("tutorial-auto-click");
  scheduleTimeout(() => node.classList?.remove?.("tutorial-auto-click"), 520);
  const rect = node.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
  const pulse = document?.createElement?.("div");
  if (pulse) {
    pulse.className = "tutorial-click-pulse";
    pulse.style.left = (rect.left + (rect.width / 2)) + "px";
    pulse.style.top = (rect.top + (rect.height / 2)) + "px";
    document.body?.appendChild?.(pulse);
    scheduleTimeout(() => pulse.remove?.(), 620);
  }
  return true;
}

export function fillTutorialForm({
  target = null,
  payload = null,
  pulseTutorialNodeFn = payload => pulseTutorialNode(payload)
} = {}) {
  const form = target?.matches?.("form") ? target : target?.closest?.("form") || target?.querySelector?.("form");
  if (!form || !payload) return false;
  for (const [key, value] of Object.entries(payload)) {
    const field = form.elements.namedItem(key) || form.querySelector?.('[name="' + CSS.escape(key) + '"]');
    if (!field) continue;
    if (field.type === "checkbox") field.checked = value === true;
    else field.value = value == null ? "" : String(value);
    pulseTutorialNodeFn({ node: field, duration: 900 });
  }
  return true;
}

export function focusTutorialOverlayTarget({
  targetName = "",
  byTarget = () => null,
  clearHighlightFn = () => ({ activeHighlightTarget: null, activeFocusScope: null }),
  focusScopeFor = target => target,
  pulseTutorialNodeFn = payload => pulseTutorialNode(payload)
} = {}) {
  const target = byTarget(targetName);
  if (!target) return { focused: false, activeHighlightTarget: null, activeFocusScope: null };
  clearHighlightFn();
  target.setAttribute?.("data-tutorial-current", "true");
  const scope = focusScopeFor(target);
  if (scope) scope.setAttribute?.("data-tutorial-focus-scope", "true");
  pulseTutorialNodeFn({ node: target, duration: 900 });
  target.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const focusable = target.matches?.("input,button,select,textarea,a[href]") ? target : target.querySelector?.("input,button,select,textarea,a[href]");
  focusable?.focus?.({ preventScroll: true });
  return {
    focused: true,
    activeHighlightTarget: target,
    activeFocusScope: scope || null
  };
}

export function focusTutorialOverlayScopeTarget({
  scopeKey = "",
  tutorialScopeTargetNameFn = () => null,
  byTarget = () => null,
  activeFocusScope = null,
  focusScopeFor = target => target,
  pulseTutorialNodeFn = payload => pulseTutorialNode(payload),
  document = globalThis?.document || null
} = {}) {
  const targetName = tutorialScopeTargetNameFn(scopeKey);
  const target = targetName ? byTarget(targetName) : null;
  if (!target) return { focused: false, activeFocusScope };
  if (activeFocusScope?.isConnected) activeFocusScope.removeAttribute?.("data-tutorial-focus-scope");
  document?.querySelectorAll?.("[data-tutorial-focus-scope]")?.forEach?.(node => node.removeAttribute?.("data-tutorial-focus-scope"));
  const scope = focusScopeFor(target);
  if (scope) scope.setAttribute?.("data-tutorial-focus-scope", "true");
  pulseTutorialNodeFn({ node: target, duration: 900 });
  target.scrollIntoView?.({ block: "center", behavior: "smooth" });
  const focusable = target.matches?.("input,button,select,textarea,a[href]") ? target : target.querySelector?.("input,button,select,textarea,a[href]");
  focusable?.focus?.({ preventScroll: true });
  return {
    focused: true,
    activeFocusScope: scope || null
  };
}
