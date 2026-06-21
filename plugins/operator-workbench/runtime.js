import path from "node:path";
import { operatorWorkbenchRvmForms } from "./desire-rvm.js";
import { buildOperatorWorkbenchDefinition } from "./operator-screen-specs.js";
import { createOperatorWorkbenchCore } from "./workbench/core.js";

export const bundleId = "bundle-operator-workbench";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "operator.snapshot.read",
    "operator.command.run",
    "operator.intent.dispatch",
    "operator.displaySettings.update",
    "operator.autocomplete.read"
  ]),
  handlerMetadata: Object.freeze({
    "operator.snapshot.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "operator.command.run": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "operator.intent.dispatch": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "operator.displaySettings.update": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "operator.autocomplete.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) })
  })
});

export const routes = Object.freeze([
  Object.freeze({ kind: "exact", method: "GET", path: "/api/operator/snapshot", handler: "operator.snapshot.read" }),
  Object.freeze({ kind: "exact", method: "POST", path: "/api/operator/command", handler: "operator.command.run" }),
  Object.freeze({ kind: "exact", method: "POST", path: "/api/operator/intent", handler: "operator.intent.dispatch" }),
  Object.freeze({ kind: "exact", method: "POST", path: "/api/operator/display-settings", handler: "operator.displaySettings.update" }),
  Object.freeze({ kind: "exact", method: "GET", path: "/api/operator/autocomplete", handler: "operator.autocomplete.read" })
]);

export const surfaces = Object.freeze([]);

function applyOperatorWorkbenchDeclaration() {
  return [];
}

export const desireExtensions = Object.freeze({
  rvmForms: operatorWorkbenchRvmForms,
  runtimeDeclarations: Object.freeze([
    Object.freeze({ kind: "operator_theme", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_action", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_menu", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_dataset", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_screen", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_screen_section", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_overlay", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_handle", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_surface", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_viewport", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_layout", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_keymap", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_setup", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_split", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_panel", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_content", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_chrome", apply: applyOperatorWorkbenchDeclaration }),
    Object.freeze({ kind: "operator_window", apply: applyOperatorWorkbenchDeclaration })
  ])
});

export const appProjectAssemblers = Object.freeze([
  Object.freeze({
    modelId: "operatorWorkbench",
    build({ authoredDesireDocs } = {}) {
      return buildOperatorWorkbenchDefinition({
        authoredDesireDocs: Array.isArray(authoredDesireDocs) ? authoredDesireDocs : []
      });
    }
  })
]);

function buildOperatorCoreArgs(appContext = {}) {
  const manifestPath = appContext?.manifestPath
    ?? appContext?.appSnapshotManager?.manifestPath
    ?? appContext?.appProject?.manifestPath
    ?? null;
  const runtimePluginIds = [...new Set([
    ...(Array.isArray(appContext?.runtimePluginIds) ? appContext.runtimePluginIds : []),
    "plugin.operator-workbench"
  ])];
  const args = [];
  if (manifestPath) args.push(manifestPath);
  if (appContext?.runtimeOperatorContract?.worldHome) {
    args.push("--world-home", appContext.runtimeOperatorContract.worldHome);
  }
  if (appContext?.runtimeProfile) {
    args.push("--runtime-profile", appContext.runtimeProfile);
  }
  for (const pluginId of runtimePluginIds) {
    args.push("--runtime-plugin", pluginId);
  }
  return args;
}

function operatorCoreCwd(appContext = {}) {
  const appRoot = appContext?.appRoot
    ?? appContext?.appSnapshotManager?.appRoot
    ?? appContext?.appProject?.appRoot
    ?? null;
  if (appRoot) return appRoot;
  const manifestPath = appContext?.manifestPath
    ?? appContext?.appSnapshotManager?.manifestPath
    ?? appContext?.appProject?.manifestPath
    ?? null;
  return manifestPath ? path.dirname(manifestPath) : process.cwd();
}

export function createHandlers({
  appContext = null,
  readJson,
  sendJson
} = {}) {
  let corePromise = null;

  const getCore = async runtimeAppContext => {
    if (!corePromise) {
      const activeAppContext = runtimeAppContext ?? appContext ?? {};
      corePromise = createOperatorWorkbenchCore({
        args: buildOperatorCoreArgs(activeAppContext),
        cwd: operatorCoreCwd(activeAppContext),
        env: process.env
      }).catch(error => {
        corePromise = null;
        throw error;
      });
    }
    return corePromise;
  };

  return {
    "operator.snapshot.read": async ({ res, appContext: runtimeAppContext }) => {
      const core = await getCore(runtimeAppContext);
      sendJson(res, 200, await core.snapshot());
    },

    "operator.command.run": async ({ req, res, appContext: runtimeAppContext }) => {
      const core = await getCore(runtimeAppContext);
      const body = await readJson(req);
      sendJson(res, 200, await core.executeCommand(body?.command ?? ""));
    },

    "operator.intent.dispatch": async ({ req, res, appContext: runtimeAppContext }) => {
      const core = await getCore(runtimeAppContext);
      sendJson(res, 200, await core.dispatchIntent(await readJson(req)));
    },

    "operator.displaySettings.update": async ({ req, res, appContext: runtimeAppContext }) => {
      const core = await getCore(runtimeAppContext);
      sendJson(res, 200, await core.updateDisplaySettings(await readJson(req)));
    },

    "operator.autocomplete.read": async ({ res, requestUrl, appContext: runtimeAppContext }) => {
      const core = await getCore(runtimeAppContext);
      sendJson(res, 200, core.autocomplete(requestUrl.searchParams.get("line") || ""));
    }
  };
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  desireExtensions,
  appProjectAssemblers,
  createHandlers
};
