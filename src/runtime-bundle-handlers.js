import { bundles as authoringRuntimeBundles } from "../plugins/authoring/runtime.js";
import { handlerCatalog as canvasHandlerCatalog } from "../plugins/canvas/runtime.js";
import { handlerCatalog as edenHandlerCatalog } from "../plugins/eden/runtime.js";
import { handlerCatalog as inspectHandlerCatalog } from "../plugins/inspect/runtime.js";
import { handlerCatalog as mcpHandlerCatalog } from "../plugins/mcp/runtime.js";
import { handlerCatalog as practicalBackendHandlerCatalog } from "../plugins/practical-backend/handler-catalog.js";

function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

function freezeCatalog({ authorableHandlers = [], pageHandlers = [], dispatchHandlers = [], handlerMetadata = {} }) {
  return Object.freeze({
    authorableHandlers: freezeStrings(authorableHandlers),
    pageHandlers: freezeStrings(pageHandlers),
    dispatchHandlers: freezeStrings(dispatchHandlers),
    handlerMetadata: Object.freeze(Object.fromEntries(
      Object.entries(handlerMetadata || {}).map(([handlerId, metadata]) => [String(handlerId), Object.freeze({ ...(metadata || {}) })])
    ))
  });
}

const EMPTY_CATALOG = freezeCatalog({});

export const RUNTIME_BUNDLE_HANDLER_CATALOGS = Object.freeze({
  "bundle-core-runtime": freezeCatalog({
    authorableHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "backendProgram.run",
      "page.home",
      "runtime.diagnostics.read",
      "runtime.plugins.read",
      "runtime.pluginReviews.read"
    ],
    handlerMetadata: {
      "backendProgram.run": { routeKind: "backendProgram", responseKind: "json" },
      "page.home": { routeKind: "page", responseKind: "page", methods: ["GET"] },
      "session.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "session.open": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "session.logout": { routeKind: "json", responseKind: "json", methods: ["DELETE"] }
    },
    pageHandlers: ["page.home"],
    dispatchHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "backendProgram.run",
      "page.home",
      "runtime.diagnostics.read",
      "runtime.plugins.read",
      "runtime.pluginReviews.read"
    ]
  }),
  "bundle-tutorial": authoringRuntimeBundles["bundle-tutorial"].handlerCatalog,
  "bundle-authoring": authoringRuntimeBundles["bundle-authoring"].handlerCatalog,
  "bundle-inspect": inspectHandlerCatalog,
  "bundle-canvas": canvasHandlerCatalog,
  "bundle-mcp": mcpHandlerCatalog,
  "bundle-practical-backend": practicalBackendHandlerCatalog,
  "bundle-eden": edenHandlerCatalog
});

export function runtimeBundleHandlerCatalog(bundleId) {
  return RUNTIME_BUNDLE_HANDLER_CATALOGS[bundleId] ?? EMPTY_CATALOG;
}

export function composeRuntimeBundleHandlers({
  activeBundleIds = [],
  availableHandlers = {},
  reservedHandlerIds = [],
  handlerCatalogsByBundleId = null
}) {
  const orderedReserved = [...new Set((reservedHandlerIds ?? []).map(value => String(value)).filter(Boolean))];
  const orderedActiveBundleIds = [...new Set((activeBundleIds ?? []).map(value => String(value)).filter(Boolean))];
  const orderedActiveHandlerIds = [];
  const allowedHandlerIds = new Set(orderedReserved);
  for (const bundleId of orderedActiveBundleIds) {
    const catalog = handlerCatalogsByBundleId?.[bundleId] ?? runtimeBundleHandlerCatalog(bundleId);
    for (const handlerId of catalog.dispatchHandlers) {
      if (allowedHandlerIds.has(handlerId)) continue;
      allowedHandlerIds.add(handlerId);
      orderedActiveHandlerIds.push(handlerId);
    }
  }

  const handlers = Object.create(null);
  for (const handlerId of orderedReserved) {
    if (Object.prototype.hasOwnProperty.call(availableHandlers, handlerId)) {
      handlers[handlerId] = availableHandlers[handlerId];
    }
  }
  for (const handlerId of orderedActiveHandlerIds) {
    if (Object.prototype.hasOwnProperty.call(availableHandlers, handlerId)) {
      handlers[handlerId] = availableHandlers[handlerId];
    }
  }

  const missingHandlerIds = orderedActiveHandlerIds.filter(handlerId => !Object.prototype.hasOwnProperty.call(availableHandlers, handlerId));
  const extraHandlerIds = Object.keys(availableHandlers).filter(handlerId => !allowedHandlerIds.has(handlerId));

  return {
    handlers,
    diagnostics: Object.freeze({
      activeBundleIds: Object.freeze([...orderedActiveBundleIds]),
      activeHandlerIds: Object.freeze([...orderedActiveHandlerIds]),
      missingHandlerIds: Object.freeze(missingHandlerIds),
      extraHandlerIds: Object.freeze(extraHandlerIds)
    })
  };
}
