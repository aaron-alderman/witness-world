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
      "authority.grants.read",
      "authority.grants.create",
      "authority.grants.revoke",
      "backendProgram.run",
      "page.surface",
      "guidance.progress.read",
      "guidance.progress.write",
      "guidance.progress.delete",
      "app.revision.events",
      "backend.revision.events",
      "app.snapshot.promoteCurrent",
      "app.snapshot.rollbackStable",
      "app.snapshot.serveLive",
      "app.snapshot.reload",
      "app.source.write",
      "app.preview.session.create",
      "app.preview.session.read",
      "app.preview.session.patchSources",
      "app.preview.session.patchCandidates",
      "app.preview.session.delete",
      "app.preview.session.events",
      "app.preview.session.source.read",
      "app.preview.session.targets.read",
      "app.preview.session.inspect.read",
      "app.preview.session.properties.patch",
      "runtime.diagnostics.read",
      "runtime.plugins.read",
      "runtime.pluginReviews.read"
    ],
    handlerMetadata: {
      "backendProgram.run": { routeKind: "backendProgram", responseKind: "json" },
      "page.surface": { routeKind: "page", responseKind: "page", methods: ["GET"] },
      "session.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "session.open": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "session.logout": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "authority.grants.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "authority.grants.create": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "authority.grants.revoke": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "guidance.progress.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "guidance.progress.write": { routeKind: "json", responseKind: "json", methods: ["PUT"] },
      "guidance.progress.delete": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "app.revision.events": { routeKind: "json", responseKind: "stream", methods: ["GET"] },
      "backend.revision.events": { routeKind: "json", responseKind: "stream", methods: ["GET"] },
      "app.snapshot.promoteCurrent": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.snapshot.rollbackStable": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.snapshot.serveLive": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.snapshot.reload": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.source.write": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.preview.session.create": { routeKind: "json", responseKind: "json", methods: ["POST"] },
      "app.preview.session.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "app.preview.session.patchSources": { routeKind: "json", responseKind: "json", methods: ["PATCH"] },
      "app.preview.session.patchCandidates": { routeKind: "json", responseKind: "json", methods: ["PATCH"] },
      "app.preview.session.delete": { routeKind: "json", responseKind: "json", methods: ["DELETE"] },
      "app.preview.session.events": { routeKind: "json", responseKind: "stream", methods: ["GET"] },
      "app.preview.session.source.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "app.preview.session.targets.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "app.preview.session.inspect.read": { routeKind: "json", responseKind: "json", methods: ["GET"] },
      "app.preview.session.properties.patch": { routeKind: "json", responseKind: "json", methods: ["PATCH"] }
    },
    pageHandlers: ["page.surface"],
    dispatchHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "authority.grants.read",
      "authority.grants.create",
      "authority.grants.revoke",
      "backendProgram.run",
      "page.surface",
      "guidance.progress.read",
      "guidance.progress.write",
      "guidance.progress.delete",
      "app.revision.events",
      "backend.revision.events",
      "app.snapshot.promoteCurrent",
      "app.snapshot.rollbackStable",
      "app.snapshot.serveLive",
      "app.snapshot.reload",
      "app.source.write",
      "app.preview.session.create",
      "app.preview.session.read",
      "app.preview.session.patchSources",
      "app.preview.session.patchCandidates",
      "app.preview.session.delete",
      "app.preview.session.events",
      "app.preview.session.source.read",
      "app.preview.session.targets.read",
      "app.preview.session.inspect.read",
      "app.preview.session.properties.patch",
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
