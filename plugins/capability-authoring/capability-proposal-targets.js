import {
  requestBootstrapCapabilityMigrateLegacy,
  resolveCapabilityTargetInput,
  requestBootstrapCapabilityDefine,
  requestBootstrapCapabilityInstall,
  requestBootstrapCapabilityRemove
} from "./capability-processes.js";
import { previewLegacyCapabilityMigration } from "../../src/capability-legacy-migration.js";

export function executeCapabilityAuthoringProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  ensureContextAuthority,
  ensureTargetAuthority
}) {
  switch (proposal.targetProcess) {
    case "capability.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapCapabilityDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "capability.install": {
      const resolvedTarget = resolveCapabilityTargetInput(world, body, {
        label: "capability install target"
      });
      if (!resolvedTarget.ok) return { ok: false, status: 400, error: resolvedTarget.error };
      const gate = ensureTargetAuthority(actor, resolvedTarget.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapCapabilityInstall(world, {
        actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "capability.remove": {
      const resolvedTarget = resolveCapabilityTargetInput(world, body, {
        label: "capability remove target"
      });
      if (!resolvedTarget.ok) return { ok: false, status: 400, error: resolvedTarget.error };
      const gate = ensureTargetAuthority(actor, resolvedTarget.target);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapCapabilityRemove(world, {
        actor,
        backendHost,
        body: { ...body, target: resolvedTarget.target, targetRef: null }
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "capability.migrateLegacy": {
      const preview = previewLegacyCapabilityMigration(world);
      const seenTargets = new Set();
      for (const row of preview.pending ?? []) {
        const targets = [
          ...(row.installTargets ?? []).map(entry => {
            const [targetKind, ...targetParts] = String(entry).split(":");
            return { targetKind, target: targetParts.join(":") };
          }),
          ...(row.targetKind && row.target ? [{ targetKind: row.targetKind, target: row.target }] : [])
        ];
        for (const target of targets) {
          const key = `${target.targetKind}\u0000${target.target}`;
          if (seenTargets.has(key)) continue;
          seenTargets.add(key);
          const gate = ensureTargetAuthority(actor, target.target);
          if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
        }
      }
      const result = requestBootstrapCapabilityMigrateLegacy(world, {
        actor,
        backendHost
      });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    default:
      return null;
  }
}
