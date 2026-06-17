function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

export const handlerCatalog = Object.freeze({
  authorableHandlers: freezeStrings(["page.pipelineAdmin", "pipeline.script.run"]),
  pageHandlers: freezeStrings(["page.pipelineAdmin"]),
  dispatchHandlers: freezeStrings(["page.pipelineAdmin", "pipeline.script.run"]),
  handlerMetadata: Object.freeze({
    "page.pipelineAdmin": Object.freeze({ routeKind: "page", responseKind: "page", methods: ["GET"] }),
    "pipeline.script.run": Object.freeze({ routeKind: "json", responseKind: "json", methods: ["POST"] })
  })
});
