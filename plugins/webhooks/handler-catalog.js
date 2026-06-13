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

const WEBHOOK_HANDLER_IDS = [
  "webhook.inbound.receive",
  "webhook.inbound.list",
  "webhook.inbound.read"
];

export const handlerCatalog = freezeCatalog({
  authorableHandlers: WEBHOOK_HANDLER_IDS,
  pageHandlers: [],
  dispatchHandlers: WEBHOOK_HANDLER_IDS
});
