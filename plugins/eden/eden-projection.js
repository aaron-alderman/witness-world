import { projectors } from "../canvas/projectors-core.js";
import { projectEdenPersonalBoxItems } from "./eden-personal-box.js";
import { projectEdenPageTheme } from "./eden-page-theme.js";
import { projectEdenCapabilityInstallState } from "./eden-capability-install.js";
import { projectCheckpointQuestState, projectEdenAcademyState, resolveEdenActionState } from "./eden-academy.js";
import { projectEdenOrganizationState } from "./eden-organization.js";
import { projectEdenTheoryState } from "./eden-theory.js";
import { projectEdenVersionState } from "./eden-versions.js";

const EDEN_CONNECTION_RELS = new Map([
  ["edenWire", "wire"],
  ["edenPipe", "pipe"],
  ["edenPath", "path"]
]);
const EDEN_RELIEF_SIGNAL_HANDLERS = {
  "session.authenticated": ({ actor }) => Boolean(actor),
  "versions.liveDiff": ({ surfacesById }) => {
    const runtime = surfacesById.get("eden.surface.versions")?.runtime;
    return Boolean(runtime?.activeVersion && runtime?.publishedVersion && runtime.activeVersion !== runtime.publishedVersion);
  },
  "versions.draftDiff": ({ surfacesById }) => {
    const runtime = surfacesById.get("eden.surface.versions")?.runtime;
    return Boolean(runtime?.draftVersion && runtime?.publishedVersion && runtime.draftVersion !== runtime.publishedVersion);
  },
  "versions.rollbackAvailable": ({ surfacesById }) => Boolean(surfacesById.get("eden.surface.versions")?.runtime?.rollbackAvailable)
};

const numberOr = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const stringOrNull = value => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const stringList = value => {
  if (Array.isArray(value)) {
    return value
      .map(item => stringOrNull(item))
      .filter(Boolean);
  }
  const single = stringOrNull(value);
  return single ? [single] : [];
};
const objectList = value => Array.isArray(value)
  ? value.filter(entry => entry && typeof entry === "object")
  : [];

function indexCurrentRelations(witnesses) {
  const current = projectors.currentRelations(witnesses);
  const kinds = new Map();
  const titles = new Map();
  for (const row of current) {
    if (row.rel === "hasModuleKind") kinds.set(row.from, row.to);
    if (row.rel === "hasTitle") titles.set(row.from, row.to);
  }
  for (const witness of witnesses) {
    if (witness.process !== "defineContext" || !witness.body?.id) continue;
    if (titles.has(witness.body.id)) continue;
    if (typeof witness.body.label === "string" && witness.body.label.trim()) {
      titles.set(witness.body.id, witness.body.label.trim());
    }
  }
  return { current, kinds, titles };
}

function compileVisibleRange(meta = {}) {
  return {
    minZoom: numberOr(meta.zoomMin, 0),
    maxZoom: numberOr(meta.zoomMax, 99)
  };
}

function sortById(rows) {
  return rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function sortByOrder(rows) {
  return rows.sort((a, b) => {
    const orderDiff = numberOr(a.order, 0) - numberOr(b.order, 0);
    if (orderDiff !== 0) return orderDiff;
    return String(a.id).localeCompare(String(b.id));
  });
}

function resolveEdenReliefSignals(signalKeys, context) {
  const activeSignals = [];
  for (const key of signalKeys) {
    const handler = EDEN_RELIEF_SIGNAL_HANDLERS[key];
    if (handler && handler(context)) activeSignals.push(key);
  }
  return activeSignals;
}

export function edenNeighborhoodProjection(witnesses, neighborhoodId, {
  actor = null
} = {}) {
  const { current, kinds, titles } = indexCurrentRelations(witnesses);
  if (kinds.get(neighborhoodId) !== "edenNeighborhood") return null;

  const labelFor = id => titles.get(id) ?? id;
  const contains = current.filter(row => row.from === neighborhoodId && row.rel === "contains" && kinds.get(row.to) === "edenSurface");
  const surfaceIds = new Set(contains.map(row => row.to));
  const surfaces = sortById(contains.map(row => ({
    id: row.to,
    title: row.meta?.title ?? labelFor(row.to),
    subtitle: row.meta?.subtitle ?? null,
    x: numberOr(row.meta?.x, 0),
    y: numberOr(row.meta?.y, 0),
    w: numberOr(row.meta?.w, 320),
    h: numberOr(row.meta?.h, 180),
    surfaceKind: row.meta?.surfaceKind ?? "panel",
    href: row.meta?.href ? String(row.meta.href) : null,
    src: row.meta?.src ? String(row.meta.src) : null,
    body: row.meta?.body ? String(row.meta.body) : null,
    cameraTargetId: row.meta?.cameraTargetId ? String(row.meta.cameraTargetId) : null,
    visibleRange: compileVisibleRange(row.meta ?? {}),
    district: stringOrNull(row.meta?.district),
    tags: stringList(row.meta?.tags),
    questIds: stringList(row.meta?.questIds),
    theoryLessons: objectList(row.meta?.theoryLessons).map((lesson, index) => ({
      id: stringOrNull(lesson.id) ?? `lesson:${index}`,
      title: stringOrNull(lesson.title) ?? stringOrNull(lesson.id) ?? `Lesson ${index + 1}`,
      summary: stringOrNull(lesson.summary) ?? stringOrNull(lesson.description) ?? "Optional theory lesson.",
      concept: stringOrNull(lesson.concept),
      order: numberOr(lesson.order, index)
    })),
    panelKind: stringOrNull(row.meta?.panelKind),
    pageId: stringOrNull(row.meta?.pageId),
    processProgram: stringOrNull(row.meta?.processProgram),
    processEvent: stringOrNull(row.meta?.processEvent),
    versionSoul: stringOrNull(row.meta?.versionSoul),
    publishedVersion: stringOrNull(row.meta?.publishedVersion),
    draftVersion: stringOrNull(row.meta?.draftVersion),
    capabilityTarget: stringOrNull(row.meta?.capabilityTarget),
    capabilityTargetKind: stringOrNull(row.meta?.capabilityTargetKind),
    capabilityTargetLabel: stringOrNull(row.meta?.capabilityTargetLabel),
    recommendedCapabilities: stringList(row.meta?.recommendedCapabilities),
    contextParent: stringOrNull(row.meta?.contextParent),
    guestSteward: stringOrNull(row.meta?.guestSteward),
    proposalTargetProcess: stringOrNull(row.meta?.proposalTargetProcess),
    proposalTargetKind: stringOrNull(row.meta?.proposalTargetKind),
    proposalTargetId: stringOrNull(row.meta?.proposalTargetId),
    proposalBody: row.meta?.proposalBody && typeof row.meta.proposalBody === "object"
      ? { ...row.meta.proposalBody }
      : null,
    chromeKind: row.meta?.chromeKind ? String(row.meta.chromeKind) : null,
    relief: {
      base: numberOr(row.meta?.reliefBase, 1),
      hover: numberOr(row.meta?.reliefHover, numberOr(row.meta?.reliefBase, 1)),
      focus: numberOr(row.meta?.reliefFocus, Math.max(numberOr(row.meta?.reliefBase, 1), 2))
    }
  })));

  const actionsBySurface = new Map();
  for (const row of current.filter(entry => surfaceIds.has(entry.from) && entry.rel === "edenAction")) {
    const action = {
      id: stringOrNull(row.meta?.id) ?? String(row.to),
      label: stringOrNull(row.meta?.label) ?? labelFor(row.to),
      description: stringOrNull(row.meta?.description),
      state: stringOrNull(row.meta?.state) ?? "preview",
      href: stringOrNull(row.meta?.href),
      cameraTargetId: stringOrNull(row.meta?.cameraTargetId),
      commandQuery: stringOrNull(row.meta?.commandQuery),
      commandSurfaceId: stringOrNull(row.meta?.commandSurfaceId),
      requires: stringOrNull(row.meta?.requires),
      requiredSignals: stringList(row.meta?.requiresSignals),
      visibleRange: compileVisibleRange(row.meta ?? {}),
      order: numberOr(row.meta?.order, 0)
    };
    if (!actionsBySurface.has(row.from)) actionsBySurface.set(row.from, []);
    actionsBySurface.get(row.from).push(action);
  }
  const quests = sortByOrder(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenQuest")
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `quest:${index}`,
      chapterId: stringOrNull(row.meta?.chapterId),
      title: stringOrNull(row.meta?.title) ?? labelFor(row.to),
      description: stringOrNull(row.meta?.description),
      order: numberOr(row.meta?.order, index),
      dependsOnQuests: stringList(row.meta?.dependsOnQuests),
      completionSignals: stringList(row.meta?.completionSignals),
      grantsSignals: stringList(row.meta?.grantsSignals),
      unlocks: stringList(row.meta?.unlocks),
      availableLabel: stringOrNull(row.meta?.availableLabel),
      completedLabel: stringOrNull(row.meta?.completedLabel),
      lockedLabel: stringOrNull(row.meta?.lockedLabel)
    })));
  const academy = projectEdenAcademyState(witnesses, { actor, neighborhoodId, quests });
  for (const surface of surfaces) {
    surface.actions = sortByOrder((actionsBySurface.get(surface.id) ?? []).map(action => resolveEdenActionState(action, academy)));
    surface.quests = projectCheckpointQuestState({ questIds: surface.questIds }, academy);
    if (surface.theoryLessons.length) {
      surface.runtime = projectEdenTheoryState(witnesses, {
        actor,
        surfaceId: surface.id,
        lessons: surface.theoryLessons
      });
    }
    if (stringOrNull(surface.panelKind) === "personalBox") {
      surface.runtime = {
        mode: "personalBox",
        actor,
        items: projectEdenPersonalBoxItems(witnesses, { actor, surfaceId: surface.id })
      };
    }
    if (stringOrNull(surface.panelKind) === "editPage") {
      const pageId = stringOrNull(surface.pageId) ?? "todo_app_widget";
      surface.runtime = {
        mode: "pageTheme",
        actor,
        pageId,
        pageTheme: projectEdenPageTheme(witnesses, { actor, pageId })
      };
    }
    if (stringOrNull(surface.panelKind) === "versions") {
      surface.runtime = projectEdenVersionState(witnesses, {
        surfaceId: surface.id,
        soul: surface.versionSoul,
        publishedVersion: surface.publishedVersion,
        draftVersion: surface.draftVersion
      });
    }
    if (stringOrNull(surface.panelKind) === "capabilityInstall") {
      surface.runtime = projectEdenCapabilityInstallState(witnesses, {
        actor,
        surfaceId: surface.id,
        target: surface.capabilityTarget,
        targetKind: surface.capabilityTargetKind,
        targetLabel: surface.capabilityTargetLabel,
        recommendedCapabilities: surface.recommendedCapabilities
      });
    }
    if (stringOrNull(surface.panelKind) === "organization") {
      surface.runtime = projectEdenOrganizationState(witnesses, {
        actor,
        surfaceId: surface.id,
        contextParent: surface.contextParent,
        guestSteward: surface.guestSteward,
        proposalTargetProcess: surface.proposalTargetProcess,
        proposalTargetKind: surface.proposalTargetKind,
        proposalTargetId: surface.proposalTargetId,
        proposalBody: surface.proposalBody
      });
    }
  }
  const surfacesById = new Map(surfaces.map(surface => [surface.id, surface]));
  for (const surface of surfaces) {
    const reliefSections = current
      .filter(entry => entry.from === surface.id && entry.rel === "edenSurfaceRelief")
      .map(entry => {
        const signalKeys = stringList(entry.meta?.signals);
        return {
          id: entry.to,
          widgetId: entry.to,
          title: stringOrNull(entry.meta?.title) ?? labelFor(entry.to),
          subtitle: stringOrNull(entry.meta?.subtitle),
          meaning: stringOrNull(entry.meta?.meaning) ?? stringOrNull(entry.meta?.description),
          role: stringOrNull(entry.meta?.role),
          chromeKind: stringOrNull(entry.meta?.chromeKind),
          visibleRange: compileVisibleRange(entry.meta ?? {}),
          tags: stringList(entry.meta?.tags),
          anchors: stringList(entry.meta?.anchors),
          order: numberOr(entry.meta?.order, 0),
          signals: signalKeys,
          activeSignals: resolveEdenReliefSignals(signalKeys, { actor, surfacesById }),
          relief: {
            base: numberOr(entry.meta?.reliefBase, 1),
            hover: numberOr(entry.meta?.reliefHover, numberOr(entry.meta?.reliefBase, 1)),
            focus: numberOr(entry.meta?.reliefFocus, Math.max(numberOr(entry.meta?.reliefBase, 1), 2)),
            active: numberOr(entry.meta?.reliefActive, numberOr(entry.meta?.reliefHover, numberOr(entry.meta?.reliefBase, 1)))
          }
        };
      });
    surface.reliefSections = sortByOrder(reliefSections);
  }

  const prompts = sortById(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenPrompt")
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `prompt:${index}`,
      text: row.meta?.text ? String(row.meta.text) : labelFor(row.to),
      visibleRange: compileVisibleRange(row.meta ?? {})
    })));

  const cameraTargets = sortById(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenCameraTarget" && surfaceIds.has(row.to))
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `camera:${index}`,
      surfaceId: row.to,
      x: row.meta?.x == null ? null : numberOr(row.meta.x, 0),
      y: row.meta?.y == null ? null : numberOr(row.meta.y, 0),
      zoom: row.meta?.zoom == null ? null : numberOr(row.meta.zoom, 1)
    })));

  const checkpoints = sortByOrder(current
    .filter(row => row.from === neighborhoodId && row.rel === "edenCheckpoint")
    .map((row, index) => ({
      id: row.meta?.id ? String(row.meta.id) : `checkpoint:${index}`,
      title: stringOrNull(row.meta?.title) ?? labelFor(row.to),
      description: stringOrNull(row.meta?.description),
      statusText: stringOrNull(row.meta?.statusText),
      visibleRange: compileVisibleRange(row.meta ?? {}),
      focusSurfaceIds: stringList(row.meta?.focusSurfaceIds),
      questIds: stringList(row.meta?.questIds),
      unlocks: stringList(row.meta?.unlocks),
      order: numberOr(row.meta?.order, index)
    })));
  for (const checkpoint of checkpoints) {
    checkpoint.quests = projectCheckpointQuestState(checkpoint, academy);
  }

  const connections = current
    .filter(row => EDEN_CONNECTION_RELS.has(row.rel) && surfaceIds.has(row.from) && surfaceIds.has(row.to))
    .map(row => ({
      id: `${row.from}:${row.rel}:${row.to}`,
      from: row.from,
      to: row.to,
      label: row.meta?.label ? String(row.meta.label) : "",
      visualType: EDEN_CONNECTION_RELS.get(row.rel)
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const gotos = surfaces.filter(surface => surface.surfaceKind === "goto");
  const defaultCameraTargetId = current.find(row => row.from === neighborhoodId && row.rel === "edenDefaultCameraTarget")?.to ?? null;
  const spatial = {
    mode: "neighborhood",
    camera: null,
    surfaces,
    connections,
    gotos,
    prompts,
    cameraTargets,
    checkpoints,
    academy
  };

  return {
    neighborhood: {
      id: neighborhoodId,
      title: labelFor(neighborhoodId),
      defaultSurfaceId: defaultCameraTargetId
    },
    surfaces,
    connections,
    gotos,
    prompts,
    cameraTargets,
    checkpoints,
    academy,
    spatial
  };
}
