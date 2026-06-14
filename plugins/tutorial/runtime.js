import { TODO_TUTORIAL_ID, todoTutorialDefinition } from "./tutorials.js";

function patternRoute(method, pattern, handler, paramNames = []) {
  return Object.freeze({ kind: "pattern", method, pattern, handler, paramNames });
}

export const bundleId = "bundle-tutorial";

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
    kind: "guidanceDefinitions",
    definitions: Object.freeze([{
      id: TODO_TUTORIAL_ID,
      title: "Build The Todo App From Scratch",
      definition: todoTutorialDefinition(),
      defaultForBootstrap: true
    }])
  }
]);

export function createHandlers(deps) {
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
