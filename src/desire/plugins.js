import {
  createCoreRuntimeDeclarationRegistry
} from "./apply.js";
import {
  createDesirePlusElaboratorRegistry
} from "./elaborate.js";
import {
  createRvmFormRegistry
} from "./rvm-forms.js";

export function createDesireRegistriesFromPluginExtensions(loadResult = {}) {
  const elaboratorRegistry = createDesirePlusElaboratorRegistry();
  const runtimeDeclarationRegistry = createCoreRuntimeDeclarationRegistry();
  const rvmFormRegistry = createRvmFormRegistry();
  const seenElaborators = new Set();
  const extensions = loadResult.desireExtensions ?? loadResult ?? {};

  for (const entry of extensions.elaborators ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("plugin DESIRE+ elaborator entry must be an object");
    }
    if (seenElaborators.has(entry.id)) {
      throw new Error(`duplicate plugin DESIRE+ elaborator: ${entry.id}`);
    }
    seenElaborators.add(entry.id);
    elaboratorRegistry.register({
      id: entry.id,
      sourceLanguage: entry.sourceLanguage,
      sourceKind: entry.sourceKind,
      semanticKind: entry.semanticKind,
      nodeKind: entry.nodeKind,
      name: entry.name,
      elaborate: entry.elaborate
    });
  }

  for (const entry of extensions.runtimeDeclarations ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("plugin runtime declaration entry must be an object");
    }
    if (runtimeDeclarationRegistry.has(entry.kind)) {
      throw new Error(`duplicate plugin runtime declaration kind: ${entry.kind}`);
    }
    runtimeDeclarationRegistry.register(entry.kind, {
      apply: entry.apply,
      nativeCoverage: "plugin",
      extension: entry.pluginId ?? entry.metadata?.pluginId ?? null
    });
  }

  for (const entry of extensions.rvmForms ?? []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("plugin RVM form entry must be an object");
    }
    if (rvmFormRegistry.knows(entry.kind)) {
      throw new Error(`duplicate plugin RVM form kind: ${entry.kind}`);
    }
    rvmFormRegistry.register(entry);
  }

  return {
    elaboratorRegistry,
    runtimeDeclarationRegistry,
    rvmFormRegistry
  };
}
