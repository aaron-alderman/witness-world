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

export const handlerCatalog = freezeCatalog({
  authorableHandlers: [
    "asset.ingest.retry",
    "asset.search.reindex",
    "asset.attachments.list",
    "asset.attach",
    "asset.detach"
  ],
  pageHandlers: [],
  dispatchHandlers: [
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
});
