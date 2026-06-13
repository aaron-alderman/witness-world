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
    "fs.blob.list",
    "fs.blob.meta",
    "fs.blob.read",
    "fs.blob.write",
    "fs.blob.delete"
  ],
  pageHandlers: [],
  dispatchHandlers: [
    "fs.blob.list",
    "fs.blob.meta",
    "fs.blob.read",
    "fs.blob.write",
    "fs.blob.delete"
  ]
});
