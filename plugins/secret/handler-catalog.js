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
    "secret.store.list",
    "secret.store.read",
    "secret.store.create",
    "secret.store.write",
    "secret.store.delete"
  ],
  dispatchHandlers: [
    "secret.store.list",
    "secret.store.read",
    "secret.store.create",
    "secret.store.write",
    "secret.store.delete"
  ]
});
