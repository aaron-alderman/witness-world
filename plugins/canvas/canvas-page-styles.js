export const CANVAS_PAGE_CSS = `
  :root { --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "Segoe UI", Tahoma, sans-serif; font-size: 12px; background: #d4d0c8; color: #1c1c1c; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
  header.canvas-toolbar { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #d4d0c8; border-bottom: 2px solid #808080; flex: none; flex-wrap: wrap; }
  header.canvas-toolbar label { color: #333; }
  select, button, input { font: inherit; }
  select, input[type="text"], input[type="number"] { border: 2px inset #fff; background: #fff; padding: 2px 4px; }
  button { border: 2px outset #fff; background: #d4d0c8; padding: 2px 10px; cursor: pointer; }
  button:active { border-style: inset; }
  button.mode-active { border-style: inset; background: #c0d4ec; }
  .canvas-session { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .canvas-session-status { color: #333; min-width: 180px; }
  #status { margin-left: auto; color: #444; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .canvas-shell { display: flex; flex: 1; min-height: 0; }
  .canvas-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
  .canvas-stage { position: relative; flex: 1; min-width: 0; min-height: 0; border: 2px inset #fff; margin: 6px; background: #f4f4f1; }
  .canvas-stage.drop-ready { background: #eef6df; box-shadow: inset 0 0 0 2px #5f8f2b; }
  .canvas-stage.drop-disabled { background: #f6e7e7; box-shadow: inset 0 0 0 2px #a34444; }
  #history-banner { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); z-index: 5; background: #fff8d8; border: 1px solid #b89c2a; padding: 3px 8px; display: flex; align-items: center; gap: 8px; box-shadow: 1px 1px 4px rgba(0,0,0,0.25); }
  #timeline-panel { flex: none; margin: 0 6px 6px; padding: 6px; background: #d4d0c8; border: 2px outset #fff; }
  .timeline-controls { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  #timeline-slider { flex: 1; }
  #timeline-strip { display: flex; gap: 3px; overflow-x: auto; padding-bottom: 4px; }
  .timeline-tick { flex: none; font-size: 10px; padding: 1px 5px; background: #e8e6e1; border: 1px solid #999; cursor: pointer; white-space: nowrap; }
  .timeline-tick.tick-canvas { background: #c0d4ec; }
  .timeline-older { flex: none; color: #666; font-style: italic; padding: 1px 5px; }
  #canvas-surface { position: absolute; inset: 0; width: 100%; height: 100%; display: block; cursor: default; }
  #overlay-input { position: absolute; display: none; z-index: 10; min-width: 140px; border: 1px solid #336; padding: 3px 5px; box-shadow: 2px 2px 4px rgba(0,0,0,0.35); }
  aside.canvas-inspector { width: 280px; flex: none; margin: 6px 6px 6px 0; padding: 8px; background: #d4d0c8; border: 2px outset #fff; overflow-y: auto; }
  aside.canvas-inspector h2 { font-size: 12px; margin: 10px 0 4px; padding: 2px 4px; background: #0a246a; color: #fff; font-weight: 600; }
  aside.canvas-inspector h2:first-child { margin-top: 0; }
  .prop-row { display: flex; align-items: center; gap: 6px; margin: 4px 0; }
  .prop-row label { width: 64px; flex: none; color: #333; }
  .prop-row input { flex: 1; min-width: 0; }
  .prop-id { color: #555; word-break: break-all; margin: 4px 0; font-family: var(--mono); }
  .relation-row { padding: 2px 4px; margin: 2px 0; background: #e8e6e1; border: 1px solid #aaa; word-break: break-all; font-family: var(--mono); }
  .palette-item { padding: 3px 6px; margin: 3px 0; background: #fff; border: 1px solid #888; cursor: pointer; word-break: break-all; font-family: var(--mono); }
  .palette-item:hover { background: #c0d4ec; }
  .placed-badge { color: #666; margin-left: 4px; font-weight: 600; font-family: var(--mono); }
  .inspector-empty { color: #555; font-style: italic; margin: 4px 0; }
  .asset-preview { margin: 6px 0 2px; padding: 6px; background: #f3f0e8; border: 1px solid #9f998c; }
  .asset-preview pre { margin: 0; max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: var(--mono); }
  .asset-preview img { display: block; max-width: 100%; max-height: 220px; border: 1px solid #8c8677; background: #fff; }
  .danger { color: #7a0000; }
  #status, #history-label, #timeline-pos, .timeline-tick, .timeline-older { font-family: var(--mono); }
`;
