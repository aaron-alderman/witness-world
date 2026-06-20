import { authorityForActor } from "../../src/kernel.js";
import { buildCompatibilityBridgeLedger } from "../../src/compatibility-bridges.js";
import {
  legacyCapabilityCompatibilityModeFromProject,
  previewLegacyCapabilityMigrationFromProject
} from "../../src/capability-legacy-migration.js";
import {
  previewLegacyFrontendUpliftFromProject
} from "../../src/frontend-legacy-uplift.js";
import {
  packageApplyPreviewRowsFromProject,
  packageCoexistenceFromProject,
  packageConvergenceFromProject
} from "../../src/package-authorship-world.js";
import {
  TRANSITIONAL_CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES,
  moduleProjectors
} from "../../src/modules.js";
import {
  widgetDefinitions,
  widgetVersions,
  widgetVersionTransitions,
  widgetVersionActivationHistory,
  frontendProgramsProjection,
  frontendStepsProjection
} from "../../src/widgets.js";
import {
  backendProgramsProjection,
  backendProgramVersionTransitions,
  backendProgramActivationHistory,
  backendProgramVersionsProjection,
  backendStepsProjection
} from "../../src/backend-programs.js";
import { listSupportedMcpTools } from "../mcp/mcp-tools.js";
import { typeModelProjection } from "../../src/type-model.js";
import { buildBootstrapContributionState } from "./bootstrap-contribution-state.js";
import { availableRuntimeProfiles } from "../../src/runtime-bundles.js";
import {
  cloneRuntimeAuthoringPolicy,
  createRuntimeAuthoringPolicy,
  defaultRuntimeAuthoringMode
} from "../../src/runtime-authoring-policy.js";
import {
  buildGovernanceRouteInventory,
  proposalTargetGovernanceRows,
  proposalTargetProcessIds
} from "../../src/runtime-governance.js";
import { resolveAuthoringHandlerSupport } from "../../src/runtime-authoring-handler-support.js";
import { readBootstrapAppBoundaryState } from "./bootstrap-app-boundary.js";
import { activeRequestWorld, previewAwareProject } from "../../src/runtime-preview.js";

export function createBootstrapReadModels({
  world,
  runtimeProfile,
  runtimeBundleSummary,
  runtimeContributions = null,
  supportedHandlers,
  supportedHandlerMetadata = {},
  supportedPageHandlers,
  supportedHandlerSets,
  supportedFrontendOps,
  supportedBackendOps,
  backendHosts = [],
  frontendHosts = [],
  getRuntimePluginCatalog,
  buildPluginCapabilitySourceIndex,
  getRuntimeOperatorState = async () => null
}) {
  const witnessRowsByProcess = (project, process) => {
    const rows = new Map();
    for (const witness of project.allWitnesses()) {
      if (witness?.process !== process || !witness.body?.id) continue;
      rows.set(String(witness.body.id), JSON.parse(JSON.stringify(witness.body)));
    }
    return [...rows.values()];
  };

  const runtimePluginAvailabilityRows = ({
    serverRunners = [],
    runtimePluginInstalls = [],
    pluginPackages = []
  }) => {
    const installedIndex = new Set(
      runtimePluginInstalls.map(row => `${row.serverRunner}\u0000${row.plugin}`)
    );
    const packageById = new Map(pluginPackages.map(pluginPackage => [pluginPackage.id, pluginPackage]));
    return serverRunners.flatMap(serverRunner => pluginPackages.map(pluginPackage => {
      const key = `${serverRunner.id}\u0000${pluginPackage.id}`;
      const installed = installedIndex.has(key);
      const dependsOnPlugins = [...(pluginPackage.metadata?.dependsOnPlugins ?? [])];
      const missingDependencies = dependsOnPlugins.filter(pluginId => !installedIndex.has(`${serverRunner.id}\u0000${pluginId}`));
      const dependencyIssues = dependsOnPlugins.flatMap(pluginId => {
        const dependencyPackage = packageById.get(pluginId);
        if (!dependencyPackage) return [`plugin dependency not found: ${pluginId}`];
        const issues = [];
        if (!dependencyPackage.validation?.ok) issues.push(`plugin dependency manifest invalid: ${pluginId}`);
        if (!dependencyPackage.execution?.executable) issues.push(`plugin dependency is metadata-only: ${pluginId}`);
        if (!dependencyPackage.compatibility?.compatible) issues.push(`plugin dependency incompatible: ${pluginId}`);
        return issues;
      });
      const reasons = [];
      if (installed) reasons.push("already installed on server runner");
      if (!pluginPackage.validation?.ok) reasons.push(...(pluginPackage.validation?.errors ?? []));
      if (!pluginPackage.execution?.executable) reasons.push("plugin package is metadata-only");
      if (!pluginPackage.compatibility?.compatible) {
        reasons.push(...((pluginPackage.compatibility?.reasons ?? []).map(reason =>
          reason === "runtime-profile-incompatible"
            ? "runtime profile incompatible"
            : reason
        )));
      }
      reasons.push(...dependencyIssues);
      return {
        serverRunner: serverRunner.id,
        plugin: pluginPackage.id,
        displayName: pluginPackage.metadata?.displayName ?? pluginPackage.id,
        version: pluginPackage.metadata?.version ?? null,
        description: pluginPackage.metadata?.description ?? null,
        discoveryPath: pluginPackage.discoveryPath,
        installed,
        executable: pluginPackage.execution?.executable === true,
        compatible: pluginPackage.compatibility?.compatible === true,
        installable: !installed
          && pluginPackage.validation?.ok === true
          && pluginPackage.execution?.executable === true
          && pluginPackage.compatibility?.compatible === true
          && dependencyIssues.length === 0,
        reasons,
        dependsOnPlugins,
        missingDependencies,
        validationErrors: [...(pluginPackage.validation?.errors ?? [])],
        compatibilityReasons: [...(pluginPackage.compatibility?.reasons ?? [])],
        executionMode: pluginPackage.execution?.mode ?? null,
        executionReason: pluginPackage.execution?.reason ?? null
      };
    })).sort((left, right) =>
      String(left.serverRunner).localeCompare(String(right.serverRunner))
      || String(left.plugin).localeCompare(String(right.plugin))
    );
  };

  const mcpBootstrapState = ({
    mcpServers = [],
    mcpToolInstalls = [],
    appContext = null
  }) => {
    const supportedToolMap = new Map(
      listSupportedMcpTools().map(tool => [tool.name, tool])
    );
    const activeServerRunner = appContext?.serverRunnerId ?? null;
    const servers = mcpServers.map(server => {
      const tools = mcpToolInstalls
        .filter(row => row.server === server.id)
        .map(row => ({
          ...row,
          definition: supportedToolMap.get(row.tool) ?? null
        }));
      return {
        ...server,
        attachedToActiveRuntime: Boolean(server.serverRunner && activeServerRunner && server.serverRunner === activeServerRunner),
        transportVisibility: {
          stdio: server.transports.includes("stdio"),
          http: server.transports.includes("http")
        },
        httpPath: server.transports.includes("http") ? `/mcp/${encodeURIComponent(server.id)}` : null,
        tools
      };
    });
    return {
      activeServerRunner,
      servers
    };
  };

  const bootstrapState = async (requestActor = null, appContext = null) => {
    const requestWorld = activeRequestWorld(appContext, world);
    const project = appContext?.requestWorldOverride
      ? previewAwareProject(requestWorld, {
          projectionContext: appContext?.projectionContext ?? null
        })
      : (appContext?.project ?? (projector => world.project(projector)));
    if (typeof project.allWitnesses !== "function") {
      project.allWitnesses = () => requestWorld.allWitnesses();
    }
    const witnesses = requestWorld.allWitnesses();
    const routes = project(moduleProjectors.routes);
    const servedRoutes = project(moduleProjectors.servedRoutes);
    const serverRunners = project(moduleProjectors.serverRunners);
    const collections = project(moduleProjectors.collections);
    const types = witnessRowsByProcess(project, "desire.defineType");
    const processes = witnessRowsByProcess(project, "desire.defineProcess");
    const messages = witnessRowsByProcess(project, "desire.defineMessage");
    const projections = witnessRowsByProcess(project, "desire.defineProjection");
    const boundaries = witnessRowsByProcess(project, "desire.defineBoundary");
    const policies = witnessRowsByProcess(project, "desire.definePolicy");
    const surfaces = witnessRowsByProcess(project, "desire.defineSurface");
    const contexts = project(moduleProjectors.contexts);
    const contextBindings = project(moduleProjectors.contextBindings);
    const contextExports = project(moduleProjectors.contextExports);
    const contextImports = project(moduleProjectors.contextImports);
    const contextScopes = project(moduleProjectors.contextScopes);
    const contextualTargets = project(moduleProjectors.contextualTargets);
    const contextNameResolutions = project(moduleProjectors.contextNameResolutions);
    const contextNameConflicts = project(moduleProjectors.contextNameConflicts);
    const perspectives = project(moduleProjectors.perspectives);
    const stewardships = project(moduleProjectors.stewardships);
    const proposals = project(moduleProjectors.proposals);
    const packages = project(moduleProjectors.packages);
    const packageRevisions = project(moduleProjectors.packageRevisions);
    const packagePatches = project(moduleProjectors.packagePatches);
    const packageNamespaces = project(moduleProjectors.packageNamespaces);
    const packageDependencies = project(moduleProjectors.packageDependencies);
    const packageTransformers = project(moduleProjectors.packageTransformers);
    const packageCoexistence = packageCoexistenceFromProject(project);
    const packageConvergence = packageConvergenceFromProject(project);
    const packageApplyPreviews = packageApplyPreviewRowsFromProject(project);
    const capabilities = project(moduleProjectors.capabilities);
    const capabilityCatalog = project(moduleProjectors.capabilityCatalog);
    const capabilityInstalls = project(moduleProjectors.capabilityInstalls);
    const capabilityRevisionHistory = project(moduleProjectors.capabilityRevisionHistory);
    const legacyCapabilityCompatibilityMode = legacyCapabilityCompatibilityModeFromProject(project);
    const legacyCapabilityMigration = previewLegacyCapabilityMigrationFromProject(project);
    const legacyFrontendUplift = previewLegacyFrontendUpliftFromProject(project);
    const compatibilityBridges = buildCompatibilityBridgeLedger({
      capabilities,
      capabilityInstalls
    });
    const governanceRoutes = runtimeBundleSummary?.governanceRoutes
      ?? buildGovernanceRouteInventory(runtimeBundleSummary?.routes ?? []);
    const proposalTargetGovernance = runtimeBundleSummary?.proposalTargetGovernance
      ?? proposalTargetGovernanceRows();
    const runtimePluginInstalls = project(moduleProjectors.runtimePluginInstalls);
    const mcpServers = project(moduleProjectors.mcpServers);
    const mcpToolInstalls = project(moduleProjectors.mcpToolInstalls);
    const identities = project(moduleProjectors.identities);
    const identityActorAssumptionGrants = project(moduleProjectors.identityActorAssumptionGrants);
    const widgets = widgetDefinitions(witnesses);
    const widgetVersionRows = widgetVersions(witnesses);
    const widgetTransitions = widgetVersionTransitions(witnesses);
    const widgetActivationHistoryRows = [...widgetVersionActivationHistory(witnesses).values()].flat();
    const frontendPrograms = frontendProgramsProjection(witnesses);
    const frontendSteps = frontendStepsProjection(witnesses);
    const backendPrograms = backendProgramsProjection(witnesses);
    const backendProgramVersions = backendProgramVersionsProjection(witnesses);
    const backendProgramTransitions = backendProgramVersionTransitions(witnesses);
    const backendProgramActivationRows = [...backendProgramActivationHistory(witnesses).values()].flat();
    const backendSteps = backendStepsProjection(witnesses);
    const pluginCatalog = await getRuntimePluginCatalog({
      activeProfile: runtimeProfile,
      serverRunnerId: null,
      configuredPluginIds: [],
      authoredPluginIds: []
    });
    const capabilityPluginSources = buildPluginCapabilitySourceIndex({
      capabilityCatalog,
      pluginPackages: pluginCatalog.packages
    });
    const runtimePluginAvailability = runtimePluginAvailabilityRows({
      serverRunners,
      runtimePluginInstalls,
      pluginPackages: pluginCatalog.packages
    });
    const authoringPolicy = cloneRuntimeAuthoringPolicy(
      appContext?.runtimeAuthoringPolicy
      ?? createRuntimeAuthoringPolicy({
        mode: defaultRuntimeAuthoringMode({
          runtimeStartupMode: appContext?.runtimeStartupMode ?? "serve"
        })
      })
    );
    const bootstrapContributionState = buildBootstrapContributionState(
      appContext?.runtimeContributions ?? runtimeContributions
    );
    const operator = await getRuntimeOperatorState(appContext);
    const appBoundary = await readBootstrapAppBoundaryState({
      world: requestWorld,
      runtimeBundleSummary,
      bootstrapModel: {
        backendHosts: backendHosts.map(id => ({ id })),
        frontendHosts: frontendHosts.map(id => ({ id }))
      },
      runtimeProfile: appContext?.runtimeProfile ?? runtimeProfile,
      getRuntimePluginCatalog,
      appContext
    });
    return {
      contexts,
      contextBindings,
      contextExports,
      contextImports,
      contextScopes,
      contextualTargets,
      contextNameResolutions,
      contextNameConflicts,
      canonicalIdPolicyClasses: [...TRANSITIONAL_CONTEXTUAL_CANONICAL_ID_POLICY_CLASSES],
      perspectives,
      stewardships,
      authority: authorityForActor(requestWorld, requestActor),
      proposals,
      packages,
      packageRevisions,
      packagePatches,
      packageNamespaces,
      packageDependencies,
      packageTransformers,
      packageCoexistence,
      packageConvergence,
      packageApplyPreviews,
      capabilities,
      capabilityCatalog: capabilityPluginSources.capabilityCatalog,
      capabilityPackageSources: capabilityPluginSources.capabilityPackageSources,
      capabilityInstalls,
      capabilityRevisionHistory,
      legacyCapabilityCompatibilityMode,
      legacyCapabilityMigration,
      legacyFrontendUplift,
      compatibilityBridges,
      governanceRoutes,
      proposalTargetGovernance,
      runtimePluginInstalls,
      runtimePluginAvailability,
      authoringPolicy,
      pluginCatalog,
      appBoundary,
      ...bootstrapContributionState,
      operator,
      mcp: mcpBootstrapState({ mcpServers, mcpToolInstalls, appContext }),
      mcpServers,
      mcpToolInstalls,
      identities,
      identityActorAssumptionGrants,
      collections,
      types,
      processes,
      messages,
      projections,
      boundaries,
      policies,
      surfaces,
      widgets,
      widgetVersions: widgetVersionRows,
      widgetVersionTransitions: widgetTransitions,
      widgetVersionActivationHistory: widgetActivationHistoryRows,
      frontendPrograms,
      frontendSteps,
      backendPrograms,
      backendProgramVersions,
      backendProgramTransitions,
      backendProgramActivationHistory: backendProgramActivationRows,
      backendSteps,
      routes,
      servedRoutes,
      serverRunners
    };
  };

  const bootstrapModel = async (appContext = null) => {
    const requestWorld = activeRequestWorld(appContext, world);
    const authored = await bootstrapState(null, appContext);
    const pluginCatalog = await getRuntimePluginCatalog({
      activeProfile: appContext?.runtimeProfile ?? runtimeProfile,
      serverRunnerId: null,
      configuredPluginIds: [],
      authoredPluginIds: []
    });
    const handlerSupport = await resolveAuthoringHandlerSupport({
      supportedHandlerSets,
      supportedHandlers,
      supportedPageHandlers,
      supportedHandlerMetadata,
      pluginCatalog
    });
    const proposalTargetGovernance = proposalTargetGovernanceRows({ bootstrapSelectableOnly: true });
    const homeRoute = authored.servedRoutes.find(route => route.method === "GET" && route.path === "/");
    const appReady = Boolean(
      homeRoute
      && homeRoute.handler === "page.surface"
      && homeRoute.params?.rootSurface
    );
    const typeModel = requestWorld.project(typeModelProjection);
    const pageRoutes = (authored.routes || []).filter(route => {
      if (!String(route.handler || "").startsWith("page.")) return false;
      const rootWidget = route.params?.rootWidget ?? null;
      const widget = (authored.widgets || []).find(row => row.id === rootWidget);
      return widget?.kind === "Page";
    });
    return {
      appReady,
      homeReason: appReady ? "reachable home route" : "no reachable app home route",
      widgetKinds: ["Page", "Box", "Section", "Heading", "Text", "Form", "Input", "Select", "Option", "Button", "Link", "List", "ValueEditor"],
      supportedMethods: ["GET", "POST", "PATCH", "DELETE"],
      supportedHandlers: handlerSupport.supportedHandlers,
      supportedHandlerMetadata: handlerSupport.supportedHandlerMetadata,
      supportedPageHandlers: handlerSupport.supportedPageHandlers,
      supportedHandlerSets: handlerSupport.supportedHandlerSets,
      supportedFrontendOps,
      supportedBackendOps,
      supportedMcpTransports: ["stdio", "http"],
      supportedMcpActingModes: ["delegated", "service"],
      supportedMcpTools: listSupportedMcpTools(),
      runtimeProfile,
      runtimeProfiles: availableRuntimeProfiles().map(id => ({ id, label: id })),
      authoringPolicy: authored.authoringPolicy,
      runtimeBundles: runtimeBundleSummary?.bundles ?? [],
      runtimeRoutes: runtimeBundleSummary?.routes ?? [],
      runtimeSurfaces: runtimeBundleSummary?.surfaces ?? [],
      providedRuntimeCapabilities: runtimeBundleSummary?.capabilities ?? [],
      backendHosts: backendHosts.map(id => ({ id })),
      frontendHosts: frontendHosts.map(id => ({ id })),
      pluginExecutionMode: "bundle-bridge",
      processSpecs: Object.values(typeModel.processSpecsByProcess ?? {}),
      capabilityTargetKinds: ["context", "serverRunner", "routePage"],
      stewardshipTargetKinds: ["context", "perspective"],
      capabilityTargets: {
        contexts: authored.contexts || [],
        serverRunners: authored.serverRunners || [],
        routePages: pageRoutes
      },
      contextBindableTargets: [
        ...(authored.identities || []),
        ...(authored.contexts || []),
        ...(authored.perspectives || []),
        ...(authored.packages || []),
        ...(authored.packageRevisions || []),
        ...(authored.packagePatches || []),
        ...(authored.packageNamespaces || []),
        ...(authored.packageDependencies || []),
        ...(authored.packageTransformers || []),
        ...(authored.collections || []),
        ...(authored.widgets || []),
        ...(authored.backendPrograms || []),
        ...(authored.backendProgramVersions || []),
        ...(authored.routes || []),
        ...(authored.serverRunners || []),
        ...(authored.mcpServers || []),
        ...(authored.capabilities || [])
      ],
      attachableContexts: authored.contexts || [],
      proposalTargetProcesses: proposalTargetProcessIds({ bootstrapSelectableOnly: true }),
      proposalTargetGovernance
    };
  };

  return {
    getBootstrapModel: bootstrapModel,
    getBootstrapState: bootstrapState
  };
}
