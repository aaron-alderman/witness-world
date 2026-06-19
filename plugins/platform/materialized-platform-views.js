import crypto from "node:crypto";
import { stableStringify } from "../../src/projectors-core.js";
import { moduleProjectors } from "../../src/modules.js";
import { diagnosticsFromPlatformAppContext } from "./app-context-diagnostics.js";
import {
  buildPlatformShipView,
  buildPlatformSlice,
  buildPlatformVerificationView,
  currentPlatformRuntimeRevision,
  readPlatformGitBoundaryTokenSnapshot,
  readPlatformInventoryTokenSnapshot,
  requirementsForPlatformRequest
} from "./platform-model.js";

function memoizeProject(project) {
  if (typeof project !== "function") return () => [];
  const cache = new Map();
  return projector => {
    if (cache.has(projector)) return cache.get(projector);
    const value = project(projector);
    cache.set(projector, value);
    return value;
  };
}

function hashValue(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

function projectForPlatform(world, appContext = null) {
  return memoizeProject(appContext?.project ?? (projector => world.project(projector)));
}

function countWorldEvents(world) {
  return Number(world?.witnessCount?.() ?? 0) + Number(world?.observationCount?.() ?? 0);
}

function materializedDefinitionById(appContext, definitionId) {
  return appContext?.materializedViews?.findOne?.(row => row.id === String(definitionId || "")) ?? null;
}

function materializedSliceDefinition(appContext, {
  sliceKey,
  sectionId = null,
  modelView = null
} = {}) {
  return appContext?.materializedViews?.findOne?.(row =>
    row.kind === "platformSlice"
    && row.sliceKey === String(sliceKey || "")
    && (
      !row.modelView
      || row.modelView === modelView
      || row.modelView === sectionId
    )
  ) ?? null;
}

function processFingerprint(rows = [], processName = "", { definitionId = null } = {}) {
  let count = 0;
  let last = null;
  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.process || "") !== String(processName || "")) continue;
    if (definitionId && processName === "materializedView.read" && String(row?.body?.id || "") === String(definitionId)) continue;
    if (definitionId && processName === "runtime.resourceProbe.operation" && String(row?.body?.materializedViewId || "") === String(definitionId)) continue;
    count += 1;
    last = row;
  }
  return {
    count,
    lastId: last?.id ?? null,
    lastAt: last?.body?.observedAt ?? last?.body?.finishedAt ?? last?.time ?? null
  };
}

function normalizeProjectorValue(projectorName, value, definitionId = null) {
  if (projectorName === "materializedViewStates") {
    return (Array.isArray(value) ? value : []).filter(row => String(row?.id || "") !== String(definitionId || ""));
  }
  if (projectorName === "resourceProbeOperations") {
    return (Array.isArray(value) ? value : []).filter(row => {
      const materializedViewId = row?.materializedViewId ?? row?.detail?.materializedViewId ?? null;
      return String(materializedViewId || "") !== String(definitionId || "");
    });
  }
  return value;
}

function needsRuntimeRevision(definition, buildArgs = null) {
  if (definition?.kind === "platformVerification") return true;
  const sliceKey = definition?.sliceKey ?? buildArgs?.sliceKey ?? null;
  return String(sliceKey || "") === "verification";
}

function needsGitBoundary(definition, buildArgs = null) {
  if (definition?.kind === "platformShip") return true;
  const sliceKey = definition?.sliceKey ?? buildArgs?.sliceKey ?? null;
  const modelView = definition?.modelView ?? buildArgs?.modelView ?? null;
  return ["pushes", "ships"].includes(String(sliceKey || ""))
    || ["pushes", "ships", "workflowPushes", "workflowShips"].includes(String(modelView || ""));
}

function hasInventoryDependencies(requirements = null) {
  return Boolean(
    requirements?.docs
    || requirements?.folders
    || requirements?.knowledgeRelations
    || requirements?.testInventory
    || requirements?.pluginManifests
  );
}

function changedSignatureKey(previous = {}, current = {}) {
  const previousProjectors = previous?.projectors ?? {};
  const currentProjectors = current?.projectors ?? {};
  for (const key of new Set([...Object.keys(previousProjectors), ...Object.keys(currentProjectors)])) {
    if ((previousProjectors[key] ?? null) !== (currentProjectors[key] ?? null)) return `projector:${key}`;
  }
  const previousProcesses = previous?.processes ?? {};
  const currentProcesses = current?.processes ?? {};
  for (const key of new Set([...Object.keys(previousProcesses), ...Object.keys(currentProcesses)])) {
    if (stableStringify(previousProcesses[key] ?? null) !== stableStringify(currentProcesses[key] ?? null)) return `process:${key}`;
  }
  if (Number(previous?.runtimeRevision || 0) !== Number(current?.runtimeRevision || 0)) return "runtimeRevision";
  const previousInventory = previous?.inventoryTokens ?? {};
  const currentInventory = current?.inventoryTokens ?? {};
  for (const key of new Set([...Object.keys(previousInventory), ...Object.keys(currentInventory)])) {
    if ((previousInventory[key] ?? null) !== (currentInventory[key] ?? null)) return `inventory:${key}`;
  }
  if (String(previous?.gitBoundaryToken || "") !== String(current?.gitBoundaryToken || "")) return "gitBoundary";
  return "signature-changed";
}

async function buildPlatformViewSignature({
  definition,
  world,
  appContext,
  project,
  buildArgs = null,
  requirements = null
} = {}) {
  if (!definition) return null;
  const projectors = {};
  for (const projectorName of definition.sourceProjectors ?? []) {
    const projector = moduleProjectors[projectorName];
    if (typeof projector !== "function") {
      projectors[projectorName] = "missing";
      continue;
    }
    const value = normalizeProjectorValue(projectorName, project(projector), definition.id);
    projectors[projectorName] = hashValue(value);
  }
  const witnessRows = world?.allWitnesses?.() ?? [];
  const observationRows = world?.allObservations?.() ?? [];
  const processes = Object.fromEntries(
    (definition.sourceWitnessProcesses ?? []).map(processName => [
      processName,
      {
        witnesses: processFingerprint(witnessRows, processName, { definitionId: definition.id }),
        observations: processFingerprint(observationRows, processName, { definitionId: definition.id })
      }
    ])
  );
  const inventorySnapshot = hasInventoryDependencies(requirements)
    ? await readPlatformInventoryTokenSnapshot(requirements, {
        appContext
      })
    : { tokens: {}, details: {} };
  const gitBoundarySnapshot = needsGitBoundary(definition, buildArgs)
    ? await readPlatformGitBoundaryTokenSnapshot({
        repoRoot: appContext?.platformGit?.repoRoot ?? null,
        appContext
      })
    : { token: null, detail: null };
  const components = {
    id: definition.id,
    kind: definition.kind,
    sliceKey: definition.sliceKey ?? buildArgs?.sliceKey ?? null,
    modelView: definition.modelView ?? buildArgs?.modelView ?? null,
    projectors,
    processes,
    inventoryTokens: inventorySnapshot.tokens,
    runtimeRevision: needsRuntimeRevision(definition, buildArgs)
      ? currentPlatformRuntimeRevision(appContext)
      : null,
    gitBoundaryToken: gitBoundarySnapshot.token
  };
  return {
    signature: hashValue(components),
    components
  };
}

function ensurePlatformBuilders(appContext, world, {
  buildPlatformSliceImpl = buildPlatformSlice,
  buildPlatformVerificationViewImpl = buildPlatformVerificationView,
  buildPlatformShipViewImpl = buildPlatformShipView
} = {}) {
  if (!appContext?.materializedViews?.registerBuilder) return;
  appContext.__platformSliceMaterializedBuilder ??= async ({ buildArgs, signature }) => {
    const value = await buildPlatformSliceImpl(buildArgs);
    return {
      value,
      inputSize: countWorldEvents(world),
      signature
    };
  };
  appContext.__platformVerificationMaterializedBuilder ??= async ({ buildArgs, signature }) => {
    const value = await buildPlatformVerificationViewImpl(buildArgs);
    return {
      value,
      inputSize: countWorldEvents(world),
      signature
    };
  };
  appContext.__platformShipMaterializedBuilder ??= async ({ buildArgs, signature }) => {
    const value = await buildPlatformShipViewImpl(buildArgs);
    return {
      value,
      inputSize: countWorldEvents(world),
      signature
    };
  };
  appContext.materializedViews.registerBuilder("platformSlice", appContext.__platformSliceMaterializedBuilder);
  appContext.materializedViews.registerBuilder("platformVerification", appContext.__platformVerificationMaterializedBuilder);
  appContext.materializedViews.registerBuilder("platformShip", appContext.__platformShipMaterializedBuilder);
}

async function readMaterializedPlatformView({
  world,
  appContext,
  definition,
  project,
  request,
  buildArgs,
  requirements
} = {}) {
  if (!definition || !appContext?.materializedViews?.read) return null;
  const signature = await buildPlatformViewSignature({
    definition,
    world,
    appContext,
    project,
    buildArgs,
    requirements
  });
  return appContext.materializedViews.read(definition.id, {
    appContext,
    request,
    buildArgs,
    signature: signature?.signature ?? null,
    signatureComponents: signature?.components ?? null,
    deriveInvalidationCause: changedSignatureKey
  });
}

export async function readDeclaredPlatformSliceView(world, appContext, {
  sliceKey = "overview",
  sectionId = null,
  modelView = null,
  request = null,
  buildPlatformSliceImpl = buildPlatformSlice
} = {}) {
  const project = projectForPlatform(world, appContext);
  const requirements = requirementsForPlatformRequest({
    sliceKey,
    sectionId,
    modelView
  });
  const buildArgs = {
    sliceKey,
    modelView,
    appContext,
    diagnostics: diagnosticsFromPlatformAppContext(appContext),
    project,
    requirements
  };
  const definition = materializedSliceDefinition(appContext, {
    sliceKey,
    sectionId,
    modelView
  });
  if (!definition) return buildPlatformSliceImpl(buildArgs);
  ensurePlatformBuilders(appContext, world, { buildPlatformSliceImpl });
  return readMaterializedPlatformView({
    world,
    appContext,
    definition,
    project,
    request,
    buildArgs,
    requirements
  });
}

export async function readDeclaredPlatformVerificationView(world, appContext, {
  definitionId = "platform.view.verification.queue",
  request = null,
  buildPlatformVerificationViewImpl = buildPlatformVerificationView
} = {}) {
  const project = projectForPlatform(world, appContext);
  const buildArgs = {
    appContext,
    project
  };
  const definition = materializedDefinitionById(appContext, definitionId);
  if (!definition) return buildPlatformVerificationViewImpl(buildArgs);
  ensurePlatformBuilders(appContext, world, { buildPlatformVerificationViewImpl });
  return readMaterializedPlatformView({
    world,
    appContext,
    definition,
    project,
    request,
    buildArgs,
    requirements: requirementsForPlatformRequest({
      sliceKey: "verification",
      modelView: definition.modelView ?? "verificationStatus"
    })
  });
}

export async function readDeclaredPlatformShipView(world, appContext, {
  definitionId = "platform.view.ship.gating",
  request = null,
  buildPlatformShipViewImpl = buildPlatformShipView
} = {}) {
  const project = projectForPlatform(world, appContext);
  const buildArgs = {
    appContext,
    project
  };
  const definition = materializedDefinitionById(appContext, definitionId);
  if (!definition) return buildPlatformShipViewImpl(buildArgs);
  ensurePlatformBuilders(appContext, world, { buildPlatformShipViewImpl });
  return readMaterializedPlatformView({
    world,
    appContext,
    definition,
    project,
    request,
    buildArgs,
    requirements: requirementsForPlatformRequest({
      sliceKey: "ships",
      modelView: definition.modelView ?? "ships"
    })
  });
}
