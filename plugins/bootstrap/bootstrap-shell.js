import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TODO_TUTORIAL_ID } from "../tutorial/tutorials.js";
import { bootstrapTutorialPageData } from "../tutorial/tutorial-runtime-ui.js";
import {
  renderBootstrapTutorialStyles,
  renderBootstrapTutorialCard,
  renderBootstrapTutorialOverlay
} from "../tutorial/tutorial-bootstrap-ui.js";
import { renderBootstrapTutorialStateFactory } from "../tutorial/tutorial-bootstrap-client.js";
import { renderBootstrapTutorialControllerFactory } from "../tutorial/tutorial-bootstrap-controller-client.js";
import { createWorld } from "../../src/kernel.js";
import { applyWitnessToml } from "../../src/dsl.js";
import { ensureRuntimeBuiltins } from "../../src/runtime-builtins.js";
import { renderWidgetPage } from "../inspect/widget-page.js";
import { SHARED_SURFACE_KIT_CSS } from "../inspect/surface-kit-styles.js";
import { renderBootstrapBackendAuthoringControlsViewFactory } from "./bootstrap-backend-authoring-controls-view.js";
import { renderBootstrapBackendVersionControlsViewFactory } from "./bootstrap-backend-version-controls-view.js";
import { renderBootstrapCapabilityControlsSyncFactory } from "./bootstrap-capability-controls-sync.js";
import { createBootstrapControlsRuntimeFromBootstrap, renderBootstrapControlsRuntimeFactory } from "./bootstrap-controls-runtime.js";
import { renderBootstrapControlsSyncFactory } from "./bootstrap-controls-sync.js";
import { renderBootstrapDesktopControlsViewFactory } from "./bootstrap-desktop-controls-view.js";
import { renderBootstrapDomHelpersFactory } from "./bootstrap-dom-helpers.js";
import { renderBootstrapFormAccessViewFactory } from "./bootstrap-form-access-view.js";
import { renderBootstrapHostActionFactory } from "./bootstrap-host-actions.js";
import { renderBootstrapHostNavigationFactory } from "./bootstrap-host-navigation.js";
import { renderBootstrapHostRefreshFactory } from "./bootstrap-host-refresh.js";
import { renderBootstrapLiveStateFactory } from "./bootstrap-live-state.js";
import { renderBootstrapScopedControlsSyncFactory } from "./bootstrap-scoped-controls-sync.js";
import { renderBootstrapScopedControlsViewFactory } from "./bootstrap-scoped-controls-view.js";
import { renderBootstrapStarterControlsViewFactory } from "./bootstrap-starter-controls-view.js";
import { buildBootstrapStarterPlan } from "./bootstrap-starter-plan.js";
import {
  renderBootstrapVersionGuidanceFactory
} from "./bootstrap-version-guidance.js";
import {
  mcpServerProposalBody,
  mcpToolProposalBody,
  renderBootstrapProposalAdjacentFactory,
  runtimePluginProposalBody
} from "./bootstrap-proposal-adjacent.js";
import { renderBootstrapProposalAdjacentControlsViewFactory } from "./bootstrap-proposal-adjacent-controls-view.js";
import { renderBootstrapProposalAdjacentSubmitFactory } from "./bootstrap-proposal-adjacent-submit.js";
import { renderBootstrapProposalAdjacentSyncFactory } from "./bootstrap-proposal-adjacent-sync.js";
import { renderBootstrapProposalControlsSyncFactory } from "./bootstrap-proposal-controls-sync.js";
import { renderBootstrapProposalControlsViewFactory } from "./bootstrap-proposal-controls-view.js";
import { renderBootstrapRuntimeIntegrationDirectControlsSyncFactory } from "./bootstrap-runtime-integration-direct-controls-sync.js";
import { renderBootstrapRuntimeIntegrationDirectSubmitFactory } from "./bootstrap-runtime-integration-direct-submit.js";
import { renderBootstrapRuntimeIntegrationStateFactory } from "./bootstrap-runtime-integration-state.js";
import { renderBootstrapRuntimeIntegrationControlsViewFactory } from "./bootstrap-runtime-integration-controls-view.js";
import { renderBootstrapRuntimeIntegrationOptionsViewFactory } from "./bootstrap-runtime-integration-options-view.js";
import { renderBootstrapAppAuthoringSubmitFactory } from "./bootstrap-app-authoring-submit.js";
import { renderBootstrapRefreshRuntimeFactory } from "./bootstrap-refresh-runtime.js";
import { renderBootstrapRouteAuthoringSyncFactory } from "./bootstrap-route-authoring-sync.js";
import { renderBootstrapRuntimePluginReviewSyncFactory } from "./bootstrap-runtime-plugin-review-sync.js";
import { renderBootstrapRuntimePluginReviewViewFactory } from "./bootstrap-runtime-plugin-review-view.js";
import { renderBootstrapShellRenderViewFactory } from "./bootstrap-shell-render-view.js";
import { renderBootstrapShellRenderRuntimeFactory } from "./bootstrap-shell-render-runtime.js";
import { renderBootstrapStateListRenderFactory } from "./bootstrap-state-list-render.js";
import { renderBootstrapTutorialRuntimeFactory } from "./bootstrap-tutorial-runtime.js";
import { renderBootstrapTutorialRuntimeViewFactory } from "./bootstrap-tutorial-runtime-view.js";
import { renderBootstrapShellViewStateFactory } from "./bootstrap-shell-view-state.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bootstrapTopCardsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-top-cards.wtoml"), "utf8");
const bootstrapAppAuthoringControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-app-authoring-controls.wtoml"), "utf8");
const bootstrapBackendAuthoringControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-backend-authoring-controls.wtoml"), "utf8");
const bootstrapBackendVersionControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-backend-version-controls.wtoml"), "utf8");
const bootstrapCapabilityControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-capability-controls.wtoml"), "utf8");
const bootstrapProposalAdjacentControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-proposal-adjacent-controls.wtoml"), "utf8");
const bootstrapProposalCreateControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-proposal-create-controls.wtoml"), "utf8");
const bootstrapProposalReviewControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-proposal-review-controls.wtoml"), "utf8");
const bootstrapRuntimeIntegrationControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-runtime-integration-controls.wtoml"), "utf8");
const bootstrapScopedControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-scoped-controls.wtoml"), "utf8");
const bootstrapRemoveControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-remove-controls.wtoml"), "utf8");
const bootstrapStarterControlsWtoml = fs.readFileSync(path.join(__dirname, "bootstrap-starter-controls.wtoml"), "utf8");

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function extractBodyInner(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1] : html;
}

function replaceSlot(html, domId, content) {
  const escaped = String(domId).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`(<section[^>]*id="${escaped}"[^>]*>)([\\s\\S]*?)(</section>)`, "i"), `$1${content}$3`);
}

function bootstrapIdentityEditIdForUrl(requestUrl = "/_bootstrap") {
  const url = new URL(requestUrl, "http://bootstrap.local");
  const value = url.searchParams.get("identity");
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function buildBootstrapIdentityView({ bootstrapState = null, requestUrl = "/_bootstrap" } = {}) {
  const identities = Array.isArray(bootstrapState?.identities) ? bootstrapState.identities : [];
  const editId = bootstrapIdentityEditIdForUrl(requestUrl);
  const editingIdentity = identities.find(row => row.id === editId) || null;
  if (editingIdentity) {
    return {
      mode: "edit",
      editId: editingIdentity.id || "",
      heading: "Edit Identity",
      copy: "This handoff edits the real authored identity through bootstrap. Identity id and actor stay fixed in this first slice.",
      submitText: "Save Identity",
      createNewHidden: false,
      idDisabled: true,
      actorDisabled: true,
      fields: {
        editId: editingIdentity.id || "",
        id: editingIdentity.id || "",
        actor: editingIdentity.actor || "",
        label: editingIdentity.label || "",
        username: editingIdentity.username || "",
        password: editingIdentity.password || "",
        homePerspective: editingIdentity.homePerspective || "",
        homeContext: editingIdentity.homeContext || ""
      }
    };
  }
  return {
    mode: "create",
    editId: "",
    heading: "Create First Identity",
    copy: "Create the first user when the world is blank. After identities exist, normal session auth is required for bootstrap edits.",
    submitText: "Create Identity",
    createNewHidden: true,
    idDisabled: false,
    actorDisabled: false,
    fields: {
      editId: "",
      id: "",
      actor: "",
      label: "",
      username: "",
      password: "",
      homePerspective: "",
      homeContext: ""
    }
  };
}

function renderBootstrapAuthoredTopCards(identityView = buildBootstrapIdentityView()) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapTopCardsWtoml);
  const initialStateScriptId = "witness-bootstrap-top-cards-initial-state";
  const html = renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "bootstrap_top_cards_root",
    frontendProgram: "bootstrap_top_cards_program",
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId: "witness-bootstrap-top-cards-program",
      initialStateScriptId,
      initialStateInto: "bootstrapIdentityView"
    }
  });
  return `<script type="application/json" id="${initialStateScriptId}">${jsonForScript(identityView)}</script>`
    + replaceSlot(extractBodyInner(html), "bootstrap-tutorial-card-slot", renderBootstrapTutorialCard());
}

function renderBootstrapAuthoredAppAuthoringControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapAppAuthoringControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredBackendVersionControls() {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapBackendVersionControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "bootstrap_backend_version_controls_root",
    frontendProgram: "bootstrap_backend_version_controls_program",
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId: "witness-bootstrap-backend-version-controls-program"
    }
  }));
}

function renderBootstrapAuthoredBackendAuthoringControls() {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapBackendAuthoringControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "bootstrap_backend_authoring_controls_root",
    frontendProgram: "bootstrap_backend_authoring_controls_program",
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId: "witness-bootstrap-backend-authoring-controls-program"
    }
  }));
}

function renderBootstrapAuthoredCapabilityControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapCapabilityControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredProposalReviewControls() {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapProposalReviewControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "bootstrap_proposal_review_controls_root",
    frontendProgram: "bootstrap_proposal_review_controls_program",
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId: "witness-bootstrap-proposal-review-controls-program"
    }
  }));
}

function renderBootstrapAuthoredProposalAdjacentControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapProposalAdjacentControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredProposalCreateControls() {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapProposalCreateControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget: "bootstrap_proposal_create_controls_root",
    frontendProgram: "bootstrap_proposal_create_controls_program",
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId: "witness-bootstrap-proposal-create-controls-program"
    }
  }));
}

function renderBootstrapAuthoredRuntimeIntegrationControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapRuntimeIntegrationControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredRemoveControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapRemoveControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredScopedControls(rootWidget, frontendProgram, frontendProgramScriptId) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapScopedControlsWtoml);
  return extractBodyInner(renderWidgetPage(world, {
    actor: "frontendHost",
    rootWidget,
    frontendProgram,
    appConfig: {
      traceProcessEvents: false,
      frontendProgramScriptId
    }
  }));
}

function renderBootstrapAuthoredStarterControls(starterPlan = { requests: [] }) {
  const world = createWorld();
  ensureRuntimeBuiltins(world);
  applyWitnessToml(world, bootstrapStarterControlsWtoml);
  const initialStateScriptId = "witness-bootstrap-starter-controls-initial-state";
  return `<script type="application/json" id="${initialStateScriptId}">${jsonForScript(starterPlan)}</script>`
    + extractBodyInner(renderWidgetPage(world, {
      actor: "frontendHost",
      rootWidget: "bootstrap_starter_controls_root",
      frontendProgram: "bootstrap_starter_controls_program",
      appConfig: {
        traceProcessEvents: false,
        frontendProgramScriptId: "witness-bootstrap-starter-controls-program",
        initialStateScriptId,
        initialStateInto: "bootstrapStarterPlan"
      }
    }));
}

export function renderBootstrapPage({ bootstrapState = null, bootstrapModel = null, requestUrl = "/_bootstrap" } = {}) {
  const { tutorial } = bootstrapTutorialPageData();
  const identityView = buildBootstrapIdentityView({ bootstrapState, requestUrl });
  const starterPlan = buildBootstrapStarterPlan({ bootstrapModel, bootstrapState });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Witness Bootstrap</title>
  <style>
    :root {
      --bg: #f4f1ea;
      --card: #fffdf8;
      --line: #d9d2c7;
      --ink: #1f1b17;
      --muted: #6a635b;
      --accent: #7a4d2a;
      --accent-soft: #efe1d3;
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      --page-bg: linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%);
      --surface-bg: var(--card);
      --surface-strong: #f6ede1;
      --surface-border: var(--line);
      --surface-shadow: 0 10px 30px rgba(40, 24, 8, .06);
      --input-bg: #fff;
      --button-bg: #7a4d2a;
      --panel-radius: 16px;
      --texture-opacity: 0;
      --body-font: Georgia, "Times New Roman", serif;
      --heading-font: Georgia, "Times New Roman", serif;
    }
${SHARED_SURFACE_KIT_CSS}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, "Times New Roman", serif; background: linear-gradient(180deg, #f7f2eb 0%, #efe9df 100%); color: var(--ink); }
    header { padding: 28px 32px 20px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,.7); backdrop-filter: blur(6px); position: sticky; top: 0; z-index: 4; }
    header small { display: inline-block; text-transform: uppercase; letter-spacing: .16em; color: var(--muted); font-size: 11px; margin-bottom: 8px; }
    header h1 { margin: 0 0 8px; font-size: 2rem; }
    header p { margin: 0; max-width: 960px; color: var(--muted); line-height: 1.5; }
    main { display: grid; grid-template-columns: 1.25fr .95fr; gap: 20px; padding: 24px 32px 40px; align-items: start; }
    .column { display: grid; gap: 18px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; box-shadow: 0 10px 30px rgba(40, 24, 8, .06); }
    .card h2 { margin: 0 0 10px; font-size: 1.15rem; }
    .card p { margin: 0 0 10px; color: var(--muted); line-height: 1.5; }
    .badge { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); padding: 5px 10px; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .stack { display: grid; gap: 12px; }
    .grid { display: grid; gap: 10px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    label { display: grid; gap: 4px; font-size: 13px; color: var(--muted); }
    input, select, textarea, button { font: inherit; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: white; color: var(--ink); }
    textarea { min-height: 96px; resize: vertical; font-family: var(--mono); font-size: 12px; line-height: 1.45; }
    button { border: 1px solid #734e31; background: #7a4d2a; color: white; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
    button.secondary { background: white; color: var(--accent); }
    button:disabled { opacity: .55; cursor: default; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .status { min-height: 1.2em; color: var(--accent); }
    .muted { color: var(--muted); }
    .state-list { display: grid; gap: 8px; max-height: 340px; overflow: auto; }
    .state-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: #fff; transition: box-shadow .24s ease, transform .24s ease, border-color .24s ease; }
    .state-item strong { display: block; margin-bottom: 3px; font-family: var(--mono); font-size: 12px; }
    .state-item code { font-family: var(--mono); font-size: 12px; color: var(--muted); white-space: pre-wrap; }
    .hide { display: none !important; }
    .note { border-left: 4px solid var(--accent); padding-left: 10px; }
    .kicker { font-size: 12px; text-transform: uppercase; letter-spacing: .12em; color: var(--muted); font-family: var(--mono); }
    .chapter-list { display: grid; gap: 6px; margin: 12px 0; }
    .chapter-item { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: start; font-size: 13px; color: var(--muted); }
    .chapter-item strong { color: var(--ink); }
    .chapter-dot { width: 12px; height: 12px; border-radius: 999px; border: 1px solid var(--line); background: white; margin-top: 2px; }
    .chapter-active .chapter-dot { background: var(--accent); border-color: var(--accent); }
    .chapter-done .chapter-dot { background: #3f7d47; border-color: #3f7d47; }
    .chapter-active strong, .chapter-done strong { color: var(--ink); }
${renderBootstrapTutorialStyles()}
    .badge, #tutorial-overlay .tutorial-meta, .chapter-item div:last-child, #tutorial-summary, .state-list, #bootstrap-summary, #session-summary, #tutorial-status, #bootstrap-status,
    #identity-form input, #session-form input, #widget-form input, #widget-form select, #program-form input, #program-form select, #step-form input, #step-form select,
    #backend-program-form input, #backend-program-form select, #backend-program-version-form input, #backend-program-version-form select, #backend-step-form input, #backend-step-form select,
    #backend-program-activate-form select, #backend-program-rollback-form select,
    #route-form input, #route-form select, #serve-form select, #runner-form input, #runner-form select {
      font-family: var(--mono);
    }
    details summary { cursor: pointer; }
    @keyframes tutorial-focus-pulse {
      0%, 100% { outline-color: rgba(122, 77, 42, 1); box-shadow: 0 0 0 0 rgba(122, 77, 42, .08); }
      50% { outline-color: rgba(122, 77, 42, .65); box-shadow: 0 0 0 10px rgba(122, 77, 42, .12); }
    }
    @keyframes tutorial-changed-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(122, 77, 42, .18); }
      45% { transform: scale(1.01); box-shadow: 0 0 0 6px rgba(122, 77, 42, .12); }
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
    @media (max-width: 1100px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <small>Semi-Internal Bootstrap Seam</small>
    <h1>Recover And Author The App Boundary</h1>
    <p>This surface exists so a blank world can become a working app without exposing compiler and primitive machinery as the default user experience. App structures live here; deep substrate stays out of the way.</p>
  </header>
  <main>
    <section class="column">
${renderBootstrapAuthoredTopCards(identityView)}

      <article class="card">
        <div class="badge">Governance</div>
        <h2>Contexts, Stewardship, And Proposals</h2>
        <p>This slice makes authority explicit. Scoped objects can be authored under a context, stewardship can be delegated, and guarded writes can be proposed for later approval.</p>

        <details open>
          <summary><strong>Contexts</strong></summary>
${renderBootstrapAuthoredAppAuthoringControls("bootstrap_context_authoring_controls_root", "bootstrap_context_authoring_controls_program", "witness-bootstrap-context-authoring-controls-program")}
        </details>

        <details>
          <summary><strong>Naming And Scope</strong></summary>
${renderBootstrapAuthoredScopedControls("bootstrap_context_binding_create_controls_root", "bootstrap_context_binding_create_controls_program", "witness-bootstrap-context-binding-create-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_context_binding_remove_controls_root", "bootstrap_context_binding_remove_controls_program", "witness-bootstrap-context-binding-remove-controls-program")}

${renderBootstrapAuthoredScopedControls("bootstrap_context_export_create_controls_root", "bootstrap_context_export_create_controls_program", "witness-bootstrap-context-export-create-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_context_export_remove_controls_root", "bootstrap_context_export_remove_controls_program", "witness-bootstrap-context-export-remove-controls-program")}

${renderBootstrapAuthoredScopedControls("bootstrap_context_import_create_controls_root", "bootstrap_context_import_create_controls_program", "witness-bootstrap-context-import-create-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_context_import_remove_controls_root", "bootstrap_context_import_remove_controls_program", "witness-bootstrap-context-import-remove-controls-program")}
        </details>

        <details>
          <summary><strong>Stewardship</strong></summary>
${renderBootstrapAuthoredScopedControls("bootstrap_stewardship_create_controls_root", "bootstrap_stewardship_create_controls_program", "witness-bootstrap-stewardship-create-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_stewardship_remove_controls_root", "bootstrap_stewardship_remove_controls_program", "witness-bootstrap-stewardship-remove-controls-program")}
        </details>

        <details>
          <summary><strong>Proposals</strong></summary>
${renderBootstrapAuthoredProposalCreateControls()}
${renderBootstrapAuthoredProposalReviewControls()}
        </details>
      </article>

      <article class="card">
        <div class="badge">App Surface</div>
        <h2>Focused Builders</h2>
        <p>These forms edit app-visible structures. Advanced step conditions and params use JSON when needed, but the main surface stays oriented around the app rather than the substrate.</p>

        <details open>
          <summary><strong>Widgets</strong></summary>
${renderBootstrapAuthoredAppAuthoringControls("bootstrap_widget_authoring_controls_root", "bootstrap_widget_authoring_controls_program", "witness-bootstrap-widget-authoring-controls-program")}
        </details>

        <details>
          <summary><strong>Frontend Programs</strong></summary>
${renderBootstrapAuthoredAppAuthoringControls("bootstrap_frontend_program_authoring_controls_root", "bootstrap_frontend_program_authoring_controls_program", "witness-bootstrap-frontend-program-authoring-controls-program")}
        </details>

        <details>
          <summary><strong>Backend Programs</strong></summary>
${renderBootstrapAuthoredBackendAuthoringControls()}
${renderBootstrapAuthoredBackendVersionControls()}
        </details>

        <details>
          <summary><strong>Routes And Mounts</strong></summary>
${renderBootstrapAuthoredAppAuthoringControls("bootstrap_route_mount_authoring_controls_root", "bootstrap_route_mount_authoring_controls_program", "witness-bootstrap-route-mount-authoring-controls-program")}
        </details>

        <details>
          <summary><strong>Runtime Wiring</strong></summary>
${renderBootstrapAuthoredAppAuthoringControls("bootstrap_runner_authoring_controls_root", "bootstrap_runner_authoring_controls_program", "witness-bootstrap-runner-authoring-controls-program")}
        </details>

        <details>
          <summary><strong>Runtime Plugins</strong></summary>
          <p class="note">Runtime plugin installs are authored on a specific server runner. Local plugin packages stay bundle-bridge only in this slice.</p>
          <p class="note muted">Bootstrap review shows durable authored runner intent only. CLI and environment plugin overlays are excluded here and remain visible in runtime diagnostics/startup reporting.</p>

          <div class="stack">
            <div class="grid two">
              <label>Review Server Runner<select id="runtime-plugin-review-runner"></select></label>
              <label>Review Plugin<select id="runtime-plugin-review-plugin"></select></label>
            </div>
            <p class="note muted" id="runtime-plugin-review-note"></p>
            <div id="runtime-plugin-review-detail" class="state-list"></div>
          </div>

${renderBootstrapAuthoredRuntimeIntegrationControls("bootstrap_runtime_plugin_install_controls_root", "bootstrap_runtime_plugin_install_controls_program", "witness-bootstrap-runtime-plugin-install-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_runtime_plugin_remove_controls_root", "bootstrap_runtime_plugin_remove_controls_program", "witness-bootstrap-runtime-plugin-remove-controls-program")}
${renderBootstrapAuthoredProposalAdjacentControls("bootstrap_runtime_plugin_install_proposal_controls_root", "bootstrap_runtime_plugin_install_proposal_controls_program", "witness-bootstrap-runtime-plugin-install-proposal-controls-program")}
${renderBootstrapAuthoredProposalAdjacentControls("bootstrap_runtime_plugin_remove_proposal_controls_root", "bootstrap_runtime_plugin_remove_proposal_controls_program", "witness-bootstrap-runtime-plugin-remove-proposal-controls-program")}
        </details>

        <details>
          <summary><strong>MCP</strong></summary>
          <p class="note">MCP servers and tool installs stay shell-facing in this slice. Transport visibility is descriptive, delegated mode runs as the caller, service mode requires a configured <code>serviceIdentity</code>, and scope JSON narrows where an installed tool may act.</p>

          <div class="grid">
            <div>
              <div class="kicker">MCP Servers</div>
              <div id="mcp-server-inventory" class="state-list"></div>
            </div>
            <div>
              <div class="kicker">Installed MCP Tools</div>
              <div id="mcp-tool-inventory" class="state-list"></div>
            </div>
          </div>

${renderBootstrapAuthoredRuntimeIntegrationControls("bootstrap_mcp_server_controls_root", "bootstrap_mcp_server_controls_program", "witness-bootstrap-mcp-server-controls-program")}

${renderBootstrapAuthoredRuntimeIntegrationControls("bootstrap_mcp_tool_install_controls_root", "bootstrap_mcp_tool_install_controls_program", "witness-bootstrap-mcp-tool-install-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_mcp_tool_remove_controls_root", "bootstrap_mcp_tool_remove_controls_program", "witness-bootstrap-mcp-tool-remove-controls-program")}
${renderBootstrapAuthoredProposalAdjacentControls("bootstrap_mcp_server_proposal_controls_root", "bootstrap_mcp_server_proposal_controls_program", "witness-bootstrap-mcp-server-proposal-controls-program")}
${renderBootstrapAuthoredProposalAdjacentControls("bootstrap_mcp_tool_install_proposal_controls_root", "bootstrap_mcp_tool_install_proposal_controls_program", "witness-bootstrap-mcp-tool-install-proposal-controls-program")}
${renderBootstrapAuthoredProposalAdjacentControls("bootstrap_mcp_tool_remove_proposal_controls_root", "bootstrap_mcp_tool_remove_proposal_controls_program", "witness-bootstrap-mcp-tool-remove-proposal-controls-program")}
        </details>

        <details>
          <summary><strong>Capabilities</strong></summary>
${renderBootstrapAuthoredCapabilityControls("bootstrap_capability_create_controls_root", "bootstrap_capability_create_controls_program", "witness-bootstrap-capability-create-controls-program")}
${renderBootstrapAuthoredCapabilityControls("bootstrap_capability_install_controls_root", "bootstrap_capability_install_controls_program", "witness-bootstrap-capability-install-controls-program")}

${renderBootstrapAuthoredRemoveControls("bootstrap_capability_remove_controls_root", "bootstrap_capability_remove_controls_program", "witness-bootstrap-capability-remove-controls-program")}
        </details>
      </article>

${renderBootstrapAuthoredStarterControls(starterPlan)}
    </section>

    <aside class="column">
      <article class="card" data-tutorial-target="authored-state">
        <div class="badge">Current World</div>
        <h2>Authored State</h2>
        <p>The tutorial uses the same authored structures shown here. Nothing is hidden behind a fake wizard layer.</p>
        <div class="stack">
          <section>
            <h3>Contexts</h3>
            <div id="state-contexts" class="state-list"></div>
          </section>
          <section>
            <h3>Context Bindings</h3>
            <div id="state-context-bindings" class="state-list"></div>
          </section>
          <section>
            <h3>Context Exports</h3>
            <div id="state-context-exports" class="state-list"></div>
          </section>
          <section>
            <h3>Context Imports</h3>
            <div id="state-context-imports" class="state-list"></div>
          </section>
          <section>
            <h3>Context Scope</h3>
            <div id="state-context-scopes" class="state-list"></div>
          </section>
          <section>
            <h3>Perspectives</h3>
            <div id="state-perspectives" class="state-list"></div>
          </section>
          <section>
            <h3>Stewardships</h3>
            <div id="state-stewardships" class="state-list"></div>
          </section>
          <section>
            <h3>Proposals</h3>
            <div id="state-proposals" class="state-list"></div>
          </section>
          <section>
            <h3>Authority</h3>
            <div id="state-authority" class="state-list"></div>
          </section>
          <section>
            <h3>Identities</h3>
            <div id="state-identities" class="state-list"></div>
          </section>
          <section>
            <h3>Widgets</h3>
            <div id="state-widgets" class="state-list"></div>
          </section>
          <section>
            <h3>Frontend Programs</h3>
            <div id="state-programs" class="state-list"></div>
          </section>
          <section>
            <h3>Frontend Steps</h3>
            <div id="state-steps" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Programs</h3>
            <div id="state-backend-programs" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Versions</h3>
            <div id="state-backend-program-versions" class="state-list"></div>
          </section>
          <section>
            <h3>Backend Steps</h3>
            <div id="state-backend-steps" class="state-list"></div>
          </section>
          <section>
            <h3>Routes</h3>
            <div id="state-routes" class="state-list"></div>
          </section>
          <section>
            <h3>Serve Mounts</h3>
            <div id="state-serves" class="state-list"></div>
          </section>
          <section>
            <h3>Server Runners</h3>
            <div id="state-runners" class="state-list"></div>
          </section>
          <section>
            <h3>Capabilities</h3>
            <div id="state-capabilities" class="state-list"></div>
          </section>
          <section>
            <h3>Capability Installs</h3>
            <div id="state-capability-installs" class="state-list"></div>
          </section>
          <section>
            <h3>Runtime Plugin Installs</h3>
            <div id="state-runtime-plugin-installs" class="state-list"></div>
          </section>
          <section>
            <h3>Runtime Plugin Availability</h3>
            <div id="state-runtime-plugin-availability" class="state-list"></div>
          </section>
          <section>
            <h3>MCP Servers</h3>
            <div id="state-mcp-servers" class="state-list"></div>
          </section>
          <section>
            <h3>MCP Tool Installs</h3>
            <div id="state-mcp-tool-installs" class="state-list"></div>
          </section>
        </div>
      </article>
    </aside>
  </main>
${renderBootstrapTutorialOverlay()}
  <script>
  (() => {
${renderBootstrapTutorialStateFactory()}
${renderBootstrapTutorialControllerFactory()}
${renderBootstrapBackendAuthoringControlsViewFactory()}
${renderBootstrapBackendVersionControlsViewFactory()}
${renderBootstrapCapabilityControlsSyncFactory()}
${renderBootstrapControlsRuntimeFactory()}
${renderBootstrapControlsSyncFactory()}
${renderBootstrapDesktopControlsViewFactory()}
${renderBootstrapDomHelpersFactory()}
${renderBootstrapFormAccessViewFactory()}
${renderBootstrapHostActionFactory()}
${renderBootstrapHostNavigationFactory()}
${renderBootstrapHostRefreshFactory()}
${renderBootstrapLiveStateFactory()}
${renderBootstrapScopedControlsSyncFactory()}
${renderBootstrapScopedControlsViewFactory()}
${renderBootstrapStarterControlsViewFactory()}
${renderBootstrapVersionGuidanceFactory()}
${renderBootstrapProposalAdjacentFactory()}
${renderBootstrapProposalAdjacentControlsViewFactory()}
${renderBootstrapProposalAdjacentSubmitFactory()}
${renderBootstrapProposalAdjacentSyncFactory()}
${renderBootstrapProposalControlsSyncFactory()}
${renderBootstrapProposalControlsViewFactory()}
${renderBootstrapRuntimeIntegrationDirectControlsSyncFactory()}
${renderBootstrapRuntimeIntegrationDirectSubmitFactory()}
${renderBootstrapRuntimeIntegrationStateFactory()}
${renderBootstrapRuntimeIntegrationControlsViewFactory()}
${renderBootstrapRuntimeIntegrationOptionsViewFactory()}
${renderBootstrapAppAuthoringSubmitFactory()}
${renderBootstrapRefreshRuntimeFactory()}
${renderBootstrapRouteAuthoringSyncFactory()}
${renderBootstrapRuntimePluginReviewSyncFactory()}
${renderBootstrapRuntimePluginReviewViewFactory()}
${renderBootstrapShellRenderViewFactory()}
${renderBootstrapShellRenderRuntimeFactory()}
${renderBootstrapStateListRenderFactory()}
${renderBootstrapTutorialRuntimeFactory()}
${renderBootstrapTutorialRuntimeViewFactory()}
${renderBootstrapShellViewStateFactory()}
    const tutorial = ${jsonForScript(tutorial)};
    const currentSurfacePage = "bootstrap";
    const localProgressKey = "witness.tutorial." + tutorial.id;
    const state = { model: null, bootstrapState: null, session: null, tutorialProgress: null, runtimePluginReview: null, desktopShell: null };
    const runtimePluginReviewRequestState = { current: 0 };
    const stepIndex = new Map(tutorial.steps.map((step, index) => [step.id, index]));
    const autoCompletableChapters = new Set(["widgets", "program", "routes"]);
    const stateSnapshots = new Map();
    const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const bootstrapControlsRuntime = createBootstrapControlsRuntimeFromBootstrap({ state });
    const { dom, liveState } = bootstrapControlsRuntime;
    const { byId, setStatus, formField, fillSelect, readSelectValue, readFieldValue, setSelectedValue, setSubmitDisabled } = dom;
    const byTarget = target => document.querySelector('[data-tutorial-target="' + CSS.escape(target) + '"]');
    const desktopApi = () => (window.witnessDesktop && typeof window.witnessDesktop.getDesktopShellState === "function")
      ? window.witnessDesktop
      : null;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const rowKey = row => row?.id || [row?.program, row?.event, row?.op, row?.order, row?.serverRunner, row?.path, row?.method, row?.actor, row?.label].filter(value => value != null && value !== "").join("\u0000") || JSON.stringify(row);
    const request = async (url, options = {}) => {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "request failed");
      return data;
    };
    const postJson = async (url, body, method = "POST") => request(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const renderRuntimePluginReviewDetail = () => {
      const root = byId("runtime-plugin-review-detail");
      if (!root) return;
      const view = buildBootstrapRuntimePluginReviewView({
        review: state.runtimePluginReview || null,
        escapeHtml,
        runtimeProfile: state.model?.runtimeProfile || "full"
      });
      root.innerHTML = view.detailHtml;
      setStatus("runtime-plugin-review-note", view.noteText);
    };
    const {
      buildProposalControlsSyncDeps,
      buildProposalAdjacentSyncDeps,
      capabilityControls,
      buildBackendControlsSyncDeps,
      buildRuntimeIntegrationDirectControlsSyncDeps,
      buildScopedControlsSyncDeps
    } = bootstrapControlsRuntime;
    const buildRouteAuthoringSyncDeps = createBootstrapRouteAuthoringSyncDepsBuilder({
      liveState,
      dom
    });
    const tutorialRuntime = createBootstrapTutorialRuntime({
      tutorial,
      state,
      stepIndex,
      currentSurfacePage,
      localProgressKey,
      request,
      byId,
      renderPage: () => render(),
      getAppReady: () => state.model?.appReady === true,
      refresh: (...args) => refresh(...args),
      setBootstrapStatus: message => setStatus("bootstrap-status", message),
      currentHref: () => window.location.href,
      currentPathname: () => window.location.pathname,
      assign: targetHref => window.location.assign(targetHref),
      reload: () => window.location.reload(),
      autoCompletableChapters,
      escapeHtml,
      byTarget,
      setStatus,
      formField,
      sleep
    });
    const {
      currentSuggestions,
      tutorialStep,
      tutorialDisabledPages,
      tutorialDisabledScopeKeys,
      tutorialReplayStepId,
      tutorialReplayScopeKey,
      tutorialStepScope,
      tutorialStepConcepts,
      tutorialRevealedConcepts,
      tutorialSurfaceState,
      loadTutorialProgress,
      openAppHome,
      continueTutorialOnPage,
      renderTutorialCard,
      renderTutorialOverlay,
      requestMaybeAdvanceTutorial,
      bindTutorialInteractions
    } = tutorialRuntime;
    const refresh = async () => runBootstrapRefresh({
      state,
      byId,
      request,
      desktopApi,
      loadRuntimePluginReviewFn: loadBootstrapRuntimePluginReview,
      runtimePluginReviewRequestState,
      loadTutorialProgress,
      render,
      requestMaybeAdvanceTutorial,
      setRuntimePluginReview: review => {
        state.runtimePluginReview = review;
      }
    });
    bindBootstrapHostRefresh({
      target: window,
      refresh,
      setBootstrapStatus: message => setStatus("bootstrap-status", message)
    });
    bindBootstrapBackendAuthoringControlsSync({
      target: window,
      buildDeps: buildBackendControlsSyncDeps
    });
    bindBootstrapProposalAdjacentSubmit({
      target: window,
      proposalCreate,
      refresh,
      setStatus,
      resetForm: formId => byId(formId)?.reset?.(),
      resolveServerRunner: server => liveState.runtimeIntegrationState().resolveServerRunner(server),
      runtimePluginProposalBodyFn: runtimePluginProposalBody,
      mcpServerProposalBodyFn: mcpServerProposalBody,
      mcpToolProposalBodyFn: mcpToolProposalBody
    });
    bindBootstrapProposalAdjacentSync({
      target: window,
      buildDeps: buildProposalAdjacentSyncDeps
    });
    bindBootstrapRuntimeIntegrationDirectControlsSync({
      target: window,
      buildDeps: buildRuntimeIntegrationDirectControlsSyncDeps
    });
    bindBootstrapRuntimeIntegrationDirectSubmit({
      target: window,
      postJson,
      refresh,
      setStatus,
      resetForm: formId => byId(formId)?.reset?.()
    });
    bindBootstrapAppAuthoringSubmit({
      target: window,
      postJson,
      refresh,
      setStatus,
      resetForm: formId => byId(formId)?.reset?.()
    });
    bindBootstrapRouteAuthoringSync({
      target: window,
      buildDeps: buildRouteAuthoringSyncDeps
    });
    bindBootstrapRuntimePluginReviewSync({
      byId,
      request,
      requestState: runtimePluginReviewRequestState,
      getReview: () => state.runtimePluginReview,
      setReview: review => {
        state.runtimePluginReview = review;
      },
      getRuntimeProfile: () => state.model?.runtimeProfile || "full",
      renderPage: () => render(),
      renderDetail: () => renderRuntimePluginReviewDetail(),
      setStatus
    });
    bindBootstrapProposalControlsSync({
      target: window,
      buildDeps: buildProposalControlsSyncDeps
    });
    bindBootstrapBackendVersionControlsSync({
      target: window,
      buildDeps: buildBackendControlsSyncDeps
    });
    bindBootstrapScopedControlsSync({
      target: window,
      buildDeps: buildScopedControlsSyncDeps
    });
    capabilityControls.bind();
    bindBootstrapHostActions({
      target: window,
      tutorialStep,
      openAppHome,
      desktopApi,
      setBootstrapStatus: message => setStatus("bootstrap-status", message),
      setDesktopStatus: message => setStatus("desktop-status", message)
    });
    const render = createBootstrapRenderRuntime({
      state,
      currentSurfacePage,
      byId,
      document,
      stateSnapshots,
      rowKey,
      fillSelect,
      setSelectedValue,
      capabilityControls,
      buildProposalControlsSyncDeps,
      runBootstrapProposalControlsSyncFn: runBootstrapProposalControlsSync,
      buildBackendControlsSyncDeps,
      runBootstrapBackendControlsRenderFn: runBootstrapBackendControlsRender,
      buildRuntimeIntegrationDirectControlsSyncDeps,
      runBootstrapRuntimeIntegrationDirectControlsSyncFn: runBootstrapRuntimeIntegrationDirectControlsSync,
      buildProposalAdjacentSyncDeps,
      runBootstrapProposalAdjacentSyncFn: runBootstrapProposalAdjacentSync,
      buildScopedControlsSyncDeps,
      runBootstrapScopedControlsSyncFn: runBootstrapScopedControlsSync,
      buildRouteAuthoringSyncDeps,
      runBootstrapRouteAuthoringSyncFn: runBootstrapRouteAuthoringSync,
      renderRuntimePluginReviewDetail,
      renderTutorialCard,
      renderTutorialOverlay,
      tutorialState,
      currentSuggestions,
      tutorialStep,
      tutorialStepScope,
      tutorialStepConcepts,
      tutorialRevealedConcepts,
      tutorialReplayScopeKey,
      tutorialReplayStepId,
      tutorialDisabledScopeKeys,
      tutorialDisabledPages,
      tutorialSurfaceState,
      publishTutorialRuntimeView: snapshot => {
        window.__witnessTutorial = snapshot;
      }
    });
    const proposalCreate = overrides => postJson("/api/proposals", overrides);

    bindTutorialInteractions();
    refresh().catch(error => setStatus("bootstrap-status", error.message));
  })();
  </script>
</body>
</html>`;
}

export function bootstrapSummary(model = {}) {
  return {
    appReady: model.appReady === true,
    homeReason: model.appReady === true ? "reachable home route" : (model.homeReason || "bootstrap fallback active")
  };
}
