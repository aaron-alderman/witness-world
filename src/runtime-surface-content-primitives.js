export const SHARED_SURFACE_CONTENT_PRIMITIVES_CSS = `
ul { list-style: none; padding: 0; margin: 0; }
li, .todo-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
li.done .todo-title, .todo-row.done .todo-title { text-decoration: line-through; color: var(--muted); }
.surface-status, .status { min-height: 1.5em; color: var(--muted); }
.surface-page { display: grid; gap: var(--space-5); }
.surface-lede { color: var(--muted); line-height: 1.6; }
.surface-section, .surface-card {
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  padding: var(--space-4);
  background: var(--surface-bg);
  box-shadow: var(--elevation-panel);
}
.surface-section { display: grid; gap: var(--space-3); }
.surface-stack { display: grid; gap: var(--space-3); align-content: start; }
.surface-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-3);
}
.surface-list { display: grid; gap: var(--space-3); }
.surface-shell-3 {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 340px);
  gap: var(--space-4);
  align-items: start;
}
.surface-shell-2 {
  display: grid;
  grid-template-columns: var(--surface-shell-2-columns, minmax(280px, 380px) minmax(0, 1fr));
  gap: 0;
  align-items: stretch;
  min-height: 0;
  overflow: hidden;
}
.surface-pane {
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  padding: var(--space-4);
  background: var(--surface-bg);
  box-shadow: var(--elevation-panel);
  min-width: 0;
}
.surface-pane-main { min-height: 60vh; }
.surface-split-pane {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  background: var(--surface-bg);
  box-shadow: var(--elevation-panel);
}
.surface-split-pane > * { min-width: 0; }
.surface-split-pane-sidebar {
  overflow: auto;
  padding: var(--space-3);
  border-right: 1px solid var(--surface-border);
  background: var(--surface-strong);
}
.surface-split-pane-main {
  min-width: 0;
  overflow: auto;
  background: var(--surface-bg);
}
.surface-grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-3);
}
.surface-header-bar {
  display: flex;
  gap: var(--space-2);
  align-items: center;
  flex-wrap: wrap;
}
.surface-toolbar {
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  background: color-mix(in srgb, var(--surface-bg) 92%, white);
  box-shadow: var(--elevation-panel);
  overflow-x: auto;
  box-sizing: border-box;
}
.surface-toolbar-spacer {
  flex: 1 1 auto;
  min-width: 16px;
}
.surface-link-item {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  background: var(--surface-bg);
  box-shadow: var(--elevation-panel);
  transition: background var(--motion-fast), box-shadow var(--motion-fast), border-color var(--motion-fast);
}
.surface-link-item.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent), var(--elevation-panel);
  background: var(--surface-strong);
}
.surface-title-link {
  color: var(--ink);
  font-weight: 700;
  text-decoration: none;
}
.surface-title-link:hover { color: var(--accent); }
.surface-mono { font-family: var(--mono); }
.surface-accent { color: var(--accent); }
.surface-empty { color: var(--muted); }
.surface-empty-state {
  display: block;
  padding: var(--space-3) var(--space-4);
  border: 1px dashed color-mix(in srgb, var(--surface-border) 75%, white);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--surface-bg) 90%, white);
  line-height: 1.5;
}
.surface-hidden { display: none; }
.surface-state-done { border-left: 6px solid var(--state-done); }
.surface-state-running { border-left: 6px solid var(--state-running); }
.surface-state-skipped { border-left: 6px solid var(--state-skipped); }
.surface-state-failed { border-left: 6px solid var(--state-failed); background: var(--state-failed-surface); }
.surface-state-pending { border-left: 6px solid var(--state-pending); }
.surface-state-failed .surface-note,
.surface-state-failed .surface-title-link { color: var(--state-failed-ink); }
.surface-card-label {
  font-size: 0.78rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.surface-card-value { font-family: var(--heading-font); font-size: 1.4rem; }
.surface-card-title { margin: 0; font-size: 1rem; }
.surface-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  width: fit-content;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-bg));
  color: var(--accent);
  padding: calc(var(--space-1) + 1px) var(--space-3);
  font: 12px/1.2 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.surface-kicker {
  font: 12px/1.2 var(--mono);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--muted);
}
.surface-note { color: var(--muted); line-height: 1.5; white-space: pre-line; }
.surface-note-callout {
  border-left: 4px solid var(--accent);
  padding-left: var(--space-3);
}
.surface-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.surface-actions-compact { display: flex; flex-wrap: wrap; gap: calc(var(--space-2) - 2px); }
.surface-actions-compact button { font-size: 12px; }
.surface-grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}
.surface-state-list {
  display: grid;
  gap: var(--space-2);
  max-height: 340px;
  overflow: auto;
}
.surface-state-item {
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  padding: var(--space-3) var(--space-4);
  background: var(--surface-bg);
  box-shadow: var(--elevation-panel);
}
.surface-state-item strong {
  display: block;
  margin-bottom: calc(var(--space-1) - 1px);
  font: 12px/1.3 var(--mono);
}
.surface-state-item code {
  font: 12px/1.45 var(--mono);
  color: var(--muted);
  white-space: pre-wrap;
}
.surface-link-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-pill);
  background: var(--input-bg);
  color: var(--ink);
  text-decoration: none;
  transition: background var(--motion-fast), color var(--motion-fast);
}
.surface-link-chip:hover { background: var(--surface-strong); }
.surface-item-list { display: grid; gap: calc(var(--space-2) - 2px); }
.surface-item {
  border: 1px solid color-mix(in srgb, var(--surface-border) 60%, white);
  border-radius: var(--radius-md);
  padding: var(--space-2) calc(var(--space-2) + 1px);
  background: color-mix(in srgb, var(--surface-bg) 84%, white);
}
.surface-item-button {
  width: 100%;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--surface-border) 60%, white);
  border-radius: var(--radius-md);
  padding: var(--space-2) calc(var(--space-2) + 1px);
  background: color-mix(in srgb, var(--surface-bg) 84%, white);
  color: var(--ink);
}
.surface-item-button:hover {
  background: var(--surface-strong);
  transform: none;
}
.surface-item strong { display: block; margin-bottom: 4px; font-size: 12px; }
.surface-item-button strong { display: block; margin-bottom: 4px; font-size: 12px; }
.surface-status-box {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid color-mix(in srgb, var(--surface-border) 85%, white);
  background: color-mix(in srgb, var(--surface-bg) 88%, white);
}
.surface-status-box[data-level="ok"] {
  background: var(--status-ok-surface);
  border-color: var(--status-ok-border);
  color: var(--status-ok-ink);
}
.surface-status-box[data-level="error"] {
  background: var(--status-error-surface);
  border-color: var(--status-error-border);
  color: var(--status-error-ink);
}
.surface-code {
  overflow: auto;
  background: var(--code-surface);
  color: var(--code-ink);
  padding: var(--space-4);
  border-radius: var(--panel-radius);
  font: 12px/1.45 var(--mono);
  white-space: pre-wrap;
}
@media (max-width: 1100px) {
  .surface-shell-2 { grid-template-columns: minmax(0, 1fr); }
  .surface-shell-3 { grid-template-columns: minmax(0, 1fr); }
  .surface-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
`;
