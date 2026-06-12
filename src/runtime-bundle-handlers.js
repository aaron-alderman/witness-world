function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

function freezeCatalog({ authorableHandlers = [], pageHandlers = [], dispatchHandlers = [] }) {
  return Object.freeze({
    authorableHandlers: freezeStrings(authorableHandlers),
    pageHandlers: freezeStrings(pageHandlers),
    dispatchHandlers: freezeStrings(dispatchHandlers)
  });
}

const EMPTY_CATALOG = freezeCatalog({});

export const RUNTIME_BUNDLE_HANDLER_CATALOGS = Object.freeze({
  "bundle-core-runtime": freezeCatalog({
    authorableHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "page.home",
      "runtime.diagnostics.read"
    ],
    pageHandlers: ["page.home"],
    dispatchHandlers: [
      "session.read",
      "session.open",
      "session.logout",
      "page.home",
      "runtime.diagnostics.read"
    ]
  }),
  "bundle-tutorial": freezeCatalog({
    dispatchHandlers: [
      "tutorial.progress.read",
      "tutorial.progress.write",
      "tutorial.progress.delete"
    ]
  }),
  "bundle-authoring": freezeCatalog({
    authorableHandlers: [
      "mcpServer.create",
      "mcpTool.install",
      "mcpTool.remove"
    ],
    dispatchHandlers: [
      "bootstrap.model.read",
      "bootstrap.state.read",
      "bootstrap.page",
      "identity.create",
      "identity.update",
      "context.create",
      "perspective.create",
      "contextBinding.create",
      "contextBinding.remove",
      "contextExport.create",
      "contextExport.remove",
      "contextImport.create",
      "contextImport.remove",
      "stewardship.create",
      "stewardship.remove",
      "proposal.create",
      "proposal.approve",
      "proposal.reject",
      "widgets.create",
      "widgets.update",
      "capability.create",
      "capability.install",
      "capability.remove",
      "frontendProgram.create",
      "frontendStep.create",
      "route.create",
      "serve.create",
      "serverRunner.create",
      "mcpServer.create",
      "mcpTool.install",
      "mcpTool.remove"
    ]
  }),
  "bundle-inspect": freezeCatalog({
    authorableHandlers: [
      "widgetVersions.activate",
      "widgetVersions.rollback",
      "witnesses.list",
      "worldGraph.read",
      "processView.read",
      "processRun.read",
      "processEvents.record",
      "source.read",
      "page.world",
      "page.process"
    ],
    pageHandlers: [
      "page.world",
      "page.process"
    ],
    dispatchHandlers: [
      "widgetVersions.activate",
      "widgetVersions.rollback",
      "witnesses.list",
      "worldGraph.read",
      "processView.read",
      "processRun.read",
      "processEvents.record",
      "source.read",
      "page.world",
      "page.process"
    ]
  }),
  "bundle-canvas": freezeCatalog({
    authorableHandlers: [
      "canvas.perspectives.list",
      "canvas.read",
      "canvas.process",
      "page.canvas"
    ],
    pageHandlers: ["page.canvas"],
    dispatchHandlers: [
      "canvas.perspectives.list",
      "canvas.read",
      "canvas.process",
      "page.canvas"
    ]
  }),
  "bundle-mcp": freezeCatalog({
    authorableHandlers: ["mcp.http"],
    dispatchHandlers: ["mcp.http"]
  }),
  "bundle-practical-backend": freezeCatalog({
    authorableHandlers: [
      "auth.oauth.start",
      "auth.oauth.callback",
      "auth.oauth.links.list",
      "auth.oauth.links.read",
      "runtimeConfig.read",
      "db.sql.inspect",
      "db.sql.migrate",
      "db.sql.query",
      "db.sql.command",
      "db.sql.transaction",
      "search.index.inspect",
      "search.index.build",
      "search.index.reindex",
      "search.index.query",
      "http.outbound.send",
      "http.outbound.list",
      "http.outbound.read",
      "webhook.inbound.receive",
      "webhook.inbound.list",
      "webhook.inbound.read",
      "backendSeams.read",
      "page.backendSeams",
      "fs.blob.list",
      "fs.blob.meta",
      "fs.blob.read",
      "fs.blob.write",
      "fs.blob.delete",
      "fs.stream.read",
      "fs.stream.write",
      "fs.stream.copy",
      "asset.ingest.retry",
      "asset.search.reindex",
      "asset.attachments.list",
      "asset.attach",
      "asset.detach"
    ],
    pageHandlers: ["page.backendSeams"],
    dispatchHandlers: [
      "auth.oauth.start",
      "auth.oauth.callback",
      "auth.oauth.links.list",
      "auth.oauth.links.read",
      "webhook.inbound.receive",
      "webhook.inbound.list",
      "webhook.inbound.read",
      "db.sql.inspect",
      "db.sql.migrate",
      "db.sql.query",
      "db.sql.command",
      "db.sql.transaction",
      "search.index.inspect",
      "search.index.build",
      "search.index.reindex",
      "search.index.query",
      "runtimeConfig.read",
      "http.outbound.send",
      "http.outbound.list",
      "http.outbound.read",
      "jobs.queue.enqueue",
      "jobs.queue.list",
      "jobs.queue.read",
      "notify.email.enqueue",
      "notify.sms.enqueue",
      "notifications.list",
      "notifications.read",
      "page.backendSeams",
      "fs.blob.list",
      "fs.blob.meta",
      "fs.blob.read",
      "fs.blob.write",
      "fs.blob.delete",
      "fs.stream.read",
      "fs.stream.write",
      "fs.stream.copy",
      "backendSeams.read",
      "asset.upload",
      "asset.ingest.retry",
      "asset.search.reindex",
      "asset.content.read",
      "asset.text.read",
      "asset.thumbnail.read",
      "asset.attachments.list",
      "asset.attach",
      "asset.detach"
    ]
  }),
  "bundle-eden": freezeCatalog({
    authorableHandlers: [
      "edenAcademy.read",
      "edenOrganization.read",
      "edenOrganization.createContext",
      "edenOrganization.grantStewardship",
      "edenOrganization.createProposal",
      "edenOrganization.approveProposal",
      "edenTheory.read",
      "edenTheory.study",
      "edenTheory.assess",
      "edenTheory.teachBack",
      "edenCapabilityInstall.read",
      "edenCapabilityInstall.install",
      "edenVersions.read",
      "edenVersions.activate",
      "edenVersions.rollback",
      "edenVersions.publish",
      "page.edenCanvas"
    ],
    pageHandlers: ["page.edenCanvas"],
    dispatchHandlers: [
      "edenPersonalBox.read",
      "edenPersonalBox.create",
      "edenPersonalBox.update",
      "edenPersonalBox.delete",
      "edenPageTheme.read",
      "edenPageTheme.write",
      "edenAcademy.read",
      "edenOrganization.read",
      "edenOrganization.createContext",
      "edenOrganization.grantStewardship",
      "edenOrganization.createProposal",
      "edenOrganization.approveProposal",
      "edenTheory.read",
      "edenTheory.study",
      "edenTheory.assess",
      "edenTheory.teachBack",
      "edenCapabilityInstall.read",
      "edenCapabilityInstall.install",
      "edenVersions.read",
      "edenVersions.activate",
      "edenVersions.rollback",
      "edenVersions.publish",
      "page.edenCanvas"
    ]
  })
});

export function runtimeBundleHandlerCatalog(bundleId) {
  return RUNTIME_BUNDLE_HANDLER_CATALOGS[bundleId] ?? EMPTY_CATALOG;
}

export function composeRuntimeBundleHandlers({
  activeBundleIds = [],
  availableHandlers = {},
  reservedHandlerIds = []
}) {
  const orderedReserved = [...new Set((reservedHandlerIds ?? []).map(value => String(value)).filter(Boolean))];
  const orderedActiveBundleIds = [...new Set((activeBundleIds ?? []).map(value => String(value)).filter(Boolean))];
  const orderedActiveHandlerIds = [];
  const allowedHandlerIds = new Set(orderedReserved);
  for (const bundleId of orderedActiveBundleIds) {
    for (const handlerId of runtimeBundleHandlerCatalog(bundleId).dispatchHandlers) {
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
