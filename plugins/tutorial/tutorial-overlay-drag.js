export function renderTutorialOverlayDragFactory() {
  return String.raw`
    const createTutorialOverlayDragState = ${createTutorialOverlayDragState.toString()};
    const setTutorialOverlayPosition = ${setTutorialOverlayPosition.toString()};
    const positionTutorialOverlay = ${positionTutorialOverlay.toString()};
    const bindTutorialOverlayDrag = ${bindTutorialOverlayDrag.toString()};
  `;
}

export function createTutorialOverlayDragState() {
  return {
    active: false,
    manual: false,
    left: 16,
    top: 16,
    offsetX: 0,
    offsetY: 0
  };
}

export function setTutorialOverlayPosition({
  overlay = null,
  overlayDrag = null,
  left = 16,
  top = 16,
  manual = false,
  innerWidth = 0,
  innerHeight = 0
} = {}) {
  const maxLeft = Math.max(12, innerWidth - (overlay?.offsetWidth || 0) - 12);
  const maxTop = Math.max(12, innerHeight - (overlay?.offsetHeight || 0) - 12);
  const nextLeft = Math.max(12, Math.min(maxLeft, left));
  const nextTop = Math.max(12, Math.min(maxTop, top));
  if (overlay?.style) {
    overlay.style.left = nextLeft + "px";
    overlay.style.top = nextTop + "px";
    overlay.style.right = "auto";
  }
  if (overlayDrag) {
    overlayDrag.left = nextLeft;
    overlayDrag.top = nextTop;
    if (manual) overlayDrag.manual = true;
  }
}

export function positionTutorialOverlay({
  overlay = null,
  overlayDrag = null,
  target = null,
  innerWidth = 0,
  innerHeight = 0,
  setTutorialOverlayPositionFn = setTutorialOverlayPosition
} = {}) {
  if (overlayDrag?.manual) {
    setTutorialOverlayPositionFn({
      overlay,
      overlayDrag,
      left: overlayDrag.left,
      top: overlayDrag.top,
      innerWidth,
      innerHeight
    });
    return;
  }
  if (!target) {
    setTutorialOverlayPositionFn({
      overlay,
      overlayDrag,
      left: innerWidth - (overlay?.offsetWidth || 0) - 16,
      top: 16,
      innerWidth,
      innerHeight
    });
    return;
  }
  const rect = target.getBoundingClientRect();
  const top = Math.max(14, Math.min(innerHeight - (overlay?.offsetHeight || 0) - 14, rect.bottom + 12));
  const left = rect.left + (overlay?.offsetWidth || 0) + 18 > innerWidth
    ? Math.max(12, rect.right - (overlay?.offsetWidth || 0))
    : Math.max(12, rect.left);
  setTutorialOverlayPositionFn({
    overlay,
    overlayDrag,
    left,
    top,
    innerWidth,
    innerHeight
  });
}

export function bindTutorialOverlayDrag({
  handle = null,
  overlay = null,
  overlayDrag = null,
  body = null,
  addWindowListener = () => {},
  setTutorialOverlayPositionFn = setTutorialOverlayPosition
} = {}) {
  handle?.addEventListener?.("pointerdown", event => {
    if (overlay?.hidden) return;
    const rect = overlay.getBoundingClientRect();
    overlayDrag.active = true;
    overlayDrag.manual = true;
    overlayDrag.left = rect.left;
    overlayDrag.top = rect.top;
    overlayDrag.offsetX = event.clientX - rect.left;
    overlayDrag.offsetY = event.clientY - rect.top;
    body?.classList?.add?.("tutorial-dragging");
    event.preventDefault();
  });
  addWindowListener("pointermove", event => {
    if (!overlayDrag?.active) return;
    setTutorialOverlayPositionFn({
      overlay,
      overlayDrag,
      left: event.clientX - overlayDrag.offsetX,
      top: event.clientY - overlayDrag.offsetY,
      manual: true,
      innerWidth: globalThis?.window?.innerWidth || 0,
      innerHeight: globalThis?.window?.innerHeight || 0
    });
  });
  addWindowListener("pointerup", () => {
    if (overlayDrag) overlayDrag.active = false;
    body?.classList?.remove?.("tutorial-dragging");
  });
}
