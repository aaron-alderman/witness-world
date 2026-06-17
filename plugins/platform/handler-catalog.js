function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

export const handlerCatalog = Object.freeze({
  authorableHandlers: freezeStrings([
    "platform.model.read",
    "platform.gaps.read",
    "platform.changeSet.create",
    "platform.changeSet.edit",
    "platform.changeSet.validate",
    "platform.proposal.create",
    "platform.proposal.approve",
    "platform.proposal.reject",
    "page.platform"
  ]),
  pageHandlers: freezeStrings(["page.platform"]),
  dispatchHandlers: freezeStrings([
    "platform.model.read",
    "platform.gaps.read",
    "platform.changeSet.create",
    "platform.changeSet.edit",
    "platform.changeSet.validate",
    "platform.proposal.create",
    "platform.proposal.approve",
    "platform.proposal.reject",
    "page.platform"
  ]),
  handlerMetadata: Object.freeze({
    "platform.model.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "platform.gaps.read": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["GET"]) }),
    "platform.changeSet.create": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "platform.changeSet.edit": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "platform.changeSet.validate": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "platform.proposal.create": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "platform.proposal.approve": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "platform.proposal.reject": Object.freeze({ routeKind: "json", responseKind: "json", methods: Object.freeze(["POST"]) }),
    "page.platform": Object.freeze({ routeKind: "page", responseKind: "page", methods: Object.freeze(["GET"]) })
  })
});
