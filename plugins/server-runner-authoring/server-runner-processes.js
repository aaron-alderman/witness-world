import { projectors, relation } from "../../src/kernel.js";
import {
  createServerRunner,
  installRuntimePlugin,
  removeRuntimePlugin,
  moduleProjectors,
  resolveCoveredContextualRef
} from "../../src/modules.js";
import {
  buildRuntimePluginReview,
  RUNTIME_PLUGIN_RECONCILE_TARGET_PROCESS
} from "../../src/runtime-plugin-utils.js";
import { availableRuntimeProfiles } from "../../src/runtime-bundles.js";
import { processSpecFor, typeModelProjection, validateProcessInput } from "../../src/type-model.js";

function fail(world, { process, actor, body }) {
  return world.emit({ process, actor, claims: [], body });
}

function exists(world, id) {
  return world.project(projectors.things).has(id);
}

function parseJsonField(raw, field) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string") return { ok: false, error: `${field} must be a JSON string` };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: `${field} is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
}

function validateInput(world, process, body) {
  const typeModel = typeModelProjection(world.allWitnesses());
  if (!processSpecFor(typeModel, process)) {
    return {
      ok: true,
      value: body && typeof body === "object" ? { ...body } : {},
      failures: [],
      spec: null
    };
  }
  const validated = validateProcessInput(typeModel, process, body, { coerceStrings: false });
  if (!validated.ok) return validated;
  return {
    ...validated,
    value: body && typeof body === "object"
      ? { ...body, ...validated.value }
      : validated.value
  };
}

function normalizeJsonObject(parsed, field) {
  if (!parsed) return { ok: true, value: null };
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return { ok: false, error: `${field} must be a JSON object` };
  return { ok: true, value: parsed.value };
}

function normalizedRuntimeProfile(raw) {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function validateRuntimeProfile(world, {
  actor,
  backendHost,
  process,
  runtimeProfile,
  serverRunner = null
}) {
  const profile = normalizedRuntimeProfile(runtimeProfile);
  if (!profile) return { ok: true, runtimeProfile: null };
  const validProfiles = availableRuntimeProfiles();
  if (validProfiles.includes(profile)) return { ok: true, runtimeProfile: profile };
  const witness = fail(world, {
    process: `${process}.failed`,
    actor: actor || backendHost,
    body: {
      reason: "unknown runtime profile",
      runtimeProfile: profile,
      serverRunner,
      validProfiles
    }
  });
  return { ok: false, status: 400, error: "unknown runtime profile", witness };
}

function resolveBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveCoveredContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

export function resolveRuntimePluginServerRunnerInput(world, body, {
  contextField = "context",
  idField = "serverRunner",
  refField = "serverRunnerRef",
  label = "server runner"
} = {}) {
  const resolved = resolveBodyRef(world, body, {
    contextField,
    idField,
    refField,
    label
  });
  if (!resolved.ok) return resolved;
  if (!resolved.target) return { ok: false, error: `${label} is required` };
  return resolved;
}

function runtimePluginInstallExists(world, { serverRunner, plugin }) {
  return world.project(moduleProjectors.runtimePluginInstalls)
    .some(row => row.serverRunner === serverRunner && row.plugin === plugin);
}

function runtimePluginPackageById(pluginCatalog = null) {
  return new Map((pluginCatalog?.packages ?? []).map(row => [row.id, row]));
}

function currentRuntimePluginReview(world, {
  serverRunner,
  plugin,
  pluginCatalog = null
}) {
  return buildRuntimePluginReview({
    runtimeProfile: pluginCatalog?.activeProfile ?? null,
    serverRunnerId: serverRunner,
    authoredPluginIds: installedRuntimePluginRows(world, serverRunner).map(row => row.plugin),
    pluginId: plugin,
    pluginCatalog
  });
}

function validateRuntimePluginPackageForInstall(pluginPackage, { serverRunner, plugin, actor, backendHost, world }) {
  if (!pluginPackage) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin package not found", serverRunner, plugin }
    });
    return { ok: false, status: 404, error: "runtime plugin package not found", witness };
  }
  if (!pluginPackage.validation?.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: {
        reason: "runtime plugin manifest invalid",
        serverRunner,
        plugin,
        validationErrors: [...(pluginPackage.validation?.errors ?? [])]
      }
    });
    return { ok: false, status: 400, error: "runtime plugin manifest invalid", witness };
  }
  if (!pluginPackage.execution?.executable) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin package is metadata-only", serverRunner, plugin }
    });
    return { ok: false, status: 400, error: "runtime plugin package is metadata-only", witness };
  }
  if (!pluginPackage.compatibility?.compatible) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: {
        reason: "runtime plugin package incompatible with active runtime profile",
        serverRunner,
        plugin,
        compatibilityReasons: [...(pluginPackage.compatibility?.reasons ?? [])]
      }
    });
    return { ok: false, status: 400, error: "runtime plugin package incompatible with active runtime profile", witness };
  }
  return { ok: true };
}

function installedRuntimePluginRows(world, serverRunner) {
  return world.project(moduleProjectors.runtimePluginInstalls)
    .filter(row => row.serverRunner === serverRunner);
}

function emitServerRunnerState(world, {
  actor,
  owner = actor,
  runner
}) {
  return world.emit({
    process: "defineServerRunner",
    actor,
    claims: [
      relation(runner.id, "hasModuleKind", "serverRunner"),
      relation(runner.id, "supportsProcess", "serveRoute"),
      relation(runner.id, "hostBoundary", "http"),
      relation(owner, "owns", runner.id),
      ...(runner.context ? [relation(runner.id, "inContext", runner.context)] : []),
      ...(runner.backendHost ? [relation(runner.id, "usesBackendHost", runner.backendHost)] : []),
      ...(runner.frontendHost ? [relation(runner.id, "usesFrontendHost", runner.frontendHost)] : [])
    ],
    body: {
      id: runner.id,
      backendHost: runner.backendHost ? String(runner.backendHost) : null,
      frontendHost: runner.frontendHost ? String(runner.frontendHost) : null,
      runtimeProfile: runner.runtimeProfile ? String(runner.runtimeProfile) : null,
      handlerSet: runner.handlerSet ? String(runner.handlerSet) : null,
      actors: Array.isArray(runner.actors) ? [...runner.actors] : null,
      storage: runner.storage && typeof runner.storage === "object" ? { ...runner.storage } : null,
      runtimeConfig: runner.runtimeConfig && typeof runner.runtimeConfig === "object" ? { ...runner.runtimeConfig } : null,
      allowActorHeader: runner.allowActorHeader === true,
      hosts: Array.isArray(runner.hosts) ? [...runner.hosts] : null,
      default: runner.default === true,
      requireAuth: runner.requireAuth === true,
      context: runner.context ? String(runner.context) : null,
      values: runner.values && typeof runner.values === "object" ? structuredClone(runner.values) : null
    }
  });
}

function dependencyIdsForPackage(pluginPackage) {
  return [...(pluginPackage?.manifest?.dependsOnPlugins ?? pluginPackage?.dependsOnPlugins ?? [])]
    .map(String)
    .filter(Boolean);
}

function resolvePluginDependencyClosure({ pluginId, packageById, includeRoot = false }) {
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const errors = [];

  const visit = plugin => {
    if (visited.has(plugin)) return;
    if (visiting.has(plugin)) {
      errors.push({ plugin, reason: "cyclic plugin dependency" });
      return;
    }
    const pluginPackage = packageById.get(plugin);
    if (!pluginPackage) {
      errors.push({ plugin, reason: "plugin dependency not found" });
      return;
    }
    visiting.add(plugin);
    for (const dependencyId of dependencyIdsForPackage(pluginPackage)) {
      visit(dependencyId);
    }
    visiting.delete(plugin);
    visited.add(plugin);
    ordered.push(plugin);
  };

  visit(pluginId);
  const pluginIds = includeRoot ? ordered : ordered.filter(plugin => plugin !== pluginId);
  return errors.length
    ? { ok: false, pluginIds, errors }
    : { ok: true, pluginIds, errors: [] };
}

function dependencyClosureForInstalledPlugin(plugin, packageById) {
  return resolvePluginDependencyClosure({ pluginId: plugin, packageById, includeRoot: false }).pluginIds;
}

function reverseRuntimePluginDependents({ plugin, installedPluginIds, packageById, excluding = new Set() }) {
  return [...installedPluginIds]
    .filter(installedPluginId => installedPluginId !== plugin && !excluding.has(installedPluginId))
    .filter(installedPluginId => dependencyClosureForInstalledPlugin(installedPluginId, packageById).includes(plugin));
}

function runtimePluginRemovePlan({ plugin, installedPluginIds, packageById, removeMode }) {
  const mode = removeMode || "pluginOnly";
  if (!["pluginOnly", "cascadeUnused", "cascadeAll"].includes(mode)) {
    return { ok: false, error: "unsupported runtime plugin remove mode", status: 400, removeMode: mode };
  }
  const dependencyIds = dependencyClosureForInstalledPlugin(plugin, packageById).filter(id => installedPluginIds.has(id));
  const removeSet = new Set([plugin]);
  if (mode === "cascadeAll") {
    for (const dependencyId of dependencyIds) removeSet.add(dependencyId);
  } else if (mode === "cascadeUnused") {
    let changed = true;
    while (changed) {
      changed = false;
      for (const dependencyId of dependencyIds) {
        if (removeSet.has(dependencyId)) continue;
        const dependents = reverseRuntimePluginDependents({
          plugin: dependencyId,
          installedPluginIds,
          packageById,
          excluding: removeSet
        });
        if (dependents.length === 0) {
          removeSet.add(dependencyId);
          changed = true;
        }
      }
    }
  }
  const selectedDependents = reverseRuntimePluginDependents({
    plugin,
    installedPluginIds,
    packageById,
    excluding: removeSet
  });
  if (selectedDependents.length) {
    return {
      ok: false,
      status: 409,
      error: "runtime plugin is required by installed plugins",
      dependents: selectedDependents,
      removeMode: mode
    };
  }
  if (mode === "cascadeAll") {
    for (const dependencyId of dependencyIds) {
      const dependents = reverseRuntimePluginDependents({
        plugin: dependencyId,
        installedPluginIds,
        packageById,
        excluding: removeSet
      });
      if (dependents.length) {
        return {
          ok: false,
          status: 409,
          error: "runtime plugin dependency is required by installed plugins",
          plugin: dependencyId,
          dependents,
          removeMode: mode
        };
      }
    }
  }
  return { ok: true, removeMode: mode, pluginIds: [...removeSet] };
}

export function requestBootstrapServerRunnerDefine(world, {
  actor,
  backendHost,
  body,
  allowedHandlerSets = []
}) {
  const validated = validateInput(world, "serverRunner.define", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "serverRunner.define.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "server runner id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "server runner id already exists", witness };
  }
  const backendHostResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "backendHost",
    refField: "backendHostRef",
    label: "backend host"
  });
  if (!backendHostResolved.ok) {
    const witness = fail(world, { process: "serverRunner.define.failed", actor: actor || backendHost, body: { reason: backendHostResolved.error } });
    return { ok: false, status: 400, error: backendHostResolved.error, witness };
  }
  const frontendHostResolved = resolveBodyRef(world, body, {
    contextField: "context",
    idField: "frontendHost",
    refField: "frontendHostRef",
    label: "frontend host"
  });
  if (!frontendHostResolved.ok) {
    const witness = fail(world, { process: "serverRunner.define.failed", actor: actor || backendHost, body: { reason: frontendHostResolved.error } });
    return { ok: false, status: 400, error: frontendHostResolved.error, witness };
  }
  const resolvedBackendHost = backendHostResolved.target ?? input.backendHost ?? null;
  const resolvedFrontendHost = frontendHostResolved.target ?? input.frontendHost ?? null;
  const runtimeProfileValidation = validateRuntimeProfile(world, {
    actor,
    backendHost,
    process: "serverRunner.define",
    runtimeProfile: input.runtimeProfile,
    serverRunner: input.id
  });
  if (!runtimeProfileValidation.ok) return runtimeProfileValidation;
  if (!resolvedBackendHost || !resolvedFrontendHost) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "backendHost and frontendHost are required" }
    });
    return { ok: false, status: 400, error: "backendHost and frontendHost are required", witness };
  }
  if (!exists(world, resolvedBackendHost) || !exists(world, resolvedFrontendHost)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "host not found", backendHost: resolvedBackendHost, frontendHost: resolvedFrontendHost }
    });
    return { ok: false, status: 400, error: "host not found", witness };
  }
  if (input.handlerSet && !allowedHandlerSets.includes(input.handlerSet)) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: "unknown handler set", handlerSet: input.handlerSet }
    });
    return { ok: false, status: 400, error: "unknown handler set", witness };
  }
  const runtimeConfigParsed = normalizeJsonObject(parseJsonField(body.runtimeConfigJson, "runtimeConfigJson"), "runtimeConfigJson");
  if (!runtimeConfigParsed.ok) {
    const witness = fail(world, {
      process: "serverRunner.define.failed",
      actor: actor || backendHost,
      body: { reason: runtimeConfigParsed.error }
    });
    return { ok: false, status: 400, error: runtimeConfigParsed.error, witness };
  }
  const storage = {};
  if (input.todoProjection) storage.todoProjection = input.todoProjection;
  if (input.privateNotesProjection) storage.privateNotesProjection = input.privateNotesProjection;
  createServerRunner(world, {
    actor: actor || backendHost,
    id: input.id,
    backendHost: resolvedBackendHost,
    frontendHost: resolvedFrontendHost,
    runtimeProfile: runtimeProfileValidation.runtimeProfile,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    runtimeConfig: runtimeConfigParsed.value,
    allowActorHeader: input.allowActorHeader === true,
    context: input.context ?? null,
    owner: actor || backendHost
  });
  const runner = {
    id: input.id,
    backendHost: resolvedBackendHost,
    frontendHost: resolvedFrontendHost,
    runtimeProfile: runtimeProfileValidation.runtimeProfile,
    handlerSet: input.handlerSet || null,
    storage: Object.keys(storage).length ? storage : null,
    runtimeConfig: runtimeConfigParsed.value,
    allowActorHeader: input.allowActorHeader === true,
    context: input.context ?? null
  };
  const witness = world.emit({
    process: "serverRunner.define",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { serverRunner: runner }
  });
  return { ok: true, status: 201, serverRunner: runner, witness };
}

export function requestBootstrapServerRunnerRuntimeProfileSet(world, {
  actor,
  backendHost,
  body
}) {
  const validated = validateInput(world, "serverRunner.runtimeProfile.set", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "serverRunner.runtimeProfile.set.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const serverRunnerResolved = resolveRuntimePluginServerRunnerInput(world, validated.value, {
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, {
      process: "serverRunner.runtimeProfile.set.failed",
      actor: actor || backendHost,
      body: { reason: serverRunnerResolved.error }
    });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const serverRunnerId = serverRunnerResolved.target;
  const runnerBefore = world.project(moduleProjectors.serverRunners)
    .find(row => row.id === serverRunnerId) ?? null;
  if (!runnerBefore) {
    const witness = fail(world, {
      process: "serverRunner.runtimeProfile.set.failed",
      actor: actor || backendHost,
      body: { reason: "server runner target not found", serverRunner: serverRunnerId }
    });
    return { ok: false, status: 404, error: "server runner target not found", witness };
  }
  const runtimeProfileValidation = validateRuntimeProfile(world, {
    actor,
    backendHost,
    process: "serverRunner.runtimeProfile.set",
    runtimeProfile: validated.value.runtimeProfile,
    serverRunner: serverRunnerId
  });
  if (!runtimeProfileValidation.ok) return runtimeProfileValidation;
  const nextRuntimeProfile = runtimeProfileValidation.runtimeProfile;
  const runnerAfter = {
    ...runnerBefore,
    runtimeProfile: nextRuntimeProfile
  };
  emitServerRunnerState(world, {
    actor: actor || backendHost,
    owner: actor || backendHost,
    runner: runnerAfter
  });
  const witness = world.emit({
    process: "serverRunner.runtimeProfile.set",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", serverRunnerId)],
    body: {
      serverRunner: serverRunnerId,
      profileBefore: runnerBefore.runtimeProfile ?? null,
      profileAfter: nextRuntimeProfile
    }
  });
  return {
    ok: true,
    status: 200,
    serverRunner: runnerAfter,
    profileBefore: runnerBefore.runtimeProfile ?? null,
    profileAfter: nextRuntimeProfile,
    witness
  };
}

export function requestBootstrapRuntimePluginInstall(world, {
  actor,
  backendHost,
  body,
  pluginCatalog = null
}) {
  const validated = validateInput(world, "runtimePlugin.install", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.install.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const serverRunnerResolved = resolveRuntimePluginServerRunnerInput(world, validated.value, {
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: serverRunnerResolved.error }
    });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const serverRunner = serverRunnerResolved.target;
  const plugin = typeof validated.value.plugin === "string" ? validated.value.plugin.trim() : "";
  if (!serverRunner || !plugin) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner and plugin are required", serverRunner, plugin }
    });
    return { ok: false, status: 400, error: "serverRunner and plugin are required", witness };
  }
  if (!world.project(moduleProjectors.serverRunners).some(row => row.id === serverRunner)) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: "server runner target not found", serverRunner, plugin }
    });
    return { ok: false, status: 404, error: "server runner target not found", witness };
  }
  if (runtimePluginInstallExists(world, { serverRunner, plugin })) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin already installed on server runner", serverRunner, plugin }
    });
    return { ok: false, status: 409, error: "runtime plugin already installed on server runner", witness };
  }
  const packageById = runtimePluginPackageById(pluginCatalog);
  const pluginPackage = packageById.get(plugin) ?? null;
  const packageValidation = validateRuntimePluginPackageForInstall(pluginPackage, {
    serverRunner,
    plugin,
    actor,
    backendHost,
    world
  });
  if (!packageValidation.ok) return packageValidation;
  const dependencyClosure = resolvePluginDependencyClosure({ pluginId: plugin, packageById, includeRoot: false });
  if (!dependencyClosure.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.install.failed",
      actor: actor || backendHost,
      body: {
        reason: "runtime plugin dependencies invalid",
        serverRunner,
        plugin,
        dependencyErrors: dependencyClosure.errors
      }
    });
    return { ok: false, status: 400, error: "runtime plugin dependencies invalid", witness };
  }
  const pluginIdsToInstall = [...dependencyClosure.pluginIds, plugin];
  for (const dependencyPlugin of dependencyClosure.pluginIds) {
    if (runtimePluginInstallExists(world, { serverRunner, plugin: dependencyPlugin })) continue;
    const dependencyValidation = validateRuntimePluginPackageForInstall(packageById.get(dependencyPlugin) ?? null, {
      serverRunner,
      plugin: dependencyPlugin,
      actor,
      backendHost,
      world
    });
    if (!dependencyValidation.ok) {
      const witness = fail(world, {
        process: "runtimePlugin.install.failed",
        actor: actor || backendHost,
        body: {
          reason: "runtime plugin dependency is not installable",
          serverRunner,
          plugin,
          dependency: dependencyPlugin,
          dependencyError: dependencyValidation.error
        }
      });
      return { ok: false, status: dependencyValidation.status ?? 400, error: "runtime plugin dependency is not installable", witness };
    }
  }

  const installedRows = [];
  for (const pluginToInstall of pluginIdsToInstall) {
    if (runtimePluginInstallExists(world, { serverRunner, plugin: pluginToInstall })) continue;
    const installed = installRuntimePlugin(world, {
      actor: actor || backendHost,
      serverRunner,
      plugin: pluginToInstall
    });
    if (installed.body?.ok === false) {
      return { ok: false, status: 400, error: installed.body?.reason ?? "runtime plugin install failed", witness: installed };
    }
    const row = world.project(moduleProjectors.runtimePluginInstalls)
      .find(entry => entry.serverRunner === serverRunner && entry.plugin === pluginToInstall) ?? { serverRunner, plugin: pluginToInstall };
    installedRows.push(row);
  }
  const row = world.project(moduleProjectors.runtimePluginInstalls)
    .find(entry => entry.serverRunner === serverRunner && entry.plugin === plugin) ?? { serverRunner, plugin };
  const witness = world.emit({
    process: "runtimePlugin.install",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", serverRunner)],
    body: {
      runtimePluginInstall: row,
      runtimePluginInstalls: installedRows,
      requestedPlugin: plugin,
      dependencyPluginIds: dependencyClosure.pluginIds
    }
  });
  return {
    ok: true,
    status: 201,
    runtimePluginInstall: row,
    runtimePluginInstalls: installedRows,
    witness
  };
}

export function requestBootstrapRuntimePluginRemove(world, {
  actor,
  backendHost,
  body,
  pluginCatalog = null
}) {
  const validated = validateInput(world, "runtimePlugin.remove", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.remove.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const serverRunnerResolved = resolveRuntimePluginServerRunnerInput(world, validated.value, {
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.remove.failed",
      actor: actor || backendHost,
      body: { reason: serverRunnerResolved.error }
    });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const serverRunner = serverRunnerResolved.target;
  const plugin = typeof validated.value.plugin === "string" ? validated.value.plugin.trim() : "";
  const removeMode = typeof (validated.value.removeMode ?? body?.removeMode) === "string"
    ? (validated.value.removeMode ?? body.removeMode).trim()
    : "pluginOnly";
  if (!serverRunner || !plugin) {
    const witness = fail(world, {
      process: "runtimePlugin.remove.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner and plugin are required", serverRunner, plugin }
    });
    return { ok: false, status: 400, error: "serverRunner and plugin are required", witness };
  }
  const existing = world.project(moduleProjectors.runtimePluginInstalls)
    .find(row => row.serverRunner === serverRunner && row.plugin === plugin);
  if (!existing) {
    const witness = fail(world, {
      process: "runtimePlugin.remove.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin install not found", serverRunner, plugin }
    });
    return { ok: false, status: 404, error: "runtime plugin install not found", witness };
  }
  const packageById = runtimePluginPackageById(pluginCatalog);
  const installedRows = installedRuntimePluginRows(world, serverRunner);
  const installedPluginIds = new Set(installedRows.map(row => row.plugin));
  const removePlan = runtimePluginRemovePlan({
    plugin,
    installedPluginIds,
    packageById,
    removeMode
  });
  if (!removePlan.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.remove.failed",
      actor: actor || backendHost,
      body: {
        reason: removePlan.error,
        serverRunner,
        plugin,
        removeMode: removePlan.removeMode,
        dependents: removePlan.dependents ?? []
      }
    });
    return { ok: false, status: removePlan.status ?? 400, error: removePlan.error, witness };
  }
  const removedRows = [];
  for (const pluginToRemove of removePlan.pluginIds) {
    const row = world.project(moduleProjectors.runtimePluginInstalls)
      .find(entry => entry.serverRunner === serverRunner && entry.plugin === pluginToRemove);
    if (!row) continue;
    const removed = removeRuntimePlugin(world, {
      actor: actor || backendHost,
      serverRunner,
      plugin: pluginToRemove
    });
    if (removed.body?.ok === false) {
      return { ok: false, status: 400, error: removed.body?.reason ?? "runtime plugin remove failed", witness: removed };
    }
    removedRows.push(row);
  }
  const witness = world.emit({
    process: "runtimePlugin.remove",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", serverRunner)],
    body: {
      serverRunner,
      plugin,
      removeMode: removePlan.removeMode,
      runtimePluginInstall: existing,
      runtimePluginInstalls: removedRows
    }
  });
  return { ok: true, status: 200, runtimePluginInstall: existing, runtimePluginInstalls: removedRows, witness };
}

export function requestBootstrapRuntimePluginReconcile(world, {
  actor,
  backendHost,
  body,
  pluginCatalog = null
}) {
  const validated = validateInput(world, "runtimePlugin.reconcile", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const serverRunnerResolved = resolveRuntimePluginServerRunnerInput(world, validated.value, {
    label: "server runner"
  });
  if (!serverRunnerResolved.ok) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: serverRunnerResolved.error }
    });
    return { ok: false, status: 400, error: serverRunnerResolved.error, witness };
  }
  const serverRunner = serverRunnerResolved.target;
  const plugin = typeof validated.value.plugin === "string" ? validated.value.plugin.trim() : "";
  const actionId = typeof validated.value.actionId === "string" ? validated.value.actionId.trim() : "";
  if (!serverRunner || !plugin || !actionId) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: "serverRunner, plugin, and actionId are required", serverRunner, plugin, actionId }
    });
    return { ok: false, status: 400, error: "serverRunner, plugin, and actionId are required", witness };
  }
  if (!world.project(moduleProjectors.serverRunners).some(row => row.id === serverRunner)) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: "server runner target not found", serverRunner, plugin, actionId }
    });
    return { ok: false, status: 404, error: "server runner target not found", witness };
  }

  const reviewBefore = currentRuntimePluginReview(world, {
    serverRunner,
    plugin,
    pluginCatalog
  });
  const row = reviewBefore.packages.find(entry => entry.plugin === plugin) ?? null;
  if (!row) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin review row not found", serverRunner, plugin, actionId }
    });
    return { ok: false, status: 404, error: "runtime plugin review row not found", witness, currentReview: reviewBefore };
  }
  const action = row.reconcileActions?.find(entry => entry.id === actionId) ?? null;
  if (!action) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: "runtime plugin reconcile action no longer applies", serverRunner, plugin, actionId }
    });
    return {
      ok: false,
      status: 409,
      error: "runtime plugin reconcile action no longer applies",
      witness,
      currentReview: reviewBefore
    };
  }
  if (action.available !== true) {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: {
        reason: "runtime plugin reconcile action is blocked",
        serverRunner,
        plugin,
        actionId,
        blockedReasons: [...(action.blockedReasons ?? [])]
      }
    });
    return {
      ok: false,
      status: 409,
      error: "runtime plugin reconcile action is blocked",
      witness,
      currentReview: reviewBefore
    };
  }

  let result = null;
  if (action.kind === "install") {
    result = requestBootstrapRuntimePluginInstall(world, {
      actor,
      backendHost,
      body: {
        serverRunner,
        serverRunnerRef: null,
        plugin: action.targetPluginId || plugin
      },
      pluginCatalog
    });
  } else if (action.kind === "remove") {
    result = requestBootstrapRuntimePluginRemove(world, {
      actor,
      backendHost,
      body: {
        serverRunner,
        serverRunnerRef: null,
        plugin: action.targetPluginId || plugin
      },
      pluginCatalog
    });
  } else {
    const witness = fail(world, {
      process: "runtimePlugin.reconcile.failed",
      actor: actor || backendHost,
      body: { reason: "unsupported runtime plugin reconcile action", serverRunner, plugin, actionId, kind: action.kind }
    });
    return { ok: false, status: 400, error: "unsupported runtime plugin reconcile action", witness, currentReview: reviewBefore };
  }
  if (!result?.ok) {
    return {
      ...result,
      currentReview: reviewBefore
    };
  }

  const reviewAfter = currentRuntimePluginReview(world, {
    serverRunner,
    plugin,
    pluginCatalog
  });
  const witness = world.emit({
    process: RUNTIME_PLUGIN_RECONCILE_TARGET_PROCESS,
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", serverRunner)],
    body: {
      serverRunner,
      plugin,
      actionId,
      reconcileAction: {
        id: action.id,
        kind: action.kind,
        label: action.label,
        severity: action.severity,
        description: action.description,
        targetPluginId: action.targetPluginId || plugin
      },
      loweredProcess: action.kind === "install" ? "runtimePlugin.install" : "runtimePlugin.remove",
      compositionBefore: reviewBefore.currentComposition,
      compositionAfter: reviewAfter.currentComposition,
      witnessIds: [result.witness?.id].filter(Boolean)
    }
  });
  return {
    ok: true,
    status: 200,
    action,
    reviewBefore,
    reviewAfter,
    compositionBefore: reviewBefore.currentComposition,
    compositionAfter: reviewAfter.currentComposition,
    runtimePluginInstall: result.runtimePluginInstall ?? null,
    runtimePluginInstalls: result.runtimePluginInstalls ?? [],
    witness
  };
}
