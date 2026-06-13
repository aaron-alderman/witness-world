import {
  requestBootstrapFrontendProgramDefine,
  requestBootstrapFrontendStepDefine,
  requestBootstrapBackendProgramDefine,
  requestBootstrapBackendProgramVersionDefine,
  requestBootstrapBackendStepDefine,
  requestBootstrapBackendProgramVersionActivate,
  requestBootstrapBackendProgramVersionRollback
} from "./program-processes.js";

export function executeProgramAuthoringProposalTarget({
  world,
  actor,
  backendHost,
  proposal,
  body,
  supportedFrontendOps,
  supportedBackendOps,
  ensureContextAuthority,
  ensureTargetAuthority
}) {
  switch (proposal.targetProcess) {
    case "frontendProgram.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapFrontendProgramDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "frontendStep.define": {
      const gate = ensureTargetAuthority(actor, body.program);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapFrontendStepDefine(world, { actor, backendHost, body, allowedOps: supportedFrontendOps });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "backendProgram.define": {
      const gate = ensureContextAuthority(actor, body.context ?? null);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapBackendProgramDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "backendProgramVersion.define": {
      const gate = ensureTargetAuthority(actor, body.soul);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapBackendProgramVersionDefine(world, { actor, backendHost, body });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "backendStep.define": {
      const gate = ensureTargetAuthority(actor, body.version);
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapBackendStepDefine(world, { actor, backendHost, body, allowedOps: supportedBackendOps });
      return result.ok ? { ok: true, witnessIds: [result.witness.id] } : result;
    }
    case "backendProgramVersion.activate": {
      const gate = ensureTargetAuthority(actor, body.soul || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapBackendProgramVersionActivate(world, { actor, backendHost, body });
      return result.ok
        ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
        : result;
    }
    case "backendProgramVersion.rollback": {
      const gate = ensureTargetAuthority(actor, body.soul || "");
      if (!gate.ok) return { ok: false, status: gate.status, error: gate.reason };
      const result = requestBootstrapBackendProgramVersionRollback(world, { actor, backendHost, body });
      return result.ok
        ? { ok: true, witnessIds: (result.witnesses || [result.witness]).map(entry => entry?.id).filter(Boolean) }
        : result;
    }
    default:
      return null;
  }
}
