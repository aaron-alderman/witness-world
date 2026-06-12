import {
  edenOrganizationContextId,
  isEdenOrganizationContextId,
  isEdenOrganizationProposalId
} from "./eden-organization.js";

const DEFAULT_NEIGHBORHOOD_ID = "eden.neighborhood.home";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(entry => stringOrNull(entry)).filter(Boolean))]
    : [];
}

function questCompletionSignal(questId) {
  return `quest.${String(questId)}.completed`;
}

function collectPracticeState(witnesses, { actor = null } = {}) {
  const practice = {
    personalBoxCreates: 0,
    personalBoxChanges: 0,
    pageThemeChanges: 0,
    processViews: 0,
    runtimeDrills: 0,
    versionPublishes: 0,
    versionRollbacks: 0,
    capabilityInstalls: 0,
    frontendCapabilityInstalls: 0,
    organizationContexts: 0,
    organizationStewardshipGrants: 0,
    organizationProposalCreates: 0,
    organizationProposalApprovals: 0,
    theoryLessonsStudied: 0,
    theoryAssessmentsPassed: 0,
    theoryTeachBacks: 0
  };
  const signals = new Set();
  if (!actor) return { practice, signals: [] };

  for (const witness of witnesses) {
    const body = witness.body ?? {};
    if (witness.process === "edenPersonalBox.item.create" && body.owner === actor) {
      practice.personalBoxCreates += 1;
      practice.personalBoxChanges += 1;
      continue;
    }
    if ((witness.process === "edenPersonalBox.item.update" || witness.process === "edenPersonalBox.item.delete") && body.owner === actor) {
      practice.personalBoxChanges += 1;
      continue;
    }
    if (witness.process === "edenPageTheme.set" && body.owner === actor) {
      practice.pageThemeChanges += 1;
      continue;
    }
    if ((witness.process === "frontend.renderProcessPage" || witness.process === "backend.readProcessView") && witness.actor === actor) {
      practice.processViews += 1;
      continue;
    }
    if (witness.process === "network.simulated.failed" && witness.actor === actor) {
      practice.runtimeDrills += 1;
      continue;
    }
    if (witness.process === "edenVersions.publish" && witness.actor === actor) {
      practice.versionPublishes += 1;
      continue;
    }
    if (witness.process === "widgetVersion.rollback" && witness.actor === actor) {
      practice.versionRollbacks += 1;
      continue;
    }
    if ((witness.process === "capability.install" || witness.process === "installCapability") && witness.actor === actor) {
      practice.capabilityInstalls += 1;
      const install = body.install && typeof body.install === "object"
        ? body.install
        : body;
      if (install.targetKind === "context" && install.target === "frontend") {
        practice.frontendCapabilityInstalls += 1;
      }
      continue;
    }
    if (witness.process === "context.define" && witness.actor === actor) {
      const contextId = stringOrNull(body.context?.id) ?? stringOrNull(body.id);
      if (contextId && isEdenOrganizationContextId(contextId)) {
        practice.organizationContexts += 1;
      }
      continue;
    }
    if (witness.process === "stewardship.grant" && witness.actor === actor) {
      const target = stringOrNull(body.stewardship?.target) ?? stringOrNull(body.target);
      if (target && target === edenOrganizationContextId(actor)) {
        practice.organizationStewardshipGrants += 1;
      }
      continue;
    }
    if (witness.process === "proposal.create" && witness.actor === actor) {
      const proposalId = stringOrNull(body.proposal?.id) ?? stringOrNull(body.id);
      if (proposalId && isEdenOrganizationProposalId(proposalId)) {
        practice.organizationProposalCreates += 1;
      }
      continue;
    }
    if (witness.process === "proposal.approve" && witness.actor === actor) {
      const proposalId = stringOrNull(body.proposal?.id) ?? stringOrNull(body.id);
      if (proposalId && isEdenOrganizationProposalId(proposalId)) {
        practice.organizationProposalApprovals += 1;
      }
      continue;
    }
    if (witness.process === "edenTheory.lesson.study" && witness.actor === actor) {
      practice.theoryLessonsStudied += 1;
      const lessonId = stringOrNull(body.lessonId);
      if (lessonId) signals.add(`practice.theory.${lessonId}`);
      continue;
    }
    if (witness.process === "edenTheory.assessment.pass" && witness.actor === actor) {
      practice.theoryAssessmentsPassed += 1;
      signals.add("practice.theory.assessed");
      continue;
    }
    if (witness.process === "edenTheory.teachBack" && witness.actor === actor) {
      practice.theoryTeachBacks += 1;
      signals.add("practice.theory.taught");
    }
  }

  if (practice.personalBoxCreates > 0) signals.add("practice.personal_box.claimed");
  if (practice.personalBoxChanges > 0) signals.add("practice.personal_box.authored");
  if (practice.pageThemeChanges > 0) signals.add("practice.edit_page.styled");
  if (practice.processViews > 0) signals.add("practice.process.inspected");
  if (practice.runtimeDrills > 0) signals.add("practice.runtime.drilled");
  if (practice.versionPublishes > 0) signals.add("practice.versions.published");
  if (practice.versionRollbacks > 0) signals.add("practice.versions.restored");
  if (practice.capabilityInstalls > 0) signals.add("practice.capability.installed");
  if (practice.frontendCapabilityInstalls > 0) signals.add("practice.capability.frontend_installed");
  if (practice.organizationContexts > 0) signals.add("practice.organization.context_started");
  if (practice.organizationStewardshipGrants > 0) signals.add("practice.organization.steward_granted");
  if (practice.organizationProposalCreates > 0) signals.add("practice.organization.proposal_opened");
  if (practice.organizationProposalApprovals > 0) signals.add("practice.organization.proposal_approved");
  if (practice.theoryLessonsStudied > 0) signals.add("practice.theory.studied");
  if (practice.theoryAssessmentsPassed > 0) signals.add("practice.theory.trained");

  return {
    practice,
    signals: [...signals].sort()
  };
}

const ACADEMY_TRACKS = [
  {
    id: "stewardship",
    title: "Stewardship",
    description: "Shared page treatment, recovery, publish, and capability care on surfaces other people rely on.",
    thresholds: [
      { min: 1, signal: "practice.stewardship.first", label: "first stewardship loop" },
      { min: 3, signal: "practice.stewardship.steady", label: "steady stewardship" },
      { min: 6, signal: "practice.stewardship.trusted", label: "trusted stewardship" }
    ],
    count(practice) {
      return Number(practice.pageThemeChanges || 0)
        + Number(practice.versionRollbacks || 0)
        + Number(practice.versionPublishes || 0)
        + Number(practice.frontendCapabilityInstalls || 0);
    },
    breakdown(practice) {
      return [
        { label: "page treatments", count: Number(practice.pageThemeChanges || 0) },
        { label: "recoveries", count: Number(practice.versionRollbacks || 0) },
        { label: "publishes", count: Number(practice.versionPublishes || 0) },
        { label: "shared installs", count: Number(practice.frontendCapabilityInstalls || 0) }
      ];
    },
    lockedLabel: "practice the shared surface first"
  },
  {
    id: "operator",
    title: "Operator Work",
    description: "Read the machine room, ship versions, and run drills until runtime care becomes routine.",
    thresholds: [
      { min: 1, signal: "practice.operator.first", label: "first operator loop" },
      { min: 3, signal: "practice.operator.steady", label: "steady operator work" },
      { min: 6, signal: "practice.operator.trusted", label: "trusted operator work" }
    ],
    count(practice) {
      return Number(practice.processViews || 0)
        + Number(practice.runtimeDrills || 0)
        + Number(practice.versionPublishes || 0);
    },
    breakdown(practice) {
      return [
        { label: "process reads", count: Number(practice.processViews || 0) },
        { label: "runtime drills", count: Number(practice.runtimeDrills || 0) },
        { label: "publishes", count: Number(practice.versionPublishes || 0) }
      ];
    },
    lockedLabel: "inspect and ship once first"
  },
  {
    id: "governance",
    title: "Governance",
    description: "Start a group, delegate care, and run a proposal loop until shared organization becomes something you can actually carry.",
    thresholds: [
      { min: 1, signal: "practice.governance.first", label: "first group formed" },
      { min: 3, signal: "practice.governance.practiced", label: "governance practiced" },
      { min: 5, signal: "practice.governance.carried", label: "open governance carried" }
    ],
    count(practice) {
      return Number(practice.organizationContexts || 0)
        + Number(practice.organizationStewardshipGrants || 0)
        + Number(practice.organizationProposalCreates || 0)
        + Number(practice.organizationProposalApprovals || 0);
    },
    breakdown(practice) {
      return [
        { label: "groups started", count: Number(practice.organizationContexts || 0) },
        { label: "stewardships granted", count: Number(practice.organizationStewardshipGrants || 0) },
        { label: "proposals opened", count: Number(practice.organizationProposalCreates || 0) },
        { label: "proposals approved", count: Number(practice.organizationProposalApprovals || 0) }
      ];
    },
    lockedLabel: "finish the first responsibility family first",
    requiresSignals: ["quest.ship_tiny_saas.completed"]
  },
  {
    id: "teaching",
    title: "Teaching",
    description: "Once trained, teach back what the world is doing so theory becomes something you can carry for others.",
    thresholds: [
      { min: 1, signal: "practice.teaching.first", label: "first teach-back witnessed" },
      { min: 3, signal: "practice.teaching.steady", label: "teaching practiced" },
      { min: 5, signal: "practice.teaching.guide", label: "teaching carried forward" }
    ],
    count(practice) {
      return Number(practice.theoryTeachBacks || 0);
    },
    breakdown(practice) {
      return [
        { label: "teach-backs", count: Number(practice.theoryTeachBacks || 0) },
        { label: "trained assessments", count: Number(practice.theoryAssessmentsPassed || 0) }
      ];
    },
    lockedLabel: "earn the trained mark first",
    requiresSignals: ["academy.trained"]
  }
];

function deriveAcademyTracks(practice, activeSignals) {
  const grantedSignals = [];
  const tracks = ACADEMY_TRACKS.map(track => {
    const count = Number(track.count(practice) || 0);
    const open = stringList(track.requiresSignals).every(signal => activeSignals.has(signal));
    const reached = track.thresholds.filter(entry => count >= entry.min);
    const current = reached[reached.length - 1] ?? null;
    const next = track.thresholds.find(entry => count < entry.min) ?? null;
    if (open) {
      for (const entry of reached) grantedSignals.push(entry.signal);
    }
    return {
      id: track.id,
      title: track.title,
      description: track.description,
      open,
      count,
      status: !open ? "locked" : (current ? "practiced" : "available"),
      statusLabel: !open
        ? track.lockedLabel
        : (current?.label ?? "ready to practice"),
      currentLabel: current?.label ?? null,
      nextLabel: next?.label ?? null,
      nextThreshold: next?.min ?? null,
      signals: open ? reached.map(entry => entry.signal) : [],
      breakdown: track.breakdown(practice)
    };
  });
  return { tracks, grantedSignals };
}

function sortByOrder(rows) {
  return rows.sort((a, b) => {
    const orderDiff = Number(a.order ?? 0) - Number(b.order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

export function projectEdenAcademyState(witnesses, {
  actor = null,
  neighborhoodId = DEFAULT_NEIGHBORHOOD_ID,
  quests = []
} = {}) {
  const practiceState = collectPracticeState(witnesses, { actor });
  const questRows = sortByOrder(quests.map(quest => ({
    id: stringOrNull(quest.id) ?? "",
    chapterId: stringOrNull(quest.chapterId),
    title: stringOrNull(quest.title) ?? stringOrNull(quest.id) ?? "Quest",
    description: stringOrNull(quest.description),
    order: Number(quest.order ?? 0),
    dependsOnQuests: stringList(quest.dependsOnQuests),
    completionSignals: stringList(quest.completionSignals),
    grantsSignals: stringList(quest.grantsSignals),
    unlocks: stringList(quest.unlocks),
    availableLabel: stringOrNull(quest.availableLabel),
    completedLabel: stringOrNull(quest.completedLabel),
    lockedLabel: stringOrNull(quest.lockedLabel)
  })).filter(quest => quest.id));
  const questById = new Map(questRows.map(quest => [quest.id, quest]));
  const completedQuestIds = new Set();
  const grantedSignals = new Set(practiceState.signals);
  let responsibilityTracks = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const quest of questRows) {
      if (completedQuestIds.has(quest.id)) continue;
      if (quest.dependsOnQuests.some(id => !completedQuestIds.has(id))) continue;
      if (quest.completionSignals.some(signal => !grantedSignals.has(signal))) continue;
      completedQuestIds.add(quest.id);
      grantedSignals.add(questCompletionSignal(quest.id));
      for (const signal of quest.grantsSignals) grantedSignals.add(signal);
      changed = true;
    }
    const derived = deriveAcademyTracks(practiceState.practice, grantedSignals);
    responsibilityTracks = derived.tracks;
    for (const signal of derived.grantedSignals) {
      if (!grantedSignals.has(signal)) {
        grantedSignals.add(signal);
        changed = true;
      }
    }
  }

  const projectedQuests = questRows.map(quest => {
    const completed = completedQuestIds.has(quest.id);
    const missingDependencies = quest.dependsOnQuests
      .filter(id => !completedQuestIds.has(id))
      .map(id => questById.get(id)?.title ?? id);
    const missingSignals = quest.completionSignals.filter(signal => !grantedSignals.has(signal));
    const status = completed
      ? "completed"
      : (missingDependencies.length ? "locked" : "available");
    const statusLabel = completed
      ? (quest.completedLabel ?? "Practiced")
      : (status === "locked" ? (quest.lockedLabel ?? "Locked") : (quest.availableLabel ?? "Ready to practice"));
    return {
      ...quest,
      status,
      statusLabel,
      completed,
      missingDependencies,
      missingSignals,
      progress: {
        completedSignals: quest.completionSignals.length - missingSignals.length,
        totalSignals: quest.completionSignals.length
      }
    };
  });

  return {
    mode: "academy",
    actor,
    neighborhoodId: stringOrNull(neighborhoodId) ?? DEFAULT_NEIGHBORHOOD_ID,
    practice: practiceState.practice,
    tracks: responsibilityTracks,
    rawSignals: practiceState.signals,
    signals: [...grantedSignals].sort(),
    completedQuestIds: [...completedQuestIds].sort(),
    quests: projectedQuests
  };
}

export function resolveEdenActionState(action, academy) {
  const requiredSignals = stringList(action?.requiredSignals);
  if (!requiredSignals.length) return { ...action, requiredSignals };
  const activeSignals = new Set(Array.isArray(academy?.signals) ? academy.signals : []);
  const unlocked = requiredSignals.every(signal => activeSignals.has(signal));
  return {
    ...action,
    state: unlocked ? "open" : "locked",
    requires: unlocked ? null : action.requires,
    requiredSignals
  };
}

export function projectCheckpointQuestState(checkpoint, academy) {
  const questIds = stringList(checkpoint?.questIds);
  const quests = questIds
    .map(id => (academy?.quests || []).find(quest => quest.id === id) ?? null)
    .filter(Boolean);
  if (!quests.length) return [];
  return quests.map(quest => ({
    id: quest.id,
    title: quest.title,
    status: quest.status,
    statusLabel: quest.statusLabel,
    description: quest.description,
    unlocks: quest.unlocks,
    missingDependencies: quest.missingDependencies,
    missingSignals: quest.missingSignals
  }));
}
