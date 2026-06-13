import { projectors, relation } from "../../src/kernel.js";
import {
  createServerRunner,
  installRuntimePlugin,
  removeRuntimePlugin,
  moduleProjectors,
  resolveContextualRef
} from "../../src/modules.js";
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

function resolveBodyRef(world, body, {
  contextField = "context",
  idField,
  refField,
  label
}) {
  return resolveContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

function runtimePluginInstallExists(world, { serverRunner, plugin }) {
  return world.project(moduleProjectors.runtimePluginInstalls)
    .some(row => row.serverRunner === serverRunner && row.plugin === plugin);
}

function runtimePluginPackageById(pluginCatalog = null) {
  return new Map((pluginCatalog?.packages ?? []).map(row => [row.id, row]));
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
  const serverRunner = typeof validated.value.serverRunner === "string" ? validated.value.serverRunner.trim() : "";
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
  const serverRunner = typeof validated.value.serverRunner === "string" ? validated.value.serverRunner.trim() : "";
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
