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
      "page.surface",
      "guidance.progress.read",
      "guidance.progress.write",
      "guidance.progress.delete",
      "app.revision.events",
      "app.source.write",
      "runtime.diagnostics.read",
      "runtime.plugins.read",
      "runtime.pluginReviews.read"
    ],
    handlerMetadata: {
      "backendProgram.run": { routeKind: "backendProgram", responseKind: "json" },
      "page.home": { routeKind: "page", responseKind: "page", methods: ["GET"] },
      "page.surface": { routeKind: "page", responseKind: "page", methods: ["GET"] },
      "session.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "session.open": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "session.logout": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "guidance.progress.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "guidance.progress.write": { routeKind: "json", responseKind: "json", methods: ["PUT"] },
      "guidance.progress.delete": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "app.revision.events": { routeKind: "json", responseKind: "stream", methods: ["GET"] },
      "app.source.write": { routeKind: "json", responseKind: "json", methods: ["POST"] }
    },
    pageHandlers: ["page.home", "page.surface"],
    dispatchHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "backendProgram.run",
      "page.home",
      "page.surface",
      "guidance.progress.read",
      "guidance.progress.write",
      "guidance.progress.delete",
      "app.revision.events",
      "app.source.write",
      "runtime.diagnostics.read",
      "runtime.plugins.read",
      "runtime.pluginReviews.read"
    ]
  })
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
