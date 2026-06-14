export const SHARED_SURFACE_COMMAND_PRIMITIVES_CSS = `
.world-command-toggle {
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12px;
}
.world-command-hint {
  color: var(--muted);
  font-size: 11px;
  font-family: var(--mono);
}
.world-command-palette {
  border: 1px solid var(--surface-border);
  border-radius: 14px;
  background: rgba(255,255,255,.98);
  box-shadow: 0 16px 36px rgba(0,0,0,.18);
  padding: 12px;
  display: grid;
  gap: 10px;
}
.world-command-head { display: flex; gap: 8px; align-items: center; }
.world-command-input {
  flex: 1 1 auto;
  min-width: 0;
  font: 13px var(--mono);
  padding: 9px 11px;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  background: white;
}
.world-command-list { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
.world-command-item {
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--surface-border) 60%, white);
  border-radius: 8px;
  padding: 8px 10px;
  background: color-mix(in srgb, var(--surface-bg) 84%, white);
  cursor: pointer;
}
.world-command-item strong { display: block; font-size: 13px; }
.world-command-meta {
  color: var(--muted);
  font-size: 11px;
  font-family: var(--mono);
}
.world-command-result {
  border: 1px solid color-mix(in srgb, var(--surface-border) 90%, #d7c7a8);
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface-bg) 88%, #faf8f1);
  display: grid;
  gap: 8px;
}
.world-command-result strong { font-size: 13px; }
.world-command-result-grid { display: grid; gap: 4px; }
.world-command-result-row {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 8px;
  font-size: 12px;
}
.world-command-result-key {
  color: var(--muted);
  font-family: var(--mono);
}
.world-command-result-value {
  overflow-wrap: anywhere;
  font-family: var(--mono);
}
.world-command-result-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.world-command-empty { color: var(--muted); font-size: 12px; padding: 6px 2px; }
.surface-command-toggle {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 10;
  border-radius: 999px;
  padding: 9px 14px;
  background: rgba(255,255,255,.96);
  box-shadow: 0 6px 20px rgba(0,0,0,.14);
}
.surface-command-palette {
  position: fixed;
  left: 50%;
  top: 16px;
  transform: translateX(-50%);
  z-index: 12;
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: auto;
}
.surface-command-palette .world-command-list {
  max-height: min(420px, calc(100vh - 160px));
}
`;
