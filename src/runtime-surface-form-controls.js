export const SHARED_SURFACE_FORM_CONTROLS_CSS = `
form { display: flex; gap: var(--space-2); margin: var(--space-2) 0; }
select { padding: var(--space-3); border: 1px solid var(--surface-border); border-radius: var(--radius-md); background: var(--input-bg); color: var(--ink); transition: border-color var(--motion-fast), background var(--motion-fast); }
input { flex: 1; padding: var(--space-3); border: 1px solid var(--surface-border); border-radius: var(--radius-md); background: var(--input-bg); color: var(--ink); transition: border-color var(--motion-fast), background var(--motion-fast); }
button { padding: var(--space-2) var(--space-4); cursor: pointer; border: 1px solid var(--surface-border); border-radius: var(--radius-pill); background: var(--button-bg); color: var(--button-ink); transition: background var(--motion-fast), color var(--motion-fast), transform var(--motion-fast); }
button.surface-button-secondary { background: var(--input-bg); color: var(--accent); }
.surface-form { display: grid; gap: var(--space-2); margin: 0; }
.surface-field { display: grid; gap: var(--space-1); font-size: 12px; color: var(--muted); }
.surface-field > span { font-family: var(--mono); color: var(--muted); }
.surface-field input,
.surface-field textarea,
.surface-field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  background: var(--input-bg);
  color: var(--ink);
  padding: var(--space-2);
  font-family: var(--mono);
  font-size: 12px;
}
.surface-field textarea { min-height: 72px; resize: vertical; }
.value-editor-field {
  display: grid;
  gap: var(--space-1);
  min-width: 0;
  flex: 1;
  font-size: 12px;
  color: var(--muted);
}
.value-editor-field > span {
  font-family: var(--mono);
  color: var(--muted);
}
.surface-mono input,
.surface-mono select,
.surface-mono textarea { font-family: var(--mono); }
button:hover { background: var(--surface-strong); }
`;
