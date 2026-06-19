import { projectors, relation } from "../../src/kernel.js";
import {
  createProposal,
  approveProposal,
  rejectProposal,
  moduleProjectors,
  resolveCoveredContextualRef
} from "../../src/modules.js";
import { proposalTargetGovernanceEntry } from "../../src/runtime-governance.js";
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

function resolveProposalTargetIdInput(world, body, {
  contextField = "context",
  idField = "targetId",
  refField = "targetIdRef",
  label = "proposal target"
} = {}) {
  return resolveCoveredContextualRef(world.allWitnesses(), {
    context: body?.[contextField] ?? null,
    id: body?.[idField] ?? null,
    ref: body?.[refField] ?? null,
    label
  });
}

export function requestBootstrapProposalCreate(world, {
  actor,
  backendHost,
  body,
  owner = actor || backendHost
}) {
  const validated = validateInput(world, "proposal.create", body);
  if (!validated.ok) {
    const witness = fail(world, {
      process: "proposal.create.blocked",
      actor: actor || backendHost,
      body: { gate: "type.compatibility", failures: validated.failures }
    });
    return { ok: false, status: 400, error: "typed validation failed", witness };
  }
  const input = validated.value;
  if (exists(world, input.id)) {
    const witness = fail(world, {
      process: "proposal.create.failed",
      actor: actor || backendHost,
      body: { reason: "proposal id already exists", id: input.id }
    });
    return { ok: false, status: 409, error: "proposal id already exists", witness };
  }
  if (!proposalTargetGovernanceEntry(input.targetProcess)) {
    const witness = fail(world, {
      process: "proposal.create.failed",
      actor: actor || backendHost,
      body: { reason: "proposal target process not supported", targetProcess: input.targetProcess }
    });
    return { ok: false, status: 400, error: "proposal target process not supported", witness };
  }
  const bodyParsed = normalizeJsonObject(parseJsonField(body.bodyJson, "bodyJson"), "bodyJson");
  if (!bodyParsed.ok) {
    const witness = fail(world, { process: "proposal.create.failed", actor: actor || backendHost, body: { reason: bodyParsed.error } });
    return { ok: false, status: 400, error: bodyParsed.error, witness };
  }
  const resolvedTarget = resolveProposalTargetIdInput(world, input, {
    label: "proposal target"
  });
  if (!resolvedTarget.ok) {
    const witness = fail(world, {
      process: "proposal.create.failed",
      actor: actor || backendHost,
      body: { reason: resolvedTarget.error }
    });
    return { ok: false, status: 400, error: resolvedTarget.error, witness };
  }
  createProposal(world, {
    actor: actor || backendHost,
    id: input.id,
    targetProcess: input.targetProcess,
    targetKind: input.targetKind,
    targetId: resolvedTarget.target ?? null,
    body: bodyParsed.value ?? {},
    reason: input.reason ?? null,
    owner
  });
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === input.id) ?? null;
  const witness = world.emit({
    process: "proposal.create",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", input.id)],
    body: { proposal }
  });
  return { ok: true, status: 201, proposal, witness };
}

export async function requestBootstrapProposalApprove(world, {
  actor,
  backendHost,
  proposalId,
  executeTarget,
  executionContext = {}
}) {
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? null;
  if (!proposal) {
    const witness = fail(world, {
      process: "proposal.approve.failed",
      actor: actor || backendHost,
      body: { reason: "proposal not found", id: proposalId }
    });
    return { ok: false, status: 404, error: "proposal not found", witness };
  }
  if (proposal.status !== "open") {
    const witness = fail(world, {
      process: "proposal.approve.failed",
      actor: actor || backendHost,
      body: { reason: "proposal is not open", id: proposalId, status: proposal.status }
    });
    return { ok: false, status: 409, error: "proposal is not open", witness };
  }
  const executed = await executeTarget(proposal, executionContext);
  if (!executed.ok) return executed;
  approveProposal(world, {
    actor: actor || backendHost,
    id: proposalId,
    executedWitnessIds: executed.witnessIds ?? []
  });
  const approved = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? proposal;
  const witness = world.emit({
    process: "proposal.approve",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", proposalId)],
    body: { proposal: approved }
  });
  return { ok: true, status: 200, proposal: approved, witness };
}

export function requestBootstrapProposalReject(world, {
  actor,
  backendHost,
  proposalId,
  reason = null
}) {
  const proposal = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? null;
  if (!proposal) {
    const witness = fail(world, {
      process: "proposal.reject.failed",
      actor: actor || backendHost,
      body: { reason: "proposal not found", id: proposalId }
    });
    return { ok: false, status: 404, error: "proposal not found", witness };
  }
  if (proposal.status !== "open") {
    const witness = fail(world, {
      process: "proposal.reject.failed",
      actor: actor || backendHost,
      body: { reason: "proposal is not open", id: proposalId, status: proposal.status }
    });
    return { ok: false, status: 409, error: "proposal is not open", witness };
  }
  rejectProposal(world, {
    actor: actor || backendHost,
    id: proposalId,
    reason
  });
  const rejected = world.project(moduleProjectors.proposals).find(row => row.id === proposalId) ?? proposal;
  const witness = world.emit({
    process: "proposal.reject",
    actor: actor || backendHost,
    claims: [relation(actor || backendHost, "editedProjection", proposalId)],
    body: { proposal: rejected }
  });
  return { ok: true, status: 200, proposal: rejected, witness };
}
