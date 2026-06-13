import { relation } from "../../src/kernel.js";
import { runProcessGraph, runNode, predicatePasses } from "../../src/process-graph.js";
import {
  FALLBACK_EDITOR_BY_TRAIT,
  typeModelProjection,
  editorForValueType,
  processSpecFor,
  validateFlatRecord,
  validateProcessInput,
  compatibleWithType,
  matchAccepts,
  matchingValueTypes,
  valueMatchesType,
  coerceDomValue,
  inferTraitEditor,
  normalizeFields,
  jsTypeOf,
  previewValue
} from "../../src/type-model.js";
import { widgetTree, frontendProgram, templateWidgetTrees, stableJson } from "../../src/widgets.js";
import { TODO_TUTORIAL_ID, tutorialDefinition } from "../tutorial/tutorials.js";
import { renderTutorialClient } from "../tutorial/tutorial-app-client.js";
import { resolveEdenPageTheme } from "../eden/eden-page-theme.js";
export function renderWidgetPage(world, { actor, rootWidget, frontendProgram: programId = null, appConfig = {} }) {
  const tree = world.project(w => widgetTree(w, rootWidget));
  const program = world.project(w => frontendProgram(w, programId));
  const typeModel = world.project(typeModelProjection);
  const templates = world.project(templateWidgetTrees);
  const html = renderDocument(tree, program, appConfig, typeModel, templates);

  world.emit({
    process: "widget.renderHtml",
    actor,
    claims: [relation(actor, "rendered", rootWidget)],
    body: { rootWidget, frontendProgram: programId, bytes: html.length }
  });

  return html;
}

function renderDocument(root, program, appConfig = {}, typeModel = {}, templates = []) {
  const title = root.props?.title ?? "Witness App";
  const pageTheme = resolveEdenPageTheme(appConfig.pageChrome || {});
  const bodyAttrs = [
    appConfig.page ? `data-page="${escapeAttr(appConfig.page)}"` : "",
    appConfig.surfaceContext ? `data-surface-context="${escapeAttr(appConfig.surfaceContext)}"` : "",
    appConfig.surfaceRouteId ? `data-surface-route="${escapeAttr(appConfig.surfaceRouteId)}"` : "",
    appConfig.surfaceRootWidgetId ? `data-surface-root-widget="${escapeAttr(appConfig.surfaceRootWidgetId)}"` : "",
    appConfig.surfaceProgramId ? `data-surface-program="${escapeAttr(appConfig.surfaceProgramId)}"` : "",
    pageTheme.themeId ? `data-page-theme="${escapeAttr(pageTheme.themeId)}"` : "",
    pageTheme.material ? `data-page-material="${escapeAttr(pageTheme.material)}"` : "",
    pageTheme.typography ? `data-page-typography="${escapeAttr(pageTheme.typography)}"` : ""
  ].filter(Boolean).join(" ");
  const options = { excludeRoles: new Set(appConfig.excludeWidgetRoles ?? []), typeModel };
  return `<!doctype html>\n<html>\n${renderHead(title, pageTheme)}\n<body${bodyAttrs ? " " + bodyAttrs : ""}>\n${renderWidget(root, options)}\n${templates.map(template => renderWidgetTemplate(template, options)).join("\n")}\n${program ? renderClientEngine({ ...program, config: { ...appConfig, typeModel, pageChrome: pageTheme } }) : ""}\n${appConfig.tutorial ? renderTutorialClient(appConfig.tutorial) : ""}\n</body>\n</html>`;
}

function renderHead(title, pageTheme = resolveEdenPageTheme()) {
  const tokens = pageTheme.tokens || resolveEdenPageTheme().tokens;
  return `<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      --page-bg: ${tokens.pageBackground};
      --surface-bg: ${tokens.surface};
      --surface-strong: ${tokens.surfaceStrong};
      --surface-border: ${tokens.border};
      --surface-shadow: ${tokens.panelShadow};
      --accent: ${tokens.accent};
      --ink: ${tokens.ink};
      --muted: ${tokens.muted};
      --input-bg: ${tokens.input};
      --button-bg: ${tokens.button};
      --panel-radius: ${tokens.panelRadius};
      --texture-opacity: ${tokens.textureOpacity};
      --body-font: ${tokens.bodyFont};
      --heading-font: ${tokens.headingFont};
    }
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
    .todo-actions { margin-left: auto; display: flex; gap: 6px; }
    .session-panel, .private-notes, .witness-inspector, .widget-editor, .version-playground {
      border: 1px solid var(--surface-border);
      border-radius: var(--panel-radius);
      padding: 12px;
      background: var(--surface-bg);
      box-shadow: var(--surface-shadow);
    }
    .session-panel { border-left: 6px solid var(--accent, #ddd); }
    .value-editor-field { display: grid; gap: 4px; min-width: 0; flex: 1; }
    .private-note-list { display: grid; gap: 6px; margin-top: 8px; }
    .private-note { padding: 8px; border-radius: 8px; background: var(--input-bg); border: 1px solid rgba(0,0,0,0.08); }
    .witness-inspector { }
    .witness-inspector h2 { font-size: 1rem; margin: 0 0 8px; }
    code, pre, textarea { font-family: var(--mono); }
    textarea { font-size: 12px; line-height: 1.45; }
    .witness-list { max-height: 260px; overflow: auto; font-family: var(--mono); font-size: 12px; }
    .witness { display: grid; grid-template-columns: 150px 1fr; gap: 8px; padding: 6px 0; border-bottom: 1px solid #eee; }
    .witness-process { font-weight: 700; }
    .witness-body { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .widget-editor, .version-playground { border-left: 6px solid var(--surface-border); }
    .widget-editor input, .widget-editor select, .widget-editor textarea, [data-role="widget-editor-form"] input, [data-role="widget-editor-form"] select, [data-role="widget-editor-form"] textarea { font-family: var(--mono); }
    .world-graph { border: 0; border-radius: 0; padding: 0; background: #fafafa; height: 100%; min-height: 0; overflow: hidden; }
    .world-graph h2 { font-size: 1rem; margin: 0 0 8px; }
    .world-graph-shell { display: grid; grid-template-columns: 380px minmax(0, 1fr); gap: 0; align-items: stretch; height: 100%; max-height: 100%; overflow: hidden; border-top: 1px solid #e5e5e5; }
    .world-main-pane { display: grid; grid-template-rows: auto 1fr; min-height: 0; overflow: hidden; }
    .world-mode-menu { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #e5e5e5; background: #fbfbfb; overflow-x: auto; white-space: nowrap; flex-wrap: nowrap; min-height: 35px; box-sizing: border-box; }
    .world-mode-spacer { flex: 1 1 auto; min-width: 16px; }
    .world-mode-button { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
    .world-mode-active { background: var(--accent, #375a7f); color: white; border-color: var(--accent, #375a7f); }
    .world-command-toggle { border-radius: 999px; padding: 5px 11px; font-size: 12px; }
    .world-command-hint { color: #777; font-size: 11px; font-family: var(--mono); }
    .world-command-palette { border-bottom: 1px solid #e5e5e5; background: #fff; padding: 12px; display: grid; gap: 10px; }
    .world-command-head { display: flex; gap: 8px; align-items: center; }
    .world-command-input { flex: 1 1 auto; min-width: 0; font: 13px var(--mono); padding: 9px 11px; border: 1px solid #ddd; border-radius: 10px; }
    .world-command-list { display: grid; gap: 6px; max-height: 320px; overflow: auto; }
    .world-command-item { text-align: left; border: 1px solid #eee; border-radius: 8px; padding: 8px 10px; background: #fafafa; cursor: pointer; }
    .world-command-item strong { display: block; font-size: 13px; }
    .world-command-meta { color: #777; font-size: 11px; font-family: var(--mono); }
    .world-command-result { border: 1px solid #e7ddc8; border-radius: 10px; padding: 10px 12px; background: #faf8f1; display: grid; gap: 8px; }
    .world-command-result strong { font-size: 13px; }
    .world-command-result-grid { display: grid; gap: 4px; }
    .world-command-result-row { display: grid; grid-template-columns: 88px 1fr; gap: 8px; font-size: 12px; }
    .world-command-result-key { color: #777; font-family: var(--mono); }
    .world-command-result-value { overflow-wrap: anywhere; font-family: var(--mono); }
    .world-command-result-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .world-command-empty { color: #777; font-size: 12px; padding: 6px 2px; }
    .world-graph-inspector { border-right: 1px solid #ddd; background: #fff; padding: 14px; min-height: 0; height: 100%; max-height: 100%; overflow-y: scroll; overflow-x: hidden; font-size: 12px; box-sizing: border-box; }
    .world-graph-inspector h2 { margin: 0 0 8px; font-size: 1rem; }
    .world-tutorial-panel { display: grid; gap: 10px; margin-bottom: 14px; padding: 12px; border: 1px solid #ddd; border-radius: 10px; background: #faf8f1; }
    .world-tutorial-panel h2 { margin: 0; font-size: 1rem; }
    .world-tutorial-meta { color: #777; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .world-tutorial-summary { color: #555; line-height: 1.5; }
    .world-tutorial-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .world-tutorial-list { display: grid; gap: 6px; }
    .world-tutorial-item { border: 1px solid #e8e1cf; border-radius: 8px; padding: 8px 9px; background: rgba(255,255,255,.78); }
    .world-tutorial-item p { margin: 4px 0 0; color: #555; line-height: 1.45; }
    .world-inspector-row { display: grid; grid-template-columns: 84px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f2f2f2; }
    .world-inspector-key { color: #777; font-weight: 700; }
    .world-inspector-list { display: grid; gap: 4px; margin-top: 8px; }
    .world-inspector-item { border: 1px solid #eee; border-radius: 6px; padding: 5px 7px; background: #fafafa; text-align: left; cursor: pointer; }
    .world-version-item { display: grid; gap: 6px; }
    .world-version-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .world-version-status { margin-top: 8px; padding: 8px 10px; border-radius: 6px; background: #f6f6f6; border: 1px solid #e4e4e4; }
    .world-version-status[data-level="error"] { background: #fff1f1; border-color: #f1c9c9; color: #8a2e2e; }
    .world-version-status[data-level="ok"] { background: #eef8ef; border-color: #cde6cf; color: #265f31; }
    .world-ref-button { appearance: none; border: 0; background: none; color: var(--accent, #375a7f); padding: 0; cursor: pointer; font: inherit; text-align: left; text-decoration: underline; }
    .world-kind-button { appearance: none; border: 0; border-radius: 999px; background: #eee; padding: 2px 7px; cursor: pointer; font: inherit; }
    .world-graph-canvas { position: relative; width: 100%; height: 100%; min-height: 0; overflow: scroll; border: 0; border-radius: 0; background: #fff; box-sizing: border-box; }
    .world-graph-content { position: relative; }
    .world-document-view, .world-primitive-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; }
    .world-witness-browser { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px; background: #fff; display: grid; gap: 10px; align-content: start; }
    .world-witness-card { border: 1px solid #eee; border-radius: 8px; padding: 10px 12px; background: #fafafa; display: grid; gap: 6px; }
    .world-witness-card pre { margin: 0; white-space: pre-wrap; font-size: 11px; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 8px; overflow: auto; }
    .world-source-workbench { display: grid; grid-template-columns: 260px minmax(0, 1fr); height: 100%; border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #1e1e1e; color: #d4d4d4; }
    .world-source-sidebar { background: #252526; border-right: 1px solid #333; padding: 10px; overflow: auto; }
    .world-source-file-button { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; background: transparent; color: #ccc; padding: 6px 8px; font: 12px var(--mono); cursor: pointer; }
    .world-source-file-button:hover, .world-source-file-active { background: #37373d; color: #f2f2f2; }
    .world-source-ref:hover { color: #dcdcaa; background: #2a2d2e; }
    .world-source-editor { overflow: auto; min-width: 0; }
    .world-source-title { position: sticky; top: 0; z-index: 2; background: #2d2d2d; color: #eee; padding: 8px 12px; border-bottom: 1px solid #3a3a3a; font: 12px var(--mono); }
    .world-source-code { display: table; width: 100%; font: 12px/1.5 var(--mono); }
    .world-source-line { display: table-row; }
    .world-source-line-number { display: table-cell; width: 44px; padding: 0 10px; text-align: right; color: #858585; background: #1e1e1e; user-select: none; border-right: 1px solid #2a2a2a; }
    .world-source-line-code { display: table-cell; white-space: pre-wrap; padding: 0 12px; }
    .world-source-highlight .world-source-line-code { background: rgba(255, 213, 0, .18); outline: 1px solid rgba(255, 213, 0, .35); }
    .world-source-ref { color: #9cdcfe; background: transparent; border: 0; padding: 0; font: inherit; text-decoration: underline; cursor: pointer; }
    .world-source-empty { padding: 16px; color: #ccc; }
    .world-primitive-grid { display: grid; grid-template-columns: 220px 280px minmax(0, 1fr); gap: 16px; }
    .world-primitive-list { display: grid; gap: 6px; align-content: start; }
    .world-primitive-item { text-align: left; border: 1px solid #eee; border-radius: 6px; padding: 6px 8px; background: #fafafa; cursor: pointer; }
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
    .world-source-ast { margin: 6px 0 0; max-height: 180px; overflow: auto; white-space: pre-wrap; background: #fff; border: 1px solid #eee; border-radius: 6px; padding: 6px; font-size: 11px; font-family: var(--mono); }
    .world-edge-label { font-size: 10px; fill: #777; }
    .world-edge-ownership { stroke: #c7352f; stroke-width: 2.5; }
    .world-edge-process { stroke: #5577aa; stroke-dasharray: 4 3; }
    .world-edge-capability { stroke: #777; stroke-dasharray: 2 3; }
    .world-edge-relation { stroke: #ddd; }
    .surface-inspector-toggle { position: fixed; left: 16px; bottom: 16px; z-index: 10; border-radius: 999px; padding: 9px 14px; background: rgba(255,255,255,.96); box-shadow: 0 6px 20px rgba(0,0,0,.14); }
    .surface-inspector-panel { position: fixed; left: 16px; bottom: 68px; z-index: 10; width: 360px; max-width: calc(100vw - 32px); max-height: calc(100vh - 96px); overflow: auto; border: 1px solid #ddd; border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 14px; display: grid; gap: 10px; }
    .surface-inspector-panel h2 { margin: 0; font-size: 1rem; }
    .surface-inspector-meta { color: #777; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-family: var(--mono); }
    .surface-inspector-summary { color: #555; line-height: 1.45; }
    .surface-inspector-grid { display: grid; gap: 6px; }
    .surface-inspector-row { display: grid; grid-template-columns: 92px 1fr; gap: 8px; padding: 4px 0; border-bottom: 1px solid #f1f1f1; }
    .surface-inspector-label { color: #777; font-weight: 700; font-family: var(--mono); }
    .surface-inspector-value { min-width: 0; overflow-wrap: anywhere; font-family: var(--mono); }
    .surface-inspector-form { display: grid; gap: 8px; }
    .surface-inspector-field { display: grid; gap: 4px; font-size: 12px; color: #555; }
    .surface-inspector-field span { font-family: var(--mono); color: #777; }
    .surface-inspector-field input, .surface-inspector-field textarea, .surface-inspector-field select { width: 100%; box-sizing: border-box; border: 1px solid #ddd; border-radius: 8px; background: #fff; padding: 8px; font-family: var(--mono); font-size: 12px; }
    .surface-inspector-field textarea { min-height: 72px; resize: vertical; }
    .surface-inspector-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .surface-inspector-actions button { font-size: 12px; }
    .surface-inspector-list { display: grid; gap: 6px; }
    .surface-inspector-item { border: 1px solid #eee; border-radius: 8px; padding: 8px 9px; background: #fafafa; }
    .surface-inspector-item strong { display: block; margin-bottom: 4px; font-size: 12px; }
    .surface-inspector-status { padding: 8px 10px; border-radius: 8px; border: 1px solid #e3e3e3; background: #f7f7f7; }
    .surface-inspector-status[data-level="ok"] { background: #eef8ef; border-color: #cde6cf; color: #265f31; }
    .surface-inspector-status[data-level="error"] { background: #fff1f1; border-color: #f1c9c9; color: #8a2e2e; }
    .surface-inspector-menu { position: fixed; z-index: 11; min-width: 220px; max-width: min(320px, calc(100vw - 24px)); border: 1px solid #ddd; border-radius: 12px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 8px; display: grid; gap: 6px; }
    .surface-inspector-menu button { text-align: left; width: 100%; background: #fafafa; }
    .surface-inspector-menu button:hover { background: #f1f1f1; }
    .surface-inspector-menu p { margin: 0; color: #555; font-size: 12px; line-height: 1.4; padding: 4px 2px; }
    .surface-command-toggle { position: fixed; right: 16px; bottom: 16px; z-index: 10; border-radius: 999px; padding: 9px 14px; background: rgba(255,255,255,.96); box-shadow: 0 6px 20px rgba(0,0,0,.14); }
    .surface-command-palette { position: fixed; left: 50%; top: 16px; transform: translateX(-50%); z-index: 12; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow: auto; border: 1px solid #ddd; border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 16px 36px rgba(0,0,0,.18); padding: 12px; display: grid; gap: 10px; }
    .surface-command-palette .world-command-list { max-height: min(420px, calc(100vh - 160px)); }
    [data-surface-inspector-selected="true"] { outline: 3px solid var(--accent, #333); outline-offset: 4px; border-radius: 8px; box-shadow: 0 0 0 8px rgba(51, 51, 51, .12); }
    [data-widget-version] { border-left: 8px solid var(--version-color, #ddd); padding-left: 12px; border-radius: 8px; }
    [data-tutorial-focus-scope="true"], [data-tutorial-current] { position: relative; z-index: 9; }
    [data-tutorial-current] { outline: 3px solid var(--accent, #333); outline-offset: 4px; border-radius: 8px; scroll-margin-top: 60px; animation: tutorial-focus-pulse 1.35s ease-in-out infinite; }
    [data-tutorial-changed="true"] { box-shadow: 0 0 0 3px rgba(51, 51, 51, .12); animation: tutorial-changed-pulse 1.1s ease-in-out 2; }
    [data-tutorial-changed="true"] strong { animation: tutorial-text-pulse 1.1s ease-in-out 2; }
    .tutorial-dimmer { position: fixed; inset: 0; z-index: 7; background: rgba(17, 17, 17, .38); backdrop-filter: blur(2px); pointer-events: none; }
    .tutorial-overlay { position: fixed; width: 340px; max-width: calc(100vw - 24px); z-index: 10; background: rgba(255,255,255,.98); border: 1px solid #ddd; border-radius: 14px; padding: 14px; box-shadow: 0 16px 36px rgba(0,0,0,.18); pointer-events: none; }
    .tutorial-overlay h3 { margin: 0 0 8px; font-size: 1rem; }
    .tutorial-overlay p { margin: 0 0 10px; color: #555; line-height: 1.45; }
    .tutorial-overlay-meta { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: #777; margin-bottom: 6px; }
    .tutorial-concept-list { display: grid; gap: 8px; margin: 0 0 10px; }
    .tutorial-concept { border: 1px solid #ddd; border-radius: 10px; padding: 9px 10px; background: rgba(248,248,248,.92); }
    .tutorial-concept strong { display: block; margin-bottom: 3px; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #333; }
    .tutorial-concept span { display: block; font-size: 13px; line-height: 1.4; color: #555; }
    .tutorial-overlay button, .tutorial-overlay-handle { pointer-events: auto; }
    .tutorial-overlay-handle { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin: -4px -4px 10px; padding: 4px; cursor: grab; user-select: none; }
    .tutorial-overlay-handle:active { cursor: grabbing; }
    .tutorial-handle-copy { min-width: 0; }
    .tutorial-handle-kicker { font-size: 11px; text-transform: uppercase; letter-spacing: .14em; color: #777; }
    .tutorial-handle-grip { color: #777; font-size: 18px; line-height: 1; padding-top: 2px; }
    .tutorial-click-pulse { position: fixed; width: 22px; height: 22px; margin-left: -11px; margin-top: -11px; border-radius: 999px; border: 2px solid rgba(51, 51, 51, .55); background: rgba(51, 51, 51, .12); z-index: 11; pointer-events: none; animation: tutorial-click-pulse .55s ease-out forwards; }
    .tutorial-auto-click { animation: tutorial-button-click .5s ease-out; }
    .tutorial-resume { position: fixed; right: 16px; bottom: 16px; z-index: 10; }
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
    .world-inspector-key, .world-inspector-item, .world-badge, .world-value-list, .world-value-type, .world-value-record-row,
    .world-context-label, .world-node-kind, .world-node a, .world-source-ref, .tutorial-overlay-meta, .tutorial-handle-kicker {
      font-family: var(--mono);
    }
  </style>
</head>`;
}

function renderWidgetTemplate(widget, options = {}) {
  const content = renderWidget(widget, { ...options, templateContent: true });
  if (widget.kind === "Option") {
    // Browsers do not consistently preserve top-level <option> nodes inside a
    // parsed template fragment. Keep the authored widget declarative, but wrap
    // it in a temporary <select> so the parser creates a real option element.
    return `<template data-widget-template="${escapeAttr(widget.id)}"><select data-template-wrapper="option">${content}</select></template>`;
  }
  return `<template data-widget-template="${escapeAttr(widget.id)}">${content}</template>`;
}

function renderWidget(widget, options = {}) {
  const role = widget.props?.role ?? widget.props?.["data-role"];
  if (role && options.excludeRoles?.has(role)) return "";
  if (widget.props?.template === true && !options.templateContent) return "";
  const children = widget.children.map(child => renderWidget(child, options)).join("\n");
  const attrs = renderAttrs(widget);

  switch (widget.kind) {
    case "Page":
      return `<main${attrs}>\n${children}\n</main>`;
    case "Box":
    case "Section":
      return `<section${attrs}>\n${children}\n</section>`;
    case "Heading": {
      const level = clamp(Number(widget.props.level ?? 1), 1, 6);
      return `<h${level}${attrs}>${escapeHtml(widget.props.text ?? "")}</h${level}>`;
    }
    case "Text":
      return `<div${attrs}>${escapeHtml(widget.props.text ?? "")}</div>`;
    case "Form":
      return `<form${attrs}>\n${children}\n</form>`;
    case "Input":
      return `<input${attrs}${renderExtraAttrs(widget, ["name", "placeholder", "type", "valueType", "label", "template"])} name="${escapeAttr(widget.props.name ?? "value")}" placeholder="${escapeAttr(widget.props.placeholder ?? "")}" autocomplete="off" />`;
    case "Select":
      return `<select${attrs}${renderExtraAttrs(widget, ["name", "template"])} name="${escapeAttr(widget.props.name ?? "value")}">${children}</select>`;
    case "Option":
      return `<option${attrs}${renderExtraAttrs(widget, ["text", "value", "template"])} value="${escapeAttr(widget.props.value ?? "")}">${escapeHtml(widget.props.text ?? "")}</option>`;
    case "ValueEditor":
      return renderValueEditor(widget, options.typeModel ?? {}, attrs);
    case "Button": {
      const type = widget.props.type ?? "button";
      return `<button${attrs}${renderExtraAttrs(widget, ["text", "type", "template"])} type="${escapeAttr(type)}">${escapeHtml(widget.props.text ?? "Button")}</button>`;
    }
    case "Link":
      return `<a${attrs}${renderExtraAttrs(widget, ["text", "href", "template"])} href="${escapeAttr(widget.props.href ?? "#")}">${escapeHtml(widget.props.text ?? widget.props.href ?? "Link")}</a>`;
    case "List":
      return `<ul${attrs}></ul>`;
    default:
      return `<section${attrs} data-kind="${escapeAttr(widget.kind)}">${children}</section>`;
  }
}

function renderValueEditor(widget, typeModel, attrs) {
  const valueType = widget.props.valueType ?? "textual";
  const editor = editorForValueType(typeModel, valueType);
  const name = escapeAttr(widget.props.name ?? "value");
  const placeholder = escapeAttr(widget.props.placeholder ?? "");
  const controlAttrs = `${attrs} name="${name}" data-value-type="${escapeAttr(valueType)}" data-editor-control="${escapeAttr(editor.control)}"`;
  let control = "";
  if (editor.control === "select") {
    const options = Array.isArray(editor.options) ? editor.options : [];
    const placeholderOption = widget.props.placeholder ? `<option value="">${escapeHtml(widget.props.placeholder)}</option>` : "";
    control = `<select${controlAttrs}>${placeholderOption}${options.map(option => `<option value="${escapeAttr(option)}">${escapeHtml(option)}</option>`).join("")}</select>`;
  } else if (editor.control === "checkbox") {
    control = `<input${controlAttrs} type="checkbox" />`;
  } else {
    const inputType = editor.control === "number" ? "number" : editor.control === "color" ? "color" : "text";
    control = `<input${controlAttrs} type="${escapeAttr(inputType)}" placeholder="${placeholder}" autocomplete="off" />`;
  }
  if (!widget.props.label) return control;
  return `<label class="value-editor-field"><span>${escapeHtml(widget.props.label)}</span>${control}</label>`;
}

function renderAttrs(widget) {
  const parts = [`data-widget="${escapeAttr(widget.id)}"`];
  if (widget.version) parts.push(`data-widget-version="${escapeAttr(widget.version)}"`);
  if (widget.props.class) parts.push(`class="${escapeAttr(widget.props.class)}"`);
  if (widget.props.hidden === true) parts.push("hidden");
  if (widget.props.role) {
    parts.push(`data-role="${escapeAttr(widget.props.role)}"`);
    parts.push(`data-${escapeAttr(widget.props.role)}`);
  }
  if (widget.props.action) parts.push(`data-action="${escapeAttr(widget.props.action)}"`);
  if (typeof widget.props.tutorialTarget === "string" && widget.props.tutorialTarget !== "") {
    parts.push(`data-tutorial-target="${escapeAttr(widget.props.tutorialTarget)}"`);
  }
  if (widget.props.type && widget.kind !== "Button") parts.push(`type="${escapeAttr(widget.props.type)}"`);
  if (widget.versionIndex != null) parts.push(`style="--version-color: ${escapeAttr(versionColor(widget.versionIndex))}"`);
  for (const [key, value] of Object.entries(widget.props || {})) {
    if (key.startsWith("event") && key.length > 5 && value != null) {
      parts.push(`data-${escapeAttr(camelToKebab(key.slice(5)))}="${escapeAttr(value)}"`);
    }
    if ((key.startsWith("data-") || key.startsWith("aria-")) && value != null) parts.push(`${escapeAttr(key)}="${escapeAttr(value)}"`);
  }
  return " " + parts.join(" ");
}

function renderExtraAttrs(widget, consumed = []) {
  const consumedSet = new Set(["class", "role", "action", "hidden", "template", "tutorialTarget", ...consumed]);
  const entries = Object.entries(widget.props || {})
    .filter(([key, value]) => !consumedSet.has(key) && !key.startsWith("event") && !key.startsWith("data-") && !key.startsWith("aria-") && value != null && typeof value !== "object");
  if (entries.length === 0) return "";
  return " " + entries.map(([key, value]) => `${escapeAttr(key)}="${escapeAttr(value)}"`).join(" ");
}

function camelToKebab(value) {
  return String(value || "").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function versionColor(index) {
  const colors = ["#375a7f", "#6b4f8a", "#667a3a", "#9a5a35", "#2f766f", "#8a3f65"];
  const n = Math.abs(Number(index) || 0) % colors.length;
  return colors[n];
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function renderClientEngine(program) {
  const json = JSON.stringify(program).replace(/</g, "\\u003c");
  const commandTutorial = program.config?.tutorial ? tutorialDefinition(TODO_TUTORIAL_ID) : null;
  const commandTutorialJson = JSON.stringify(commandTutorial).replace(/</g, "\\u003c");
  const engine = String.raw`(async () => {
  let program = JSON.parse(document.getElementById('witness-frontend-program').textContent);
  let config = program.config || {};
  let typeModel = config.typeModel || {};
  const currentSurfaceContext = typeof config.surfaceContext === 'string' && config.surfaceContext.trim() ? config.surfaceContext.trim() : null;
  const runtimeSurfaces = Array.isArray(config.runtimeSurfaces) ? config.runtimeSurfaces : [];
  const runtimeSurfacesFor = context => runtimeSurfaces.filter(surface => {
    if (!Array.isArray(surface?.contexts) || !surface.contexts.length) return true;
    return surface.contexts.includes(context);
  });
  const commandTutorial = ${commandTutorialJson};
  const state = Object.create(null);
  const liveProjectionProcesses = new Set(['defineWidget', 'updateWidget', 'widget.update', 'attachWidget', 'defineWidgetVersion', 'activateWidgetVersion', 'widgetVersion.migrate', 'widgetVersion.rollback']);
  let refreshInFlight = null;
  let liveProjectionStarted = false;
  const byWidget = id => document.querySelector('[data-widget="' + CSS.escape(id) + '"]');
  const byTemplate = id => document.querySelector('[data-widget-template="' + CSS.escape(id) + '"]');
  const readPath = (value, path) => String(path || '').split('.').filter(Boolean).reduce((x, key) => x == null ? undefined : x[key], value);
  const FALLBACK_EDITOR_BY_TRAIT = ${JSON.stringify(FALLBACK_EDITOR_BY_TRAIT)};
  const predicatePasses = ${predicatePasses.toString()};
  const runNode = ${runNode.toString()};
  const runProcessGraph = ${runProcessGraph.toString()};
  const compatibleWithType = ${compatibleWithType.toString()};
  const editorForValueType = ${editorForValueType.toString()};
  const processSpecFor = ${processSpecFor.toString()};
  const normalizeFields = ${normalizeFields.toString()};
  const jsTypeOf = ${jsTypeOf.toString()};
  const previewValue = ${previewValue.toString()};
  const inferTraitEditor = ${inferTraitEditor.toString()};
  const coerceDomValue = ${coerceDomValue.toString()};
  const valueMatchesType = ${valueMatchesType.toString()};
  const matchingValueTypes = ${matchingValueTypes.toString()};
  const matchAccepts = ${matchAccepts.toString()};
  const validateFlatRecord = ${validateFlatRecord.toString()};
  const validateProcessInput = ${validateProcessInput.toString()};
  const textAt = (value, path) => String(readPath(value, path) ?? '');
  const setText = (id, text) => { const el = byWidget(id); if (el) el.textContent = text; };
  const setValue = (id, value) => {
    const el = byWidget(id);
    if (!el) return;
    if ('value' in el) el.value = value ?? '';
    else el.textContent = value ?? '';
  };
  const currentActor = () => state.session?.actor || state.actor || '';
  const applyTheme = () => { document.body.dataset.actor = currentActor() || ''; };
  const liveSurfaceInspectable = Boolean(config.page && config.page !== 'world');
  const validWorldGraphModes = new Set(['graph', 'things', 'primitive', 'witness', 'source', 'process']);
  const processViewHref = ({ program, event }) => {
    const url = new URL('/process', window.location.origin);
    if (program) url.searchParams.set('program', program);
    if (event) url.searchParams.set('event', event);
    return url.pathname + url.search;
  };
  const worldSurfaceHref = ({ select = '', mode = '' } = {}) => {
    const url = new URL('/world', window.location.origin);
    if (select) url.searchParams.set('select', select);
    if (mode) url.searchParams.set('mode', mode);
    return url.pathname + url.search;
  };
  const selectedSurfaceWidgetId = () => String(state.surfaceInspectorSelectedId || '');
  const clearSurfaceInspectorHighlight = () => {
    document.querySelectorAll('[data-surface-inspector-selected]').forEach(node => node.removeAttribute('data-surface-inspector-selected'));
  };
  const applySurfaceInspectorHighlight = widgetId => {
    clearSurfaceInspectorHighlight();
    if (!widgetId) return;
    const element = byWidget(widgetId);
    if (!element) return;
    element.setAttribute('data-surface-inspector-selected', 'true');
    element.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  const selectedSurfaceWidgetElement = () => {
    const widgetId = selectedSurfaceWidgetId();
    return widgetId ? byWidget(widgetId) : null;
  };
  const selectedSurfaceWidgetNode = () => state.surfaceInspectorGraphById?.[selectedSurfaceWidgetId()] || null;
  const selectedSurfaceWidgetAuthored = () => state.surfaceInspectorWidgetsById?.[selectedSurfaceWidgetId()] || null;
  const selectedSurfaceWidgetEditAuthority = () => {
    const widget = selectedSurfaceWidgetAuthored();
    if (!widget) return { ok: false, reason: 'This selected element is not currently backed by a directly editable authored widget row.' };
    const actor = currentActor();
    if (!actor) return { ok: false, reason: 'Sign in to edit bootstrap state.' };
    if (widget.context) {
      const mutationContexts = Array.isArray(state.authority?.mutationContexts) ? state.authority.mutationContexts : [];
      if (mutationContexts.includes(widget.context)) return { ok: true, reason: '' };
      return { ok: false, reason: 'Read-only: this widget lives in context ' + widget.context + ' and the current actor lacks authority for that context.' };
    }
    if (widget.owner && widget.owner === actor) return { ok: true, reason: '' };
    if (widget.owner) return { ok: false, reason: 'Read-only: this unscoped widget is owned by ' + widget.owner + '.' };
    return { ok: false, reason: 'Read-only: this widget is not owned by the current actor.' };
  };
  const selectedSurfaceWidgetSource = () => {
    const node = selectedSurfaceWidgetNode();
    return (node?.sources || []).slice(-1)[0] || null;
  };
  const selectedSurfaceWidgetVersionState = () => selectedSurfaceWidgetNode()?.widgetVersionState || null;
  const selectedSurfaceWidgetVersions = () => selectedSurfaceWidgetNode()?.widgetVersions || [];
  const currentSurfaceIdentityNode = () => {
    const identityId = typeof state.session?.identity === 'string' ? state.session.identity : '';
    return identityId ? (state.surfaceInspectorGraphById?.[identityId] || null) : null;
  };
  const currentSurfaceIdentityRecord = () => {
    const identityId = typeof state.session?.identity === 'string' ? state.session.identity : '';
    return identityId ? (state.surfaceBootstrapIdentitiesById?.[identityId] || null) : null;
  };
  const currentSurfaceIdentitySource = () => {
    const node = currentSurfaceIdentityNode();
    return (node?.sources || []).slice(-1)[0] || null;
  };
  const buildSurfaceWhoamiResult = () => {
    const identityRecord = currentSurfaceIdentityRecord();
    const identity = typeof state.session?.identity === 'string' ? state.session.identity : '';
    const actor = typeof state.session?.actor === 'string' ? state.session.actor : '';
    const label = typeof state.session?.label === 'string' ? state.session.label : '';
    const homeContext = typeof (identityRecord?.homeContext ?? state.session?.homeContext) === 'string' ? (identityRecord?.homeContext ?? state.session?.homeContext) : '';
    const perspective = typeof (identityRecord?.homePerspective ?? state.session?.perspective) === 'string' ? (identityRecord?.homePerspective ?? state.session?.perspective) : '';
    const authenticated = Boolean(state.session?.authenticated && identity);
    const title = authenticated ? (label || actor || identity) : 'user';
    const subtitle = authenticated
      ? ('Current signed-in identity / ' + identity)
      : 'Anonymous principal / sign in if you want the world to remember your label.';
    const rows = [
      ['principal', title],
      ['identity', identity || 'user'],
      ['actor', actor || 'user'],
      ['context', homeContext || ''],
      ['perspective', perspective || ''],
      ['sourcerer', 'TRUE']
    ].filter(([, value]) => value);
    return {
      kind: 'whoami',
      title,
      subtitle,
      rows,
      authenticated,
      identity,
      username: typeof identityRecord?.username === 'string' ? identityRecord.username : '',
      homeContextValue: homeContext || '',
      homePerspectiveValue: perspective || '',
      contextOptions: Array.isArray(state.surfaceBootstrapContexts) ? state.surfaceBootstrapContexts.map(row => row?.id).filter(Boolean) : [],
      editorReady: Boolean(identityRecord),
      editorLoading: authenticated && !identityRecord && !state.surfaceInspectorWidgetsError,
      editorError: authenticated && !identityRecord ? state.surfaceInspectorWidgetsError : '',
      bootstrapHref: authenticated && identity ? ('/_bootstrap?identity=' + encodeURIComponent(identity) + '#identity-form') : '',
      source: currentSurfaceIdentitySource(),
      note: authenticated
        ? 'The shortcut reveals inspectability and authority-to-begin. From here you can inspect the real world record, edit the current identity inline through a real identity.update path, or open the bootstrap editor.'
        : 'The shortcut reveals the deeper truth first. Sign in when you want this user to become a concrete identity record.'
    };
  };
  const openSurfaceWhoami = () => {
    state.surfaceCommandOpen = true;
    state.surfaceCommandQuery = 'whoami';
    state.surfaceCommandResult = buildSurfaceWhoamiResult();
    state.surfaceCommandFocusRequested = true;
    updateSurfaceInspectorUi();
    if (state.session?.authenticated && state.session?.identity) {
      void ensureSurfaceInspectorWidgets().then(() => {
        if (state.surfaceCommandResult?.kind !== 'whoami') return;
        state.surfaceCommandResult = buildSurfaceWhoamiResult();
        updateSurfaceInspectorUi();
      }).catch(error => {
        if (state.surfaceCommandResult?.kind !== 'whoami') return;
        state.surfaceCommandResult = {
          ...buildSurfaceWhoamiResult(),
          statusMessage: error instanceof Error ? error.message : String(error),
          statusLevel: 'error'
        };
        updateSurfaceInspectorUi();
      });
    }
  };
  const deriveSurfaceInspectorProcessSelection = widgetId => {
    if (!widgetId || !program?.graph?.length) return null;
    const element = byWidget(widgetId);
    if (!element) return null;
    const action = element.getAttribute('data-action') || '';
    if (action) {
      const event = 'click:' + action;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    const form = element.matches?.('form[data-widget]') ? element : element.closest?.('form[data-widget]');
    const formId = form?.getAttribute?.('data-widget') || '';
    if (formId) {
      const event = 'submit:' + formId;
      if ((program.graph || []).some(step => step.event === event)) return { program: program.id, event };
    }
    if (widgetId === program.rootWidget && (program.graph || []).some(step => step.event === 'load')) {
      return { program: program.id, event: 'load' };
    }
    return null;
  };
  const invalidateSurfaceInspectorGraph = () => {
    state.surfaceInspectorGraph = null;
    state.surfaceInspectorGraphById = null;
    state.surfaceInspectorGraphLoaded = false;
    state.surfaceInspectorGraphError = null;
  };
  const invalidateSurfaceInspectorWidgets = () => {
    state.surfaceInspectorWidgets = null;
    state.surfaceInspectorWidgetsById = null;
    state.surfaceBootstrapIdentities = null;
    state.surfaceBootstrapIdentitiesById = null;
    state.surfaceBootstrapContexts = null;
    state.surfaceInspectorWidgetsLoaded = false;
    state.surfaceInspectorWidgetsError = null;
  };
  const setSurfaceInspectorStatus = (message, level = 'ok') => {
    state.surfaceInspectorStatus = message ? { message: String(message), level } : null;
  };
  const selectedSurfaceInspectorProcessSelection = () => {
    const selectedNode = selectedSurfaceWidgetNode();
    if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) return selectedNode.processSelection;
    return deriveSurfaceInspectorProcessSelection(selectedSurfaceWidgetId());
  };
  const ensureSurfaceInspectorGraph = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorGraph();
    if (state.surfaceInspectorGraphLoaded && state.surfaceInspectorGraphById) {
      return { ok: true, graph: state.surfaceInspectorGraph, byId: state.surfaceInspectorGraphById };
    }
    if (state.surfaceInspectorGraphPromise) return state.surfaceInspectorGraphPromise;
    state.surfaceInspectorGraphPromise = (async () => {
      const url = '/api/world-graph';
      const response = await fetch(url, requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorGraphError = body?.error || 'world graph request failed';
        state.surfaceInspectorGraphLoaded = true;
        return { ok: false, error: state.surfaceInspectorGraphError, status: response.status };
      }
      const graph = body.graph || body;
      const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
      state.surfaceInspectorGraph = graph;
      state.surfaceInspectorGraphById = Object.fromEntries(nodes.map(node => [node.id, node]));
      state.surfaceInspectorGraphLoaded = true;
      state.surfaceInspectorGraphError = null;
      return { ok: true, graph, byId: state.surfaceInspectorGraphById };
    })();
    try {
      return await state.surfaceInspectorGraphPromise;
    } finally {
      state.surfaceInspectorGraphPromise = null;
    }
  };
  const ensureSurfaceInspectorWidgets = async ({ force = false } = {}) => {
    if (!liveSurfaceInspectable) return { ok: false, error: 'surface inspector unavailable' };
    if (force) invalidateSurfaceInspectorWidgets();
    if (state.surfaceInspectorWidgetsLoaded && state.surfaceInspectorWidgetsById) {
      return { ok: true, widgets: state.surfaceInspectorWidgets, byId: state.surfaceInspectorWidgetsById };
    }
    if (state.surfaceInspectorWidgetsPromise) return state.surfaceInspectorWidgetsPromise;
    state.surfaceInspectorWidgetsPromise = (async () => {
      const url = '/api/bootstrap-state';
      const response = await fetch(url, requestOptions({}, { url }));
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        state.surfaceInspectorWidgetsError = body?.error || 'bootstrap widget state request failed';
        state.surfaceInspectorWidgetsLoaded = true;
        return { ok: false, error: state.surfaceInspectorWidgetsError, status: response.status };
      }
      const widgets = Array.isArray(body?.widgets) ? body.widgets : [];
      const identities = Array.isArray(body?.identities) ? body.identities : [];
      const contexts = Array.isArray(body?.contexts) ? body.contexts : [];
      state.surfaceInspectorWidgets = widgets;
      state.surfaceInspectorWidgetsById = Object.fromEntries(widgets.map(widget => [widget.id, widget]));
      state.surfaceBootstrapIdentities = identities;
      state.surfaceBootstrapIdentitiesById = Object.fromEntries(identities.map(identity => [identity.id, identity]));
      state.surfaceBootstrapContexts = contexts;
      state.authority = body?.authority && typeof body.authority === 'object' ? body.authority : state.authority;
      state.surfaceInspectorWidgetsLoaded = true;
      state.surfaceInspectorWidgetsError = null;
      return { ok: true, widgets, byId: state.surfaceInspectorWidgetsById };
    })();
    try {
      return await state.surfaceInspectorWidgetsPromise;
    } finally {
      state.surfaceInspectorWidgetsPromise = null;
    }
  };
  const selectSurfaceInspectorWidget = async (widgetId, { refreshGraph = false, statusMessage = null } = {}) => {
    state.surfaceInspectorOpen = true;
    state.surfaceInspectorSelectedId = widgetId || '';
    state.surfaceInspectorMenu = widgetId && state.surfaceInspectorMenu
      ? { ...state.surfaceInspectorMenu, widgetId }
      : null;
    applySurfaceInspectorHighlight(widgetId || '');
    if (statusMessage) setSurfaceInspectorStatus(statusMessage, 'ok');
    if (!widgetId) {
      updateSurfaceInspectorUi();
      return { ok: true, widgetId: '' };
    }
    const [loaded, authored] = await Promise.all([
      ensureSurfaceInspectorGraph({ force: refreshGraph }),
      ensureSurfaceInspectorWidgets({ force: refreshGraph })
    ]);
    if (!loaded.ok) {
      setSurfaceInspectorStatus(loaded.error || 'Failed to load world graph for inspector.', 'error');
    } else if (!authored.ok) {
      setSurfaceInspectorStatus(authored.error || 'Failed to load authored widget state for inspector.', 'error');
    } else if (!state.surfaceInspectorGraphById?.[widgetId] && !statusMessage) {
      setSurfaceInspectorStatus('Selected widget is not yet visible in the world graph.', 'error');
    } else if (!statusMessage) {
      setSurfaceInspectorStatus('Selected ' + widgetId + '.', 'ok');
    }
    updateSurfaceInspectorUi();
    return { ok: true, widgetId };
  };
  const closeSurfaceInspectorMenu = () => {
    if (!state.surfaceInspectorMenu) return;
    state.surfaceInspectorMenu = null;
    updateSurfaceInspectorUi();
  };
  const surfaceInspectorTagLabel = element => {
    const tag = String(element?.tagName || '').toLowerCase();
    return tag ? '<' + tag + '>' : '';
  };
  const patchSurfaceWidget = async ({ id, patch }) => {
    const url = '/api/widgets/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const patchSurfaceIdentity = async ({ id, patch }) => {
    const url = '/api/identities/' + encodeURIComponent(id);
    const response = await fetch(url, requestOptions({
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch || {})
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const proposalIdForSurfaceWidget = widgetId => {
    const base = String(widgetId || 'widget').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const suffix = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^A-Za-z0-9_.:-]+/g, '-')
      : String(Date.now());
    return 'proposal.widget.update.' + base + '.' + suffix;
  };
  const proposalIdForSurfaceWidgetVersion = (processName, soul) => {
    const processPart = String(processName || 'widgetVersion.action').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const soulPart = String(soul || 'widget').replace(/[^A-Za-z0-9_.:-]+/g, '-');
    const suffix = typeof crypto?.randomUUID === 'function'
      ? crypto.randomUUID().replace(/[^A-Za-z0-9_.:-]+/g, '-')
      : String(Date.now());
    return 'proposal.' + processPart + '.' + soulPart + '.' + suffix;
  };
  const proposeSurfaceWidgetPatch = async ({ id, patch, reason = '' }) => {
    const url = '/api/proposals';
    const proposalId = proposalIdForSurfaceWidget(id);
    const response = await fetch(url, requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: proposalId,
        targetProcess: 'widget.update',
        targetKind: 'widget',
        targetId: id,
        bodyJson: JSON.stringify({ id, ...patch }),
        reason: String(reason || '').trim()
      })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body, proposalId };
  };
  const proposeSurfaceWidgetVersionAction = async ({ targetProcess, soul, version = '', reason = '' }) => {
    const url = '/api/proposals';
    const proposalId = proposalIdForSurfaceWidgetVersion(targetProcess, soul);
    const proposalBody = targetProcess === 'widgetVersion.activate'
      ? { soul, version }
      : { soul };
    const response = await fetch(url, requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: proposalId,
        targetProcess,
        targetKind: 'widget',
        targetId: soul,
        bodyJson: JSON.stringify(proposalBody),
        reason: String(reason || '').trim()
      })
    }, { url }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body, proposalId };
  };
  const renderSurfaceInspectorEditor = () => {
    const widgetId = selectedSurfaceWidgetId();
    if (!widgetId) return '';
    const authoredWidget = selectedSurfaceWidgetAuthored();
    const versionRows = selectedSurfaceWidgetVersions();
    if (versionRows.length) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Versioned widgets still use the dedicated version controls. This first save-back slice intentionally blocks direct editing for souls with authored widget versions.</div></section>';
    }
    if (!state.surfaceInspectorWidgetsLoaded) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Loading authored widget state...</div></section>';
    }
    if (state.surfaceInspectorWidgetsError) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">Authored widget state is unavailable right now.</div></section>';
    }
    if (!authoredWidget) {
      return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">This selected element is not currently backed by a directly editable authored widget row.</div></section>';
    }
    const authority = selectedSurfaceWidgetEditAuthority();
    const props = authoredWidget.props || {};
    const hiddenChecked = props.hidden === true ? ' checked' : '';
    if (!authority.ok) {
      if (!currentActor()) {
        return '<section><div class="surface-inspector-meta">Live Save-Back</div><div class="surface-inspector-summary">' + escapeHtml(authority.reason || 'This widget is read-only right now.') + '</div></section>';
      }
      return '<section><div class="surface-inspector-meta">Live Save-Back</div>'
        + '<div class="surface-inspector-summary">' + escapeHtml(authority.reason || 'This widget is read-only right now.') + '</div>'
        + '<form class="surface-inspector-form" data-surface-inspector-proposal-form data-widget-id="' + escapeHtml(widgetId) + '">'
        + '<label class="surface-inspector-field"><span>Text</span><textarea name="text" rows="3">' + escapeHtml(String(props.text ?? '')) + '</textarea></label>'
        + '<label class="surface-inspector-field"><span>Title</span><input name="title" value="' + escapeHtml(String(props.title ?? '')) + '" /></label>'
        + '<label class="surface-inspector-field"><span>Class</span><input name="class" value="' + escapeHtml(String(props.class ?? '')) + '" /></label>'
        + '<label class="surface-inspector-field"><span>Hidden</span><input name="hidden" type="checkbox"' + hiddenChecked + ' /></label>'
        + '<label class="surface-inspector-field"><span>Reason</span><input name="reason" placeholder="Why should this shared widget change?" /></label>'
        + '<div class="surface-inspector-actions"><button type="submit" data-surface-inspector-propose>Propose Save-Back</button></div>'
        + '</form>'
        + '<div class="surface-inspector-summary">Direct save is blocked here, but you can create a real <code>widget.update</code> proposal from this live surface for later approval.</div>'
        + '</section>';
    }
    return '<section><div class="surface-inspector-meta">Live Save-Back</div>'
      + '<form class="surface-inspector-form" data-surface-inspector-edit-form data-widget-id="' + escapeHtml(widgetId) + '">'
      + '<label class="surface-inspector-field"><span>Text</span><textarea name="text" rows="3">' + escapeHtml(String(props.text ?? '')) + '</textarea></label>'
      + '<label class="surface-inspector-field"><span>Title</span><input name="title" value="' + escapeHtml(String(props.title ?? '')) + '" /></label>'
      + '<label class="surface-inspector-field"><span>Class</span><input name="class" value="' + escapeHtml(String(props.class ?? '')) + '" /></label>'
      + '<label class="surface-inspector-field"><span>Hidden</span><input name="hidden" type="checkbox"' + hiddenChecked + ' /></label>'
      + '<div class="surface-inspector-actions"><button type="submit" data-surface-inspector-save>Save Widget</button></div>'
      + '</form>'
      + '<div class="surface-inspector-summary">Writes a real <code>widget.update</code> witness for the selected widget. This first slice edits <code>text</code>, <code>title</code>, <code>class</code>, and <code>hidden</code>.</div>'
      + '</section>';
  };
  const renderSurfaceInspectorPanel = () => {
    if (!liveSurfaceInspectable || state.surfaceInspectorOpen !== true) return '';
    const widgetId = selectedSurfaceWidgetId();
    const selectedNode = selectedSurfaceWidgetNode();
    const selectedElement = selectedSurfaceWidgetElement();
    const selectedSource = selectedSurfaceWidgetSource();
    const versionState = selectedSurfaceWidgetVersionState();
    const versionRows = selectedSurfaceWidgetVersions();
    const versionAuthority = versionRows.length ? selectedSurfaceWidgetEditAuthority() : { ok: false, reason: '' };
    const canProposeVersion = !versionAuthority.ok && Boolean(currentActor());
    const processSelection = selectedSurfaceInspectorProcessSelection();
    const summary = widgetId
      ? (selectedNode
        ? ('Inspecting ' + widgetId + ' as a real ' + String(selectedNode.kind || 'thing') + ' node. Use the handoff buttons to jump into witnesses, source, process, or the world surface.')
        : ('Inspecting ' + widgetId + ' from the live page. World metadata is loading or not yet available.'))
      : 'Right-click any widget on this page to inspect it. This first slice is truthful inspect/handoff/version control plus narrow save-back for non-versioned widget text/title/class edits.';
    const rows = widgetId
      ? [
          ['Widget', widgetId],
          ['Kind', selectedNode?.kind || selectedElement?.getAttribute?.('data-kind') || surfaceInspectorTagLabel(selectedElement) || 'widget'],
          ['Context', selectedNode?.context || ''],
          ['Element', surfaceInspectorTagLabel(selectedElement)],
          ['Source', selectedSource?.file || ''],
          ['Process', processSelection?.event || '']
        ].filter(([, value]) => value)
      : [];
    const actions = widgetId
      ? [
          '<button type="button" data-surface-inspector-world>Open In World</button>',
          '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>',
          selectedSource?.file ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : '',
          processSelection ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : ''
        ].filter(Boolean).join('')
      : '';
    const versions = versionRows.length
      ? '<section><div class="surface-inspector-meta">Widget Versions</div><div class="surface-inspector-list">' + versionRows.map(row =>
          '<div class="surface-inspector-item">'
            + '<strong>' + escapeHtml(row.version || row.soul || '') + (row.isActive ? ' [active]' : '') + '</strong>'
            + (row.transitionFromActive ? '<div class="surface-inspector-summary">Transition: ' + escapeHtml(row.transitionFromActive) + '</div>' : '')
            + (!row.isActive
              ? (versionAuthority.ok
                ? '<div class="surface-inspector-actions"><button type="button" data-surface-inspector-activate="' + escapeHtml(row.soul || '') + '" data-surface-inspector-version="' + escapeHtml(row.version || '') + '">Activate</button></div>'
                : (canProposeVersion
                  ? '<form class="surface-inspector-form" data-surface-inspector-version-proposal-form data-surface-inspector-proposal-process="widgetVersion.activate" data-surface-inspector-proposal-soul="' + escapeHtml(row.soul || '') + '" data-surface-inspector-proposal-version="' + escapeHtml(row.version || '') + '">'
                    + '<label class="surface-inspector-field"><span>Reason</span><input name="reason" placeholder="Why should this version go live?" /></label>'
                    + '<div class="surface-inspector-actions"><button type="submit" data-surface-inspector-propose-version="activate">Propose Activate</button></div>'
                  + '</form>'
                  : '<div class="surface-inspector-summary">' + escapeHtml(versionAuthority.reason || 'Sign in to propose version changes.') + '</div>'))
              : '')
          + '</div>'
        ).join('') + '</div>'
        + (versionState?.rollbackAvailable
          ? (versionAuthority.ok
            ? '<div class="surface-inspector-actions"><button type="button" data-surface-inspector-rollback="' + escapeHtml(versionState.soul || '') + '">Rollback To ' + escapeHtml(versionState.rollbackVersion || 'previous') + '</button></div>'
            : (canProposeVersion
              ? '<form class="surface-inspector-form" data-surface-inspector-version-proposal-form data-surface-inspector-proposal-process="widgetVersion.rollback" data-surface-inspector-proposal-soul="' + escapeHtml(versionState.soul || '') + '" data-surface-inspector-proposal-version="' + escapeHtml(versionState.rollbackVersion || '') + '">'
                + '<label class="surface-inspector-field"><span>Reason</span><input name="reason" placeholder="Why should this version be restored?" /></label>'
                + '<div class="surface-inspector-actions"><button type="submit" data-surface-inspector-propose-version="rollback">Propose Rollback To ' + escapeHtml(versionState.rollbackVersion || 'previous') + '</button></div>'
              + '</form>'
              : '<div class="surface-inspector-summary">' + escapeHtml(versionAuthority.reason || 'Sign in to propose version changes.') + '</div>'))
          : '')
        + (!versionAuthority.ok && canProposeVersion
          ? '<div class="surface-inspector-summary">Direct version changes are blocked here, but you can create a real version-change proposal from this live surface for later approval.</div>'
          : '')
        + '</section>'
      : '';
    const status = state.surfaceInspectorStatus?.message
      ? '<div class="surface-inspector-status" data-level="' + escapeHtml(state.surfaceInspectorStatus.level || 'ok') + '">' + escapeHtml(state.surfaceInspectorStatus.message) + '</div>'
      : '';
    const graphError = state.surfaceInspectorGraphError
      ? '<div class="surface-inspector-status" data-level="error">' + escapeHtml(state.surfaceInspectorGraphError) + '</div>'
      : '';
    return '<aside class="surface-inspector-panel" data-surface-inspector-panel>'
      + '<div class="surface-inspector-meta">Live Page Inspector</div>'
      + '<h2>' + escapeHtml(widgetId || 'Inspect Page') + '</h2>'
      + '<div class="surface-inspector-summary">' + escapeHtml(summary) + '</div>'
      + status
      + graphError
      + '<div class="surface-inspector-actions">'
        + '<button type="button" data-surface-inspector-close>Close Inspector</button>'
        + (widgetId ? '<button type="button" data-surface-inspector-clear>Clear Selection</button>' : '')
        + '<button type="button" data-surface-inspector-refresh>Refresh Metadata</button>'
      + '</div>'
      + (rows.length
        ? '<div class="surface-inspector-grid">' + rows.map(([label, value]) =>
            '<div class="surface-inspector-row"><div class="surface-inspector-label">' + escapeHtml(label) + '</div><div class="surface-inspector-value">' + escapeHtml(value) + '</div></div>'
          ).join('') + '</div>'
        : '')
      + (actions ? '<div class="surface-inspector-actions">' + actions + '</div>' : '')
      + versions
      + renderSurfaceInspectorEditor()
    + '</aside>';
  };
  const renderSurfaceInspectorMenu = () => {
    if (!liveSurfaceInspectable || !state.surfaceInspectorMenu?.widgetId) return '';
    const widgetId = String(state.surfaceInspectorMenu.widgetId || '');
    const x = Math.max(12, Math.min(Number(state.surfaceInspectorMenu.x) || 12, window.innerWidth - 236));
    const y = Math.max(12, Math.min(Number(state.surfaceInspectorMenu.y) || 12, window.innerHeight - 220));
    const selectedSource = selectedSurfaceWidgetSource();
    const processSelection = selectedSurfaceInspectorProcessSelection();
    return '<div class="surface-inspector-menu" data-surface-inspector-menu style="left:' + x + 'px;top:' + y + 'px">'
      + '<div class="surface-inspector-meta">Widget</div>'
      + '<p>' + escapeHtml(widgetId) + '</p>'
      + '<button type="button" data-surface-inspector-select>Inspect Widget</button>'
      + '<button type="button" data-surface-inspector-world>Open In World</button>'
      + '<button type="button" data-surface-inspector-world-mode="witness">Show Witnesses</button>'
      + (selectedSource?.file ? '<button type="button" data-surface-inspector-world-mode="source">Show Source</button>' : '')
      + (processSelection ? '<button type="button" data-surface-inspector-open-process>Open Process View</button>' : '')
    + '</div>';
  };
  const liveSurfaceWidgetRows = () => {
    if (!liveSurfaceInspectable) return [];
    const rootWidget = byWidget(program.rootWidget);
    if (!rootWidget) return [];
    const widgetIds = [];
    rootWidget.querySelectorAll('[data-widget]').forEach(element => {
      const widgetId = element.getAttribute('data-widget') || '';
      if (widgetId && !widgetIds.includes(widgetId)) widgetIds.push(widgetId);
    });
    return widgetIds.map(widgetId => {
      const node = state.surfaceInspectorGraphById?.[widgetId] || null;
      return {
        id: widgetId,
        label: String(node?.label || widgetId),
        kind: String(node?.kind || 'widget'),
        context: String(node?.context || ''),
        source: (node?.sources || []).slice(-1)[0] || null,
        processSelection: node?.processSelection?.program && node?.processSelection?.event
          ? node.processSelection
          : deriveSurfaceInspectorProcessSelection(widgetId),
        versionState: node?.widgetVersionState || null,
        versionRows: node?.widgetVersions || []
      };
    });
  };
  const buildSurfaceCommandCatalog = () => {
    const items = [];
    const push = item => {
      if (!item?.id || !item?.action?.kind) return;
      items.push(item);
    };
    const widgetRows = liveSurfaceWidgetRows();
    const selectedWidget = widgetRows.find(row => row.id === selectedSurfaceWidgetId()) || null;
    const graphNodes = Array.isArray(state.surfaceInspectorGraph?.nodes)
      ? state.surfaceInspectorGraph.nodes
      : Object.values(state.surfaceInspectorGraphById || {});
    const widgetIds = new Set(widgetRows.map(row => row.id));
    const signedInIdentity = typeof state.session?.identity === 'string' ? state.session.identity : '';
    const signedInActor = typeof state.session?.actor === 'string' ? state.session.actor : '';
    const signedInLabel = typeof state.session?.label === 'string' ? state.session.label : '';
    const currentIdentitySource = currentSurfaceIdentitySource();
    const routeValue = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return row?.value?.type === 'string' ? String(row.value.value || '') : '';
    };
    push({
      id: 'surface-command:whoami',
      type: 'command',
      title: 'whoami',
      subtitle: signedInIdentity || 'user',
      search: 'whoami current user identity session sourcerer command surface',
      priority: 320,
      action: { kind: 'surface-whoami' }
    });
    if (signedInIdentity) {
      push({
        id: 'surface-command:identity-world',
        type: 'identity',
        title: 'Open Current User',
        subtitle: signedInIdentity,
        search: 'open current user identity world record session ' + signedInIdentity + ' ' + signedInActor + ' ' + signedInLabel,
        priority: 318,
        action: { kind: 'world-navigate', select: signedInIdentity }
      });
      if (currentIdentitySource?.file) {
        push({
          id: 'surface-command:identity-source',
          type: 'source',
          title: 'Open Current User Source',
          subtitle: currentIdentitySource.file,
          search: 'open current user identity source record ' + signedInIdentity + ' ' + currentIdentitySource.file,
          priority: 317,
          action: { kind: 'world-navigate', select: signedInIdentity, mode: 'source' }
        });
      }
    }
    for (const row of widgetRows) {
      const keywords = [row.id, row.label, row.kind, row.context].filter(Boolean).join(' ');
      push({
        id: 'surface-widget:' + row.id,
        type: 'widget',
        title: 'Inspect Widget ' + row.label,
        subtitle: row.id + (row.context ? ' / ' + row.context : ''),
        search: 'inspect widget live page rendered current surface ' + keywords,
        priority: row.id === selectedSurfaceWidgetId() ? 250 : 220,
        action: { kind: 'inspect-widget', widgetId: row.id }
      });
      if (row.processSelection?.program && row.processSelection?.event) {
        push({
          id: 'surface-widget-process:' + row.id,
          type: 'execution',
          title: 'Open Process For ' + row.label,
          subtitle: row.processSelection.event,
          search: 'open process witnessed execution live page widget ' + keywords + ' ' + row.processSelection.program + ' ' + row.processSelection.event,
          priority: 216,
          action: { kind: 'navigate', href: processViewHref(row.processSelection) }
        });
      }
      if (row.source?.file) {
        push({
          id: 'surface-widget-source:' + row.id,
          type: 'source',
          title: 'Show Source For ' + row.label,
          subtitle: row.source.file,
          search: 'show source live page widget witnessed source ' + keywords + ' ' + row.source.file,
          priority: 214,
          action: { kind: 'world-navigate', select: row.id, mode: 'source' }
        });
      }
    }
    if (selectedWidget) {
      push({
        id: 'surface-selected-world:' + selectedWidget.id,
        type: 'command',
        title: 'Open Selected Widget In World',
        subtitle: selectedWidget.id,
        search: 'open selected widget world witnesses graph ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 260,
        action: { kind: 'world-navigate', select: selectedWidget.id }
      });
      push({
        id: 'surface-selected-witness:' + selectedWidget.id,
        type: 'command',
        title: 'Show Witnesses For Selected Widget',
        subtitle: selectedWidget.id,
        search: 'show witnesses selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label,
        priority: 258,
        action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'witness' }
      });
      if (selectedWidget.source?.file) {
        push({
          id: 'surface-selected-source:' + selectedWidget.id,
          type: 'command',
          title: 'Show Source For Selected Widget',
          subtitle: selectedWidget.source.file,
          search: 'show source selected widget live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.source.file,
          priority: 256,
          action: { kind: 'world-navigate', select: selectedWidget.id, mode: 'source' }
        });
      }
      if (selectedWidget.processSelection?.program && selectedWidget.processSelection?.event) {
        push({
          id: 'surface-selected-process:' + selectedWidget.id,
          type: 'command',
          title: 'Open Process For Selected Widget',
          subtitle: selectedWidget.processSelection.event,
          search: 'open process selected widget witnessed execution live page ' + selectedWidget.id + ' ' + selectedWidget.label + ' ' + selectedWidget.processSelection.program + ' ' + selectedWidget.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedWidget.processSelection) }
        });
      }
      for (const row of selectedWidget.versionRows.filter(entry => !entry.isActive)) {
        push({
          id: 'surface-selected-version:' + row.soul + ':' + row.version,
          type: 'command',
          title: 'Upgrade Selected Widget To ' + row.version,
          subtitle: row.soul,
          search: 'upgrade activate version selected widget live page ' + row.soul + ' ' + row.version,
          priority: 252,
          action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
        });
      }
      if (selectedWidget.versionState?.rollbackAvailable) {
        push({
          id: 'surface-selected-rollback:' + selectedWidget.versionState.soul,
          type: 'command',
          title: 'Rollback Selected Widget To ' + selectedWidget.versionState.rollbackVersion,
          subtitle: selectedWidget.versionState.soul,
          search: 'rollback selected widget version live page ' + selectedWidget.versionState.soul + ' ' + selectedWidget.versionState.rollbackVersion,
          priority: 251,
          action: { kind: 'widget-version-rollback', soul: selectedWidget.versionState.soul }
        });
      }
    }
    for (const surface of runtimeSurfacesFor('app-command')) {
      push({
        id: surface.id,
        type: surface.type || 'surface',
        title: surface.title,
        subtitle: surface.subtitle,
        search: surface.search,
        priority: 205,
        action: surface?.action && typeof surface.action === 'object'
          ? { ...surface.action }
          : { kind: 'navigate', href: surface.href }
      });
    }
    for (const node of graphNodes) {
      if (!node?.id) continue;
      const label = String(node.label || node.id);
      const kind = String(node.kind || 'thing');
      const keywords = [node.id, label, kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
      const source = (node.sources || []).slice(-1)[0] || null;
      if (!widgetIds.has(node.id)) {
        push({
          id: 'surface-world-node:' + node.id,
          type: kind,
          title: 'Open In World: ' + label,
          subtitle: kind + (node.context ? ' / ' + node.context : ''),
          search: 'open in world graph object capability widget route process source ' + keywords,
          priority: kind === 'capability' ? 198 : 170,
          action: { kind: 'world-navigate', select: node.id }
        });
      }
      if (kind === 'route') {
        const routePath = routeValue(node, 'path');
        const routeMethod = routeValue(node, 'method');
        if (routePath && routeMethod === 'GET') {
          push({
            id: 'surface-route:' + node.id,
            type: 'page',
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'open page route surface ' + routePath + ' ' + keywords,
            priority: 215,
            action: { kind: 'navigate', href: routePath }
          });
        }
      }
      if (source?.file) {
        push({
          id: 'surface-source:' + node.id,
          type: 'source',
          title: 'Show Source For ' + label,
          subtitle: source.file,
          search: 'show source witnessed file dsl ' + keywords + ' ' + source.file,
          priority: 166,
          action: { kind: 'world-navigate', select: node.id, mode: 'source' }
        });
      }
      if (node.processSelection?.program && node.processSelection?.event) {
        push({
          id: 'surface-process:' + node.id,
          type: 'execution',
          title: 'Open Process For ' + label,
          subtitle: node.processSelection.event,
          search: 'open process witnessed execution ' + keywords + ' ' + node.processSelection.program + ' ' + node.processSelection.event,
          priority: 167,
          action: { kind: 'navigate', href: processViewHref(node.processSelection) }
        });
      }
    }
    return [...new Map(items.map(item => [item.id, item])).values()];
  };
  const scoreSurfaceCommandItem = (item, query) => {
    if (!query) return item.priority || 0;
    const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
    const title = String(item.title || '').toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return item.priority || 0;
    let score = item.priority || 0;
    for (const term of terms) {
      if (title === term) score += 220;
      else if (title.startsWith(term)) score += 120;
      else if (title.includes(term)) score += 70;
      else if (haystack.includes(term)) score += 25;
      else return -1;
    }
    return score;
  };
  const visibleSurfaceCommands = () => {
    const query = String(state.surfaceCommandQuery || '').trim();
    return buildSurfaceCommandCatalog()
      .map(item => ({ ...item, score: scoreSurfaceCommandItem(item, query) }))
      .filter(item => item.score >= 0)
      .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
      .slice(0, query ? 24 : 12);
  };
  const renderSurfaceWhoamiResult = whoami => {
    if (!whoami) return '';
    const contextOptions = [''].concat(
      [...new Set([
        whoami.homeContextValue || '',
        ...((whoami.contextOptions || []).map(value => String(value || '')).filter(Boolean))
      ])]
    );
    const editStatus = whoami.statusMessage
      ? '<div class="surface-inspector-status" data-level="' + escapeHtml(whoami.statusLevel || 'ok') + '">' + escapeHtml(whoami.statusMessage) + '</div>'
      : '';
    const inlineEditor = whoami.authenticated
      ? (whoami.editorReady
          ? '<form class="surface-inspector-form" data-surface-command-identity-form data-identity-id="' + escapeHtml(whoami.identity || '') + '">'
              + '<label class="surface-inspector-field"><span>Label</span><input name="label" value="' + escapeHtml(String(whoami.title || '')) + '" /></label>'
              + '<label class="surface-inspector-field"><span>Username</span><input name="username" value="' + escapeHtml(String(whoami.username || '')) + '" /></label>'
              + '<label class="surface-inspector-field"><span>New Password</span><input name="password" type="password" placeholder="leave unchanged" /></label>'
              + '<label class="surface-inspector-field"><span>Home Context</span><select name="homeContext">' + contextOptions.map(value =>
                  '<option value="' + escapeHtml(value) + '"' + (value === String(whoami.homeContextValue || '') ? ' selected' : '') + '>' + escapeHtml(value || '(none)') + '</option>'
                ).join('') + '</select></label>'
              + '<label class="surface-inspector-field"><span>Home Perspective</span><input name="homePerspective" value="' + escapeHtml(String(whoami.homePerspectiveValue || '')) + '" /></label>'
              + '<div class="surface-inspector-actions"><button type="submit" data-surface-command-identity-save>Save Identity Here</button></div>'
            + '</form>'
          : '<div class="world-command-meta">' + escapeHtml(whoami.editorError || (whoami.editorLoading ? 'Loading inline identity editor...' : 'Inline identity editor is unavailable right now.')) + '</div>')
      : '';
    return '<section class="world-command-result" data-surface-command-result="whoami">'
      + '<strong>' + escapeHtml(whoami.title) + '</strong>'
      + '<div class="world-command-meta">' + escapeHtml(whoami.subtitle || '') + '</div>'
      + '<div class="world-command-result-grid">' + (whoami.rows || []).map(([key, value]) =>
          '<div class="world-command-result-row"><div class="world-command-result-key">' + escapeHtml(key) + '</div><div class="world-command-result-value">' + escapeHtml(value) + '</div></div>'
        ).join('') + '</div>'
      + '<div class="world-command-meta">' + escapeHtml(whoami.note || '') + '</div>'
      + editStatus
      + inlineEditor
      + '<div class="world-command-result-actions">'
        + (whoami.identity ? '<button type="button" data-surface-command-result-world>Open User</button>' : '')
        + (whoami.source?.file ? '<button type="button" data-surface-command-result-source>Open Source</button>' : '')
        + (whoami.bootstrapHref ? '<button type="button" data-surface-command-result-bootstrap>Edit In Bootstrap</button>' : '')
      + '</div>'
    + '</section>';
  };
  const renderSurfaceCommandPalette = () => {
    if (!liveSurfaceInspectable || !state.surfaceCommandOpen) return '';
    const query = String(state.surfaceCommandQuery || '');
    const items = visibleSurfaceCommands();
    const whoami = state.surfaceCommandResult?.kind === 'whoami' ? state.surfaceCommandResult : null;
    const graphNotice = state.surfaceInspectorGraphError
      ? '<div class="surface-inspector-status" data-level="error">' + escapeHtml(state.surfaceInspectorGraphError) + '</div>'
      : (!state.surfaceInspectorGraphLoaded
          ? '<div class="world-command-meta">Loading world graph metadata for capabilities, routes, and source handoffs...</div>'
          : '');
    const currentSelection = selectedSurfaceWidgetId()
      ? '<div class="world-command-meta">Selected widget / ' + escapeHtml(selectedSurfaceWidgetId()) + '</div>'
      : '<div class="world-command-meta">No widget selected yet. Search current-page widgets to inspect them in place.</div>';
    const results = items.length
      ? items.map((item, index) => '<button class="world-command-item" data-surface-command-run="' + index + '"><strong>' + escapeHtml(item.title) + '</strong><span class="world-command-meta">' + escapeHtml(item.type) + (item.subtitle ? ' / ' + escapeHtml(item.subtitle) : '') + '</span></button>').join('')
      : '<div class="world-command-empty">No matching pages, widgets, capabilities, or commands.</div>';
    const resultCard = renderSurfaceWhoamiResult(whoami);
    return '<section class="surface-command-palette world-command-palette" data-surface-command-palette>'
      + '<div class="world-command-head">'
        + '<input class="world-command-input" data-surface-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />'
        + '<button class="world-command-toggle" data-surface-command-close>Close</button>'
      + '</div>'
      + currentSelection
      + graphNotice
      + resultCard
      + '<div class="world-command-list">' + results + '</div>'
    + '</section>';
  };
  const executeSurfaceCommand = async item => {
    if (!item?.action) return;
    const action = item.action;
    state.surfaceCommandOpen = false;
    state.surfaceCommandQuery = '';
    state.surfaceCommandFocusRequested = false;
    state.surfaceCommandResult = null;
    if (action.kind === 'navigate') {
      window.location.assign(action.href);
      return;
    }
    if (action.kind === 'surface-whoami') {
      openSurfaceWhoami();
      return;
    }
    if (action.kind === 'inspect-widget') {
      await selectSurfaceInspectorWidget(action.widgetId || '');
      updateSurfaceInspectorUi();
      return;
    }
    if (action.kind === 'world-navigate') {
      window.location.assign(worldSurfaceHref({ select: action.select || '', mode: action.mode || '' }));
      return;
    }
    if (action.kind === 'widget-version-activate') {
      setSurfaceInspectorStatus('Activating ' + (action.version || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await activateSurfaceWidgetVersion({ soul: action.soul || '', version: action.version || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version activation failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Activated ' + (action.version || '') + (result.body?.status ? ' (' + result.body.status + ')' : '.')
      });
      return;
    }
    if (action.kind === 'widget-version-rollback') {
      setSurfaceInspectorStatus('Rolling back ' + (action.soul || '') + '...', 'ok');
      updateSurfaceInspectorUi();
      const result = await rollbackSurfaceWidgetVersion({ soul: action.soul || '' });
      if (!result.ok) {
        setSurfaceInspectorStatus(result.body?.error || 'Widget version rollback failed.', 'error');
        updateSurfaceInspectorUi();
        return;
      }
      invalidateSurfaceInspectorGraph();
      await refreshProjection();
      await selectSurfaceInspectorWidget(action.soul || '', {
        refreshGraph: true,
        statusMessage: 'Rolled back to ' + (result.body?.version || 'the previous version') + '.'
      });
    }
  };
  const updateSurfaceInspectorUi = () => {
    if (!liveSurfaceInspectable) return;
    let overlay = document.getElementById('surface-inspector-root');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'surface-inspector-root';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML =
      '<button type="button" class="surface-command-toggle world-command-toggle" data-surface-command-toggle>'
        + (state.surfaceCommandOpen ? 'Close Search' : 'Search / Command')
      + '</button>'
      + renderSurfaceCommandPalette()
      +
      '<button type="button" class="surface-inspector-toggle" data-surface-inspector-toggle>'
        + (state.surfaceInspectorOpen ? 'Close Inspector' : 'Inspect Page')
      + '</button>'
      + renderSurfaceInspectorPanel()
      + renderSurfaceInspectorMenu();
    overlay.querySelectorAll('[data-surface-command-toggle]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceCommandOpen = !state.surfaceCommandOpen;
        if (state.surfaceCommandOpen) {
          state.surfaceCommandFocusRequested = true;
          void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        } else {
          state.surfaceCommandQuery = '';
          state.surfaceCommandResult = null;
        }
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-command-close]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceCommandOpen = false;
        state.surfaceCommandQuery = '';
        state.surfaceCommandResult = null;
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-command-input]').forEach(node => {
      node.addEventListener('input', () => {
        state.surfaceCommandQuery = node.value || '';
        if (String(node.value || '').trim().toLowerCase() !== 'whoami') state.surfaceCommandResult = null;
        state.surfaceCommandFocusRequested = true;
        updateSurfaceInspectorUi();
      });
      node.addEventListener('keydown', async event => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const items = visibleSurfaceCommands();
        if (items[0]) await executeSurfaceCommand(items[0]);
      });
    });
    overlay.querySelectorAll('[data-surface-command-run]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const index = Number(node.getAttribute('data-surface-command-run'));
        const items = visibleSurfaceCommands();
        if (Number.isFinite(index) && items[index]) await executeSurfaceCommand(items[index]);
      });
    });
    overlay.querySelectorAll('[data-surface-command-result-world]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const identity = state.surfaceCommandResult?.identity || '';
        if (!identity) return;
        window.location.assign(worldSurfaceHref({ select: identity }));
      });
    });
    overlay.querySelectorAll('[data-surface-command-result-source]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const identity = state.surfaceCommandResult?.identity || '';
        if (!identity) return;
        window.location.assign(worldSurfaceHref({ select: identity, mode: 'source' }));
      });
    });
    overlay.querySelectorAll('[data-surface-command-result-bootstrap]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const href = state.surfaceCommandResult?.bootstrapHref || '';
        if (!href) return;
        window.location.assign(href);
      });
    });
    overlay.querySelectorAll('[data-surface-command-identity-form]').forEach(node => {
      node.addEventListener('submit', async event => {
        event.preventDefault();
        const whoami = state.surfaceCommandResult?.kind === 'whoami' ? state.surfaceCommandResult : null;
        const identityId = node.getAttribute('data-identity-id') || whoami?.identity || '';
        const currentIdentity = currentSurfaceIdentityRecord();
        if (!whoami?.authenticated || !identityId || !currentIdentity) {
          state.surfaceCommandResult = {
            ...buildSurfaceWhoamiResult(),
            statusMessage: 'Inline identity editor is not ready yet.',
            statusLevel: 'error'
          };
          updateSurfaceInspectorUi();
          return;
        }
        const formData = new FormData(node);
        const label = String(formData.get('label') ?? '').trim();
        const username = String(formData.get('username') ?? '').trim();
        const password = String(formData.get('password') ?? '');
        const homeContext = String(formData.get('homeContext') ?? '').trim();
        const homePerspective = String(formData.get('homePerspective') ?? '').trim();
        const patch = {};
        if (label !== String(currentIdentity.label ?? '')) patch.label = label;
        if (username !== String(currentIdentity.username ?? '')) patch.username = username;
        if (homeContext !== String(currentIdentity.homeContext ?? '')) patch.homeContext = homeContext;
        if (homePerspective !== String(currentIdentity.homePerspective ?? '')) patch.homePerspective = homePerspective;
        if (password) patch.password = password;
        if (!Object.keys(patch).length) {
          state.surfaceCommandResult = {
            ...buildSurfaceWhoamiResult(),
            statusMessage: 'No identity changes to save.',
            statusLevel: 'ok'
          };
          updateSurfaceInspectorUi();
          return;
        }
        state.surfaceCommandResult = {
          ...buildSurfaceWhoamiResult(),
          statusMessage: 'Saving ' + identityId + '...',
          statusLevel: 'ok'
        };
        updateSurfaceInspectorUi();
        const result = await patchSurfaceIdentity({ id: identityId, patch });
        if (!result.ok) {
          state.surfaceCommandResult = {
            ...buildSurfaceWhoamiResult(),
            statusMessage: result.body?.error || 'Identity save failed.',
            statusLevel: 'error'
          };
          updateSurfaceInspectorUi();
          return;
        }
        if (result.body?.session && typeof result.body.session === 'object') {
          state.session = result.body.session;
          applyTheme();
        }
        if (result.body?.identity && typeof result.body.identity === 'object') {
          const identity = result.body.identity;
          const identities = Array.isArray(state.surfaceBootstrapIdentities) ? state.surfaceBootstrapIdentities.slice() : [];
          const index = identities.findIndex(row => row?.id === identity.id);
          if (index >= 0) identities[index] = identity;
          else identities.push(identity);
          state.surfaceBootstrapIdentities = identities;
          state.surfaceBootstrapIdentitiesById = Object.fromEntries(identities.map(row => [row.id, row]));
        }
        state.surfaceCommandResult = {
          ...buildSurfaceWhoamiResult(),
          statusMessage: 'Saved ' + identityId + '.',
          statusLevel: 'ok'
        };
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-toggle]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        state.surfaceInspectorOpen = !state.surfaceInspectorOpen;
        if (!state.surfaceInspectorOpen) {
          state.surfaceInspectorMenu = null;
          clearSurfaceInspectorHighlight();
        } else {
          setSurfaceInspectorStatus('Inspector enabled. Right-click any widget on the live page.', 'ok');
          if (selectedSurfaceWidgetId()) applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
        }
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-close]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorOpen = false;
        state.surfaceInspectorMenu = null;
        clearSurfaceInspectorHighlight();
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-clear]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorSelectedId = '';
        state.surfaceInspectorMenu = null;
        clearSurfaceInspectorHighlight();
        setSurfaceInspectorStatus('Selection cleared. Right-click another widget to inspect it.', 'ok');
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-refresh]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        if (!selectedSurfaceWidgetId()) {
          invalidateSurfaceInspectorGraph();
          invalidateSurfaceInspectorWidgets();
          setSurfaceInspectorStatus('Inspector metadata refreshed.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        await selectSurfaceInspectorWidget(selectedSurfaceWidgetId(), {
          refreshGraph: true,
          statusMessage: 'Inspector metadata refreshed for ' + selectedSurfaceWidgetId() + '.'
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-select]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        state.surfaceInspectorMenu = null;
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-world]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const widgetId = selectedSurfaceWidgetId();
        if (!widgetId) return;
        window.location.assign(worldSurfaceHref({ select: widgetId }));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-world-mode]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const widgetId = selectedSurfaceWidgetId();
        if (!widgetId) return;
        const mode = node.getAttribute('data-surface-inspector-world-mode') || '';
        window.location.assign(worldSurfaceHref({ select: widgetId, mode }));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-open-process]').forEach(node => {
      node.addEventListener('click', event => {
        event.preventDefault();
        const selection = selectedSurfaceInspectorProcessSelection();
        if (!selection?.program || !selection?.event) return;
        window.location.assign(processViewHref(selection));
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-activate]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const soul = node.getAttribute('data-surface-inspector-activate') || '';
        const version = node.getAttribute('data-surface-inspector-version') || '';
        if (!soul || !version) return;
        setSurfaceInspectorStatus('Activating ' + version + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await activateSurfaceWidgetVersion({ soul, version });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget version activation failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        await refreshProjection();
        await selectSurfaceInspectorWidget(soul, {
          refreshGraph: true,
          statusMessage: 'Activated ' + version + (result.body?.status ? ' (' + result.body.status + ')' : '.')
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-rollback]').forEach(node => {
      node.addEventListener('click', async event => {
        event.preventDefault();
        const soul = node.getAttribute('data-surface-inspector-rollback') || '';
        if (!soul) return;
        setSurfaceInspectorStatus('Rolling back ' + soul + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await rollbackSurfaceWidgetVersion({ soul });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget version rollback failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        await refreshProjection();
        await selectSurfaceInspectorWidget(soul, {
          refreshGraph: true,
          statusMessage: 'Rolled back to ' + (result.body?.version || 'the previous version') + '.'
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-edit-form]').forEach(node => {
      node.addEventListener('submit', async event => {
        event.preventDefault();
        const widgetId = node.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        if (!widgetId) return;
        const current = selectedSurfaceWidgetAuthored();
        if (!current) {
          setSurfaceInspectorStatus('Authored widget state is not available for editing.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const authority = selectedSurfaceWidgetEditAuthority();
        if (!authority.ok) {
          setSurfaceInspectorStatus(authority.reason || 'This widget is read-only right now.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const formData = new FormData(node);
        const hiddenField = node.querySelector('[name="hidden"]');
        const patch = {
          text: String(formData.get('text') ?? ''),
          title: String(formData.get('title') ?? ''),
          class: String(formData.get('class') ?? ''),
          hidden: hiddenField instanceof HTMLInputElement ? hiddenField.checked : false
        };
        const currentProps = current.props || {};
        if (
          (currentProps.text ?? '') === patch.text
          && (currentProps.title ?? '') === patch.title
          && (currentProps.class ?? '') === patch.class
          && Boolean(currentProps.hidden === true) === patch.hidden
        ) {
          setSurfaceInspectorStatus('No widget changes to save.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        setSurfaceInspectorStatus('Saving ' + widgetId + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await patchSurfaceWidget({ id: widgetId, patch });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Widget save failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        invalidateSurfaceInspectorGraph();
        invalidateSurfaceInspectorWidgets();
        await refreshProjection();
        await selectSurfaceInspectorWidget(widgetId, {
          refreshGraph: true,
          statusMessage: 'Saved ' + widgetId + '.'
        });
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-proposal-form]').forEach(node => {
      node.addEventListener('submit', async event => {
        event.preventDefault();
        const widgetId = node.getAttribute('data-widget-id') || selectedSurfaceWidgetId();
        if (!widgetId) return;
        const current = selectedSurfaceWidgetAuthored();
        if (!current) {
          setSurfaceInspectorStatus('Authored widget state is not available for proposal.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const authority = selectedSurfaceWidgetEditAuthority();
        if (authority.ok) {
          setSurfaceInspectorStatus('You already have direct authority here. Save the widget instead of proposing it.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        if (!currentActor()) {
          setSurfaceInspectorStatus(authority.reason || 'Sign in to propose changes.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const formData = new FormData(node);
        const hiddenField = node.querySelector('[name="hidden"]');
        const patch = {
          text: String(formData.get('text') ?? ''),
          title: String(formData.get('title') ?? ''),
          class: String(formData.get('class') ?? ''),
          hidden: hiddenField instanceof HTMLInputElement ? hiddenField.checked : false
        };
        const currentProps = current.props || {};
        if (
          (currentProps.text ?? '') === patch.text
          && (currentProps.title ?? '') === patch.title
          && (currentProps.class ?? '') === patch.class
          && Boolean(currentProps.hidden === true) === patch.hidden
        ) {
          setSurfaceInspectorStatus('No widget changes to propose.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        const reason = String(formData.get('reason') ?? '');
        setSurfaceInspectorStatus('Creating proposal for ' + widgetId + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await proposeSurfaceWidgetPatch({ id: widgetId, patch, reason });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Proposal creation failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        setSurfaceInspectorStatus('Proposed ' + widgetId + ' as ' + (result.body?.proposal?.id || result.proposalId) + '.', 'ok');
        updateSurfaceInspectorUi();
      });
    });
    overlay.querySelectorAll('[data-surface-inspector-version-proposal-form]').forEach(node => {
      node.addEventListener('submit', async event => {
        event.preventDefault();
        const processName = node.getAttribute('data-surface-inspector-proposal-process') || '';
        const soul = node.getAttribute('data-surface-inspector-proposal-soul') || '';
        const version = node.getAttribute('data-surface-inspector-proposal-version') || '';
        if (!processName || !soul) return;
        const authority = selectedSurfaceWidgetEditAuthority();
        if (authority.ok) {
          setSurfaceInspectorStatus('You already have direct authority here. Apply the version change directly instead of proposing it.', 'ok');
          updateSurfaceInspectorUi();
          return;
        }
        if (!currentActor()) {
          setSurfaceInspectorStatus(authority.reason || 'Sign in to propose version changes.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        const formData = new FormData(node);
        const reason = String(formData.get('reason') ?? '');
        const actionLabel = processName === 'widgetVersion.rollback'
          ? ('rollback ' + soul)
          : ('activate ' + version);
        setSurfaceInspectorStatus('Creating proposal to ' + actionLabel + '...', 'ok');
        updateSurfaceInspectorUi();
        const result = await proposeSurfaceWidgetVersionAction({ targetProcess: processName, soul, version, reason });
        if (!result.ok) {
          setSurfaceInspectorStatus(result.body?.error || 'Version proposal creation failed.', 'error');
          updateSurfaceInspectorUi();
          return;
        }
        setSurfaceInspectorStatus('Proposed ' + actionLabel + ' as ' + (result.body?.proposal?.id || result.proposalId) + '.', 'ok');
        updateSurfaceInspectorUi();
      });
    });
    if (state.surfaceCommandOpen && state.surfaceCommandFocusRequested !== false) {
      const input = overlay.querySelector('[data-surface-command-input]');
      if (input) {
        input.focus();
        const length = input.value.length;
        input.setSelectionRange(length, length);
      }
      state.surfaceCommandFocusRequested = false;
    }
  };
  const bootSurfaceInspector = () => {
    if (!liveSurfaceInspectable || state.surfaceInspectorBooted) return;
    state.surfaceInspectorBooted = true;
    updateSurfaceInspectorUi();
    document.addEventListener('contextmenu', event => {
      if (!state.surfaceInspectorOpen) return;
      const rootWidget = byWidget(program.rootWidget);
      const target = event.target?.closest?.('[data-widget]');
      if (!rootWidget || !target || !rootWidget.contains(target)) return;
      const widgetId = target.getAttribute('data-widget') || '';
      if (!widgetId) return;
      event.preventDefault();
      state.surfaceInspectorMenu = {
        widgetId,
        x: event.clientX,
        y: event.clientY
      };
      void selectSurfaceInspectorWidget(widgetId).catch(error => {
        setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
        updateSurfaceInspectorUi();
      });
    }, true);
    document.addEventListener('click', event => {
      if (!state.surfaceInspectorMenu) return;
      if (event.target?.closest?.('.surface-inspector-menu')) return;
      state.surfaceInspectorMenu = null;
      updateSurfaceInspectorUi();
    }, true);
    window.addEventListener('keydown', event => {
      const active = document.activeElement;
      const typing = active?.matches?.('input, textarea, select') || active?.isContentEditable;
      const key = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === 'k') {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === 'F1') {
        event.preventDefault();
        void ensureSurfaceInspectorGraph().then(() => {
          openSurfaceWhoami();
        }).catch(error => {
          setSurfaceInspectorStatus(error instanceof Error ? error.message : String(error), 'error');
          openSurfaceWhoami();
        });
        return;
      }
      if (event.key === 'Escape' && state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = false;
        state.surfaceCommandQuery = '';
        state.surfaceCommandResult = null;
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key === '/' && !typing && !state.surfaceCommandOpen) {
        event.preventDefault();
        state.surfaceCommandOpen = true;
        state.surfaceCommandFocusRequested = true;
        void ensureSurfaceInspectorGraph().then(() => updateSurfaceInspectorUi()).catch(() => {});
        updateSurfaceInspectorUi();
        return;
      }
      if (event.key !== 'Escape') return;
      if (state.surfaceInspectorMenu) {
        event.preventDefault();
        state.surfaceInspectorMenu = null;
        updateSurfaceInspectorUi();
      }
    });
  };
  const commandTutorialStepById = new Map((commandTutorial?.steps || []).map(step => [step.id, step]));
  const commandTutorialConceptMap = new Map((commandTutorial?.concepts || []).map(concept => [concept.id, concept]));
  const commandTutorialPageLabel = page => page === 'app' ? 'App' : (page === 'bootstrap' ? 'Bootstrap' : (page === 'world' ? 'World' : String(page || '')));
  const commandTutorialPageHref = page => page === 'app' ? '/' : (page === 'bootstrap' ? '/_bootstrap' : (page === 'world' ? '/world' : null));
  const commandTutorialPageScopeKey = page => typeof page === 'string' && page.trim() ? ('page:' + page.trim()) : null;
  const commandTutorialChapterScopeKey = chapterId => typeof chapterId === 'string' && chapterId.trim() ? ('chapter:' + chapterId.trim()) : null;
  const commandTutorialStepScope = step => {
    if (!step) return null;
    const key = typeof step.scopeKey === 'string' && step.scopeKey.trim()
      ? step.scopeKey.trim()
      : (step.page === 'world' ? 'world' : commandTutorialPageScopeKey(step.page));
    if (!key) return null;
    const kind = typeof step.scopeKind === 'string' && step.scopeKind.trim()
      ? step.scopeKind.trim()
      : (key === 'world'
          ? 'world'
          : (key.startsWith('section:')
              ? 'section'
              : (key.startsWith('widget:')
                  ? 'widget'
                  : (key.startsWith('chapter:')
                      ? 'chapter'
                      : 'page'))));
    return {
      key,
      kind,
      page: typeof step.scopePage === 'string' && step.scopePage.trim() ? step.scopePage.trim() : (kind === 'world' ? 'world' : (step.page || null)),
      label: typeof step.scopeLabel === 'string' && step.scopeLabel.trim() ? step.scopeLabel.trim() : (step.title || ''),
      chapterId: step.chapterId || null,
      target: typeof step.target === 'string' && step.target.trim() ? step.target.trim() : null
    };
  };
  const commandTutorialScopeCatalog = new Map();
  const commandTutorialContextCatalog = new Map();
  const addCommandTutorialScope = info => {
    if (!info?.key) return;
    if (!commandTutorialScopeCatalog.has(info.key)) {
      commandTutorialScopeCatalog.set(info.key, { ...info });
      return;
    }
    commandTutorialScopeCatalog.set(info.key, {
      ...commandTutorialScopeCatalog.get(info.key),
      ...Object.fromEntries(Object.entries(info).filter(([, value]) => value != null && value !== ''))
    });
  };
  const addCommandTutorialContext = info => {
    if (!info?.id || commandTutorialContextCatalog.has(info.id)) return;
    commandTutorialContextCatalog.set(info.id, { ...info });
  };
  const commandTutorialContextLabel = contextId => typeof contextId === 'string' && contextId.trim()
    ? (contextId.trim().charAt(0).toUpperCase() + contextId.trim().slice(1) + ' context')
    : null;
  const commandTutorialStepSurfaceContext = step => {
    if (!step) return null;
    const contextId = typeof step.surfaceContextId === 'string' && step.surfaceContextId.trim() ? step.surfaceContextId.trim() : '';
    if (!contextId) return null;
    return {
      id: contextId,
      label: typeof step.surfaceContextLabel === 'string' && step.surfaceContextLabel.trim() ? step.surfaceContextLabel.trim() : commandTutorialContextLabel(contextId)
    };
  };
  for (const scope of commandTutorial?.scopes || []) addCommandTutorialScope(commandTutorialStepScope(scope));
  for (const step of commandTutorial?.steps || []) {
    addCommandTutorialScope(commandTutorialStepScope(step));
    addCommandTutorialContext(commandTutorialStepSurfaceContext(step));
    if (step.page) addCommandTutorialScope({ key: commandTutorialPageScopeKey(step.page), kind: 'page', page: step.page, label: commandTutorialPageLabel(step.page) });
    if (step.page === 'world') addCommandTutorialScope({ key: 'world', kind: 'world', page: 'world', label: 'World surface' });
    if (step.chapterId) addCommandTutorialScope({ key: commandTutorialChapterScopeKey(step.chapterId), kind: 'chapter', chapterId: step.chapterId, label: step.chapterId });
  }
  const commandTutorialScopeInfo = scopeKey => commandTutorialScopeCatalog.get(typeof scopeKey === 'string' ? scopeKey.trim() : '') || null;
  const commandTutorialContextInfo = contextId => commandTutorialContextCatalog.get(typeof contextId === 'string' ? contextId.trim() : '') || null;
  const commandTutorialScopeTargetName = scopeKey => {
    const key = typeof scopeKey === 'string' ? scopeKey.trim() : '';
    if (!key) return null;
    const authored = commandTutorialScopeInfo(key);
    if (authored?.target && (!authored.page || authored.page === 'world')) return authored.target;
    const preferred = (commandTutorial?.steps || []).find(step => commandTutorialStepScope(step)?.key === key && step.page === 'world' && typeof step.target === 'string' && step.target.trim());
    if (preferred?.target) return preferred.target.trim();
    const fallback = (commandTutorial?.steps || []).find(step => commandTutorialStepScope(step)?.key === key && typeof step.target === 'string' && step.target.trim());
    return fallback?.target?.trim() || null;
  };
  const normalizeWorldTutorialProgress = progress => {
    if (!progress || typeof progress !== 'object') return null;
    const step = commandTutorialStepById.get(progress.stepId || '') || commandTutorial?.steps?.[0] || null;
    const disabledScopeKeys = [];
    const disabledContextIds = [];
    if (Array.isArray(progress.disabledScopeKeys)) {
      for (const key of progress.disabledScopeKeys.map(String).map(value => value.trim()).filter(Boolean)) {
        if (commandTutorialScopeInfo(key) && !disabledScopeKeys.includes(key)) disabledScopeKeys.push(key);
      }
    }
    if (Array.isArray(progress.disabledContextIds)) {
      for (const contextId of progress.disabledContextIds.map(String).map(value => value.trim()).filter(Boolean)) {
        if (commandTutorialContextInfo(contextId) && !disabledContextIds.includes(contextId)) disabledContextIds.push(contextId);
      }
    }
    for (const page of (Array.isArray(progress.disabledPages) ? progress.disabledPages : []).map(String).map(value => value.trim()).filter(Boolean)) {
      const pageKey = commandTutorialPageScopeKey(page);
      if (pageKey && commandTutorialScopeInfo(pageKey) && !disabledScopeKeys.includes(pageKey)) disabledScopeKeys.push(pageKey);
      if (page === 'world' && commandTutorialScopeInfo('world') && !disabledScopeKeys.includes('world')) disabledScopeKeys.push('world');
    }
    const stepScopeKey = commandTutorialStepScope(step)?.key || null;
    const chapterScopeKey = commandTutorialChapterScopeKey(step?.chapterId);
    const explicitReplayScopeKey = typeof progress.replayScopeKey === 'string' ? progress.replayScopeKey.trim() : '';
    const replayScopeKey = explicitReplayScopeKey && commandTutorialScopeInfo(explicitReplayScopeKey) && (explicitReplayScopeKey === stepScopeKey || explicitReplayScopeKey === chapterScopeKey)
      ? explicitReplayScopeKey
      : (typeof progress.replayStepId === 'string' && progress.replayStepId === step?.id ? stepScopeKey : null);
    const disabledPages = [];
    for (const key of disabledScopeKeys) {
      const scope = commandTutorialScopeInfo(key);
      if (!scope) continue;
      if (scope.kind === 'page' && scope.page && !disabledPages.includes(scope.page)) disabledPages.push(scope.page);
      if (scope.kind === 'world' && !disabledPages.includes('world')) disabledPages.push('world');
    }
    return {
      tutorialId: commandTutorial?.id || '',
      chapterId: step?.chapterId || null,
      stepId: step?.id || null,
      chapterStatus: typeof progress.chapterStatus === 'string' ? progress.chapterStatus : (step ? 'in_progress' : 'idle'),
      draftInputs: progress.draftInputs && typeof progress.draftInputs === 'object' ? progress.draftInputs : {},
      completedAt: typeof progress.completedAt === 'string' ? progress.completedAt : null,
      hidden: progress.hidden === true,
      disabledScopeKeys,
      disabledContextIds,
      replayScopeKey,
      disabledPages,
      replayStepId: replayScopeKey && step?.id ? step.id : null
    };
  };
  const commandTutorialStep = current => commandTutorialStepById.get(current?.stepId || '') || null;
  const commandTutorialPreviousStep = current => {
    const index = (commandTutorial?.steps || []).findIndex(step => step.id === current?.stepId);
    return index > 0 ? commandTutorial.steps[index - 1] : null;
  };
  const commandTutorialDisabledScopeKeysFor = current => normalizeWorldTutorialProgress(current)?.disabledScopeKeys || [];
  const commandTutorialDisabledContextIdsFor = current => normalizeWorldTutorialProgress(current)?.disabledContextIds || [];
  const commandTutorialDisabledPages = current => normalizeWorldTutorialProgress(current)?.disabledPages || [];
  const commandTutorialReplayScopeKeyFor = current => normalizeWorldTutorialProgress(current)?.replayScopeKey || null;
  const commandTutorialReplayStepId = current => normalizeWorldTutorialProgress(current)?.replayStepId || null;
  const commandTutorialStepConcepts = step => [...new Set((step?.concepts || []).map(String))].map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  const commandTutorialRevealedConcepts = current => {
    if (!commandTutorial?.steps?.length) return [];
    const currentIndex = current?.completedAt
      ? (commandTutorial.steps.length - 1)
      : commandTutorial.steps.findIndex(step => step.id === current?.stepId);
    if (currentIndex < 0) return [];
    const ids = [];
    for (const step of commandTutorial.steps.slice(0, currentIndex + 1)) {
      for (const concept of commandTutorialStepConcepts(step)) {
        if (!ids.includes(concept.id)) ids.push(concept.id);
      }
    }
    return ids.map(id => commandTutorialConceptMap.get(id)).filter(Boolean);
  };
  const commandTutorialScopeAncestors = scopeKey => {
    const scope = commandTutorialScopeInfo(scopeKey);
    if (!scope?.key) return [];
    const keys = [scope.key];
    if (scope.kind === 'widget' || scope.kind === 'section') {
      const pageKey = commandTutorialPageScopeKey(scope.page);
      if (pageKey) keys.push(pageKey);
      if (scope.page === 'world') keys.push('world');
    } else if (scope.kind === 'page' && scope.page === 'world') {
      keys.push('world');
    } else if (scope.kind === 'world') {
      const pageKey = commandTutorialPageScopeKey('world');
      if (pageKey) keys.push(pageKey);
    }
    return [...new Set(keys.filter(Boolean))];
  };
  const isCommandTutorialScopeDisabled = (current, scopeKey) => {
    const disabled = new Set(commandTutorialDisabledScopeKeysFor(current));
    return commandTutorialScopeAncestors(scopeKey).some(key => disabled.has(key));
  };
  const isCommandTutorialContextDisabled = (current, contextId) => {
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    return Boolean(normalizedContextId) && commandTutorialDisabledContextIdsFor(current).includes(normalizedContextId);
  };
  const worldTutorialSurfaceState = current => {
    const step = commandTutorialStep(current);
    if (!current || !step) return { kind: 'idle', page: null };
    if (current.completedAt) return { kind: 'completed', page: step.page || null };
    if (current.hidden) return { kind: 'hidden', page: step.page || null };
    if ((step.page || null) !== 'world') return { kind: 'offpage', page: step.page || null };
    const contextId = commandTutorialStepSurfaceContext(step)?.id || null;
    if (contextId && isCommandTutorialContextDisabled(current, contextId)) return { kind: 'disabled-context', page: step.page || null, contextId };
    const scopeKey = commandTutorialStepScope(step)?.key || null;
    if (scopeKey && isCommandTutorialScopeDisabled(current, scopeKey)) return { kind: 'disabled', page: step.page || null, scopeKey };
    return { kind: 'active', page: step.page || null, scopeKey };
  };
  const clearWorldTutorialScopeDisabled = (current, scopeKey = 'world') => {
    if (!current) return null;
    const keysToRemove = new Set(commandTutorialScopeAncestors(scopeKey));
    return normalizeWorldTutorialProgress({
      ...current,
      disabledScopeKeys: commandTutorialDisabledScopeKeysFor(current).filter(key => !keysToRemove.has(key)),
      disabledPages: []
    });
  };
  const disableWorldTutorialOnCurrentScope = current => {
    if (!current) return null;
    const scopeKey = commandTutorialStepScope(commandTutorialStep(current))?.key || 'world';
    return normalizeWorldTutorialProgress({
      ...current,
      hidden: false,
      disabledScopeKeys: [...new Set([...commandTutorialDisabledScopeKeysFor(current), scopeKey])],
      disabledPages: []
    });
  };
  const clearWorldTutorialContextDisabled = (current, contextId = currentSurfaceContext) => {
    if (!current) return null;
    const normalizedContextId = typeof contextId === 'string' ? contextId.trim() : '';
    if (!normalizedContextId) return normalizeWorldTutorialProgress(current);
    return normalizeWorldTutorialProgress({
      ...current,
      disabledContextIds: commandTutorialDisabledContextIdsFor(current).filter(id => id !== normalizedContextId)
    });
  };
  const disableWorldTutorialOnCurrentContext = current => {
    if (!current) return null;
    const contextId = typeof currentSurfaceContext === 'string' ? currentSurfaceContext.trim() : '';
    if (!contextId) return normalizeWorldTutorialProgress(current);
    return normalizeWorldTutorialProgress({
      ...current,
      hidden: false,
      disabledContextIds: [...new Set([...commandTutorialDisabledContextIdsFor(current), contextId])]
    });
  };
  const requestWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return;
    }
    const requestId = (state.worldTutorialRequestId || 0) + 1;
    state.worldTutorialRequestId = requestId;
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const res = await fetch(url, requestOptions({}, { url }));
    const body = await res.json().catch(() => ({ progress: null }));
    if (state.worldTutorialRequestId !== requestId) return;
    if (!res.ok) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = body?.error || 'tutorial request failed';
      state.worldTutorialLoaded = true;
      return;
    }
    state.worldTutorialProgress = normalizeWorldTutorialProgress(body.progress);
    state.worldTutorialError = null;
    state.worldTutorialLoaded = true;
  };
  const persistWorldTutorialProgress = async nextProgress => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: state.worldTutorialProgress } };
    }
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextProgress)
    }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = response.ok
      ? normalizeWorldTutorialProgress(body.progress || nextProgress)
      : normalizeWorldTutorialProgress(state.worldTutorialProgress);
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const clearWorldTutorialProgress = async () => {
    if (!commandTutorial?.id || !state.session?.authenticated) {
      state.worldTutorialProgress = null;
      state.worldTutorialError = null;
      state.worldTutorialLoaded = true;
      return { ok: true, body: { progress: null } };
    }
    const url = '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id);
    const response = await fetch(url, requestOptions({ method: 'DELETE' }, { url }));
    const body = await response.json().catch(() => ({ progress: null }));
    state.worldTutorialProgress = null;
    state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance reset failed');
    state.worldTutorialLoaded = true;
    return { ok: response.ok, body };
  };
  const syncSession = session => {
    const authenticated = Boolean(session?.authenticated);
    state.session = authenticated ? session : { authenticated: false, identity: null, actor: null, label: null, perspective: null };
    state.actor = state.session.actor || '';
    state.worldTutorialLoaded = false;
    state.worldTutorialProgress = null;
    state.worldTutorialError = null;
    applyTheme();
    updateSurfaceInspectorUi();
  };
  const traceEndpoint = '/api/process-events';
  const traceContext = { runId: null, stepId: null };
  const makeRunId = () => (globalThis.crypto?.randomUUID?.() || ('run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
  const withTraceContext = async (runId, stepId, fn) => {
    const previous = { ...traceContext };
    traceContext.runId = runId || previous.runId || null;
    traceContext.stepId = stepId || null;
    try {
      return await fn();
    } finally {
      traceContext.runId = previous.runId;
      traceContext.stepId = previous.stepId;
    }
  };
  const requestOptions = (options, { url = '', disableTrace = false } = {}) => {
    const next = { credentials: 'same-origin', ...(options || {}) };
    if (!disableTrace && url !== traceEndpoint && traceContext.runId) {
      next.headers = {
        ...(next.headers || {}),
        'x-witness-process-run': traceContext.runId,
        'x-witness-step-id': traceContext.stepId || ''
      };
    }
    return next;
  };
  const activateSurfaceWidgetVersion = async ({ soul, version }) => {
    const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/activate', requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version })
    }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/activate' }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const rollbackSurfaceWidgetVersion = async ({ soul }) => {
    const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/rollback', requestOptions({
      method: 'POST'
    }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback' }));
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, body };
  };
  const scopeFor = extra => ({ state, event: state.event || {}, ...extra });
  const traceStepBody = (process, body = {}) => ({
    process,
    runId: body.runId || '',
    program: body.program || program.id || '',
    event: body.event || '',
    nodeId: body.nodeId || '',
    op: body.op || '',
    status: body.status || '',
    frontier: Array.isArray(body.frontier) ? body.frontier : [],
    repeat: body.repeat ?? null,
    repeatCount: body.repeatCount ?? null,
    message: body.message || '',
    eventData: body.eventData ?? null,
    actor: currentActor() || '',
    timestamp: Date.now()
  });
  const recordProcessEvent = async (process, body = {}) => {
    try {
      await fetch(traceEndpoint, requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(traceStepBody(process, body))
      }, { url: traceEndpoint, disableTrace: true }));
    } catch {}
  };
  const evaluateExpression = (expression, scope) => {
    const names = Object.keys(scope);
    const values = Object.values(scope);
    return Function(...names, 'return (' + expression + ');')(...values);
  };
  const interpolateString = (value, scope) => {
    const text = String(value ?? '');
    const exact = text.match(/^\$\{([^}]+)\}$/);
    if (exact) {
      try { return evaluateExpression(exact[1], scope); }
      catch { return ''; }
    }
    return text.replace(/\$\{([^}]+)\}/g, (_, expression) => {
      try {
        const result = evaluateExpression(expression, scope);
        return result == null ? '' : String(result);
      } catch {
        return '';
      }
    });
  };
  const interpolateValue = (value, scope) => {
    if (typeof value === 'string') return interpolateString(value, scope);
    if (Array.isArray(value)) return value.map(item => interpolateValue(item, scope));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, interpolateValue(item, scope)]));
    return value;
  };
  const applyInterpolations = (root, scope) => {
    const applyElementAttrs = element => {
      for (const attr of [...element.attributes]) {
        if (!attr.value.includes('\${')) continue;
        const value = interpolateString(attr.value, scope);
        if (attr.name === 'selected' || attr.name === 'checked' || attr.name === 'disabled') {
          if (value === false || value === '' || value === 'false' || value == null) element.removeAttribute(attr.name);
          else element.setAttribute(attr.name, attr.name);
        } else if (value == null || value === false) {
          element.removeAttribute(attr.name);
        } else {
          element.setAttribute(attr.name, String(value));
        }
      }
    };
    if (root?.nodeType === Node.ELEMENT_NODE) applyElementAttrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let current;
    while ((current = walker.nextNode())) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current.textContent && current.textContent.includes('\${')) current.textContent = interpolateString(current.textContent, scope);
        continue;
      }
      applyElementAttrs(current);
    }
  };
  const instantiateTemplate = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const fragment = template.content.cloneNode(true);
    applyInterpolations(fragment, scope);
    return fragment;
  };
  const instantiateSelectOption = (templateId, scope) => {
    const template = byTemplate(templateId);
    if (!template) throw new Error('unknown template ' + templateId);
    const option = template.content.querySelector('option')?.cloneNode(true);
    if (!option) throw new Error('option template ' + templateId + ' did not yield an option');
    applyInterpolations(option, scope);
    return option;
  };
  const appendTemplateInstance = (target, instance) => {
    const wrapper = instance.firstElementChild;
    if (wrapper?.getAttribute?.('data-template-wrapper') === 'option') {
      while (wrapper.firstChild) target.appendChild(wrapper.firstChild);
      return;
    }
    target.appendChild(instance);
  };
  const renderCollection = ({ widget, from, template, itemAs = 'item', indexAs = 'index', emptyWidget = null, limit = null, reverse = false }) => {
    const el = byWidget(widget);
    if (!el) return;
    const value = readPath(state, from);
    let items = Array.isArray(value) ? [...value] : [];
    if (reverse) items.reverse();
    if (limit != null && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    el.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const target = el.tagName === 'SELECT' ? el : fragment;
    if (items.length === 0) {
      if (emptyWidget) appendTemplateInstance(target, instantiateTemplate(emptyWidget, scopeFor({ item: null, index: 0 })));
      if (target !== el) el.appendChild(fragment);
      return;
    }
    items.forEach((item, index) => {
      const scope = scopeFor({ item, index, [itemAs]: item, [indexAs]: index });
      if (el.tagName === 'SELECT') {
        el.appendChild(instantiateSelectOption(template, scope));
        return;
      }
      appendTemplateInstance(target, instantiateTemplate(template, scope));
    });
    if (target !== el) el.appendChild(fragment);
  };
  const renderWorldGraph = ({ widget, from }) => {
    const root = byWidget(widget);
    if (!root) return;
    const value = readPath(state, from) || {};
    const graph = value.graph || value;
    const nodes = graph.nodes || [];
    const edges = graph.edges || [];
    const groups = graph.groups || [];
    const width = Math.max(900, ...nodes.map(n => (n.x || 0) + 240), ...groups.map(g => (g.x || 0) + (g.width || 0) + 24));
    const height = Math.max(420, ...nodes.map(n => (n.y || 0) + 90), ...groups.map(g => (g.y || 0) + (g.height || 0) + 24));
    const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
    if (!state.worldGraphUrlStateApplied) {
      state.worldGraphUrlStateApplied = true;
      const params = new URLSearchParams(window.location.search);
      const selectedFromUrl = params.get('select') || '';
      const modeFromUrl = params.get('mode') || '';
      if (selectedFromUrl) state.worldGraphSelectedId = selectedFromUrl;
      if (validWorldGraphModes.has(modeFromUrl)) {
        state.worldGraphMode = modeFromUrl;
        state.worldGraphInitialSourcePending = modeFromUrl === 'source';
      }
    }
    let selectedId = state.worldGraphSelectedId && byId[state.worldGraphSelectedId] ? state.worldGraphSelectedId : (nodes[0]?.id || '');
    const primitiveIndex = buildPrimitiveIndex();
    const sourceFiles = [...new Map(nodes.flatMap(n => (n.sources || []).map(src => [src.file, src])).filter(([file]) => file).sort((a, b) => String(a[0]).localeCompare(String(b[0])))).values()];
    const currentMode = () => state.worldGraphMode || 'graph';
    const modeButton = (mode, label) => '<button class="world-mode-button ' + (currentMode() === mode ? 'world-mode-active' : '') + '" data-world-mode="' + mode + '">' + label + '</button>';
    const renderModeMenu = () => '<nav class="world-mode-menu">' +
      modeButton('graph', 'Graph') +
      modeButton('things', 'Thing List') +
      modeButton('primitive', 'Primitive Browser') +
      modeButton('witness', 'Witness Browser') +
      modeButton('source', 'Source Browser') +
      modeButton('process', 'Process Explorer') +
      '<span class="world-mode-spacer"></span>' +
      '<button class="world-command-toggle" data-world-command-toggle data-tutorial-target="world-command-toggle">Search / Command</button>' +
      '<span class="world-command-hint">Ctrl+K</span>' +
      '</nav>';
    const linkRef = id => byId[id]
      ? '<button class="world-ref-button" data-world-select="' + escapeHtml(id) + '">' + escapeHtml(id) + '</button>'
      : '<button class="world-ref-button" data-world-primitive="' + escapeHtml(String(id || '')) + '" data-world-primitive-kind="unresolved-ref">' + escapeHtml(String(id || '')) + '</button>';
    const linkKind = kind => '<button class="world-kind-button" data-world-kind="' + escapeHtml(kind) + '">' + escapeHtml(kind) + '</button>';
    const typedStringValue = value => {
      if (!value || typeof value !== 'object') return null;
      if (value.type === 'string') return String(value.value || '');
      if (value.type === 'ref') return String(value.target || '');
      return null;
    };
    const nodeValueString = (node, key) => {
      const row = (node?.values || []).find(entry => entry.key === key);
      return typedStringValue(row?.value);
    };
    const routePathFor = node => nodeValueString(node, 'path');
    const routeMethodFor = node => nodeValueString(node, 'method');
    const sourceForNode = node => (node?.sources || []).slice(-1)[0] || null;
    const processViewHref = ({ program, event }) => {
      const url = new URL('/process', window.location.origin);
      if (program) url.searchParams.set('program', program);
      if (event) url.searchParams.set('event', event);
      return url.pathname + url.search;
    };
    const currentWorldTutorialStep = commandTutorialStepById.get(state.worldTutorialProgress?.stepId || '') || null;
    const commandTutorialDisabledScopeRows = () => {
      const stepScopeKey = commandTutorialStepScope(currentWorldTutorialStep)?.key || null;
      const stepScopeAncestors = commandTutorialScopeAncestors(stepScopeKey);
      const stepContextId = commandTutorialStepSurfaceContext(currentWorldTutorialStep)?.id || null;
      const rows = commandTutorialDisabledContextIdsFor(state.worldTutorialProgress).map(contextId => {
        const context = commandTutorialContextInfo(contextId);
        const matchingStep = (stepContextId && stepContextId === contextId ? currentWorldTutorialStep : null)
          || (commandTutorial?.steps || []).find(step => commandTutorialStepSurfaceContext(step)?.id === contextId && step.page === 'world')
          || (commandTutorial?.steps || []).find(step => commandTutorialStepSurfaceContext(step)?.id === contextId)
          || null;
        const focusScopeKey = commandTutorialStepScope(matchingStep)?.key || null;
        return {
          type: 'context',
          contextId,
          scopeKey: focusScopeKey,
          page: matchingStep?.page || null,
          label: context?.label || commandTutorialContextLabel(contextId) || contextId,
          kind: 'context',
          pageLabel: matchingStep?.page ? commandTutorialPageLabel(matchingStep.page) : '',
          currentStepTitle: stepContextId === contextId ? currentWorldTutorialStep?.title || null : null,
          href: matchingStep?.page ? commandTutorialPageHref(matchingStep.page) : null,
          target: matchingStep?.page === 'world' && focusScopeKey ? commandTutorialScopeTargetName(focusScopeKey) : null
        };
      });
      for (const scopeKey of commandTutorialDisabledScopeKeysFor(state.worldTutorialProgress)) {
        const scope = commandTutorialScopeInfo(scopeKey);
        rows.push({
          type: 'scope',
          scopeKey,
          page: scope?.page || null,
          label: scope?.label || scopeKey,
          kind: scope?.kind || 'scope',
          pageLabel: scope?.page ? commandTutorialPageLabel(scope.page) : '',
          currentStepTitle: stepScopeAncestors.includes(scopeKey) ? currentWorldTutorialStep?.title || null : null,
          href: scope?.page ? commandTutorialPageHref(scope.page) : null,
          target: scope?.page === 'world' ? commandTutorialScopeTargetName(scopeKey) : null
        });
      }
      return rows;
    };
    const continueWorldTutorialOnPage = page => {
      const href = commandTutorialPageHref(page);
      if (!href) return;
      const target = new URL(href, window.location.origin);
      if (window.location.pathname === target.pathname) {
        window.location.reload();
        return;
      }
      window.location.assign(target.toString());
    };
    const queueWorldTutorialStateLoad = () => {
      if (!state.session?.authenticated || !commandTutorial?.id || state.worldTutorialLoaded === true || state.worldTutorialLoading === true) return;
      state.worldTutorialLoading = true;
      void requestWorldTutorialProgress()
        .catch(() => {})
        .finally(() => {
          state.worldTutorialLoading = false;
          if (byWidget(widget)) draw();
        });
    };
    const linkPrimitive = (kind, value) => {
      const text = String(value ?? '');
      if (sourceFiles.some(src => src.file === text)) return '<button class="world-ref-button" data-world-source-file="' + escapeHtml(text) + '">' + escapeHtml(text) + '</button>';
      return '<button class="world-ref-button" data-world-primitive="' + escapeHtml(text) + '" data-world-primitive-kind="' + escapeHtml(kind) + '">' + escapeHtml(text) + '</button>';
    };
    function buildPrimitiveIndex() {
      const map = new Map();
      const add = (kind, value, where = '') => {
        const text = String(value ?? '');
        if (!text) return;
        if (!map.has(kind)) map.set(kind, new Map());
        const bucket = map.get(kind);
        if (!bucket.has(text)) bucket.set(text, { value: text, count: 0, where: new Set() });
        const entry = bucket.get(text);
        entry.count += 1;
        if (where) entry.where.add(where);
      };
      const visitTyped = (value, where) => {
        if (!value || typeof value !== 'object') return;
        if (value.type === 'string') add('string', value.value, where);
        else if (value.type === 'number') add('number', value.value, where);
        else if (value.type === 'boolean') add('boolean', value.value, where);
        else if (value.type === 'null') add('null', 'null', where);
        else if (value.type === 'ref') { if (!byId[value.target]) add('unresolved-ref', value.target, where); }
        else if (value.type === 'list') (value.items || []).forEach(x => visitTyped(x, where));
        else if (value.type === 'record') Object.values(value.fields || {}).forEach(x => visitTyped(x, where));
      };
      for (const n of nodes) {
        add('kind', n.kind || 'thing', n.id);
        if (n.context && !byId[n.context]) add('context', n.context, n.id);
        for (const p of [...(n.properties || []), ...(n.values || [])]) visitTyped(p.value, n.id + '.' + p.key);
        for (const b of n.badges || []) add('badge', b.label || b, n.id);
      }
      for (const e of edges) {
        add('relation', e.rel, e.from + '→' + e.to);
        for (const p of e.properties || []) {
          if (typeof p.value === 'string' || typeof p.value === 'number' || typeof p.value === 'boolean') add('association-property', p.value, e.rel + '.' + p.key);
        }
      }
      return map;
    }
    const runtimeSurfaceAction = surface => surface?.action && typeof surface.action === 'object'
      ? { ...surface.action }
      : { kind: 'navigate', href: surface?.href };
    const buildWorldCommandCatalog = () => {
      const selectedNode = byId[selectedId] || null;
      const items = [];
      const push = item => {
        if (!item?.id || !item?.action?.kind) return;
        items.push(item);
      };
      if (selectedNode && sourceForNode(selectedNode)?.file) {
        push({
          id: 'command:selected-source',
          type: 'command',
          title: 'Show Source For Selected Object',
          subtitle: selectedNode.id,
          search: 'selected source show source witnesses ' + selectedNode.id,
          priority: 260,
          action: { kind: 'source', file: sourceForNode(selectedNode).file, focusId: selectedNode.id }
        });
      }
      if (selectedNode) {
        push({
          id: 'command:selected-witnesses',
          type: 'command',
          title: 'Show Witnesses For Selected Object',
          subtitle: selectedNode.id,
          search: 'show witnesses selected object history ' + selectedNode.id + ' ' + selectedNode.label,
          priority: 255,
          action: { kind: 'mode', mode: 'witness' }
        });
      }
      if (selectedNode?.processEvents?.length) {
        for (const entry of selectedNode.processEvents) {
          push({
            id: 'command:selected-process:' + selectedNode.id + ':' + entry.event,
            type: 'command',
            title: 'Show Process For ' + entry.event,
            subtitle: selectedNode.id + ' / ' + entry.stepCount + ' steps',
            search: 'show process selected object frontend program event ' + selectedNode.id + ' ' + entry.event,
            priority: 258,
            action: { kind: 'navigate', href: processViewHref({ program: selectedNode.id, event: entry.event }) }
          });
        }
      } else if (selectedNode?.processSelection?.program && selectedNode?.processSelection?.event) {
        push({
          id: 'command:selected-process:' + selectedNode.id,
          type: 'command',
          title: 'Show Process For Selected Object',
          subtitle: selectedNode.processSelection.program + ' / ' + selectedNode.processSelection.event,
          search: 'show process selected object frontend execution ' + selectedNode.id + ' ' + selectedNode.processSelection.program + ' ' + selectedNode.processSelection.event,
          priority: 257,
          action: { kind: 'navigate', href: processViewHref(selectedNode.processSelection) }
        });
      }
      const versionState = selectedNode?.widgetVersionState || null;
      const versionRows = selectedNode?.widgetVersions || [];
      if (selectedNode?.kind === 'widget' && versionRows.length) {
        for (const row of versionRows.filter(entry => !entry.isActive)) {
          push({
            id: 'command:widget-version:' + row.soul + ':' + row.version,
            type: 'command',
            title: 'Upgrade Widget To ' + row.version,
            subtitle: row.soul + (row.transitionFromActive ? ' / ' + row.transitionFromActive : ''),
            search: 'upgrade widget activate version ' + row.soul + ' ' + row.version + ' ' + (row.transitionFromActive || ''),
            priority: 250,
            action: { kind: 'widget-version-activate', soul: row.soul, version: row.version }
          });
        }
        if (versionState?.rollbackAvailable) {
          push({
            id: 'command:widget-version-rollback:' + versionState.soul,
            type: 'command',
            title: 'Rollback Widget To ' + versionState.rollbackVersion,
            subtitle: versionState.soul,
            search: 'rollback widget version ' + versionState.soul + ' ' + versionState.rollbackVersion,
            priority: 248,
            action: { kind: 'widget-version-rollback', soul: versionState.soul }
          });
        }
      }
      for (const surface of runtimeSurfacesFor('world-command')) {
        push({
          id: surface.id,
          type: surface.type || 'surface',
          tier: surface.tier || 'internal',
          title: surface.title,
          subtitle: surface.subtitle,
          search: surface.search,
          priority: 210,
          action: runtimeSurfaceAction(surface)
        });
      }
      if (state.session?.authenticated) {
        const tutorialProgress = state.worldTutorialProgress;
        if (tutorialProgress && !tutorialProgress.completedAt) {
          if (tutorialProgress.hidden && currentWorldTutorialStep?.page) {
            push({
              id: 'tutorial:resume:' + (currentWorldTutorialStep.page || 'current'),
              type: 'surface',
              tier: 'harness',
              title: 'Resume Tutorial On ' + commandTutorialPageLabel(currentWorldTutorialStep.page),
              subtitle: currentWorldTutorialStep.title || currentWorldTutorialStep.id,
              search: 'resume tutorial sourcery guidance hidden surface ' + (currentWorldTutorialStep.page || '') + ' ' + (currentWorldTutorialStep.title || ''),
              priority: 214,
              action: { kind: 'tutorial-resume', href: commandTutorialPageHref(currentWorldTutorialStep.page) || '/world' }
            });
          }
          for (const row of commandTutorialDisabledScopeRows()) {
            push({
              id: 'tutorial:enable:' + (row.type === 'context' ? ('context:' + row.contextId) : row.scopeKey),
              type: 'command',
              tier: 'harness',
              title: 'Enable Sourcery For ' + row.label,
              subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label + (row.pageLabel ? (' / ' + row.pageLabel) : '')),
              search: 'enable tutorial on sourcery guidance disabled ' + row.type + ' ' + (row.scopeKey || row.contextId || '') + ' ' + row.label + ' ' + row.kind + ' ' + (row.page || '') + ' ' + (row.currentStepTitle || ''),
              priority: 222,
              action: row.type === 'context'
                ? { kind: 'tutorial-enable-context', contextId: row.contextId }
                : { kind: 'tutorial-enable-scope', scopeKey: row.scopeKey }
            });
            if (row.href) {
              push({
                id: 'tutorial:open-disabled:' + row.scopeKey,
                type: 'surface',
                tier: 'harness',
                title: 'Open ' + row.pageLabel + ' Sourcery Recovery',
                subtitle: row.currentStepTitle || ('Guidance disabled on ' + row.label),
                search: 'open disabled tutorial sourcery guidance recovery ' + row.scopeKey + ' ' + row.pageLabel + ' ' + row.label + ' ' + (row.currentStepTitle || ''),
                priority: 216,
                action: { kind: 'navigate', href: row.href }
              });
            }
          }
          if (currentWorldTutorialStep?.page && currentWorldTutorialStep.page !== 'world') {
            const targetHref = commandTutorialPageHref(currentWorldTutorialStep.page);
            if (targetHref) {
              push({
                id: 'tutorial:continue:' + currentWorldTutorialStep.page,
                type: 'surface',
                tier: 'harness',
                title: 'Continue Tutorial On ' + commandTutorialPageLabel(currentWorldTutorialStep.page),
                subtitle: currentWorldTutorialStep.title || currentWorldTutorialStep.id,
                search: 'continue tutorial sourcery current step surface ' + currentWorldTutorialStep.page + ' ' + (currentWorldTutorialStep.title || ''),
                priority: 218,
                action: { kind: 'navigate', href: targetHref }
              });
            }
          }
        }
      }
      for (const node of nodes) {
        const keywords = [node.id, node.label, node.kind, node.context, node.surfaceTier, node.surfaceLabel, ...(node.badges || []).map(b => b.label || b)].filter(Boolean).join(' ');
        push({
          id: 'node:' + node.id,
          type: node.kind || 'thing',
          tier: node.surfaceTier || null,
          title: String(node.label || node.id),
          subtitle: (node.kind || 'thing') + (node.surfaceTier ? ' / ' + node.surfaceTier : '') + (node.context ? ' / ' + node.context : ''),
          search: keywords,
          priority: node.kind === 'capability' ? 190 : node.kind === 'widget' ? 180 : node.kind === 'process' ? 175 : 150,
          action: { kind: 'select', id: node.id, mode: 'graph' }
        });
        const routePath = routePathFor(node);
        if (node.kind === 'route' && routePath && routeMethodFor(node) === 'GET') {
          push({
            id: 'route:' + node.id,
            type: 'page',
            tier: node.surfaceTier || null,
            title: 'Open Page ' + routePath,
            subtitle: node.id + (node.surfaceTier ? ' / ' + node.surfaceTier : ''),
            search: 'page route surface ' + routePath + ' ' + node.id + ' ' + (node.surfaceTier || ''),
            priority: 205,
            action: { kind: 'navigate', href: routePath }
          });
        }
        if (node.kind === 'process') {
          push({
            id: 'execution:' + node.id,
            type: 'execution',
            tier: node.surfaceTier || null,
            title: 'Inspect Witnessed Process ' + String(node.label || node.id),
            subtitle: node.context || 'process',
            search: 'witnessed execution process witnesses runs ' + keywords,
            priority: 185,
            action: { kind: 'select', id: node.id, mode: 'graph' }
          });
        }
        const source = sourceForNode(node);
        if (source?.file) {
          push({
            id: 'source:' + node.id,
            type: 'source',
            tier: node.surfaceTier || null,
            title: 'Open Source For ' + String(node.label || node.id),
            subtitle: source.file,
            search: 'source witnessed file dsl ' + keywords + ' ' + source.file,
            priority: 170,
            action: { kind: 'source', file: source.file, focusId: node.id }
          });
        }
      }
      return [...new Map(items.map(item => [item.id, item])).values()];
    };
    const scoreWorldCommandItem = (item, query) => {
      if (!query) return item.priority || 0;
      const haystack = ((item.title || '') + ' ' + (item.subtitle || '') + ' ' + (item.search || '')).toLowerCase();
      const title = String(item.title || '').toLowerCase();
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return item.priority || 0;
      let score = item.priority || 0;
      for (const term of terms) {
        if (title === term) score += 220;
        else if (title.startsWith(term)) score += 120;
        else if (title.includes(term)) score += 70;
        else if (haystack.includes(term)) score += 25;
        else return -1;
      }
      return score;
    };
    const visibleWorldCommands = () => {
      const query = String(state.worldCommandQuery || '').trim();
      return buildWorldCommandCatalog()
        .map(item => ({ ...item, score: scoreWorldCommandItem(item, query) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => (b.score - a.score) || String(a.title).localeCompare(String(b.title)))
        .slice(0, query ? 24 : 12);
    };
    const renderWorldCommandPalette = () => {
      if (!state.worldCommandOpen) return '';
      const query = String(state.worldCommandQuery || '');
      const items = visibleWorldCommands();
      const results = items.length
        ? items.map((item, index) => '<button class="world-command-item" data-world-command-run="' + index + '"><strong>' + escapeHtml(item.title) + '</strong><span class="world-command-meta">' + escapeHtml(item.type) + (item.tier ? ' / ' + item.tier : '') + (item.subtitle ? ' / ' + item.subtitle : '') + '</span></button>').join('')
        : '<div class="world-command-empty">No matching surfaces, objects, or commands.</div>';
      return '<section class="world-command-palette" data-world-command-palette>' +
        '<div class="world-command-head">' +
        '<input class="world-command-input" data-world-command-input placeholder="Search pages, widgets, capabilities, execution, commands..." value="' + escapeHtml(query) + '" />' +
        '<button class="world-command-toggle" data-world-command-close>Close</button>' +
        '</div>' +
        '<div class="world-command-list">' + results + '</div>' +
        '</section>';
    };
    const renderWorldTutorialConceptList = (concepts, emptyText) => (
      '<div class="tutorial-concept-list">' +
      (concepts.length
        ? concepts.map(concept => '<div class="tutorial-concept"><strong>' + escapeHtml(concept.label) + '</strong><span>' + escapeHtml(concept.summary) + '</span></div>').join('')
        : '<div class="tutorial-concept"><span>' + escapeHtml(emptyText) + '</span></div>') +
      '</div>'
    );
    const renderWorldTutorialPanel = () => {
      if (!state.session?.authenticated) return '';
      const progress = state.worldTutorialProgress;
      const step = commandTutorialStep(progress);
      const surface = worldTutorialSurfaceState(progress);
      if (!progress && !state.worldTutorialError) return '';
      const currentConcepts = step ? commandTutorialStepConcepts(step) : [];
      const revealedConcepts = commandTutorialRevealedConcepts(progress);
      const disabledRows = commandTutorialDisabledScopeRows();
      const previous = commandTutorialPreviousStep(progress);
      const currentScopeKey = commandTutorialStepScope(step)?.key || null;
      const currentScopeDisabled = Boolean(progress && currentScopeKey && isCommandTutorialScopeDisabled(progress, currentScopeKey));
      const currentContextId = commandTutorialStepSurfaceContext(step)?.id || null;
      const currentContextDisabled = Boolean(progress && currentContextId && isCommandTutorialContextDisabled(progress, currentContextId));
      const summary = !progress
        ? 'Tutorial progress is not active on this surface yet.'
        : progress.completedAt
          ? 'Tutorial complete. The world surface remains available for truthful inspection and handoff into real product pages.'
          : surface.kind === 'offpage'
            ? (() => {
                return currentContextDisabled
                  ? ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface, but Sourcery is disabled in that context until you re-enable it.')
                  : (currentScopeDisabled
                  ? ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface, but Sourcery is disabled there until you re-enable that scope.')
                  : ('Current guidance continues on the ' + commandTutorialPageLabel(surface.page) + ' surface.'));
              })()
            : surface.kind === 'disabled-context'
              ? 'Sourcery is disabled for this context, but the current step remains recoverable without losing progress.'
            : surface.kind === 'disabled'
              ? 'Sourcery is disabled for this scope, but the current step remains recoverable without losing progress.'
              : surface.kind === 'hidden'
                ? 'Tutorial paused. Resume to continue with the current authored step.'
                : (commandTutorialReplayScopeKeyFor(progress)
                    ? ('Replaying this scope from here: ' + (step?.title || '') + '. This replays guidance only and does not roll back app state.')
                    : (step ? (step.title + ' (' + step.chapterId + ' / ' + step.page + ')') : 'Tutorial in progress.'));
      const disabledList = disabledRows.length
        ? '<div class="world-tutorial-list" data-world-tutorial-disabled-list>' + disabledRows.map(row =>
          '<div class="world-tutorial-item"><strong>' + escapeHtml(row.label) + '</strong><p>' + escapeHtml((row.pageLabel ? (row.pageLabel + ' / ') : '') + (row.currentStepTitle ? ('Current step there: ' + row.currentStepTitle + '.') : (row.type === 'context' ? 'Sourcery is disabled for this context, but you can re-enable it without resetting progress.' : 'Sourcery is disabled for this scope, but you can re-enable it without resetting progress.'))) + '</p><div class="actions">' + (row.target ? '<button type="button" class="secondary" data-world-tutorial-focus-scope-target="' + escapeHtml(row.target) + '">Show This Control</button>' : '') + (row.type === 'context' ? '<button type="button" class="secondary" data-world-tutorial-enable-context="' + escapeHtml(row.contextId) + '">Enable This Context</button>' : '<button type="button" class="secondary" data-world-tutorial-enable-scope="' + escapeHtml(row.scopeKey) + '">Enable Sourcery Here</button>') + (row.href ? '<button type="button" class="secondary" data-world-tutorial-open-scope="' + escapeHtml(row.href) + '">Open Surface</button>' : '') + '</div></div>'
        ).join('') + '</div>'
        : '<div class="world-tutorial-list" data-world-tutorial-disabled-list><div class="world-tutorial-item"><p>No disabled Sourcery scopes right now.</p></div></div>';
      return '<section class="world-tutorial-panel" data-world-tutorial-panel>' +
        '<div class="world-tutorial-meta">Sourcery / ' + escapeHtml(surface.kind) + '</div>' +
        '<h2>' + escapeHtml(step?.title || 'Tutorial status') + '</h2>' +
        '<div class="world-tutorial-summary">' + escapeHtml(summary) + '</div>' +
        '<div class="world-tutorial-actions">' +
          (disabledRows.length ? '<button type="button" class="secondary" data-world-tutorial-show-disabled>Show Disabled Sourcery Scopes</button>' : '') +
          (step?.target && surface.kind === 'active' ? '<button type="button" class="secondary" data-world-tutorial-focus-target="' + escapeHtml(step.target) + '">Show Current Control</button>' : '') +
          (progress && !progress.completedAt ? '<button type="button" class="secondary" data-world-tutorial-resume>' + escapeHtml(surface.kind === 'offpage' ? ('Continue On ' + commandTutorialPageLabel(surface.page)) : (surface.kind === 'disabled-context' ? 'Enable Sourcery In This Context' : (surface.kind === 'disabled' ? 'Enable Sourcery Here' : 'Resume Tutorial'))) + '</button>' : '') +
          (surface.kind === 'active' && previous ? '<button type="button" class="secondary" data-world-tutorial-back>Back</button>' : '') +
          (surface.kind === 'active' && step ? '<button type="button" data-world-tutorial-next>' + escapeHtml(step.nextLabel || 'Next') + '</button>' : '') +
          (progress && !progress.completedAt ? '<button type="button" class="secondary" data-world-tutorial-restart-chapter>Restart Chapter</button>' : '') +
          (progress && !progress.completedAt && step ? '<button type="button" class="secondary" data-world-tutorial-restart-step>Restart From This Scope</button>' : '') +
          (surface.kind === 'active' && step?.page === 'world' ? '<button type="button" class="secondary" data-world-tutorial-disable>Disable Sourcery Here</button>' : '') +
          (surface.kind === 'active' && currentSurfaceContext ? '<button type="button" class="secondary" data-world-tutorial-disable-context>Disable Sourcery In This Context</button>' : '') +
          (progress && !progress.completedAt && !progress.hidden ? '<button type="button" class="secondary" data-world-tutorial-exit>Exit</button>' : '') +
          (progress ? '<button type="button" class="secondary" data-world-tutorial-reset>Reset</button>' : '') +
        '</div>' +
        renderWorldTutorialConceptList(currentConcepts, 'This step uses the current product surface without unlocking a new concept.') +
        renderWorldTutorialConceptList(revealedConcepts, 'No concepts revealed on this surface yet.') +
        disabledList +
      '</section>';
    };
    const renderInspector = () => {
      if (state.worldGraphSelectedKind) {
        const kind = state.worldGraphSelectedKind;
        const matches = nodes.filter(n => (n.kind || 'thing') === kind).sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
        return '<h2>' + escapeHtml(kind) + ' list</h2>' +
          '<div class="world-inspector-row"><span class="world-inspector-key">count</span><span>' + matches.length + '</span></div>' +
          '<button class="world-ref-button" data-world-clear-kind>Back to selected object</button>' +
          '<div class="world-inspector-list">' + matches.map(n =>
            '<button class="world-inspector-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || '') + '</span></button>'
          ).join('') + '</div>';
      }
      const node = byId[selectedId];
      const incoming = edges.filter(e => e.to === selectedId).slice(0, 24);
      const outgoing = edges.filter(e => e.from === selectedId).slice(0, 24);
      if (!node) return '<h2>Selection</h2><p>Select a node in the graph.</p>';
      const rows = [
        ['id', linkRef(node.id)],
        ['label', escapeHtml(String(node.label || node.id))],
        ['kind', linkKind(node.kind || 'thing')],
        ['surface', node.surfaceLabel ? escapeHtml(String(node.surfaceLabel)) : ''],
        ['context', node.context ? linkRef(node.context) : ''],
        ['href', node.href ? escapeHtml(String(node.href)) : '']
      ].filter(([, v]) => v !== null && v !== undefined && String(v) !== '');
      const badges = (node.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + '</span>').join('');
      const valueRef = value => {
        if (typeof value === 'string' && byId[value]) return linkRef(value);
        if (typeof value === 'string') return linkPrimitive('string', value);
        if (typeof value === 'number') return linkPrimitive('number', value);
        if (typeof value === 'boolean') return linkPrimitive('boolean', value);
        if (Array.isArray(value)) return '<span class="world-value-list">' + value.map(valueRef).join('') + '</span>';
        if (value && typeof value === 'object') return renderTypedValue(value);
        return linkPrimitive('null', value ?? 'null');
      };
      const renderTypedValue = value => {
        if (!value || typeof value !== 'object' || !value.type) return '<code>' + escapeHtml(JSON.stringify(value)) + '</code>';
        const type = '<span class="world-value-type">' + escapeHtml(value.type) + '</span>';
        if (value.type === 'ref') return '<span class="world-value-widget">' + type + linkRef(value.target) + '</span>';
        if (value.type === 'list') return '<span class="world-value-widget">' + type + '<span class="world-value-list">' + (value.items || []).map(renderTypedValue).join('') + '</span></span>';
        if (value.type === 'record') {
          const rows = Object.entries(value.fields || {}).map(([k, v]) => '<span class="world-value-record-row"><span class="world-inspector-key">' + escapeHtml(k) + '</span><span>' + renderTypedValue(v) + '</span></span>').join('');
          return '<span class="world-value-widget">' + type + '<span class="world-value-record">' + rows + '</span></span>';
        }
        const primitiveValue = value.value ?? (value.type === 'null' ? 'null' : '');
        return '<span class="world-value-widget">' + type + '<span>' + linkPrimitive(value.type, primitiveValue) + '</span></span>';
      };
      const propertyList = (title, props) => '<div class="world-inspector-list"><strong>' + title + '</strong>' + ((props || []).length ? props.map(p =>
        '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(p.key) + '</span><span>' + valueRef(p.value) + '</span></div>'
      ).join('') : '<div class="world-node-kind">none</div>') + '</div>';
      const edgeItem = (e, dir) => {
        const other = dir === 'in' ? e.from : e.to;
        const props = (e.properties || []).length ? '<div class="world-edge-props">' + e.properties.map(p => '<span class="world-badge">' + escapeHtml(p.key) + '=' + escapeHtml(JSON.stringify(p.value)) + '</span>').join('') + '</div>' : '';
        return '<div class="world-inspector-item">' + linkRef(other) + '<br><span class="world-node-kind">' + escapeHtml(e.rel || '') + '</span>' + props + '</div>';
      };
      const edgeList = (title, list, dir) => '<div class="world-inspector-list"><strong>' + title + '</strong>' + (list.length ? list.map(e => edgeItem(e, dir)).join('') : '<div class="world-node-kind">none</div>') + '</div>';
      const associationPropertyList = (node.associationProperties || []).length ? '<div class="world-inspector-list"><strong>Association properties</strong>' + node.associationProperties.slice(0, 24).map(a =>
        '<div class="world-inspector-item">' + linkRef(a.from) + ' <span class="world-node-kind">' + escapeHtml(a.rel) + '</span> ' + linkRef(a.to) +
        '<div class="world-edge-props">' + (a.properties || []).map(p => '<span class="world-badge">' + escapeHtml(p.key) + '=' + escapeHtml(JSON.stringify(p.value)) + '</span>').join('') + '</div></div>'
      ).join('') + '</div>' : '';
      const sourceList = (node.sources || []).length ? '<div class="world-inspector-list"><strong>Source definition</strong>' + node.sources.slice(-6).reverse().map(src =>
        '<div class="world-inspector-item"><div>' + escapeHtml(src.section || '') + '</div><button class="world-ref-button" data-world-source-file="' + escapeHtml(src.file || '') + '" data-world-source-focus="' + escapeHtml(node.id) + '">' + escapeHtml(src.file || '') + (src.line != null ? ' (line ' + src.line + ')' : '') + '</button><pre class="world-source-ast">' + escapeHtml(JSON.stringify(src.values || {}, null, 2)) + '</pre></div>'
      ).join('') + '</div>' : '';
      const witnessList = (node.recentWitnesses || []).length ? '<div class="world-inspector-list"><strong>Recent witnesses</strong>' + node.recentWitnesses.slice(0, 6).map(entry =>
        '<div class="world-inspector-item"><div><strong>' + escapeHtml(entry.process || entry.id) + '</strong></div><div class="world-node-kind">' + escapeHtml(entry.actor || '') + '</div><button class="world-ref-button" data-world-mode="witness">Open witness browser</button></div>'
      ).join('') + '</div>' : '';
      const processList = (node.processEvents || []).length
        ? '<div class="world-inspector-list"><strong>Process explorer</strong>' + node.processEvents.map(entry =>
          '<div class="world-inspector-item"><div><strong>' + escapeHtml(entry.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(String(entry.stepCount || 0)) + ' steps / ' + escapeHtml(String(entry.asyncCount || 0)) + ' async</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.id) + '" data-world-open-process-event="' + escapeHtml(entry.event) + '">Open process view</button></div>'
        ).join('') + '</div>'
        : (node.processSelection?.program && node.processSelection?.event
          ? '<div class="world-inspector-list"><strong>Process explorer</strong><div class="world-inspector-item"><div><strong>' + escapeHtml(node.processSelection.event) + '</strong></div><div class="world-node-kind">' + escapeHtml(node.processSelection.program) + '</div><button class="world-ref-button" data-world-open-process-program="' + escapeHtml(node.processSelection.program) + '" data-world-open-process-event="' + escapeHtml(node.processSelection.event) + '">Open process view</button></div></div>'
          : '');
      const versionState = node.widgetVersionState || null;
      const versionStatus = state.worldGraphVersionStatus && state.worldGraphVersionStatus.soul === node.id
        ? '<div class="world-version-status" data-level="' + escapeHtml(state.worldGraphVersionStatus.level || 'info') + '">' + escapeHtml(state.worldGraphVersionStatus.message || '') + '</div>'
        : '';
      const widgetVersionList = (node.widgetVersions || []).length ? '<div class="world-inspector-list"><strong>Widget versions</strong>' +
        '<div class="world-inspector-row"><span class="world-inspector-key">active</span><span>' + (versionState?.activeVersion ? escapeHtml(versionState.activeVersion) : 'none') + '</span></div>' +
        node.widgetVersions.map(entry => {
          const badges = [
            entry.isActive ? 'active' : '',
            entry.transitionFromActive ? ('from current: ' + entry.transitionFromActive) : '',
            entry.transitionToActive ? ('to current: ' + entry.transitionToActive) : ''
          ].filter(Boolean).map(label => '<span class="world-badge">' + escapeHtml(label) + '</span>').join('');
          const actions = entry.isActive
            ? ''
            : '<div class="world-version-actions"><button class="world-ref-button" data-world-widget-activate="' + escapeHtml(entry.soul) + '" data-world-widget-version="' + escapeHtml(entry.version) + '">Activate</button></div>';
          return '<div class="world-inspector-item world-version-item"><div><strong>' + escapeHtml(entry.version) + '</strong></div><div class="world-node-kind">' + escapeHtml(entry.kind || 'widget') + ' / index ' + escapeHtml(String(entry.index ?? 0)) + '</div><div class="world-badges">' + badges + '</div>' + actions + '<pre class="world-source-ast">' + escapeHtml(JSON.stringify(entry.propsPreview ?? {}, null, 2)) + '</pre></div>';
        }).join('') +
        (versionState?.rollbackAvailable ? '<div class="world-version-actions"><button class="world-ref-button" data-world-widget-rollback="' + escapeHtml(versionState.soul) + '">Rollback to ' + escapeHtml(versionState.rollbackVersion || '') + '</button></div>' : '') +
        ((versionState?.history || []).length ? '<div class="world-inspector-list"><strong>Activation history</strong>' + versionState.history.slice(-6).reverse().map(entry => '<div class="world-inspector-item"><strong>' + escapeHtml(entry.version || '') + '</strong><br><span class="world-node-kind">' + escapeHtml(entry.actor || '') + ' / ' + escapeHtml(entry.witnessId || '') + '</span></div>').join('') + '</div>' : '') +
        versionStatus +
        '</div>' : '';
      return '<h2>Selected Object</h2>' +
        rows.map(([k, v]) => '<div class="world-inspector-row"><span class="world-inspector-key">' + escapeHtml(k) + '</span><span>' + v + '</span></div>').join('') +
        '<div class="world-badges">' + badges + '</div>' +
        propertyList('Object properties', node.properties) +
        propertyList('Values', node.values) +
        edgeList('Associations from this object', outgoing, 'out') +
        edgeList('Associations to this object', incoming, 'in') +
        associationPropertyList +
        processList +
        widgetVersionList +
        witnessList +
        sourceList;
    };
    const sourceDefinitionRange = (text, focusId) => {
      const node = byId[focusId] || byId[selectedId];
      const src = (node?.sources || []).slice(-1)[0];
      if (!src || !text) return null;
      const lines = text.split(/\r?\n/);
      if (src.line != null) {
        const startLine = src.line - 1;
        let endLine = lines.length - 1;
        for (let i = startLine + 1; i < lines.length; i++) {
          if (/^\s*\[\[?/.test(lines[i]) && i > startLine) { endLine = i - 1; break; }
        }
        return { start: startLine, end: endLine };
      }
      const candidates = [src.values?.id, src.values?.soul, src.values?.version, focusId].filter(Boolean).map(String);
      const section = src.section ? '[[' + src.section + ']]' : null;
      let startLine = -1;
      for (let i = 0; i < lines.length; i++) {
        const nearSection = !section || lines[i].trim() === section;
        const hasCandidate = candidates.some(c => lines[i].includes('"' + c + '"') || lines[i].includes(c));
        if (nearSection || hasCandidate) {
          if (nearSection) {
            for (let j = i; j < Math.min(lines.length, i + 12); j++) {
              if (candidates.some(c => lines[j].includes('"' + c + '"') || lines[j].includes(c))) { startLine = i; break; }
            }
          }
          if (startLine < 0 && hasCandidate) startLine = Math.max(0, i - 2);
          if (startLine >= 0) break;
        }
      }
      if (startLine < 0) return null;
      let endLine = lines.length - 1;
      for (let i = startLine + 1; i < lines.length; i++) {
        if (/^\s*\[\[?/.test(lines[i]) && i > startLine + 1) { endLine = i - 1; break; }
      }
      return { start: startLine, end: endLine };
    };
    const renderSourceText = (text, focusId) => {
      const range = sourceDefinitionRange(text, focusId);
      const ids = Object.keys(byId).filter(id => id && id.length > 2).sort((a, b) => b.length - a.length).slice(0, 400);
      const linkLine = line => {
        let out = escapeHtml(line);
        for (const id of ids) {
          const escaped = escapeHtml(id).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          out = out.replace(new RegExp('(&quot;)?\\b' + escaped + '\\b(&quot;)?', 'g'), match => '<button class="world-source-ref" data-world-select="' + escapeHtml(id) + '">' + match + '</button>');
        }
        return out;
      };
      return text.split(/\r?\n/).map((line, i) => {
        const highlighted = range && i >= range.start && i <= range.end;
        const lineNumAttrs = highlighted && focusId ? ' data-world-jump-to-graph="' + escapeHtml(focusId) + '" title="Jump to object in graph"' : '';
        return '<div class="world-source-line ' + (highlighted ? 'world-source-highlight' : '') + '"><span class="world-source-line-number"' + lineNumAttrs + '>' + (i + 1) + '</span><span class="world-source-line-code">' + linkLine(line) + '</span></div>';
      }).join('');
    };
    const renderSourceDocument = () => {
      const doc = state.worldGraphSource;
      const selectedFile = doc?.file || sourceFiles[0]?.file || '';
      const sidebar = '<aside class="world-source-sidebar"><strong>Source files</strong>' + (sourceFiles.length ? sourceFiles.map(src => '<button class="world-source-file-button ' + (src.file === selectedFile ? 'world-source-file-active' : '') + '" data-world-source-file="' + escapeHtml(src.file || '') + '">' + escapeHtml((src.file || '').split(/[\\/]/).slice(-2).join('/')) + '</button>').join('') : '<div class="world-source-empty">No witnessed source files.</div>') + '</aside>';
      const body = doc
        ? '<section class="world-source-editor"><div class="world-source-title">' + escapeHtml(doc.file || 'Source') + '</div><div class="world-source-code">' + renderSourceText(doc.text || '', state.worldGraphSourceFocus || selectedId) + '</div></section>'
        : '<section class="world-source-editor"><div class="world-source-title">Source Browser</div><div class="world-source-empty">Select a source file. Definitions linked to the selected object will be highlighted.</div></section>';
      return '<div class="world-document-view"><div class="world-source-workbench">' + sidebar + body + '</div></div>';
    };
    const renderThingList = () => {
      const kinds = [...new Set(nodes.map(n => n.kind || 'thing'))].sort();
      const selectedKind = state.worldGraphSelectedKind || 'thing';
      const items = nodes.filter(n => (n.kind || 'thing') === selectedKind).sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
      return '<div class="world-primitive-browser"><h2>Thing List</h2><div class="world-primitive-grid"><div class="world-primitive-list"><strong>Kinds</strong>' + kinds.map(k => '<button class="world-primitive-item" data-world-kind="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + nodes.filter(n => (n.kind || 'thing') === k).length + '</span></button>').join('') + '</div><div class="world-primitive-list" style="grid-column: span 2"><strong>' + escapeHtml(selectedKind) + '</strong>' + items.map(n => '<button class="world-primitive-item" data-world-select="' + escapeHtml(n.id) + '"><strong>' + escapeHtml(n.label || n.id) + '</strong><br><span class="world-node-kind">' + escapeHtml(n.context || '') + '</span></button>').join('') + '</div></div></div>';
    };
    const renderWitnessBrowser = () => {
      const node = byId[selectedId];
      const witnesses = node?.recentWitnesses || [];
      if (!node) return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-empty">Select an object to inspect its witnessed history.</div></div>';
      return '<div class="world-witness-browser"><h2>Witness Browser</h2><div class="world-command-meta">' + escapeHtml(String(node.label || node.id)) + ' / ' + escapeHtml(node.kind || 'thing') + '</div>' +
        (witnesses.length
          ? witnesses.map(entry => '<article class="world-witness-card"><div><strong>' + escapeHtml(entry.process || entry.id) + '</strong></div><div class="world-command-meta">' + escapeHtml(entry.id || '') + (entry.actor ? ' / actor ' + escapeHtml(entry.actor) : '') + (entry.cause ? ' / cause ' + escapeHtml(entry.cause) : '') + '</div><pre>' + escapeHtml(JSON.stringify(entry.body ?? {}, null, 2)) + '</pre></article>').join('')
          : '<div class="world-command-empty">No recent witnessed history for this object.</div>') +
        '</div>';
    };
    const renderProcessExplorer = () => '<div class="world-primitive-browser"><h2>Process Explorer</h2><div class="world-primitive-list"><a class="world-primitive-item" href="/process"><strong>Open Process View</strong><br><span class="world-node-kind">Dedicated process graph, run inspector, and replay</span></a></div></div>';
    const renderPrimitiveBrowser = () => {
      const selectedKind = state.worldGraphSelectedPrimitiveKind || [...primitiveIndex.keys()][0] || '';
      const bucket = primitiveIndex.get(selectedKind) || new Map();
      const selectedValue = state.worldGraphSelectedPrimitiveValue || '';
      const kinds = [...primitiveIndex.keys()].sort();
      const items = [...bucket.values()].sort((a, b) => a.value.localeCompare(b.value));
      const selectedItem = bucket.get(selectedValue) || items[0] || null;
      const refs = selectedItem ? [...selectedItem.where].sort() : [];
      return '<div class="world-primitive-browser"><h2>Primitive browser</h2><div class="world-primitive-grid"><div class="world-primitive-list"><strong>Kinds</strong>' + kinds.map(k => '<button class="world-primitive-item" data-world-primitive-kind-only="' + escapeHtml(k) + '">' + escapeHtml(k) + ' <span class="world-node-kind">' + (primitiveIndex.get(k)?.size || 0) + '</span></button>').join('') + '</div><div class="world-primitive-list"><strong>' + escapeHtml(selectedKind || 'none') + '</strong>' + items.map(item => '<button class="world-primitive-item" data-world-primitive="' + escapeHtml(item.value) + '" data-world-primitive-kind="' + escapeHtml(selectedKind) + '">' + escapeHtml(item.value) + '<br><span class="world-node-kind">count ' + item.count + '</span></button>').join('') + '</div><div class="world-primitive-list"><strong>References</strong>' + refs.map(ref => { const id = String(ref).split('.')[0].split('→')[0]; return '<button class="world-primitive-item" data-world-select="' + escapeHtml(byId[id] ? id : '') + '" data-world-primitive-ref="' + escapeHtml(ref) + '">' + escapeHtml(ref) + '</button>'; }).join('') + '</div></div></div>';
    };
    const marker = '<defs><marker id="world-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#777" /></marker><marker id="world-arrow-owner" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L7,3 z" fill="#c7352f" /></marker></defs>';
    const renderCanvas = () => {
      if (currentMode() === 'source') return renderSourceDocument();
      if (currentMode() === 'primitive') return renderPrimitiveBrowser();
      if (currentMode() === 'things') return renderThingList();
      if (currentMode() === 'witness') return renderWitnessBrowser();
      if (currentMode() === 'process') return renderProcessExplorer();
      const svg = '<svg class="world-graph-svg" width="' + width + '" height="' + height + '">' + marker + edges.map(e => {
        const a = byId[e.from], b = byId[e.to];
        if (!a || !b) return '';
        const x1 = (a.x || 0) + 190, y1 = (a.y || 0) + 28, x2 = (b.x || 0), y2 = (b.y || 0) + 28;
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        const style = e.style || 'relation';
        const markerId = style === 'ownership' ? 'world-arrow-owner' : 'world-arrow';
        return '<line class="world-edge-' + escapeHtml(style) + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" marker-end="url(#' + markerId + ')" />' +
          '<text class="world-edge-label" x="' + mx + '" y="' + (my - 3) + '">' + escapeHtml(String(e.rel || '')) + '</text>';
      }).join('') + '</svg>';
      const groupHtml = groups.map(g => '<div class="world-context-box" style="left:' + (g.x || 0) + 'px;top:' + (g.y || 0) + 'px;width:' + (g.width || 0) + 'px;height:' + (g.height || 0) + 'px"><div class="world-context-label">' + escapeHtml(g.label || g.id || '') + '</div></div>').join('');
      const html = nodes.map(n => '<div class="world-node world-node-' + escapeHtml(n.kind || 'thing') + (n.id === selectedId ? ' world-node-selected' : '') + '" data-world-node-id="' + escapeHtml(n.id) + '" style="left:' + (n.x || 0) + 'px;top:' + (n.y || 0) + 'px">' +
        '<div class="world-node-kind">' + escapeHtml(n.kind || 'thing') + '</div>' +
        '<a href="' + escapeHtml(n.href || '#') + '" title="' + escapeHtml(n.id) + '">' + escapeHtml(String(n.label || n.id)) + '</a>' +
        '<div class="world-badges">' + (n.badges || []).map(b => '<span class="world-badge">' + escapeHtml(String(b.label || b)) + '</span>').join('') + '</div>' +
        '</div>').join('');
      return '<div class="world-graph-canvas"><div class="world-graph-content" style="width:' + width + 'px;height:' + height + 'px">' + groupHtml + svg + html + '</div></div>';
    };
    const openSourceFile = async (file, focusId = selectedId) => {
      if (!file) return;
      state.worldGraphSourceFocus = focusId || selectedId;
      const res = await fetch('/api/source?file=' + encodeURIComponent(file), requestOptions({}, { url: '/api/source' }));
      state.worldGraphSource = await res.json().catch(() => ({ file, text: 'Failed to load source' }));
      state.worldGraphMode = 'source';
      state.worldGraphPrimitiveMode = false;
    };
    const openSourceForSelected = async () => {
      const src = (byId[selectedId]?.sources || []).slice(-1)[0];
      if (src?.file) await openSourceFile(src.file, selectedId);
    };
    const tutorialDomRoot = () => root.closest('[data-widget="world_graph_page"]') || root;
    const focusWorldTutorialTarget = targetName => {
      if (!targetName) return false;
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-tutorial-target="' + CSS.escape(targetName) + '"]');
      if (!target) return false;
      const scope = target.closest('.world-main-pane, .world-graph-inspector, .world-command-palette, nav, form, section') || target;
      domRoot.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      target.setAttribute('data-tutorial-current', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = target.matches?.('input, textarea, select, button, a')
        ? target
        : target.querySelector?.('input, textarea, select, button, a, [tabindex]');
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const focusWorldTutorialScopeTarget = targetName => {
      if (!targetName) return false;
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-tutorial-target="' + CSS.escape(targetName) + '"]');
      if (!target) return false;
      const scope = target.closest('.world-main-pane, .world-graph-inspector, .world-command-palette, nav, form, section') || target;
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      scope.setAttribute('data-tutorial-focus-scope', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const focusable = target.matches?.('input, textarea, select, button, a')
        ? target
        : target.querySelector?.('input, textarea, select, button, a, [tabindex]');
      focusable?.focus?.({ preventScroll: true });
      return true;
    };
    const focusWorldTutorialDisabledList = () => {
      const domRoot = tutorialDomRoot();
      const target = domRoot.querySelector('[data-world-tutorial-disabled-list]');
      if (!target) return false;
      domRoot.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
      domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      target.setAttribute('data-tutorial-focus-scope', 'true');
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.querySelector('button, [tabindex]')?.focus?.({ preventScroll: true });
      return true;
    };
    const updateWorldTutorialApi = () => {
      window.__witnessTutorial = {
        get currentStepId() { return state.worldTutorialProgress?.stepId || null; },
        get currentChapterId() { return state.worldTutorialProgress?.chapterId || null; },
        get currentPage() { return commandTutorialStep(state.worldTutorialProgress)?.page || null; },
        get currentScopeKey() { return commandTutorialStepScope(commandTutorialStep(state.worldTutorialProgress))?.key || null; },
        get currentConceptIds() { return commandTutorialStepConcepts(commandTutorialStep(state.worldTutorialProgress)).map(concept => concept.id); },
        get revealedConceptIds() { return commandTutorialRevealedConcepts(state.worldTutorialProgress).map(concept => concept.id); },
        get replayScopeKey() { return commandTutorialReplayScopeKeyFor(state.worldTutorialProgress); },
        get replayStepId() { return commandTutorialReplayStepId(state.worldTutorialProgress); },
        get completedAt() { return state.worldTutorialProgress?.completedAt || null; },
        get hidden() { return state.worldTutorialProgress?.hidden === true; },
        get disabledScopeKeys() { return commandTutorialDisabledScopeKeysFor(state.worldTutorialProgress); },
        get disabledContextIds() { return commandTutorialDisabledContextIdsFor(state.worldTutorialProgress); },
        get disabledPages() { return commandTutorialDisabledPages(state.worldTutorialProgress); },
        get surfacePage() { return 'world'; },
        get surfaceContext() { return typeof config.surfaceContext === 'string' && config.surfaceContext.trim() ? config.surfaceContext.trim() : null; },
        get surfaceRouteId() { return typeof config.surfaceRouteId === 'string' && config.surfaceRouteId.trim() ? config.surfaceRouteId.trim() : null; },
        get surfaceRootWidgetId() { return typeof config.surfaceRootWidgetId === 'string' && config.surfaceRootWidgetId.trim() ? config.surfaceRootWidgetId.trim() : null; },
        get surfaceProgramId() { return typeof config.surfaceProgramId === 'string' && config.surfaceProgramId.trim() ? config.surfaceProgramId.trim() : null; },
        get surfaceStatus() { return worldTutorialSurfaceState(state.worldTutorialProgress).kind; }
      };
    };
    const advanceWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      if (!current) return;
      const step = commandTutorialStep(current);
      const nextIndex = (commandTutorial?.steps || []).findIndex(candidate => candidate.id === step?.id);
      const next = nextIndex >= 0 ? (commandTutorial.steps[nextIndex + 1] || null) : null;
      if (!next) {
        await persistWorldTutorialProgress({ ...current, chapterStatus: 'completed', completedAt: new Date().toISOString(), hidden: false, replayScopeKey: null });
        return;
      }
      await persistWorldTutorialProgress({ ...current, chapterId: next.chapterId, stepId: next.id, chapterStatus: 'in_progress', completedAt: null, hidden: false, replayScopeKey: null });
    };
    const backWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const previous = commandTutorialPreviousStep(current);
      if (!current || !previous) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: previous.chapterId,
        stepId: previous.id,
        completedAt: null,
        hidden: false,
        replayScopeKey: commandTutorialStepScope(previous)?.key || null
      });
    };
    const restartWorldTutorialChapter = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      const first = (commandTutorial?.steps || []).find(candidate => candidate.chapterId === (current?.chapterId || step?.chapterId));
      if (!current || !first) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: first.chapterId,
        stepId: first.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayScopeKey: null
      });
    };
    const restartWorldTutorialFromHere = async () => {
      const current = state.worldTutorialProgress;
      const step = commandTutorialStep(current);
      if (!current || !step) return;
      await persistWorldTutorialProgress({
        ...current,
        chapterId: step.chapterId,
        stepId: step.id,
        chapterStatus: 'in_progress',
        completedAt: null,
        hidden: false,
        replayScopeKey: commandTutorialStepScope(step)?.key || null
      });
    };
    const resumeWorldTutorial = async () => {
      const current = state.worldTutorialProgress;
      const surface = worldTutorialSurfaceState(current);
      if (!current) return;
      if (surface.kind === 'offpage') {
        continueWorldTutorialOnPage(surface.page);
        return;
      }
      if (surface.kind === 'disabled-context') {
        await persistWorldTutorialProgress(clearWorldTutorialContextDisabled(current, surface.contextId || commandTutorialStepSurfaceContext(commandTutorialStep(current))?.id || currentSurfaceContext));
        return;
      }
      if (surface.kind === 'disabled') {
        await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(current, surface.scopeKey || commandTutorialStepScope(commandTutorialStep(current))?.key || 'world'));
        return;
      }
      await persistWorldTutorialProgress({ ...current, hidden: false, replayScopeKey: null });
    };
    const executeWorldCommand = async item => {
      if (!item?.action) return;
      const action = item.action;
      state.worldCommandOpen = false;
      state.worldCommandQuery = '';
      state.worldCommandFocusRequested = false;
      if (action.kind === 'navigate') {
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'mode') {
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode !== 'source') state.worldGraphSource = null;
        if (state.worldGraphMode === 'source' && !state.worldGraphSource) await openSourceForSelected();
        draw();
        return;
      }
      if (action.kind === 'source') {
        await openSourceFile(action.file, action.focusId || selectedId);
        draw();
        return;
      }
      if (action.kind === 'tutorial-enable-scope') {
        if (!state.session?.authenticated || !state.worldTutorialProgress) return;
        const nextProgress = clearWorldTutorialScopeDisabled(state.worldTutorialProgress, action.scopeKey);
        const response = await fetch('/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextProgress)
        }, { url: '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id) }));
        const body = await response.json().catch(() => ({}));
        state.worldTutorialProgress = response.ok
          ? normalizeWorldTutorialProgress(body.progress || nextProgress)
          : state.worldTutorialProgress;
        state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
        state.worldTutorialLoaded = true;
        state.worldCommandOpen = false;
        state.worldCommandQuery = '';
        draw();
        return;
      }
      if (action.kind === 'tutorial-enable-context') {
        if (!state.session?.authenticated || !state.worldTutorialProgress) return;
        const nextProgress = clearWorldTutorialContextDisabled(state.worldTutorialProgress, action.contextId || currentSurfaceContext);
        const response = await fetch('/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(nextProgress)
        }, { url: '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id) }));
        const body = await response.json().catch(() => ({}));
        state.worldTutorialProgress = response.ok
          ? normalizeWorldTutorialProgress(body.progress || nextProgress)
          : state.worldTutorialProgress;
        state.worldTutorialError = response.ok ? null : (body.error || 'tutorial guidance update failed');
        state.worldTutorialLoaded = true;
        state.worldCommandOpen = false;
        state.worldCommandQuery = '';
        draw();
        return;
      }
      if (action.kind === 'tutorial-resume') {
        if (state.session?.authenticated && state.worldTutorialProgress) {
          const nextProgress = {
            ...state.worldTutorialProgress,
            hidden: false,
            replayScopeKey: null
          };
          await fetch('/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id), requestOptions({
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(nextProgress)
          }, { url: '/api/tutorial-progress/' + encodeURIComponent(commandTutorial.id) })).catch(() => {});
          state.worldTutorialProgress = normalizeWorldTutorialProgress(nextProgress);
          state.worldTutorialLoaded = true;
        }
        window.location.assign(action.href);
        return;
      }
      if (action.kind === 'widget-version-activate') {
        await requestWidgetVersionChange({ soul: action.soul, version: action.version });
        return;
      }
      if (action.kind === 'widget-version-rollback') {
        await requestWidgetVersionRollback({ soul: action.soul });
        return;
      }
      if (action.kind === 'select') {
        selectedId = action.id;
        state.worldGraphSelectedId = action.id;
        state.worldGraphSelectedKind = '';
        state.worldGraphPrimitiveMode = false;
        state.worldGraphMode = action.mode || 'graph';
        if (state.worldGraphMode === 'source') await openSourceForSelected();
        else state.worldGraphSource = null;
        draw();
      }
    };
    const requestWidgetVersionChange = async ({ soul, version }) => {
      if (!soul || !version) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/activate', requestOptions({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version })
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/activate' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Activated ' + version + (body.status ? ' (' + body.status + ')' : ''))
          : (body.error || 'Widget version activation failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const requestWidgetVersionRollback = async ({ soul }) => {
      if (!soul) return;
      const response = await fetch('/api/widget-versions/' + encodeURIComponent(soul) + '/rollback', requestOptions({
        method: 'POST'
      }, { url: '/api/widget-versions/' + encodeURIComponent(soul) + '/rollback' }));
      const body = await response.json().catch(() => ({}));
      state.worldGraphVersionStatus = {
        soul,
        level: response.ok ? 'ok' : 'error',
        message: response.ok
          ? ('Rolled back to ' + (body.version || 'previous version'))
          : (body.error || 'Widget version rollback failed')
      };
      selectedId = soul;
      state.worldGraphSelectedId = soul;
      state.worldGraphSelectedKind = '';
      state.worldGraphMode = 'graph';
      state.worldGraphSource = null;
      if (!response.ok) {
        draw();
        return;
      }
      await refreshProjection();
    };
    const draw = () => {
      queueWorldTutorialStateLoad();
      root.innerHTML = '<div class="world-graph-shell"><aside class="world-graph-inspector" data-world-inspector>' + renderWorldTutorialPanel() + renderInspector() + '</aside><section class="world-main-pane">' + renderModeMenu() + renderWorldCommandPalette() + renderCanvas() + '</section></div>';
      if (state.worldGraphInitialSourcePending && currentMode() === 'source' && !state.worldGraphSource && !state.worldGraphSourceLoading) {
        state.worldGraphInitialSourcePending = false;
        state.worldGraphSourceLoading = true;
        void openSourceForSelected()
          .catch(() => {})
          .finally(() => {
            state.worldGraphSourceLoading = false;
            if (byWidget(widget)) draw();
          });
      }
      root.querySelectorAll('[data-world-mode]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          state.worldGraphMode = el.getAttribute('data-world-mode') || 'graph';
          if (state.worldGraphMode !== 'source') state.worldGraphSource = null;
          if (state.worldGraphMode === 'source' && !state.worldGraphSource) await openSourceForSelected();
          draw();
        });
      });
      root.querySelectorAll('[data-world-node-id], [data-world-select]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          selectedId = el.getAttribute('data-world-node-id') || el.getAttribute('data-world-select');
          if (!selectedId) return;
          state.worldGraphSelectedId = selectedId;
          state.worldGraphSelectedKind = '';
          state.worldGraphPrimitiveMode = false;
          if (currentMode() === 'source') await openSourceForSelected();
          else state.worldGraphSource = null;
          draw();
        });
      });
      root.querySelectorAll('[data-world-kind]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphSelectedKind = el.getAttribute('data-world-kind') || '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-clear-kind]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphSelectedKind = '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-source-file]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          const file = el.getAttribute('data-world-source-file') || '';
          await openSourceFile(file, el.getAttribute('data-world-source-focus') || state.worldGraphSourceFocus || selectedId);
          draw();
        });
      });
      root.querySelectorAll('[data-world-widget-activate]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await requestWidgetVersionChange({
            soul: el.getAttribute('data-world-widget-activate') || '',
            version: el.getAttribute('data-world-widget-version') || ''
          });
        });
      });
      root.querySelectorAll('[data-world-widget-rollback]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await requestWidgetVersionRollback({
            soul: el.getAttribute('data-world-widget-rollback') || ''
          });
        });
      });
      root.querySelectorAll('[data-world-open-process-program]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          const program = el.getAttribute('data-world-open-process-program') || '';
          const processEvent = el.getAttribute('data-world-open-process-event') || '';
          if (!program || !processEvent) return;
          window.location.assign(processViewHref({ program, event: processEvent }));
        });
      });
      root.querySelectorAll('[data-world-jump-to-graph]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          const id = el.getAttribute('data-world-jump-to-graph');
          if (!id) return;
          selectedId = id;
          state.worldGraphSelectedId = id;
          state.worldGraphSelectedKind = '';
          state.worldGraphSource = null;
          state.worldGraphMode = 'graph';
          draw();
        });
      });
      root.querySelectorAll('[data-world-close-source]').forEach(el => {
        el.addEventListener('click', event => { event.preventDefault(); state.worldGraphSource = null; state.worldGraphMode = 'graph'; draw(); });
      });
      root.querySelectorAll('[data-world-primitive], [data-world-primitive-kind-only]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldGraphMode = 'primitive';
          state.worldGraphPrimitiveMode = true;
          state.worldGraphSource = null;
          state.worldGraphSelectedPrimitiveKind = el.getAttribute('data-world-primitive-kind') || el.getAttribute('data-world-primitive-kind-only') || state.worldGraphSelectedPrimitiveKind || '';
          state.worldGraphSelectedPrimitiveValue = el.getAttribute('data-world-primitive') || '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-close-primitive]').forEach(el => {
        el.addEventListener('click', event => { event.preventDefault(); state.worldGraphPrimitiveMode = false; state.worldGraphMode = 'graph'; draw(); });
      });
      root.querySelectorAll('[data-world-command-toggle]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
        });
      });
      root.querySelectorAll('[data-world-command-close]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          state.worldCommandOpen = false;
          state.worldCommandQuery = '';
          draw();
        });
      });
      root.querySelectorAll('[data-world-command-input]').forEach(el => {
        el.addEventListener('input', () => {
          state.worldCommandQuery = el.value || '';
          state.worldCommandFocusRequested = true;
          draw();
        });
        el.addEventListener('keydown', async event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          const items = visibleWorldCommands();
          if (items[0]) await executeWorldCommand(items[0]);
        });
      });
      root.querySelectorAll('[data-world-command-run]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          const index = Number(el.getAttribute('data-world-command-run'));
          const items = visibleWorldCommands();
          if (Number.isFinite(index) && items[index]) await executeWorldCommand(items[index]);
        });
      });
      root.querySelectorAll('[data-world-tutorial-focus-target]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          focusWorldTutorialTarget(el.getAttribute('data-world-tutorial-focus-target') || '');
        });
      });
      root.querySelectorAll('[data-world-tutorial-focus-scope-target]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          focusWorldTutorialScopeTarget(el.getAttribute('data-world-tutorial-focus-scope-target') || '');
        });
      });
      root.querySelectorAll('[data-world-tutorial-show-disabled]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          focusWorldTutorialDisabledList();
        });
      });
      root.querySelectorAll('[data-world-tutorial-resume]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await resumeWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-next]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await advanceWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-back]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await backWorldTutorial();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-restart-chapter]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await restartWorldTutorialChapter();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-restart-step]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await restartWorldTutorialFromHere();
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-enable-scope]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(clearWorldTutorialScopeDisabled(state.worldTutorialProgress, el.getAttribute('data-world-tutorial-enable-scope') || ''));
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-enable-context]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(clearWorldTutorialContextDisabled(state.worldTutorialProgress, el.getAttribute('data-world-tutorial-enable-context') || currentSurfaceContext));
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-open-scope]').forEach(el => {
        el.addEventListener('click', event => {
          event.preventDefault();
          const href = el.getAttribute('data-world-tutorial-open-scope') || '';
          if (href) window.location.assign(href);
        });
      });
      root.querySelectorAll('[data-world-tutorial-disable]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(disableWorldTutorialOnCurrentScope(state.worldTutorialProgress));
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-disable-context]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress(disableWorldTutorialOnCurrentContext(state.worldTutorialProgress));
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-exit]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          if (!state.worldTutorialProgress) return;
          await persistWorldTutorialProgress({ ...state.worldTutorialProgress, hidden: true, replayScopeKey: null });
          draw();
        });
      });
      root.querySelectorAll('[data-world-tutorial-reset]').forEach(el => {
        el.addEventListener('click', async event => {
          event.preventDefault();
          await clearWorldTutorialProgress();
          draw();
        });
      });
      const selected = byId[selectedId];
      const canvas = root.querySelector('.world-graph-canvas');
      if (selected && canvas && currentMode() === 'graph') {
        canvas.scrollLeft = Math.max(0, (selected.x || 0) - canvas.clientWidth / 2 + 95);
        canvas.scrollTop = Math.max(0, (selected.y || 0) - canvas.clientHeight / 2 + 28);
      }
      updateWorldTutorialApi();
      if (worldTutorialSurfaceState(state.worldTutorialProgress).kind === 'active') {
        focusWorldTutorialTarget(commandTutorialStep(state.worldTutorialProgress)?.target || '');
      } else {
        const domRoot = tutorialDomRoot();
        domRoot.querySelectorAll('[data-tutorial-current]').forEach(node => node.removeAttribute('data-tutorial-current'));
        domRoot.querySelectorAll('[data-tutorial-focus-scope]').forEach(node => node.removeAttribute('data-tutorial-focus-scope'));
      }
      if (state.worldCommandOpen && state.worldCommandFocusRequested !== false) {
        const input = root.querySelector('[data-world-command-input]');
        if (input) {
          input.focus();
          const length = input.value.length;
          input.setSelectionRange(length, length);
        }
        state.worldCommandFocusRequested = false;
      }
    };
    if (!state.worldCommandShortcutBound) {
      state.worldCommandShortcutBound = true;
      window.addEventListener('keydown', event => {
        const active = document.activeElement;
        const typing = active?.matches?.('input, textarea, select') || active?.isContentEditable;
        const key = String(event.key || '').toLowerCase();
        if ((event.ctrlKey || event.metaKey) && key === 'k') {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
          return;
        }
        if (event.key === 'Escape' && state.worldCommandOpen) {
          event.preventDefault();
          state.worldCommandOpen = false;
          state.worldCommandQuery = '';
          draw();
          return;
        }
        if (event.key === '/' && !typing && !state.worldCommandOpen) {
          event.preventDefault();
          state.worldCommandOpen = true;
          state.worldCommandFocusRequested = true;
          draw();
        }
      });
    }
    draw();
  };
  const initSession = async () => {
    const res = await fetch('/api/session', requestOptions({}, { url: '/api/session' }));
    const body = await res.json().catch(() => ({ authenticated: false }));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    await requestWorldTutorialProgress().catch(() => {});
  };
  const setSession = async ({ from }) => {
    const credentials = state[from] || {};
    const res = await fetch('/api/session', requestOptions({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: credentials.username || '',
        password: credentials.password || ''
      })
    }, { url: '/api/session' }));
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || 'session request failed');
    syncSession(body);
    await requestWorldTutorialProgress().catch(() => {});
  };
  const logout = async () => {
    const res = await fetch('/api/session', requestOptions({ method: 'DELETE' }, { url: '/api/session' }));
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error || 'logout failed');
    }
    syncSession({ authenticated: false, identity: null, actor: null, label: null, perspective: null });
    await requestWorldTutorialProgress().catch(() => {});
  };
  const formForWidget = widget => {
    const el = byWidget(widget);
    if (!el) return null;
    return el.matches?.('form') ? el : el.querySelector?.('form') || null;
  };
  const readTypedForm = (data, schema) => {
    const result = validateProcessInput(typeModel, schema, data, { coerceStrings: true });
    if (result.ok) return result.value;
    const first = result.failures?.[0];
    throw new Error(first?.reason || ('typed validation failed for ' + schema));
  };
  const readForm = ({ widget, into, schema }) => {
    const form = formForWidget(widget);
    if (!form) throw new Error('widget ' + widget + ' does not contain a form');
    const data = Object.fromEntries(new FormData(form).entries());
    state[into] = schema ? readTypedForm(data, schema) : data;
  };
  const clearForm = ({ widget }) => { formForWidget(widget)?.reset?.(); };
  const bindSubmitHandlers = () => {
    for (const step of program.steps.filter(s => s.event && s.event.startsWith('submit:'))) {
      const widget = step.event.slice('submit:'.length);
      const form = byWidget(widget);
      if (form && !form.__witnessBound) {
        form.__witnessBound = true;
        form.addEventListener('submit', event => { event.preventDefault(); safeRun('submit:' + widget); });
      }
    }
  };
  const refreshProjection = async () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      const res = await fetch(window.location.href, requestOptions({}, { url: window.location.pathname }));
      if (!res.ok) throw new Error('projection refresh failed');
      const html = await res.text();
      const nextDocument = new DOMParser().parseFromString(html, 'text/html');
      const nextProgramEl = nextDocument.getElementById('witness-frontend-program');
      if (nextProgramEl?.textContent) {
        program = JSON.parse(nextProgramEl.textContent);
        config = program.config || {};
        typeModel = config.typeModel || {};
      }
      const nextRoot = nextDocument.querySelector('[data-widget="' + CSS.escape(program.rootWidget) + '"]');
      const currentRoot = byWidget(program.rootWidget);
      if (!nextRoot || !currentRoot) throw new Error('projection root not found');
      currentRoot.replaceWith(nextRoot);
      document.querySelectorAll('[data-widget-template]').forEach(node => node.remove());
      const currentProgramEl = document.getElementById('witness-frontend-program');
      const templateAnchor = currentProgramEl || document.body.lastChild;
      nextDocument.querySelectorAll('[data-widget-template]').forEach(template => {
        const clone = template.cloneNode(true);
        if (templateAnchor?.parentNode) templateAnchor.parentNode.insertBefore(clone, templateAnchor);
        else document.body.appendChild(clone);
      });
      if (currentProgramEl && nextProgramEl?.textContent) currentProgramEl.textContent = nextProgramEl.textContent;
      bindSubmitHandlers();
      await safeRun('load');
      invalidateSurfaceInspectorGraph();
      invalidateSurfaceInspectorWidgets();
      applySurfaceInspectorHighlight(selectedSurfaceWidgetId());
      updateSurfaceInspectorUi();
    })();
    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  };
  const bootLiveProjection = () => {
    if (!config.liveProjection || liveProjectionStarted) return;
    liveProjectionStarted = true;
    const stream = new EventSource('/api/events');
    stream.onmessage = event => {
      try {
        const payload = JSON.parse(event.data || '{}');
        if (!liveProjectionProcesses.has(payload.process)) return;
        void refreshProjection();
      } catch {}
    };
  };
  const resolveBody = ({ from, pick, body }) => {
    if (body) return interpolateValue(body, scopeFor({}));
    const source = state[from] || {};
    if (!pick) return source;
    const out = {};
    for (const key of pick) out[key] = source[key];
    return out;
  };
  const stepTraceMeta = (step, event, runId, extra = {}) => ({
    runId,
    program: program.id || '',
    event,
    nodeId: step?.id || '',
    op: step?.op || '',
    frontier: Array.isArray(step?.after) ? [...step.after] : [],
    repeat: step?.repeat ?? null,
    ...extra
  });
  async function run(event, eventData = {}, { runId = makeRunId() } = {}) {
    state.event = eventData;
    const nodes = (program.graph || program.steps || []).filter(s => s.event === event);
    await recordProcessEvent('frontend.process.start', {
      runId,
      program: program.id || '',
      event,
      status: 'start',
      eventData
    });
    try {
      await runProcessGraph(
        nodes,
        event,
        async (node, nextState, executionScope) => {
          await executeStep(node, { runId, stateRef: nextState, executionScope });
        },
        state,
        {
          onNodeStart: async node => {
            await recordProcessEvent('frontend.step.start', stepTraceMeta(node, event, runId, { status: 'start' }));
          },
          onNodeSkipped: async node => {
            await recordProcessEvent('frontend.step.skipped', stepTraceMeta(node, event, runId, { status: 'skipped' }));
          },
          onNodeDone: async (node, meta) => {
            await recordProcessEvent('frontend.step.done', stepTraceMeta(node, event, runId, {
              status: 'done',
              repeatCount: meta.count ?? null
            }));
          },
          onNodeFailed: async (node, error) => {
            await recordProcessEvent('frontend.step.failed', stepTraceMeta(node, event, runId, {
              status: 'failed',
              message: error instanceof Error ? error.message : String(error)
            }));
          }
        }
      );
      await recordProcessEvent('frontend.process.done', {
        runId,
        program: program.id || '',
        event,
        status: 'done'
      });
    } catch (error) {
      await recordProcessEvent('frontend.process.failed', {
        runId,
        program: program.id || '',
        event,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  const hasEventHandlers = event => (program.graph || program.steps || []).some(step => step.event === event);
  async function dispatchError(error, event, step = null) {
    if (event === 'error') throw error;
    if (!hasEventHandlers('error')) throw error;
    await run('error', {
      message: error instanceof Error ? error.message : String(error),
      event,
      stepId: step?.id || '',
      op: step?.op || ''
    });
  }
  async function safeRun(event, eventData = {}, step = null) {
    try {
      await run(event, eventData);
    } catch (error) {
      await dispatchError(error, event, step);
    }
  }
  async function executeStep(step, { runId, stateRef = state, executionScope = {} }) {
    const p = interpolateValue(step.params || {}, scopeFor(executionScope));
    try {
      await withTraceContext(runId, step.id, async () => {
        if (step.op === 'initSession') await initSession(p);
        if (step.op === 'setSession') await setSession(p);
        if (step.op === 'logout') await logout(p);
        if (step.op === 'setText') setText(p.widget, p.text || '');
        if (step.op === 'setValue') setValue(p.widget, p.value ?? '');
        if (step.op === 'fetchJson') {
          const res = await fetch(p.url, requestOptions({}, { url: p.url }));
          stateRef[p.into] = await res.json().catch(() => ({}));
          if (!res.ok && !p.allowFailure) throw new Error(stateRef[p.into]?.error || 'request failed');
        }
        if (step.op === 'renderCollection') renderCollection(p);
        if (step.op === 'renderWorldGraph') renderWorldGraph(p);
        if (step.op === 'readForm') readForm(p);
        if (step.op === 'refreshProjection') await refreshProjection();
        if (step.op === 'reloadPage') window.location.reload();
        if (step.op === 'postJson' || step.op === 'patchJson' || step.op === 'deleteJson') {
          const method = step.op === 'postJson' ? (p.method || 'POST') : step.op === 'patchJson' ? (p.method || 'PATCH') : (p.method || 'DELETE');
          const options = requestOptions({ method, headers: { 'content-type': 'application/json' } }, { url: p.url });
          if (step.op !== 'deleteJson') options.body = JSON.stringify(resolveBody(p));
          const res = await fetch(p.url, options);
          stateRef[p.into || 'lastResponse'] = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(stateRef[p.into || 'lastResponse'].error || 'request failed');
        }
        if (step.op === 'clearForm') clearForm(p);
        if (step.op === 'run') await run(p.event, stateRef.event);
      });
    } catch (error) {
      throw error;
    }
  }
  bindSubmitHandlers();
  bootSurfaceInspector();
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    event.preventDefault();
    safeRun('click:' + button.dataset.action, { ...button.dataset, done: button.dataset.done === 'true' });
  });
  bootLiveProjection();
  updateSurfaceInspectorUi();
  safeRun('load');
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
})();`;
  return `<script type="application/json" id="witness-frontend-program">${json}</script>\n<script>\n${engine}\n</script>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

