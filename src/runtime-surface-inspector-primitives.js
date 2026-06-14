export const SHARED_SURFACE_INSPECTOR_PRIMITIVES_CSS = `
.surface-inspector-toggle {
  position: fixed;
  left: var(--space-4);
  bottom: var(--space-4);
  z-index: 10;
  border-radius: var(--radius-pill);
  padding: calc(var(--space-2) + 1px) calc(var(--space-4) - 2px);
  background: rgba(255,255,255,.96);
  box-shadow: var(--elevation-overlay);
}
.surface-inspector-panel {
  position: fixed;
  left: var(--space-4);
  bottom: calc(var(--space-6) + var(--space-5));
  z-index: 10;
  width: 360px;
  max-width: calc(100vw - (2 * var(--space-4)));
  max-height: calc(100vh - 96px);
  overflow: auto;
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  background: rgba(255,255,255,.98);
  box-shadow: var(--elevation-overlay);
  padding: var(--space-4);
  display: grid;
  gap: var(--space-3);
}
.surface-inspector-panel h2 { margin: 0; font-size: 1rem; }
.surface-inspector-meta {
  color: var(--muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .08em;
  font-family: var(--mono);
}
.surface-inspector-summary { color: var(--muted); line-height: 1.45; }
.surface-inspector-grid { display: grid; gap: 6px; }
.surface-inspector-row {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: var(--space-2);
  padding: var(--space-1) 0;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-border) 45%, white);
}
.surface-inspector-label {
  color: var(--muted);
  font-weight: 700;
  font-family: var(--mono);
}
.surface-inspector-value {
  min-width: 0;
  overflow-wrap: anywhere;
  font-family: var(--mono);
}
.surface-inspector-menu {
  position: fixed;
  z-index: 11;
  min-width: 220px;
  max-width: min(320px, calc(100vw - var(--space-5)));
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  background: rgba(255,255,255,.98);
  box-shadow: var(--elevation-overlay);
  padding: var(--space-2);
  display: grid;
  gap: calc(var(--space-2) - 2px);
}
.surface-inspector-menu button {
  text-align: left;
  width: 100%;
  background: color-mix(in srgb, var(--surface-bg) 84%, white);
}
.surface-inspector-menu button:hover { background: var(--surface-strong); }
.surface-inspector-menu p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.4;
  padding: 4px 2px;
}
[data-surface-inspector-selected="true"] {
  outline: 3px solid var(--accent, #333);
  outline-offset: 4px;
  border-radius: 8px;
  box-shadow: 0 0 0 8px rgba(51, 51, 51, .12);
}
`;
