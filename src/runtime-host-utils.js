import path from "node:path";
import { thing, relation, projectors } from "./kernel.js";
import { witnessRelations, moduleProjectors, ensureCapabilityDefinition, installCapability } from "./modules.js";
import { ensureRuntimeBuiltins } from "./runtime-builtins.js";
import {
  DEFAULT_RUNTIME_PROFILE,
  defaultHostCapabilitiesForProfile,
  providedCapabilityIdsForProfile,
  runtimeCapabilityDefinitionsForProfile,
  runtimeBuiltinSeedContributionsForProfile
} from "./runtime-bundles.js";

export function declareBackendHost(world, { actor, id, owner = actor, runtimeProfile = DEFAULT_RUNTIME_PROFILE }) {
  return declareHost(world, {
    actor,
    id,
    owner,
    runtimeProfile,
    hostKind: "backend",
    process: "declareBackendHost"
  });
}

export function declareFrontendHost(world, { actor, id, owner = actor, runtimeProfile = DEFAULT_RUNTIME_PROFILE }) {
  return declareHost(world, {
    actor,
    id,
    owner,
    runtimeProfile,
    hostKind: "frontend",
    process: "declareFrontendHost"
  });
}

function declareHost(world, {
  actor,
  id,
  owner,
  runtimeProfile,
  hostKind,
  process
}) {
  const capabilities = defaultHostCapabilitiesForProfile(runtimeProfile, hostKind);
  ensureRuntimeBuiltins(world, {
    actor,
    capabilityIds: providedCapabilityIdsForProfile(runtimeProfile),
    capabilityDefinitions: runtimeCapabilityDefinitionsForProfile(runtimeProfile),
    seedContributions: runtimeBuiltinSeedContributionsForProfile(runtimeProfile)
  });
  for (const capability of capabilities) {
    ensureCapabilityDefinition(world, {
      actor,
      id: capability,
      label: capability,
      provenance: { source: `host.declare.${hostKind}` }
    });
  }
  const define = world.emit({
    process,
    actor,
    claims: [
      thing(id),
      relation(owner, "owns", id)
    ],
    body: { id }
  });
  const installs = capabilities.map(capability => installCapability(world, {
    actor,
    capability,
    target: id,
    targetKind: "host"
  }));
  return [define, ...installs];
}

export function hostCapabilities(world, hostId) {
  const installs = world.project(moduleProjectors.capabilityInstalls);
  const capabilities = installs
    .filter(row => row.target === hostId)
    .map(row => row.capability);
  const legacy = world.project(projectors.currentRelations)
    .filter(r => r.from === hostId && (r.rel === "hostCapability" || r.rel === "contextCapability"))
    .map(r => r.to);
  return new Set([...capabilities, ...legacy]);
}

export function resolveServerRunner(world, serverRunnerId = null) {
  const runners = world.project(moduleProjectors.serverRunners);
  if (serverRunnerId) {
    const runner = runners.find(candidate => candidate.id === serverRunnerId);
    if (!runner) return { ok: false, reason: "server runner not found", body: { serverRunnerId } };
    return { ok: true, runner };
  }
  if (runners.length === 1) return { ok: true, runner: runners[0] };
  if (runners.length === 0) return { ok: false, reason: "no server runners defined", body: {} };
  return { ok: false, reason: "multiple server runners defined", body: { serverRunners: runners.map(runner => runner.id) } };
}

// Normalize a raw Host header for runner matching: take the host portion, lowercase, strip port.
export function normalizeHostHeader(hostHeader) {
  if (typeof hostHeader !== "string") return "";
  const first = hostHeader.split(",")[0].trim().toLowerCase();
  if (!first) return "";
  // IPv6 literals arrive bracketed (e.g. [::1]:3000); keep the bracketed host, drop the port.
  if (first.startsWith("[")) {
    const close = first.indexOf("]");
    return close === -1 ? first : first.slice(0, close + 1);
  }
  return first.replace(/:\d+$/, "");
}

// Pick the runner that should answer a request, by Host header. Falls back to the runner flagged
// `default: true`, then to single-runner behavior so existing single-app launches are unchanged.
export function resolveRunnerForHost(world, hostHeader = null) {
  const runners = world.project(moduleProjectors.serverRunners);
  if (!runners.length) return { ok: false, reason: "no server runners defined", body: {} };
  const host = normalizeHostHeader(hostHeader);
  if (host) {
    const hostMatch = runners.find(runner => Array.isArray(runner.hosts) && runner.hosts.includes(host));
    if (hostMatch) return { ok: true, runner: hostMatch, matchedBy: "host", host };
  }
  const defaultRunner = runners.find(runner => runner.default === true);
  if (defaultRunner) return { ok: true, runner: defaultRunner, matchedBy: "default", host };
  if (runners.length === 1) return { ok: true, runner: runners[0], matchedBy: "single", host };
  return { ok: false, reason: "no server runner matches host and no default is set", body: { host, serverRunners: runners.map(runner => runner.id) } };
}

export function resolveStartupRunner(world, serverRunnerId = null) {
  const resolved = resolveServerRunner(world, serverRunnerId);
  if (resolved.ok) return resolved;
  // Multi-host: when several runners are defined and none is explicitly requested, the primary
  // (host-dispatch fallback) runner is the one flagged `default: true`. Per-request Host dispatch
  // then routes other hosts to their own runners.
  if (!serverRunnerId && resolved.reason === "multiple server runners defined") {
    const runners = world.project(moduleProjectors.serverRunners);
    const defaultRunner = runners.find(runner => runner.default === true);
    if (defaultRunner) return { ok: true, runner: defaultRunner };
    return resolved;
  }
  if (serverRunnerId || resolved.reason !== "no server runners defined") return resolved;
  const backendHost = uniqueHostByCapability(world, "http.serve");
  const frontendHost = uniqueHostByCapability(world, "dom.render");
  if (!backendHost || !frontendHost) {
    return { ok: false, reason: "no server runners defined", body: {} };
  }
  return {
    ok: true,
    runner: {
      id: "__bootstrap__",
      backendHost,
      frontendHost,
      handlerSet: null,
      actors: null,
      storage: null,
      allowActorHeader: false,
      bootstrapOnly: true
    }
  };
}

function uniqueHostByCapability(world, capability) {
  const hosts = hostIdsByCapability(world, capability);
  if (hosts.length !== 1) {
    const legacyHosts = [...new Set(
      witnessRelations(world.allWitnesses())
        .filter(r => r.rel === "hostCapability" && r.to === capability)
        .map(r => r.from)
    )];
    if (legacyHosts.length !== 1) return null;
    return legacyHosts[0];
  }
  if (hosts.length !== 1) return null;
  return hosts[0];
}

export function hostIdsByCapability(world, capability) {
  return [
    ...new Set(
      world.project(moduleProjectors.capabilityInstalls)
        .filter(row => row.targetKind === "host" && row.capability === capability)
        .map(row => row.target)
    )
  ];
}

export function resolveStorageConfig(storage, runtimeRoot) {
  const resolved = {};
  if (!storage || typeof storage !== "object") return resolved;
  for (const [key, value] of Object.entries(storage)) {
    if (typeof value !== "string" || !value.trim()) continue;
    resolved[key] = path.resolve(runtimeRoot, value);
  }
  return resolved;
}
