import { DEMO_HANDLER_SET_PROVIDER } from "./handler-set.js";
import { executeDemoMutationRequest, writeDemoPrivateNotesProjectionCache, writeDemoTodoProjectionCache } from "./backend-mutations.js";
import { DEMO_RUNTIME_BUILTIN_SEEDS } from "./runtime-builtins.js";
import { demoModuleProjectors } from "./projections.js";

export const bundleId = "bundle-demo";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const capabilities = Object.freeze(["fs.json.read", "fs.json.write"]);
export const providers = Object.freeze([
  DEMO_HANDLER_SET_PROVIDER,
  {
    kind: "moduleProjectors",
    id: "demo.projections",
    projectors: demoModuleProjectors
  },
  {
    kind: "backendProcessRequestHandlers",
    id: "demo.mutations",
    handlers: {
      "privateNote.create": async ({ world, backendHost, body, requestActor, appContext }) => executeDemoMutationRequest(world, {
        process: "privateNote.create",
        actor: requestActor ?? null,
        backendHost,
        body,
        onPrivateNotesChanged: () => writeDemoPrivateNotesProjectionCache(appContext?.storage?.privateNotesProjection ?? null, world)
      }),
      "todo.create": async ({ world, backendHost, body, requestActor, appContext }) => executeDemoMutationRequest(world, {
        process: "todo.create",
        actor: requestActor ?? null,
        backendHost,
        body,
        onTodosChanged: () => writeDemoTodoProjectionCache(appContext?.storage?.todoProjection ?? null, world)
      }),
      "todo.update": async ({ world, backendHost, body, params, requestActor, appContext }) => executeDemoMutationRequest(world, {
        process: "todo.update",
        actor: requestActor ?? null,
        backendHost,
        body,
        options: params?.options && typeof params.options === "object" ? params.options : {},
        onTodosChanged: () => writeDemoTodoProjectionCache(appContext?.storage?.todoProjection ?? null, world)
      }),
      "todo.delete": async ({ world, backendHost, body, params, requestActor, appContext }) => executeDemoMutationRequest(world, {
        process: "todo.delete",
        actor: requestActor ?? null,
        backendHost,
        body,
        options: params?.options && typeof params.options === "object" ? params.options : {},
        onTodosChanged: () => writeDemoTodoProjectionCache(appContext?.storage?.todoProjection ?? null, world)
      }),
      "widget.define": async ({ world, backendHost, body, params, requestActor }) => executeDemoMutationRequest(world, {
        process: "widget.define",
        actor: requestActor ?? null,
        backendHost,
        body,
        options: params?.options && typeof params.options === "object" ? params.options : {}
      })
    }
  },
  {
    kind: "defaultHostCapabilities",
    hostKind: "backend",
    capabilities
  },
  {
    kind: "startupRequiredHostCapabilities",
    hostKind: "backend",
    capabilities
  },
  {
    kind: "runtimeBuiltinSeeds",
    ...DEMO_RUNTIME_BUILTIN_SEEDS
  }
]);
export const handlerSetProvider = DEMO_HANDLER_SET_PROVIDER;

export function createHandlers() {
  return {};
}

export default {
  bundleId,
  handlerCatalog,
  capabilities,
  routes,
  surfaces,
  providers,
  createHandlers
};
