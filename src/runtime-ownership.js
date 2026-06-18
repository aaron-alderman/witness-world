export const RUNTIME_OWNER_CLASSES = Object.freeze([
  "generic-host",
  "backend-program",
  "runtime-plugin",
  "handler-set",
  "shell"
]);

const OWNER_CLASS_SET = new Set(RUNTIME_OWNER_CLASSES);

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ownerChainEntry(entry = {}) {
  return Object.fromEntries(
    Object.entries(entry)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value])
  );
}

export function normalizeRuntimeOwnerClass(value) {
  const normalized = trimString(value);
  return normalized && OWNER_CLASS_SET.has(normalized) ? normalized : null;
}

export function cloneRuntimeOwnerChain(chain = []) {
  return Array.isArray(chain)
    ? chain.map(entry => ({ ...(entry || {}) }))
    : undefined;
}

export function extractRuntimeOwnershipFields(source = {}) {
  return {
    ownerClass: normalizeRuntimeOwnerClass(source?.ownerClass) ?? undefined,
    ownerBundleId: trimString(source?.ownerBundleId) ?? undefined,
    ownerPluginId: trimString(source?.ownerPluginId) ?? undefined,
    ownerHandlerId: trimString(source?.ownerHandlerId) ?? undefined,
    ownerHandlerSetId: trimString(source?.ownerHandlerSetId) ?? undefined,
    ownerBackendProgramSoul: trimString(source?.ownerBackendProgramSoul) ?? undefined,
    ownerNote: trimString(source?.ownerNote) ?? undefined,
    ownerChain: cloneRuntimeOwnerChain(source?.ownerChain)
  };
}

export function summarizeRuntimeBundleOwner(bundle = {}) {
  const ownerBundleId = trimString(bundle?.id);
  const ownerPluginId = trimString(bundle?.pluginId);
  if (bundle?.kind === "plugin") {
    return {
      ownerClass: "runtime-plugin",
      ownerBundleId,
      ownerPluginId: ownerPluginId ?? ownerBundleId,
      ownerNote: ownerPluginId
        ? `Runtime behavior is owned by plugin ${ownerPluginId}.`
        : "Runtime behavior is owned by an active plugin bundle."
    };
  }
  return {
    ownerClass: "generic-host",
    ownerBundleId,
    ownerPluginId: null,
    ownerNote: "Runtime behavior is owned by shared host/runtime code."
  };
}

export function describeHandlerOwnership({
  handlerId,
  handlerMetadata = {},
  bundle = {}
} = {}) {
  const ownerHandlerId = trimString(handlerId);
  const routeKind = trimString(handlerMetadata?.routeKind);
  const bundleOwner = summarizeRuntimeBundleOwner(bundle);
  const explicitOwnerClass = normalizeRuntimeOwnerClass(handlerMetadata?.ownerClass);
  const ownerClass = explicitOwnerClass
    ?? (routeKind === "backendProgram" || ownerHandlerId === "backendProgram.run"
      ? "backend-program"
      : bundleOwner.ownerClass);

  if (ownerClass === "backend-program") {
    const ownerNote = trimString(handlerMetadata?.ownerNote)
      ?? "Route behavior is owned by an authored backend program and dispatched through a shared runtime handler.";
    return {
      ownerClass,
      ownerBundleId: bundleOwner.ownerBundleId,
      ownerPluginId: bundleOwner.ownerPluginId,
      ownerHandlerId,
      ownerNote,
      ownerChain: [
        ownerChainEntry({
          class: "backend-program",
          handlerId: ownerHandlerId,
          note: "Authored backend program selected by route params at request time."
        }),
        ownerChainEntry({
          class: bundleOwner.ownerClass,
          bundleId: bundleOwner.ownerBundleId,
          pluginId: bundleOwner.ownerPluginId,
          handlerId: ownerHandlerId,
          note: bundleOwner.ownerNote
        })
      ]
    };
  }

  const ownerNote = trimString(handlerMetadata?.ownerNote) ?? bundleOwner.ownerNote;
  return {
    ownerClass,
    ownerBundleId: bundleOwner.ownerBundleId,
    ownerPluginId: bundleOwner.ownerPluginId,
    ownerHandlerId,
    ownerNote,
    ownerChain: [
      ownerChainEntry({
        class: ownerClass,
        bundleId: bundleOwner.ownerBundleId,
        pluginId: bundleOwner.ownerPluginId,
        handlerId: ownerHandlerId,
        note: ownerNote
      })
    ]
  };
}

export function describeRuntimeRouteOwnership({
  route = {},
  handlerMetadata = {},
  bundle = {}
} = {}) {
  return describeHandlerOwnership({
    handlerId: route?.handler,
    handlerMetadata,
    bundle
  });
}

export function describeSurfaceOwnership({
  surface = {},
  bundle = {}
} = {}) {
  const bundleOwner = summarizeRuntimeBundleOwner(bundle);
  const explicitOwnerClass = normalizeRuntimeOwnerClass(surface?.ownerClass);
  const ownerClass = explicitOwnerClass ?? bundleOwner.ownerClass;
  const ownerNote = trimString(surface?.ownerNote)
    ?? (ownerClass === "runtime-plugin"
      ? "Surface is contributed by an active plugin bundle."
      : "Surface is contributed by shared host/runtime code.");
  return {
    ownerClass,
    ownerBundleId: bundleOwner.ownerBundleId,
    ownerPluginId: bundleOwner.ownerPluginId,
    ownerNote,
    ownerChain: [
      ownerChainEntry({
        class: ownerClass,
        bundleId: bundleOwner.ownerBundleId,
        pluginId: bundleOwner.ownerPluginId,
        note: ownerNote
      })
    ]
  };
}

export function describeHandlerSetOwnership({
  handlerSetId,
  provider = null,
  handlers = []
} = {}) {
  const ownerHandlerSetId = trimString(handlerSetId);
  const bundleOwner = summarizeRuntimeBundleOwner({
    id: provider?.bundleId ?? null,
    kind: provider?.bundleKind ?? "internal",
    pluginId: provider?.pluginId ?? null
  });
  const ownerNote = ownerHandlerSetId
    ? `Behavior is dispatched through handler set ${ownerHandlerSetId}.`
    : "Behavior is dispatched through a handler set.";
  return {
    ownerClass: "handler-set",
    ownerBundleId: bundleOwner.ownerBundleId,
    ownerPluginId: bundleOwner.ownerPluginId,
    ownerHandlerSetId,
    ownerNote,
    ownerChain: [
      ownerChainEntry({
        class: "handler-set",
        handlerSetId: ownerHandlerSetId,
        bundleId: bundleOwner.ownerBundleId,
        pluginId: bundleOwner.ownerPluginId,
        note: ownerNote
      })
    ],
    handlers: Array.isArray(handlers) ? handlers.map(String) : []
  };
}

export function describeShellOwnership(shellId) {
  const normalizedShellId = trimString(shellId);
  const ownerNote = normalizedShellId
    ? `Behavior is owned by the ${normalizedShellId} shell adapter.`
    : "Behavior is owned by a shell adapter.";
  return {
    ownerClass: "shell",
    ownerNote,
    ownerChain: [
      ownerChainEntry({
        class: "shell",
        shellId: normalizedShellId,
        note: ownerNote
      })
    ]
  };
}

export function findHandlerSetIdsForHandler(handlerSetDefinitions = {}, handlerId) {
  const normalizedHandlerId = trimString(handlerId);
  if (!normalizedHandlerId) return [];
  return Object.entries(handlerSetDefinitions ?? {})
    .filter(([, definition]) => Array.isArray(definition?.handlers) && definition.handlers.includes(normalizedHandlerId))
    .map(([id]) => String(id))
    .sort();
}

export function describeMountedRouteOwnership({
  route = {},
  handlerMetadataById = {},
  handlerSetDefinitions = {},
  handlerSetProviders = {}
} = {}) {
  const handlerId = trimString(route?.handler);
  const handlerMetadata = handlerId ? (handlerMetadataById?.[handlerId] ?? {}) : {};
  const routeOwnership = extractRuntimeOwnershipFields(
    describeHandlerOwnership({
      handlerId,
      handlerMetadata,
      bundle: {
        id: handlerMetadata?.ownerBundleId ?? null,
        kind: handlerMetadata?.ownerClass === "runtime-plugin" ? "plugin" : "internal",
        pluginId: handlerMetadata?.ownerPluginId ?? null
      }
    })
  );
  const backendProgramSoul = trimString(route?.params?.backendProgramSoul);
  if (routeOwnership.ownerClass === "backend-program") {
    return {
      ...routeOwnership,
      ownerBackendProgramSoul: backendProgramSoul ?? routeOwnership.ownerBackendProgramSoul,
      ownerNote: backendProgramSoul
        ? `Mounted route dispatches to authored backend program ${backendProgramSoul}.`
        : routeOwnership.ownerNote
    };
  }
  const handlerSetIds = findHandlerSetIdsForHandler(handlerSetDefinitions, handlerId);
  if (handlerSetIds.length) {
    const primaryHandlerSetId = handlerSetIds[0];
    const handlerSetOwnership = describeHandlerSetOwnership({
      handlerSetId: primaryHandlerSetId,
      provider: handlerSetProviders?.[primaryHandlerSetId] ?? null,
      handlers: handlerSetDefinitions?.[primaryHandlerSetId]?.handlers ?? []
    });
    return {
      ...extractRuntimeOwnershipFields(handlerSetOwnership),
      ownerNote: `Mounted route dispatches through handler set ${primaryHandlerSetId}.`,
      ownerChain: cloneRuntimeOwnerChain(handlerSetOwnership.ownerChain),
      ownerHandlerId: handlerId ?? undefined,
      ownerHandlerSetIds: handlerSetIds
    };
  }
  return routeOwnership;
}
