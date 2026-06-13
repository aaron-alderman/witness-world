import { createEdenBundleHandlers } from "./handlers.js";

export const bundleId = "bundle-eden";

export const handlerCatalog = Object.freeze({
  authorableHandlers: Object.freeze([
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
  ]),
  pageHandlers: Object.freeze(["page.edenCanvas"]),
  dispatchHandlers: Object.freeze([
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
  ]),
  handlerMetadata: Object.freeze({})
});

export const routes = Object.freeze([]);
export const surfaces = Object.freeze([]);

export function createHandlers(deps) {
  return createEdenBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  createHandlers
};
