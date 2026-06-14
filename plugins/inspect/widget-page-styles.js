export const INSPECT_WIDGET_PAGE_CSS = `
.todo-actions { margin-left: auto; display: flex; gap: 6px; }
.session-panel { border-left: 6px solid var(--accent, #ddd); }
code, pre, textarea { font-family: var(--mono); }
textarea { font-size: 12px; line-height: 1.45; }
.widget-editor { border-left: 6px solid var(--surface-border); }
.world-graph { border: 0; border-radius: 0; padding: 0; background: #fafafa; height: 100%; min-height: 0; overflow: hidden; }
.world-graph h2 { font-size: 1rem; margin: 0 0 8px; }
.world-graph-shell { --surface-shell-2-columns: 380px minmax(0, 1fr); height: 100%; max-height: 100%; border-top: 1px solid #e5e5e5; }
.world-main-pane { display: grid; grid-template-rows: auto 1fr; min-height: 0; overflow: hidden; }
.world-mode-menu { white-space: nowrap; flex-wrap: nowrap; border-bottom: 1px solid #e5e5e5; border-radius: 0; box-shadow: none; }
.world-mode-spacer { flex: 1 1 auto; min-width: 16px; }
.world-mode-button { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
.world-mode-active { background: var(--accent, #375a7f); color: white; border-color: var(--accent, #375a7f); }
.world-graph-inspector { border-right: 1px solid #ddd; border-radius: 0; box-shadow: none; min-height: 0; height: 100%; max-height: 100%; overflow-y: scroll; overflow-x: hidden; font-size: 12px; }
.world-graph-inspector h2 { margin: 0 0 8px; font-size: 1rem; }
.world-tutorial-panel { margin-bottom: 14px; background: #faf8f1; border-color: #ddd; }
.world-tutorial-panel h2 { margin: 0; font-size: 1rem; }
.world-tutorial-item { border-color: #e8e1cf; background: rgba(255,255,255,.78); }
.world-tutorial-item p { margin: 4px 0 0; color: #555; line-height: 1.45; }
.world-inspector-row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
.world-inspector-key { color: #777; font-weight: 700; }
.world-inspector-list { display: grid; gap: 4px; margin-top: 8px; }
.world-version-item { display: grid; gap: 6px; }
.world-ref-button { appearance: none; border: 0; background: none; color: var(--accent, #375a7f); padding: 0; cursor: pointer; font: inherit; text-align: left; text-decoration: underline; }
.world-kind-button { appearance: none; border: 0; border-radius: 999px; background: #eee; padding: 2px 7px; cursor: pointer; font: inherit; }
.world-graph-canvas { position: relative; width: 100%; height: 100%; min-height: 0; overflow: scroll; border: 0; border-radius: 0; background: #fff; box-sizing: border-box; }
.world-graph-content { position: relative; }
.world-document-view, .world-primitive-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; }
.world-witness-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; display: grid; gap: 10px; align-content: start; }
.world-witness-card { background: #fafafa; }
.world-source-workbench { height: 100%; border-color: #ddd; background: #1e1e1e; color: #d4d4d4; }
.world-source-sidebar { background: #252526; border-right-color: #333; }
.world-source-file-button { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; background: transparent; color: #ccc; padding: 6px 8px; font: 12px var(--mono); cursor: pointer; }
.world-source-file-button:hover, .world-source-file-active { background: #37373d; color: #f2f2f2; }
.world-source-ref:hover { color: #dcdcaa; background: #2a2d2e; }
.world-source-editor { background: #1e1e1e; }
.world-source-title { position: sticky; top: 0; z-index: 2; background: #2d2d2d; color: #eee; padding: 8px 12px; border-bottom: 1px solid #3a3a3a; font: 12px var(--mono); }
.world-source-code { display: table; width: 100%; font: 12px/1.5 var(--mono); }
.world-source-line { display: table-row; }
.world-source-line-number { display: table-cell; width: 44px; padding: 0 10px; text-align: right; color: #858585; background: #1e1e1e; user-select: none; border-right: 1px solid #2a2a2a; }
.world-source-line-code { display: table-cell; white-space: pre-wrap; padding: 0 12px; }
.world-source-highlight .world-source-line-code { background: rgba(255, 213, 0, .18); outline: 1px solid rgba(255, 213, 0, .35); }
.world-source-ref { color: #9cdcfe; background: transparent; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
.world-source-empty { padding: 16px; color: #ccc; }
.world-primitive-grid { display: grid; grid-template-columns: 220px 280px minmax(0, 1fr); gap: 16px; }
.world-primitive-list { align-content: start; }
.world-graph-svg { position: absolute; inset: 0; pointer-events: none; }
.world-context-box { position: absolute; border: 2px solid #d7d7d7; border-radius: 14px; background: rgba(250,250,250,.78); box-sizing: border-box; }
.world-context-label { position: absolute; left: 12px; top: 8px; font-weight: 700; font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: .06em; }
.world-node { position: absolute; width: 190px; min-height: 48px; padding: 8px; border: 1px solid #ccc; border-radius: 8px; background: white; box-shadow: 0 1px 2px rgba(0,0,0,.08); font-size: 12px; cursor: pointer; }
.world-node-selected { outline: 3px solid var(--accent, #333); outline-offset: 2px; box-shadow: 0 0 0 5px rgba(55,90,127,.12); }
.world-node-step { border-style: dashed; background: #fbfbff; }
.world-node-api { border-color: #c79b45; background: #fff9ed; }
.world-node-process { border-color: #b8c7e0; background: #f8fbff; }
.world-node-context, .world-node-context-ref { border-color: #aaa; background: #f7f7f7; }
.world-node-widget, .world-node-layout { border-color: #6ca278; background: #f4fff6; }
.world-node-capability { border-color: #9a7cc0; background: #fbf7ff; }
.world-node-trait, .world-node-valueType, .world-node-processSpec { border-color: #4c8f8f; background: #f2fffe; }
.world-node-vocabulary { border-color: #999; background: #f7f7f7; }
.world-node a { color: var(--accent, #333); font-weight: 700; text-decoration: none; }
.world-node-kind { color: #777; font-size: 11px; }
.world-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.world-badge { background: #f0f0f0; border-radius: 999px; padding: 2px 6px; font-size: 10px; }
.world-edge-props { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; }
.world-value-list { color: #555; display: grid; gap: 4px; }
.world-value-widget { display: grid; gap: 3px; border: 1px solid #eee; border-radius: 6px; padding: 5px; background: #fff; }
.world-value-type { color: #777; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
.world-value-record { display: grid; gap: 4px; }
.world-value-record-row { display: grid; grid-template-columns: 72px 1fr; gap: 6px; }
.world-source-ast { margin: 6px 0 0; max-height: 180px; font-size: 11px; }
.world-edge-label { font-size: 10px; fill: #777; }
.world-edge-ownership { stroke: #c7352f; stroke-width: 2.5; }
.world-edge-process { stroke: #5577aa; stroke-dasharray: 4 3; }
.world-edge-capability { stroke: #777; stroke-dasharray: 2 3; }
.world-edge-relation { stroke: #ddd; }
[data-widget-version] { border-left: 8px solid var(--version-color, #ddd); padding-left: 12px; border-radius: 8px; }
.world-inspector-key, .world-inspector-item, .world-badge, .world-value-list, .world-value-type, .world-value-record-row,
.world-context-label, .world-node-kind, .world-node a, .world-source-ref {
  font-family: var(--mono);
}
`;
