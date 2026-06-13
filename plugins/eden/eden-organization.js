import { projectors } from "../canvas/projectors-core.js";

const DEFAULT_SURFACE_ID = "eden.surface.commons";
const CONTEXT_PREFIX = "ctx.eden.guild.";
const PROPOSAL_PREFIX = "proposal.eden.organization.";
const WIDGET_PREFIX = "eden_guild_notice_";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function slugActor(actor) {
  return String(actor || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "user";
}

function actorLabel(actor) {
  const normalized = String(actor || "").trim();
  if (!normalized) return "User";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function numericProposalOrder(id) {
  const match = /(?:^|\.)(\d+)$/.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

function currentRelations(witnesses) {
  return projectors.currentRelations(witnesses);
}

function latestBodiesByProcess(witnesses, process) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process !== process || !witness.body?.id) continue;
    rows.set(String(witness.body.id), witness.body);
  }
  return rows;
}

function modulesMap(witnesses) {
  const rows = new Map();
  for (const row of currentRelations(witnesses)) {
    if (row.rel === "hasModuleKind") rows.set(row.from, row.to);
  }
  return rows;
}

function contextsProjection(witnesses) {
  const rows = new Map();
  const rels = currentRelations(witnesses);
  const owners = projectors.owners(witnesses);
  const stewards = projectors.stewards(witnesses);
  const bodies = latestBodiesByProcess(witnesses, "defineContext");
  for (const row of rels) {
    if (row.rel !== "hasModuleKind" || row.to !== "context") continue;
    rows.set(row.from, {
      id: row.from,
      label: row.from,
      actor: null,
      parent: null,
      owner: owners.get(row.from) ?? null,
      stewards: [...(stewards.get(row.from) ?? [])].sort()
    });
  }
  for (const row of rels) {
    const context = rows.get(row.from);
    if (!context) continue;
    if (row.rel === "contextActor") context.actor = row.to;
    if (row.rel === "parentContext") context.parent = row.to;
  }
  return [...rows.values()]
    .map(row => {
      const body = bodies.get(row.id) ?? {};
      return {
        ...row,
        label: typeof body.label === "string" && body.label.trim() ? body.label.trim() : row.label
      };
    })
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function stewardshipsProjection(witnesses) {
  const rows = [];
  const kinds = modulesMap(witnesses);
  for (const row of currentRelations(witnesses)) {
    if (row.rel !== "stewards") continue;
    rows.push({
      steward: row.from,
      target: row.to,
      targetKind: row.meta?.targetKind ? String(row.meta.targetKind) : (kinds.get(row.to) ?? null),
      witness: row.witness
    });
  }
  return rows.sort((a, b) =>
    String(a.steward).localeCompare(String(b.steward))
    || String(a.target).localeCompare(String(b.target))
  );
}

function proposalsProjection(witnesses) {
  const rows = new Map();
  for (const witness of witnesses) {
    if (witness.process === "createProposal" && witness.body?.id) {
      rows.set(String(witness.body.id), {
        id: String(witness.body.id),
        proposer: witness.body.proposer ?? witness.actor,
        targetProcess: witness.body.targetProcess ?? null,
        targetKind: witness.body.targetKind ?? null,
        targetId: witness.body.targetId ?? null,
        body: witness.body.body && typeof witness.body.body === "object" ? { ...witness.body.body } : {},
        reason: witness.body.reason ?? null,
        status: witness.body.status ?? "open",
        executedWitnessIds: [],
        reviewer: null
      });
    }
    if (witness.process === "approveProposal" && witness.body?.id && rows.has(String(witness.body.id))) {
      const row = rows.get(String(witness.body.id));
      row.status = "approved";
      row.reviewer = witness.body.approver ?? witness.actor;
      row.executedWitnessIds = [...new Set((witness.body.executedWitnessIds ?? []).map(String).filter(Boolean))];
    }
    if (witness.process === "rejectProposal" && witness.body?.id && rows.has(String(witness.body.id))) {
      const row = rows.get(String(witness.body.id));
      row.status = "rejected";
      row.reviewer = witness.body.reviewer ?? witness.actor;
      row.reviewReason = witness.body.reason ?? null;
    }
  }
  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sortProposals(rows) {
  return rows.sort((a, b) =>
    numericProposalOrder(a.id) - numericProposalOrder(b.id)
    || String(a.id).localeCompare(String(b.id))
  );
}

export function edenOrganizationContextId(actor) {
  return CONTEXT_PREFIX + slugActor(actor);
}

export function edenOrganizationNoticeWidgetId(actor) {
  return WIDGET_PREFIX + slugActor(actor);
}

export function edenOrganizationContextLabel(actor) {
  return `${actorLabel(actor)} Guild`;
}

export function isEdenOrganizationContextId(id) {
  return typeof id === "string" && id.startsWith(CONTEXT_PREFIX);
}

export function isEdenOrganizationProposalId(id) {
  return typeof id === "string" && id.startsWith(PROPOSAL_PREFIX);
}

export function nextEdenOrganizationProposalId(witnesses, actor) {
  const prefix = `${PROPOSAL_PREFIX}${slugActor(actor)}.`;
  const seen = new Set(
    proposalsProjection(witnesses)
      .map(row => stringOrNull(row.id))
      .filter(Boolean)
      .filter(id => id.startsWith(prefix))
  );
  let next = seen.size + 1;
  while (seen.has(prefix + String(next))) next += 1;
  return prefix + String(next);
}

export function edenOrganizationProposalBody(actor, { contextId = null, widgetId = null } = {}) {
  const resolvedContextId = stringOrNull(contextId) ?? edenOrganizationContextId(actor);
  const resolvedWidgetId = stringOrNull(widgetId) ?? edenOrganizationNoticeWidgetId(actor);
  return {
    id: resolvedWidgetId,
    kind: "Text",
    text: `${edenOrganizationContextLabel(actor)} is open for shared stewardship.`,
    attach: false,
    context: resolvedContextId
  };
}

export function projectEdenOrganizationState(witnesses, {
  actor = null,
  surfaceId = DEFAULT_SURFACE_ID,
  contextParent = "frontend",
  guestSteward = "callan",
  proposalTargetProcess = "widget.define",
  proposalTargetKind = "widget",
  proposalTargetId = null,
  proposalBody = null
} = {}) {
  const normalizedActor = stringOrNull(actor);
  const normalizedSurfaceId = stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID;
  const normalizedParent = stringOrNull(contextParent);
  const normalizedGuestSteward = stringOrNull(guestSteward) ?? "callan";
  const contextId = normalizedActor ? edenOrganizationContextId(normalizedActor) : null;
  const widgetId = normalizedActor ? edenOrganizationNoticeWidgetId(normalizedActor) : null;
  const contexts = contextsProjection(witnesses);
  const stewardships = stewardshipsProjection(witnesses);
  const proposals = proposalsProjection(witnesses);
  const modules = modulesMap(witnesses);
  const context = contextId ? (contexts.find(row => row.id === contextId) ?? null) : null;
  const contextStewardships = contextId
    ? stewardships.filter(row => row.target === contextId)
    : [];
  const guestGrant = contextStewardships.find(row => row.steward === normalizedGuestSteward) ?? null;
  const organizationProposals = normalizedActor
    ? sortProposals(proposals
      .filter(row => row.proposer === normalizedActor && isEdenOrganizationProposalId(row.id))
      .map(row => ({
        id: row.id,
        targetProcess: stringOrNull(row.targetProcess),
        targetKind: stringOrNull(row.targetKind),
        targetId: stringOrNull(row.targetId),
        reason: stringOrNull(row.reason),
        status: stringOrNull(row.status) ?? "open",
        reviewer: stringOrNull(row.reviewer),
        executedWitnessIds: Array.isArray(row.executedWitnessIds) ? row.executedWitnessIds.map(String) : []
      })))
    : [];
  const openProposal = organizationProposals.find(row => row.status === "open") ?? null;
  const approvedProposal = organizationProposals
    .slice()
    .reverse()
    .find(row => row.status === "approved") ?? null;
  const noticeWidgetExists = Boolean(widgetId && modules.get(widgetId) === "widget");
  const templateBody = proposalBody && typeof proposalBody === "object"
    ? { ...proposalBody }
    : edenOrganizationProposalBody(normalizedActor, { contextId, widgetId });

  return {
    mode: "organization",
    actor: normalizedActor,
    surfaceId: normalizedSurfaceId,
    contextParent: normalizedParent,
    contextId,
    contextLabel: normalizedActor ? edenOrganizationContextLabel(normalizedActor) : null,
    contextExists: Boolean(context),
    context,
    guestSteward: normalizedGuestSteward,
    stewardships: contextStewardships.map(row => ({
      steward: row.steward,
      target: row.target,
      targetKind: row.targetKind
    })),
    guestGrant,
    hasGuestStewardship: Boolean(guestGrant),
    proposalTemplate: {
      targetProcess: stringOrNull(proposalTargetProcess) ?? "widget.define",
      targetKind: stringOrNull(proposalTargetKind) ?? "widget",
      targetId: stringOrNull(proposalTargetId) ?? widgetId,
      body: templateBody
    },
    proposals: organizationProposals,
    openProposal,
    approvedProposal,
    approvedProposalCount: organizationProposals.filter(row => row.status === "approved").length,
    noticeWidgetId: widgetId,
    noticeWidgetExists
  };
}
