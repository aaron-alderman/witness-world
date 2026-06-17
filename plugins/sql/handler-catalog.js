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
    "db.sql.inspect",
    "db.sql.datasources.list",
    "db.sql.datasource.read",
    "db.sql.datasource.create",
    "db.sql.datasource.update",
    "db.sql.datasource.delete",
    "db.sql.datasource.test",
    "db.sql.datasource.testDraft",
    "db.sql.migrate",
    "db.sql.query",
    "db.sql.command",
    "db.sql.transaction"
  ],
  dispatchHandlers: [
    "db.sql.inspect",
    "db.sql.datasources.list",
    "db.sql.datasource.read",
    "db.sql.datasource.create",
    "db.sql.datasource.update",
    "db.sql.datasource.delete",
    "db.sql.datasource.test",
    "db.sql.datasource.testDraft",
    "db.sql.migrate",
    "db.sql.query",
    "db.sql.command",
    "db.sql.transaction"
  ]
});
