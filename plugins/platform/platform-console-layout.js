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
    summary: "RVM-authored platform pages for overview, workflow, verification, knowledge, signals, and model inspection.",
    children: Object.freeze([
      "PlatformOverviewPage",
      "PlatformWorkflowPage",
      "PlatformVerificationPage",
      "PlatformVerificationStatusPage",
      "PlatformVerificationRunsPage",
      "PlatformVerificationRuntimePage",
      "PlatformKnowledgePage",
      "PlatformSignalsPage",
      "PlatformModelPage",
      "PlatformPackageApplyPreviewPage"
    ])
  }),
  children: Object.freeze([
    fallbackSurface("PlatformOverviewPage", {
      surfaceKind: "page",
      className: "platform-overview",
      pageId: "overview",
      props: Object.freeze({
        modelView: "overview",
        summaryCards: "Plugins=nodes@countKind:plugin|Bundles=nodes@countKind:bundle|Handlers=nodes@countKind:handler|Routes=nodes@countKind:route|Docs=docs@count|Change Sets=changeSets@count|Test Gates=testGates@count|Gaps=gaps@count"
      }),
      title: "Overview",
      summary: "Counts, authored surface ownership, lifecycle, and quick platform links.",
      children: ["PlatformConsoleSummary", "PlatformAuthoredSurfaceTree", "PlatformLifecycleBoard", "PlatformMap", "PlatformProfileComparison"]
    }),
    fallbackSurface("PlatformWorkflowPage", {
      surfaceKind: "page",
      className: "platform-workflow",
      pageId: "workflow",
      props: Object.freeze({
        modelView: "workflow",
        summaryCards: "Branches=branches@count|Change Sets=changeSets@count|Open Proposals=proposals@countWhere:status=open|Candidate Snapshots=candidateSnapshots@count"
      }),
      title: "Workflow",
      summary: "Branches, change sets, proposals, and authoring commands.",
      children: [
        "PlatformBranchBoard",
        "PlatformWorkflowList",
        "PlatformWorkflowDetail",
        "PlatformProposalPanel",
        "PlatformProposalReviewList",
        "PlatformBranchCreatePanel",
        "PlatformChangeSetCreatePanel",
        "PlatformChangeSetEditPanel",
        "PlatformChangeSetValidatePanel",
        "PlatformChangeSetApplyPanel",
        "PlatformChangeSetLifecyclePanel"
      ]
    }),
    fallbackSurface("PlatformVerificationPage", {
      surfaceKind: "page",
      className: "platform-verification",
      pageId: "verification",
      props: Object.freeze({
        modelView: "verificationOverview",
        summaryCards: "Fresh=verificationFreshness@countWhere:status=fresh|Stale=verificationFreshness@countWhere:status=stale|Missing=verificationFreshness@countWhere:status=missing|Running=testRuns@countWhere:status=running|Regressed=testReports@countWhere:status=regressed|Queued=verificationQueue@count"
      }),
      title: "Verification",
      summary: "Verification landing page for live health, red/green state, and links into narrower authored verification pages.",
      children: [
        "PlatformVerificationStatusBanner",
        "PlatformVerificationStreams",
        "PlatformBranchRedGreenList",
        "PlatformChangeSetRedGreenList"
      ]
    }),
    fallbackSurface("PlatformVerificationStatusPage", {
      surfaceKind: "page",
      className: "platform-verification",
      pageId: "verificationStatus",
      props: Object.freeze({
        modelView: "verificationStatus",
        summaryCards: "Policies=verificationPolicies@count|Fresh=verificationFreshness@countWhere:status=fresh|Stale=verificationFreshness@countWhere:status=stale|Missing=verificationFreshness@countWhere:status=missing|Executions=verificationExecutions@count|Gates=testGates@count"
      }),
      title: "Verification Status",
      summary: "Policies, freshness, invalidations, queue state, and test-gate detail.",
      children: [
        "PlatformVerificationStatusBanner",
        "PlatformVerificationStatusList",
        "PlatformVerificationDetail"
      ]
    }),
    fallbackSurface("PlatformVerificationRunsPage", {
      surfaceKind: "page",
      className: "platform-verification",
      pageId: "verificationRuns",
      props: Object.freeze({
        modelView: "verificationRuns",
        summaryCards: "Runs=testRuns@count|Reports=testReports@count|Artifacts=testArtifacts@count|Suites=testSuites@count|Failed Cases=testCases@countWhere:status=failed|Errored Cases=testCases@countWhere:status=error"
      }),
      title: "Verification Runs",
      summary: "Test runs, authored reports, artifacts, suites, failures, and run execution commands.",
      children: [
        "PlatformVerificationRunsList",
        "PlatformVerificationDetail",
        "PlatformTestRunPanel",
        "PlatformSelectedTestRunPanel"
      ]
    }),
    fallbackSurface("PlatformVerificationRuntimePage", {
      surfaceKind: "page",
      className: "platform-verification",
      pageId: "verificationRuntime",
      props: Object.freeze({
        modelView: "verificationRuntime",
        summaryCards: "Runtime Revisions=runtimeRevisions@count|Candidate Snapshots=candidateSnapshots@count|Snapshot Builds=snapshotBuilds@count|Build Errors=snapshotBuildErrors@count"
      }),
      title: "Verification Runtime",
      summary: "Candidate snapshots, runtime revisions, snapshot builds, and runtime rebuild diagnostics.",
      children: [
        "PlatformVerificationRuntimeList",
        "PlatformVerificationDetail",
        "PlatformVerificationStreams"
      ]
    }),
    fallbackSurface("PlatformKnowledgePage", {
      surfaceKind: "page",
      className: "platform-knowledge",
      pageId: "knowledge",
      props: Object.freeze({
        modelView: "knowledge",
        summaryCards: "Governed Docs=docs@count|Roadmap Tasks=roadmapTasks@count|Epics=epics@count|Features=features@count"
      }),
      title: "Knowledge",
      summary: "Governed docs, roadmap tasks, epics, and features.",
      children: ["PlatformKnowledgeList", "PlatformKnowledgeDetail"]
    }),
    fallbackSurface("PlatformSignalsPage", {
      surfaceKind: "page",
      className: "platform-signals",
      pageId: "signals",
      props: Object.freeze({
        modelView: "signals",
        summaryCards: "Gaps=gaps@count|Telemetry Metrics=nodes@countKind:telemetryMetric|Defect Clusters=nodes@countKind:defectCluster|Boundaries=nodes@countKind:boundary"
      }),
      title: "Signals",
      summary: "Gaps, telemetry, defect clusters, and boundary actors.",
      children: ["PlatformGapList", "PlatformSignalList", "PlatformSignalDetail"]
    }),
    fallbackSurface("PlatformModelPage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "model",
      props: Object.freeze({
        modelView: "model",
        summaryCards: "Platform Objects=nodes@count|Relationships=edges@count|Profiles=profiles@count|Coverage Edges=coverageEdges@count"
      }),
      title: "Model",
      summary: "Platform objects, relationships, runtime profiles, and dependency evidence.",
      children: ["PlatformProfileComparison", "PlatformModelList", "PlatformModelDetail", "PlatformCoverageMatrix"]
    }),
    fallbackSurface("PlatformPackageApplyPreviewPage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "packageApplyPreview",
      props: Object.freeze({
        modelView: "packageApplyPreview",
        summaryCards: "Revisions=packageApplyPreviews@count"
      }),
      title: "Package Apply Preview",
      summary: "Revision-scoped apply impact, emitted bundle summary, and convergence truth.",
      children: ["PlatformPackageApplyPreviewList", "PlatformPackageApplyPreviewDetail"]
    })
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
    children: Object.freeze([]),
    childSurfaces: Object.freeze([]),
    pageId: null,
    title: titleFromViewName(name),
    summary: null,
    props: Object.freeze({}),
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
  const props = Object.freeze(Object.fromEntries(
    Object.entries(semantic?.props ?? {}).map(([key, value]) => [String(key), value == null ? null : String(value)])
  ));
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
    children: Object.freeze([...(semantic?.children ?? [])].map(String)),
    childSurfaces: Object.freeze([]),
    props,
    pageId: semantic?.props?.pageId ? String(semantic.props.pageId) : null,
    title: semantic?.props?.title ? String(semantic.props.title) : titleFromViewName(name),
    summary: semantic?.props?.summary ? String(semantic.props.summary) : null
  });
}

function readSurfaceTree(name, surfaceByName, routeByName, fallbackByName, seen = new Set()) {
  if (seen.has(name)) return fallbackByName.get(name) ?? fallbackSurface(name);
  const semantic = surfaceByName.get(name) ?? null;
  const base = semantic
    ? readSurfaceRow(semantic, name, routeByName)
    : (fallbackByName.get(name) ?? fallbackSurface(name));
  const nextSeen = new Set(seen);
  nextSeen.add(name);
  const childSurfaces = Object.freeze((base.children ?? []).map(childName =>
    readSurfaceTree(childName, surfaceByName, routeByName, fallbackByName, nextSeen)
  ));
  return Object.freeze({
    ...base,
    childSurfaces
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
    const children = Object.freeze(childNames.map(name =>
      readSurfaceTree(name, surfaceByName, routeByName, fallbackByName)
    ));
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
