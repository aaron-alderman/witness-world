import { DEMO_HANDLER_SET_PROVIDER } from "./handler-set.js";

export const bundleId = "bundle-demo";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([]),
  pageHandlers: Object.freeze([]),
  dispatchHandlers: Object.freeze([]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);
export const providers = Object.freeze([DEMO_HANDLER_SET_PROVIDER]);
export const handlerSetProvider = DEMO_HANDLER_SET_PROVIDER;

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
