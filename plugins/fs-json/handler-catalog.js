function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

export const handlerCatalog = Object.freeze({
  authorableHandlers: freezeStrings([]),
  pageHandlers: freezeStrings([]),
  dispatchHandlers: freezeStrings([]),
  handlerMetadata: Object.freeze({})
});
