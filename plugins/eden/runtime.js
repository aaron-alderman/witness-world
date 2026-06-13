import { fileURLToPath } from "node:url";
import { createEdenBundleHandlers } from "./handlers.js";
import { projectEdenPageTheme } from "./eden-page-theme.js";

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

function runtimeFile(name) {
  return fileURLToPath(new URL(`./${name}`, import.meta.url));
}

export const providers = Object.freeze([
  {
    kind: "coreHook",
    id: "projectEdenPageTheme",
    hook: projectEdenPageTheme
  },
  {
    kind: "staticAssetProvider",
    id: "eden.static",
    mount: "/canvas-lib/",
    files: Object.freeze({
      "eden-personal-box.js": runtimeFile("eden-personal-box.js"),
      "eden-page-theme.js": runtimeFile("eden-page-theme.js"),
      "eden-capability-install.js": runtimeFile("eden-capability-install.js"),
      "eden-academy.js": runtimeFile("eden-academy.js"),
      "eden-organization.js": runtimeFile("eden-organization.js"),
      "eden-theory.js": runtimeFile("eden-theory.js")
    })
  }
]);

export function createHandlers(deps) {
  return createEdenBundleHandlers(deps);
}

export default {
  bundleId,
  handlerCatalog,
  routes,
  surfaces,
  providers,
  createHandlers
};
