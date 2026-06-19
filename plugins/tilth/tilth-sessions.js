// Tilth: the witnessed conversation-catalogue.
//
// This is the boundary leaf. The .wtoml authors the browser surface, routes and
// page; this file is the thin JS that (a) emits witnesses through the two
// processes and (b) folds the witness log into the `sessions` projection.
//
// Tenet (README): "Processes attempt change. Witnesses record what happened.
// Projections render meaning for a context." Every mark/import is one witness;
// provenance lives in the witness `actor` + claims, never in a mutable flag.

import { thing, relation } from "../../src/projectors-core.js";

// --- projection -----------------------------------------------------------
// Fold every witness into the current set of known sessions. Two processes
// contribute: session.import (creates the thing + provenance) and
// session.markDesire (asserts the relatesTo:DESIRE relation).
export function projectSessions(witnesses) {
  const sessions = new Map();
  for (const witness of witnesses) {
    const body = witness.body ?? {};
    const id = body.id;
    if (!id) continue;

    if (witness.process === "session.import") {
      const existing = sessions.get(id);
      sessions.set(id, {
        id,
        title: String(body.title || ""),
        preview: String(body.preview || ""),
        origin: String(body.origin || ""),
        project: String(body.project || ""),
        started: String(body.started || ""),
        msgCount: Number.isFinite(Number(body.msgCount)) ? Number(body.msgCount) : 0,
        importedBy: witness.actor || null,
        // marks survive a re-import of the same session
        desire: existing ? existing.desire : false,
        markedBy: existing ? existing.markedBy : null
      });
      continue;
    }

    if (witness.process === "session.markDesire" && sessions.has(id)) {
      const current = sessions.get(id);
      sessions.set(id, { ...current, desire: true, markedBy: witness.actor || null });
    }
  }

  return [...sessions.values()].sort((a, b) => {
    // newest first by start time, then id for stability
    const t = String(b.started).localeCompare(String(a.started));
    if (t !== 0) return t;
    return String(a.id).localeCompare(String(b.id));
  });
}

// --- processes (the only writers) -----------------------------------------
export function requestSessionImport(world, { actor, backendHost, body }) {
  const id = stringOrNull(body?.id);
  if (!id) return { ok: false, status: 400, error: "id is required" };

  const title = String(body?.title || "");
  const preview = String(body?.preview || "");
  const origin = String(body?.origin || actor || backendHost || "");
  const project = String(body?.project || "");
  const started = String(body?.started || "");
  const msgCount = Number.isFinite(Number(body?.msgCount)) ? Number(body.msgCount) : 0;

  // Idempotent on CONTENT: skip only when the known session already carries the
  // same title/preview/msgCount. If any changed (e.g. a sanitization fix, or a
  // grown conversation), re-witness an update — the projection preserves the
  // DESIRE mark across re-import, so marks are never lost.
  const existing = projectSessions(world.allWitnesses()).find(s => s.id === id);
  if (existing
    && existing.title === title
    && existing.preview === preview
    && existing.msgCount === msgCount) {
    return { ok: true, status: 200, skipped: true, id };
  }

  const witness = world.emit({
    process: "session.import",
    actor: actor || backendHost,
    claims: [
      thing(id),
      relation(id, "origin", origin),
      relation(id, "hasTitle", title)
    ],
    body: { id, title, preview, origin, project, started, msgCount }
  });
  return { ok: true, status: 201, id, witness };
}

export function requestSessionMarkDesire(world, { actor, backendHost, id }) {
  const sid = stringOrNull(id);
  if (!sid) return { ok: false, status: 400, error: "id is required" };

  const known = projectSessions(world.allWitnesses()).find(s => s.id === sid);
  if (!known) return { ok: false, status: 404, error: "unknown session" };

  const witness = world.emit({
    process: "session.markDesire",
    actor: actor || backendHost,
    claims: [relation(sid, "relatesTo", "DESIRE")],
    body: { id: sid }
  });
  return { ok: true, status: 200, id: sid, witness };
}

// --- handler registration (eden dispatch-handler pattern) -----------------
export function createTilthHandlers({ world, backendHost, sendJson, readJson }) {
  return {
    "sessions.read": async ({ res }) => {
      sendJson(res, 200, { sessions: projectSessions(world.allWitnesses()) });
    },

    "session.import": async ({ req, res, requestActor }) => {
      const body = await readJson(req);
      const result = requestSessionImport(world, { actor: requestActor, backendHost, body });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    },

    "session.markDesire": async ({ res, requestActor, params }) => {
      const result = requestSessionMarkDesire(world, {
        actor: requestActor,
        backendHost,
        id: params?.id || ""
      });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, { ok: true, id: result.id, witness: result.witness });
    }
  };
}

function stringOrNull(value) {
  if (typeof value !== "string") return value == null ? null : String(value).trim() || null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
