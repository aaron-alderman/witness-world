import { todoStarterBlueprint } from "./starter-blueprints.js";

export const bundleId = "bundle-starter";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
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

export function createHandlers() {
  return {};
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
