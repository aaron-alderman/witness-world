import {
  activeWidgetVersions,
  widgetVersionActivationHistory,
  widgetVersionTransitionIndex,
  widgetVersions
} from "../../src/widgets.js";
import { requestWidgetVersionActivation, rollbackWidgetVersion } from "../inspect/widget-versions.js";

const DEFAULT_SURFACE_ID = "eden.surface.versions";

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function previousDistinctVersion(history, currentVersion) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const version = stringOrNull(history[index]?.version);
    if (version && version !== currentVersion) return version;
  }
  return null;
}

function previewProps(props = {}) {
  const text = stringOrNull(props.text);
  if (text) return text;
  const title = stringOrNull(props.title);
  if (title) return title;
  const summary = Object.entries(props)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value ?? "")}`);
  return summary.join(" | ");
}

function changedFields(fromProps = {}, toProps = {}) {
  const keys = [...new Set([...Object.keys(fromProps || {}), ...Object.keys(toProps || {})])];
  return keys
    .filter(key => JSON.stringify(fromProps?.[key] ?? null) !== JSON.stringify(toProps?.[key] ?? null))
    .map(key => ({
      key,
      from: fromProps?.[key] ?? null,
      to: toProps?.[key] ?? null
    }));
}

function latestPublishedVersion(witnesses, { surfaceId, soul, fallback = null } = {}) {
  let published = stringOrNull(fallback);
  for (const witness of witnesses) {
    if (witness.process !== "edenVersions.publish") continue;
    if (stringOrNull(witness.body?.surfaceId) !== surfaceId) continue;
    if (stringOrNull(witness.body?.soul) !== soul) continue;
    const version = stringOrNull(witness.body?.version);
    if (version) published = version;
  }
  return published;
}

function pickDraftVersion(versionRows, { publishedVersion = null, authoredDraftVersion = null, activeVersion = null } = {}) {
  const authored = stringOrNull(authoredDraftVersion);
  if (authored && authored !== publishedVersion && versionRows.some(row => row.version === authored)) return authored;

  const preferred = versionRows
    .slice()
    .sort((a, b) => Number(b.index ?? 0) - Number(a.index ?? 0) || String(b.version).localeCompare(String(a.version)));

  const notPublished = preferred.find(row => row.version !== publishedVersion);
  if (notPublished) return notPublished.version;
  if (activeVersion) return activeVersion;
  return versionRows[0]?.version ?? null;
}

export function projectEdenVersionState(witnesses, {
  surfaceId = DEFAULT_SURFACE_ID,
  soul,
  publishedVersion = null,
  draftVersion = null
} = {}) {
  const normalizedSoul = stringOrNull(soul);
  const allRows = widgetVersions(witnesses)
    .filter(row => row.soul === normalizedSoul)
    .slice()
    .sort((a, b) => Number(a.index ?? 0) - Number(b.index ?? 0) || String(a.version).localeCompare(String(b.version)));
  const byVersion = new Map(allRows.map(row => [row.version, row]));
  const activeVersion = normalizedSoul ? (activeWidgetVersions(witnesses).get(normalizedSoul) ?? null) : null;
  const history = normalizedSoul ? (widgetVersionActivationHistory(witnesses).get(normalizedSoul) ?? []) : [];
  const published = latestPublishedVersion(witnesses, {
    surfaceId: stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID,
    soul: normalizedSoul,
    fallback: publishedVersion
  }) ?? (activeVersion || allRows[0]?.version || null);
  const draft = pickDraftVersion(allRows, {
    publishedVersion: published,
    authoredDraftVersion: draftVersion,
    activeVersion
  });
  const lastGood = previousDistinctVersion(history, activeVersion);
  const transitions = widgetVersionTransitionIndex(witnesses);
  const activeProps = byVersion.get(activeVersion)?.props ?? {};
  const publishedProps = byVersion.get(published)?.props ?? {};
  const draftProps = byVersion.get(draft)?.props ?? {};

  return {
    mode: "versions",
    surfaceId: stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID,
    soul: normalizedSoul,
    activeVersion,
    publishedVersion: published,
    draftVersion: draft,
    lastGoodVersion: lastGood,
    rollbackAvailable: Boolean(lastGood),
    versions: allRows.map(row => ({
      soul: row.soul,
      version: row.version,
      kind: row.kind,
      index: row.index ?? 0,
      isActive: row.version === activeVersion,
      isPublished: row.version === published,
      isDraft: row.version === draft,
      transitionFromActive: activeVersion && activeVersion !== row.version
        ? (transitions.get(`${normalizedSoul}\u0000${activeVersion}\u0000${row.version}`) ?? null)
        : null,
      preview: previewProps(row.props ?? {}),
      props: { ...(row.props ?? {}) }
    })),
    compare: {
      activePreview: previewProps(activeProps),
      publishedPreview: previewProps(publishedProps),
      draftPreview: previewProps(draftProps),
      activeToPublished: changedFields(activeProps, publishedProps),
      activeToDraft: changedFields(activeProps, draftProps)
    },
    history: history.map(entry => ({
      witnessId: entry.witnessId,
      actor: entry.actor,
      version: entry.version
    }))
  };
}

function unauthenticatedFailure(world, { actor, backendHost, process, body, error }) {
  const witness = world.emit({
    process,
    actor: actor || backendHost,
    claims: [],
    body
  });
  return { ok: false, status: 401, error, witness };
}

export function requestEdenVersionActivate(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  soul,
  publishedVersion = null,
  draftVersion = null,
  body
} = {}) {
  const normalizedSoul = stringOrNull(soul);
  if (!actor) {
    return unauthenticatedFailure(world, {
      actor,
      backendHost,
      process: "edenVersions.activate.failed",
      body: { surfaceId, soul: normalizedSoul, reason: "no actor" },
      error: "sign in to change versions"
    });
  }
  const version = stringOrNull(body?.version);
  if (!version) {
    const witness = world.emit({
      process: "edenVersions.activate.failed",
      actor,
      claims: [],
      body: { surfaceId, soul: normalizedSoul, reason: "missing version" }
    });
    return { ok: false, status: 400, error: "missing version", witness };
  }
  const result = requestWidgetVersionActivation(world, { actor, soul: normalizedSoul || "", version });
  const versionState = projectEdenVersionState(world.allWitnesses(), { surfaceId, soul: normalizedSoul, publishedVersion, draftVersion });
  if (result.status === "failed") {
    return { ok: false, status: 400, error: result.witness.body?.reason || "unknown widget version", witness: result.witness, versionState };
  }
  if (!result.ok) {
    return { ok: false, status: 409, error: result.witness.body?.reason || "widget version transition blocked", witness: result.witness, versionState };
  }
  return { ok: true, status: 200, witness: result.witness, versionState, activationStatus: result.status };
}

export function requestEdenVersionRollback(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  soul,
  publishedVersion = null,
  draftVersion = null
} = {}) {
  const normalizedSoul = stringOrNull(soul);
  if (!actor) {
    return unauthenticatedFailure(world, {
      actor,
      backendHost,
      process: "edenVersions.rollback.failed",
      body: { surfaceId, soul: normalizedSoul, reason: "no actor" },
      error: "sign in to restore the last good version"
    });
  }
  const result = rollbackWidgetVersion(world, { actor, soul: normalizedSoul || "" });
  const versionState = projectEdenVersionState(world.allWitnesses(), { surfaceId, soul: normalizedSoul, publishedVersion, draftVersion });
  if (!result.ok) {
    return { ok: false, status: 409, error: result.witness.body?.reason || "rollback unavailable", witness: result.witness, versionState };
  }
  return { ok: true, status: 200, witness: result.witness, versionState, rollbackStatus: result.status };
}

export function requestEdenVersionPublish(world, {
  actor,
  backendHost,
  surfaceId = DEFAULT_SURFACE_ID,
  soul,
  publishedVersion = null,
  draftVersion = null,
  body
} = {}) {
  const normalizedSurfaceId = stringOrNull(surfaceId) ?? DEFAULT_SURFACE_ID;
  const normalizedSoul = stringOrNull(soul);
  if (!actor) {
    return unauthenticatedFailure(world, {
      actor,
      backendHost,
      process: "edenVersions.publish.failed",
      body: { surfaceId: normalizedSurfaceId, soul: normalizedSoul, reason: "no actor" },
      error: "sign in to publish versions"
    });
  }
  const currentState = projectEdenVersionState(world.allWitnesses(), {
    surfaceId: normalizedSurfaceId,
    soul: normalizedSoul,
    publishedVersion,
    draftVersion
  });
  const version = stringOrNull(body?.version) ?? stringOrNull(currentState.activeVersion);
  const target = currentState.versions.find(row => row.version === version) ?? null;
  if (!target) {
    const witness = world.emit({
      process: "edenVersions.publish.failed",
      actor,
      claims: [],
      body: { surfaceId: normalizedSurfaceId, soul: normalizedSoul, version, reason: "unknown widget version" }
    });
    return { ok: false, status: 400, error: "unknown widget version", witness, versionState: currentState };
  }
  const witness = world.emit({
    process: "edenVersions.publish",
    actor,
    claims: [],
    body: {
      surfaceId: normalizedSurfaceId,
      soul: normalizedSoul,
      version
    }
  });
  const versionState = projectEdenVersionState(world.allWitnesses(), {
    surfaceId: normalizedSurfaceId,
    soul: normalizedSoul,
    publishedVersion,
    draftVersion
  });
  return { ok: true, status: 200, witness, versionState };
}
