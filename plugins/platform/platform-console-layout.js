import fs from "node:fs";
import { compileRvmToDesirePlus } from "../../src/desire/index.js";

const PLATFORM_CONSOLE_RVM_FILE = "plugins/platform/platform-console.rvm";
const PLATFORM_CONSOLE_RVM_URL = new URL("./platform-console.rvm", import.meta.url);
let platformConsoleLayoutCache = null;

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
      "PlatformWorkflowBranchesPage",
      "PlatformWorkflowChangeSetsPage",
      "PlatformWorkflowProposalsPage",
      "PlatformVerificationPage",
      "PlatformVerificationStatusPage",
      "PlatformVerificationRunsPage",
      "PlatformVerificationRuntimePage",
      "PlatformKnowledgePage",
      "PlatformKnowledgeDocsPage",
      "PlatformKnowledgeFoldersPage",
      "PlatformKnowledgeRoadmapPage",
      "PlatformSignalsPage",
      "PlatformSignalsGapsPage",
      "PlatformSignalsCatalogPage",
      "PlatformModelPage",
      "PlatformModelObjectsPage",
      "PlatformModelProfilesPage",
      "PlatformModelCoveragePage",
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
        modelView: "workflowOverview",
        summaryCards: "Branches=branches@count|Change Sets=changeSets@count|Open Proposals=proposals@countWhere:status=open|Candidate Snapshots=candidateSnapshots@count"
      }),
      title: "Workflow",
      summary: "Workflow landing page for branch activity and links into narrower authored workflow pages.",
      children: [
        "PlatformBranchBoard"
      ]
    }),
    fallbackSurface("PlatformWorkflowBranchesPage", {
      surfaceKind: "page",
      className: "platform-workflow",
      pageId: "workflowBranches",
      props: Object.freeze({
        modelView: "workflowBranches",
        summaryCards: "Branches=branches@count|Draft=branches@countWhere:status=draft|Active=branches@countWhere:status=active|Candidate Snapshots=candidateSnapshots@count"
      }),
      title: "Workflow Branches",
      summary: "Branch lifecycle, linked change sets, and branch authoring.",
      children: [
        "PlatformBranchBoard",
        "PlatformWorkflowBranchesList",
        "PlatformWorkflowDetail",
        "PlatformBranchCreatePanel",
      ]
    }),
    fallbackSurface("PlatformWorkflowChangeSetsPage", {
      surfaceKind: "page",
      className: "platform-workflow",
      pageId: "workflowChangeSets",
      props: Object.freeze({
        modelView: "workflowChangeSets",
        summaryCards: "Change Sets=changeSets@count|Draft=changeSets@countWhere:status=draft|Validated=changeSets@countWhere:status=validated|Candidate Snapshots=candidateSnapshots@count"
      }),
      title: "Workflow Change Sets",
      summary: "Staged change sets, overlays, candidate snapshots, and change-set operations.",
      children: [
        "PlatformWorkflowChangeSetsList",
        "PlatformWorkflowDetail",
        "PlatformChangeSetCreatePanel",
        "PlatformChangeSetEditPanel",
        "PlatformChangeSetValidatePanel",
        "PlatformChangeSetApplyPanel",
        "PlatformChangeSetLifecyclePanel"
      ]
    }),
    fallbackSurface("PlatformWorkflowProposalsPage", {
      surfaceKind: "page",
      className: "platform-workflow",
      pageId: "workflowProposals",
      props: Object.freeze({
        modelView: "workflowProposals",
        summaryCards: "Open Proposals=proposals@countWhere:status=open|Approved=proposals@countWhere:status=approved|Rejected=proposals@countWhere:status=rejected"
      }),
      title: "Workflow Proposals",
      summary: "Proposal intake, review, and proposal-linked workflow detail.",
      children: [
        "PlatformWorkflowProposalsList",
        "PlatformWorkflowDetail",
        "PlatformProposalPanel",
        "PlatformProposalReviewList"
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
        modelView: "knowledgeOverview",
        summaryCards: "Governed Docs=docs@count|Folders=folders@count|Roadmap Tasks=roadmapTasks@count|Epics=epics@count|Features=features@count"
      }),
      title: "Knowledge",
      summary: "Knowledge landing page with links into narrower docs, folders (this.folder.wtoml), and roadmap views.",
      children: []
    }),
    fallbackSurface("PlatformKnowledgeDocsPage", {
      surfaceKind: "page",
      className: "platform-knowledge",
      pageId: "knowledgeDocs",
      props: Object.freeze({
        modelView: "knowledgeDocs",
        summaryCards: "Governed Docs=docs@count|Fresh=docs@countWhere:freshness.status=fresh|Stale=docs@countWhere:freshness.status=stale|Tasks=docTasks@count"
      }),
      title: "Knowledge Docs",
      summary: "Governed documents, authored references, and document detail.",
      children: ["PlatformKnowledgeDocsList", "PlatformKnowledgeDocsDetail"]
    }),
    fallbackSurface("PlatformKnowledgeFoldersPage", {
      surfaceKind: "page",
      className: "platform-knowledge",
      pageId: "knowledgeFolders",
      props: Object.freeze({
        modelView: "knowledgeFolders",
        summaryCards: "Folders=folders@count"
      }),
      title: "Knowledge Folders",
      summary: "Folders with this.folder.wtoml metadata and their linked platform concepts.",
      children: ["PlatformKnowledgeFoldersList", "PlatformKnowledgeFoldersDetail"]
    }),
    fallbackSurface("PlatformKnowledgeRoadmapPage", {
      surfaceKind: "page",
      className: "platform-knowledge",
      pageId: "knowledgeRoadmap",
      props: Object.freeze({
        modelView: "knowledgeRoadmap",
        summaryCards: "Roadmap Tasks=roadmapTasks@count|Epics=epics@count|Features=features@count"
      }),
      title: "Knowledge Roadmap",
      summary: "Roadmap tasks, epics, features, and linked platform work.",
      children: ["PlatformKnowledgeRoadmapList", "PlatformKnowledgeRoadmapDetail"]
    }),
    fallbackSurface("PlatformSignalsPage", {
      surfaceKind: "page",
      className: "platform-signals",
      pageId: "signals",
      props: Object.freeze({
        modelView: "signalsOverview",
        summaryCards: "Gaps=gaps@count|Telemetry Metrics=nodes@countKind:telemetryMetric|Defect Clusters=nodes@countKind:defectCluster|Boundaries=nodes@countKind:boundary"
      }),
      title: "Signals",
      summary: "Signals landing page with links into narrower gap and signal-catalog views.",
      children: []
    }),
    fallbackSurface("PlatformSignalsGapsPage", {
      surfaceKind: "page",
      className: "platform-signals",
      pageId: "signalsGaps",
      props: Object.freeze({
        modelView: "signalsGaps",
        summaryCards: "Gaps=gaps@count"
      }),
      title: "Signals Gaps",
      summary: "Gap inventory, selector drift, and gap detail.",
      children: ["PlatformGapList", "PlatformGapDetail"]
    }),
    fallbackSurface("PlatformSignalsCatalogPage", {
      surfaceKind: "page",
      className: "platform-signals",
      pageId: "signalsCatalog",
      props: Object.freeze({
        modelView: "signalsCatalog",
        summaryCards: "Telemetry Metrics=nodes@countKind:telemetryMetric|Defect Clusters=nodes@countKind:defectCluster|Boundaries=nodes@countKind:boundary"
      }),
      title: "Signals Catalog",
      summary: "Telemetry metrics, defect clusters, boundaries, and linked signal-node detail.",
      children: ["PlatformSignalList", "PlatformSignalCatalogDetail"]
    }),
    fallbackSurface("PlatformModelPage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "model",
      props: Object.freeze({
        modelView: "modelOverview",
        summaryCards: "Platform Objects=nodes@count|Relationships=edges@count|Profiles=profiles@count|Coverage Edges=coverageEdges@count"
      }),
      title: "Model",
      summary: "Model landing page with links into narrower objects, profiles, and coverage views.",
      children: []
    }),
    fallbackSurface("PlatformModelObjectsPage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "modelObjects",
      props: Object.freeze({
        modelView: "modelObjects",
        summaryCards: "Platform Objects=nodes@count|Relationships=edges@count"
      }),
      title: "Model Objects",
      summary: "Platform objects, their properties, and linked relationships.",
      children: ["PlatformModelList", "PlatformModelDetail"]
    }),
    fallbackSurface("PlatformModelProfilesPage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "modelProfiles",
      props: Object.freeze({
        modelView: "modelProfiles",
        summaryCards: "Profiles=profiles@count"
      }),
      title: "Model Profiles",
      summary: "Runtime profile exposure and composition evidence.",
      children: ["PlatformProfileComparison"]
    }),
    fallbackSurface("PlatformModelCoveragePage", {
      surfaceKind: "page",
      className: "platform-model",
      pageId: "modelCoverage",
      props: Object.freeze({
        modelView: "modelCoverage",
        summaryCards: "Coverage Edges=coverageEdges@count"
      }),
      title: "Model Coverage",
      summary: "Coverage edges between gates and protected platform targets.",
      children: ["PlatformCoverageMatrix"]
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
    const stat = fs.statSync(PLATFORM_CONSOLE_RVM_URL);
    const cacheToken = `${PLATFORM_CONSOLE_RVM_FILE}:${stat.mtimeMs}`;
    if (platformConsoleLayoutCache?.token === cacheToken && platformConsoleLayoutCache.value) {
      return platformConsoleLayoutCache.value;
    }
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
    const layout = {
      sourceFile: PLATFORM_CONSOLE_RVM_FILE,
      page,
      children,
      error: null
    };
    platformConsoleLayoutCache = { token: cacheToken, value: layout };
    return layout;
  } catch (error) {
    return {
      ...FALLBACK_LAYOUT,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
