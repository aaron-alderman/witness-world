function freezeStrings(values = []) {
  return Object.freeze(values.map(value => String(value)));
}

const PLATFORM_RUNTIME_OWNER_NOTE = "Behavior is owned by the Platform Self Model runtime plugin.";

function platformHandlerMetadata({ routeKind, responseKind, methods = [] }) {
  return Object.freeze({
    routeKind,
    responseKind,
    methods: freezeStrings(methods),
    ownerClass: "runtime-plugin",
    ownerNote: PLATFORM_RUNTIME_OWNER_NOTE
  });
}

export const handlerCatalog = Object.freeze({
  authorableHandlers: freezeStrings([
    "platform.page.read",
    "platform.model.read",
    "platform.gaps.read",
    "platform.branch.list",
    "platform.branch.read",
    "platform.branch.create",
    "platform.branch.push",
    "platform.branch.ship",
    "platform.changeSet.list",
    "platform.changeSet.read",
    "platform.changeSet.create",
    "platform.changeSet.edit",
    "platform.changeSet.removeEdit",
    "platform.changeSet.validate",
    "platform.changeSet.apply",
    "platform.changeSet.reject",
    "platform.changeSet.abandon",
    "platform.testRun.create",
    "platform.testRun.events",
    "platform.testRun.read",
    "platform.artifact.content",
    "platform.testArtifact.content",
    "platform.proposal.create",
    "platform.proposal.approve",
    "platform.proposal.reject",
    "page.platform"
  ]),
  pageHandlers: freezeStrings(["page.platform"]),
  dispatchHandlers: freezeStrings([
    "platform.page.read",
    "platform.model.read",
    "platform.gaps.read",
    "platform.branch.list",
    "platform.branch.read",
    "platform.branch.create",
    "platform.branch.push",
    "platform.branch.ship",
    "platform.changeSet.list",
    "platform.changeSet.read",
    "platform.changeSet.create",
    "platform.changeSet.edit",
    "platform.changeSet.removeEdit",
    "platform.changeSet.validate",
    "platform.changeSet.apply",
    "platform.changeSet.reject",
    "platform.changeSet.abandon",
    "platform.testRun.create",
    "platform.testRun.events",
    "platform.testRun.read",
    "platform.artifact.content",
    "platform.testArtifact.content",
    "platform.proposal.create",
    "platform.proposal.approve",
    "platform.proposal.reject",
    "page.platform"
  ]),
  handlerMetadata: Object.freeze({
    "platform.page.read": platformHandlerMetadata({ routeKind: "content", responseKind: "content", methods: ["GET"] }),
    "platform.model.read": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.gaps.read": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.branch.list": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.branch.read": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.branch.create": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.branch.push": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.branch.ship": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.list": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.changeSet.read": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.changeSet.create": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.edit": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.removeEdit": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["DELETE"] }),
    "platform.changeSet.validate": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.apply": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.reject": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.changeSet.abandon": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.testRun.create": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.testRun.events": platformHandlerMetadata({ routeKind: "stream", responseKind: "stream", methods: ["GET"] }),
    "platform.testRun.read": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["GET"] }),
    "platform.artifact.content": platformHandlerMetadata({ routeKind: "content", responseKind: "content", methods: ["GET"] }),
    "platform.testArtifact.content": platformHandlerMetadata({ routeKind: "content", responseKind: "content", methods: ["GET"] }),
    "platform.proposal.create": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.proposal.approve": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "platform.proposal.reject": platformHandlerMetadata({ routeKind: "json", responseKind: "json", methods: ["POST"] }),
    "page.platform": platformHandlerMetadata({ routeKind: "page", responseKind: "page", methods: ["GET"] })
  })
});
