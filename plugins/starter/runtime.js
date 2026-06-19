import { todoStarterBlueprint } from "./starter-blueprints.js";
import { createStarterBundleHandlers } from "./starter-apply.js";

export const bundleId = "bundle-starter";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([
    "starter.todo.apply"
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([
  Object.freeze({ kind: "exact", method: "POST", path: "/api/bootstrap-starters/todo", handler: "starter.todo.apply", params: {} })
]);
export const surfaces = Object.freeze([]);

export const providers = Object.freeze([
  {
    kind: "starterBlueprints",
    blueprints: Object.freeze([{
      id: "todo-starter",
      title: "Todo Starter",
      blueprint: todoStarterBlueprint(),
      defaultForBootstrap: true
    }])
  }
]);

export function createHandlers(deps) {
  return createStarterBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
