import { registerModuleProjectors } from "../src/modules.js";

export function withRegisteredPluginProjectors(providerSets, callback) {
  const providers = Array.isArray(providerSets)
    ? providerSets.flat()
    : [providerSets].flat();
  const projectors = {};
  for (const provider of providers) {
    if (provider?.kind !== "moduleProjectors") continue;
    Object.assign(projectors, provider.projectors ?? {});
  }
  const unregister = registerModuleProjectors("plugin.test", projectors);
  try {
    return callback();
  } finally {
    unregister();
  }
}
