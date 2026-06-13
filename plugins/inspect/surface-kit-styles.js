export const SHARED_SURFACE_KIT_CSS = `
body {
  font-family: var(--body-font);
  max-width: 920px;
  margin: 40px auto;
  padding: 0 24px;
  color: var(--ink);
  background:
    radial-gradient(circle at top, rgba(255,255,255,0.38), transparent 34%),
    linear-gradient(180deg, rgba(255,255,255,var(--texture-opacity)) 0%, rgba(255,255,255,0) 22%),
    var(--page-bg);
}
body[data-page="world"] { max-width: none; margin: 0; padding: 0; overflow: hidden; }
body[data-page="world"] main { height: 100vh; display: grid; grid-template-rows: auto 1fr; gap: 0; overflow: hidden; }
body[data-page="world"] h1 { font-size: 1.05rem; margin: 4px 14px 6px; line-height: 1.2; }
body[data-page="world"] .world-graph-link { padding: 6px 14px; display: inline-block; font-size: 13px; }
body[data-actor="aaron"] { --accent: #375a7f; }
body[data-actor="callan"] { --accent: #6b4f8a; }
body[data-actor="adam"] { --accent: #667a3a; }
h1, h2 { font-family: var(--heading-font); }
h1 { color: var(--accent, #333); }
main { display: grid; gap: 18px; }
form { display: flex; gap: 8px; margin: 8px 0; }
select { padding: 10px; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--input-bg); color: var(--ink); }
input { flex: 1; padding: 10px; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--input-bg); color: var(--ink); }
button { padding: 8px 12px; cursor: pointer; border: 1px solid var(--surface-border); border-radius: 999px; background: var(--button-bg); color: var(--ink); }
button:hover { background: var(--surface-strong); }
ul { list-style: none; padding: 0; margin: 0; }
li, .todo-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(0,0,0,0.08); }
li.done .todo-title, .todo-row.done .todo-title { text-decoration: line-through; color: var(--muted); }
.status { min-height: 1.5em; color: var(--muted); }
.surface-page { display: grid; gap: 18px; }
.surface-lede { color: var(--muted); line-height: 1.6; }
.surface-section, .surface-card {
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  padding: 14px;
  background: var(--surface-bg);
  box-shadow: var(--surface-shadow);
}
.surface-section { display: grid; gap: 12px; }
.surface-stack { display: grid; gap: 10px; align-content: start; }
.surface-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}
.surface-list { display: grid; gap: 12px; }
.surface-shell-3 {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr) minmax(260px, 340px);
  gap: 14px;
  align-items: start;
}
.surface-pane {
  border: 1px solid var(--surface-border);
  border-radius: var(--panel-radius);
  padding: 14px;
  background: var(--surface-bg);
  box-shadow: var(--surface-shadow);
  min-width: 0;
}
.surface-pane-main { min-height: 60vh; }
.surface-grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}
.surface-header-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.surface-link-item {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  background: var(--surface-bg);
  box-shadow: var(--surface-shadow);
}
.surface-link-item.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent), var(--surface-shadow);
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
.surface-hidden { display: none; }
.surface-state-done { border-left: 6px solid #3f7d3a; }
.surface-state-running { border-left: 6px solid #9a7c22; }
.surface-state-skipped { border-left: 6px solid #7b7b7b; }
.surface-state-failed { border-left: 6px solid #b53a30; background: #fff5f5; }
.surface-state-pending { border-left: 6px solid #d2d2d2; }
.surface-state-failed .surface-note,
.surface-state-failed .surface-title-link { color: #7a2821; }
.surface-card-label {
  font-size: 0.78rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.surface-card-value { font-family: var(--heading-font); font-size: 1.4rem; }
.surface-card-title { margin: 0; font-size: 1rem; }
.surface-note { color: var(--muted); line-height: 1.5; white-space: pre-line; }
.surface-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.surface-link-chip {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px;
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  background: var(--input-bg);
  color: var(--ink);
  text-decoration: none;
}
.surface-link-chip:hover { background: var(--surface-strong); }
.surface-code {
  overflow: auto;
  background: #1f1f1f;
  color: #f7f1e3;
  padding: 16px;
  border-radius: 12px;
  font: 12px/1.45 var(--mono);
  white-space: pre-wrap;
}
@media (max-width: 1100px) {
  .surface-shell-3 { grid-template-columns: minmax(0, 1fr); }
}
`;
