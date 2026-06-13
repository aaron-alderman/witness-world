import fs from "node:fs/promises";
import path from "node:path";
import { createWorld } from "./kernel.js";
import { declareBackendHost, declareFrontendHost, startServer } from "./host.js";
import {
  DEFAULT_BOOTSTRAP_RUNTIME_PROFILE,
  DEFAULT_RUNTIME_PROFILE,
  resolveRuntimeProfile,
  resolveRuntimeProfileStrict
} from "./runtime-bundles.js";
import { resolveRuntimeOperatorPaths } from "./runtime-operator-contract.js";

export function resolveCliRuntimeProfile({ runtimeProfile, explicit }) {
  if (!explicit) return resolveRuntimeProfile(runtimeProfile);
  const resolved = resolveRuntimeProfileStrict(runtimeProfile);
  if (resolved.ok) return resolved;
  const error = new Error(`Unknown runtime profile: ${resolved.requestedProfile}`);
  error.code = "RUNTIME_PROFILE_UNKNOWN";
  error.requestedProfile = resolved.requestedProfile;
  error.validProfileIds = resolved.validProfileIds;
  throw error;
}

export async function ensureWorldHomeLayout(operatorContract, {
  fsModule = fs
} = {}) {
  if (operatorContract?.layout !== "world-home-v1") return operatorContract;
  const directories = [
    operatorContract.worldHome,
    operatorContract.directories?.runtimeRoot,
    operatorContract.directories?.backupsRoot,
    operatorContract.directories?.exportsRoot,
    operatorContract.directories?.importsRoot
  ].filter(Boolean);
  const truthDirectories = [
    operatorContract.canonicalTruth?.witnessLogPath,
    operatorContract.canonicalTruth?.observationLogPath
  ]
    .filter(Boolean)
    .map(filePath => path.dirname(filePath));
  for (const directory of [...directories, ...truthDirectories]) {
    await fsModule.mkdir(directory, { recursive: true });
  }
  return operatorContract;
}

export async function startBlankRuntime({
  actor = "system",
  port = 0,
  startupMode = "bootstrap",
  worldHome = null,
  runtimeProfile = DEFAULT_BOOTSTRAP_RUNTIME_PROFILE,
  runtimeProfileExplicit = false,
  runtimePluginIds = [],
  cwd = process.cwd(),
  env = process.env,
  resolveRuntimeOperatorPathsImpl = resolveRuntimeOperatorPaths,
  ensureWorldHomeLayoutImpl = ensureWorldHomeLayout,
  createWorldImpl = createWorld,
  declareBackendHostImpl = declareBackendHost,
  declareFrontendHostImpl = declareFrontendHost,
  startServerImpl = startServer
} = {}) {
  const requestedRuntimeProfile = runtimeProfile ?? (
    startupMode === "bootstrap"
      ? DEFAULT_BOOTSTRAP_RUNTIME_PROFILE
      : DEFAULT_RUNTIME_PROFILE
  );
  const runtimeProfileInfo = resolveCliRuntimeProfile({
    runtimeProfile: requestedRuntimeProfile,
    explicit: runtimeProfileExplicit
  });
  const operatorContract = await resolveRuntimeOperatorPathsImpl({
    startupMode,
    cwd,
    env: {
      ...env,
      ...(worldHome ? { WORLD_HOME: worldHome } : {})
    }
  });
  await ensureWorldHomeLayoutImpl(operatorContract);
  const witnessLogPath = operatorContract.canonicalTruth.witnessLogPath;
  const observationLogPath = operatorContract.canonicalTruth.observationLogPath;
  const world = createWorldImpl({
    genesis: { system: "witness-world", mode: startupMode },
    witnessLogPath,
    observationLogPath
  });

  declareBackendHostImpl(world, {
    actor,
    id: "backendHost",
    runtimeProfile: runtimeProfileInfo.id
  });
  declareFrontendHostImpl(world, {
    actor,
    id: "frontendHost",
    runtimeProfile: runtimeProfileInfo.id
  });

  const explicitRuntimePlugins = Array.isArray(runtimePluginIds) ? runtimePluginIds.filter(Boolean) : [];
  const envRuntimePlugins = typeof env?.RUNTIME_PLUGINS === "string" ? env.RUNTIME_PLUGINS.trim() : "";
  const defaultBootstrapRuntimePluginIds = (
    startupMode === "bootstrap"
    && explicitRuntimePlugins.length === 0
    && !envRuntimePlugins
  )
    ? ["plugin.authoring"]
    : [];

  const server = await startServerImpl(world, {
    actor,
    port,
    runtimeRoot: operatorContract.directories.runtimeRoot,
    runtimeProfile: runtimeProfileInfo.id,
    runtimePluginIds: explicitRuntimePlugins.length
      ? explicitRuntimePlugins
      : (defaultBootstrapRuntimePluginIds.length ? defaultBootstrapRuntimePluginIds : null),
    runtimeStartupMode: startupMode,
    runtimeOperatorContract: operatorContract
  });

  return {
    server,
    world,
    operatorContract,
    runtimeProfile: runtimeProfileInfo.id,
    runtimeProfileInfo,
    witnessLogPath,
    observationLogPath
  };
}
