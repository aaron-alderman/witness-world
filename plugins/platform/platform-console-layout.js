import fs from "node:fs";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";

const PLATFORM_CONSOLE_RVM_FILE = "plugins/platform/platform-console.rvm";
const PLATFORM_CONSOLE_RVM_URL = new URL("./platform-console.rvm", import.meta.url);

const FALLBACK_LAYOUT = Object.freeze({
  sourceFile: PLATFORM_CONSOLE_RVM_FILE,
  page: Object.freeze({
    name: "PlatformConsolePage",
    identity: "surface:platform",
    surfaceKind: "page",
    className: "platform-console",
    title: "Platform Console",
    summary: "Self-model, lifecycle board, profile map, verification gates, and proposal lane.",
    children: Object.freeze([
      "PlatformConsoleSummary",
      "PlatformLifecycleBoard",
      "PlatformMap",
      "PlatformProposalPanel",
      "PlatformGapList",
      "PlatformProfileComparison",
      "PlatformProposalReviewList"
    ])
  }),
  children: Object.freeze([
    fallbackSurface("PlatformConsoleSummary", { surfaceKind: "region", className: "platform-summary", title: "Platform Summary" }),
    fallbackSurface("PlatformLifecycleBoard", { surfaceKind: "region", className: "platform-board", title: "Lifecycle Board" }),
    fallbackSurface("PlatformMap", { surfaceKind: "table", className: "platform-map", title: "Platform Map" }),
    fallbackSurface("PlatformProposalPanel", { surfaceKind: "form", className: "platform-proposal-panel", title: "Proposal Panel", processRoute: "/api/platform-proposals" }),
    fallbackSurface("PlatformGapList", { surfaceKind: "table", className: "platform-gaps", title: "Platform Gaps", projectionRoutes: ["/api/platform-gaps"] }),
    fallbackSurface("PlatformProfileComparison", { surfaceKind: "table", className: "platform-profiles", title: "Runtime Profiles", projectionRoutes: ["/api/platform-model"] }),
    fallbackSurface("PlatformProposalReviewList", { surfaceKind: "form", className: "platform-review-panel", title: "Review Proposals", processRoute: "/api/platform-proposals/:id/approve" })
  ])
});

function fallbackSurface(name, overrides = {}) {
  return Object.freeze({
    name,
    identity: null,
    surfaceKind: null,
    className: null,
    processRef: null,
    processRoute: null,
    projectionRefs: Object.freeze([]),
    projectionRoutes: Object.freeze([]),
    capabilityRefs: Object.freeze([]),
    title: titleFromViewName(name),
    summary: null,
    ...overrides
  });
}

function titleFromViewName(name) {
  const base = String(name || "")
    .replace(/^Platform/, "")
    .replace(/Page$/, "");
  return base.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || "Platform Surface";
}

function readSurfaceRow(semantic, name, routeByName) {
  const projectionRefs = Object.freeze([...(semantic?.projectionRefs ?? [])].map(String));
  const capabilityRefs = Object.freeze([...(semantic?.capabilityRefs ?? [])].map(String));
  return Object.freeze({
    name,
    identity: semantic?.identity ? String(semantic.identity) : null,
    surfaceKind: semantic?.surfaceKind ? String(semantic.surfaceKind) : null,
    className: semantic?.className ? String(semantic.className) : null,
    processRef: semantic?.processRef ? String(semantic.processRef) : null,
    processRoute: semantic?.processRef ? (routeByName.get(String(semantic.processRef)) ?? null) : null,
    projectionRefs,
    projectionRoutes: Object.freeze(projectionRefs.map(ref => routeByName.get(ref)).filter(Boolean)),
    capabilityRefs,
    title: semantic?.props?.title ? String(semantic.props.title) : titleFromViewName(name),
    summary: semantic?.props?.summary ? String(semantic.props.summary) : null
  });
}

export function readPlatformConsoleLayout() {
  try {
    const source = fs.readFileSync(PLATFORM_CONSOLE_RVM_URL, "utf8");
    const desirePlus = compileRvmToDesirePlus(source, { file: PLATFORM_CONSOLE_RVM_FILE });
    const routeByName = new Map();
    const surfaceByName = new Map();
    for (const node of desirePlus.nodes ?? []) {
      if (node?.semantic?.kind === "message" && node.name && node.semantic.route) {
        routeByName.set(String(node.name), String(node.semantic.route));
      }
      if (node?.semantic?.kind === "surface" && node.name) {
        surfaceByName.set(String(node.name), node.semantic);
      }
    }
    const fallbackPage = FALLBACK_LAYOUT.page;
    const pageSemantic = surfaceByName.get("PlatformConsolePage") ?? null;
    const childNames = [...(pageSemantic?.children ?? fallbackPage.children)].map(String);
    const page = Object.freeze({
      name: "PlatformConsolePage",
      identity: pageSemantic?.identity ? String(pageSemantic.identity) : fallbackPage.identity,
      surfaceKind: pageSemantic?.surfaceKind ? String(pageSemantic.surfaceKind) : fallbackPage.surfaceKind,
      className: pageSemantic?.className ? String(pageSemantic.className) : fallbackPage.className,
      title: pageSemantic?.props?.title ? String(pageSemantic.props.title) : fallbackPage.title,
      summary: pageSemantic?.props?.summary ? String(pageSemantic.props.summary) : fallbackPage.summary,
      children: Object.freeze(childNames)
    });
    const fallbackByName = new Map(FALLBACK_LAYOUT.children.map(surface => [surface.name, surface]));
    const children = Object.freeze(childNames.map(name => {
      const semantic = surfaceByName.get(name) ?? null;
      if (semantic) return readSurfaceRow(semantic, name, routeByName);
      return fallbackByName.get(name) ?? fallbackSurface(name);
    }));
    return {
      sourceFile: PLATFORM_CONSOLE_RVM_FILE,
      page,
      children,
      error: null
    };
  } catch (error) {
    return {
      ...FALLBACK_LAYOUT,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
