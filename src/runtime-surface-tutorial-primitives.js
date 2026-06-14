export const SHARED_SURFACE_TUTORIAL_PRIMITIVES_CSS = `
[data-tutorial-focus-scope="true"],
[data-tutorial-current] {
  position: relative;
  z-index: 9;
}
[data-tutorial-current] {
  outline: 3px solid var(--accent, #333);
  outline-offset: 4px;
  border-radius: 8px;
  scroll-margin-top: 60px;
  animation: tutorial-focus-pulse 1.35s ease-in-out infinite;
}
[data-tutorial-changed="true"] {
  box-shadow: 0 0 0 3px rgba(51, 51, 51, .12);
  animation: tutorial-changed-pulse 1.1s ease-in-out 2;
}
[data-tutorial-changed="true"] strong {
  animation: tutorial-text-pulse 1.1s ease-in-out 2;
}
.tutorial-dimmer {
  position: fixed;
  inset: 0;
  z-index: 7;
  background: rgba(17, 17, 17, .38);
  backdrop-filter: blur(2px);
  pointer-events: none;
}
.tutorial-overlay {
  position: fixed;
  width: 340px;
  max-width: calc(100vw - 24px);
  z-index: 10;
  background: rgba(255,255,255,.98);
  border: 1px solid var(--surface-border);
  border-radius: 14px;
  padding: 14px;
  box-shadow: 0 16px 36px rgba(0,0,0,.18);
  pointer-events: none;
}
.tutorial-overlay h3 { margin: 0 0 8px; font-size: 1rem; }
.tutorial-overlay p {
  margin: 0 0 10px;
  color: var(--muted);
  line-height: 1.45;
}
.tutorial-overlay-meta {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: var(--muted);
  margin-bottom: 6px;
  font-family: var(--mono);
}
.tutorial-concept-list {
  display: grid;
  gap: 8px;
  margin: 0 0 10px;
}
.tutorial-concept {
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  padding: 9px 10px;
  background: color-mix(in srgb, var(--surface-bg) 84%, white);
}
.tutorial-concept strong {
  display: block;
  margin-bottom: 3px;
  font-size: 11px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ink);
}
.tutorial-concept span {
  display: block;
  font-size: 13px;
  line-height: 1.4;
  color: var(--muted);
}
.tutorial-suggestion-list,
.tutorial-disabled-list {
  display: grid;
  gap: 10px;
}
.tutorial-suggestion,
.tutorial-disabled-item {
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--surface-bg) 88%, white);
  display: grid;
  gap: 8px;
}
.tutorial-suggestion strong,
.tutorial-disabled-item strong {
  display: block;
  font-size: 14px;
  color: var(--ink);
}
.tutorial-suggestion p,
.tutorial-disabled-item p {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: var(--muted);
}
.tutorial-overlay button,
.tutorial-overlay-handle {
  pointer-events: auto;
}
.tutorial-overlay-handle {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin: -4px -4px 10px;
  padding: 4px;
  cursor: grab;
  user-select: none;
}
.tutorial-overlay-handle:active { cursor: grabbing; }
.tutorial-handle-copy { min-width: 0; }
.tutorial-handle-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .14em;
  color: var(--muted);
  font-family: var(--mono);
}
.tutorial-handle-grip {
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
  padding-top: 2px;
}
.tutorial-click-pulse {
  position: fixed;
  width: 22px;
  height: 22px;
  margin-left: -11px;
  margin-top: -11px;
  border-radius: 999px;
  border: 2px solid rgba(51, 51, 51, .55);
  background: rgba(51, 51, 51, .12);
  z-index: 11;
  pointer-events: none;
  animation: tutorial-click-pulse .55s ease-out forwards;
}
.tutorial-auto-click { animation: tutorial-button-click .5s ease-out; }
.tutorial-hidden { display: none !important; }
.tutorial-resume {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10;
}
body.tutorial-dragging { user-select: none; }
@keyframes tutorial-focus-pulse {
  0%, 100% { outline-color: rgba(51, 51, 51, 1); box-shadow: 0 0 0 0 rgba(51, 51, 51, .08); }
  50% { outline-color: rgba(51, 51, 51, .65); box-shadow: 0 0 0 10px rgba(51, 51, 51, .1); }
}
@keyframes tutorial-changed-pulse {
  0%, 100% { transform: scale(1); }
  45% { transform: scale(1.01); }
}
@keyframes tutorial-text-pulse {
  0%, 100% { font-weight: 600; opacity: 1; }
  50% { font-weight: 400; opacity: .82; }
}
@keyframes tutorial-click-pulse {
  0% { transform: scale(.35); opacity: 1; }
  100% { transform: scale(2.6); opacity: 0; }
}
@keyframes tutorial-button-click {
  0% { transform: scale(1); }
  35% { transform: scale(.95); }
  100% { transform: scale(1); }
}
`;
