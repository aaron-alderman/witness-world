// tilth-net: the in-world half of the private network — a witnessed,
// versioned canonical-state model. It proves the "git but better" thesis
// locally, with no networking: many versions of a doc are appended as
// witnesses (facts), they UNION rather than merge, and the canonical head is a
// projection. Two "peers" are simulated as two actors in one world.
//
// Dialect split, each where it belongs:
//   - this file (.wtoml + JS) is the WITNESSED substrate: doc.put emits the
//     versions; projectDocs folds the append-only log.
//   - examples/tilth-net/reconcile.rvm is the RECONCILIATION model: the one
//     genuinely pipeline-shaped piece (versions -> canonical head). It is
//     authored in rvm and actually executed here via evaluateModel().

import { thing, relation } from "../../src/projectors-core.js";
import { compileRvmFileToDesirePlus, normalizeDesirePlusToDesire } from "../../src/desire/index.js";
import { evaluateModel } from "../chart-runtime/dataflow-eval.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

// --- the rvm reconciliation model (loaded once, evaluated per projection) ----
const RECONCILE_RVM = path.join(
  path.dirname(fileURLToPath(import.meta.url)), "..", "..", "examples", "tilth-net", "reconcile.rvm"
);

// The irreducible JS leaf the rvm model calls: pick the head version — latest by
// `at`, tie-broken by versionId. The comparison is the one thing rvm's native
// reducers can't express over arbitrary records, so it lives here, by design.
const PICK_HEAD = (list) => {
  let best = null;
  for (const v of (list || [])) {
    const newer = !best
      || String(v.at) > String(best.at)
      || (v.at === best.at && String(v.versionId) > String(best.versionId));
    if (newer) best = v;
  }
  return best ? best.versionId : "";
};

let MODEL_BODY = null;
export async function ensureModel() {
  if (MODEL_BODY) return MODEL_BODY;
  try {
    const desire = normalizeDesirePlusToDesire(await compileRvmFileToDesirePlus(RECONCILE_RVM));
    const node = desire.nodes.find(n => n.kind === "dataflow" && n.name === "CanonicalHead");
    MODEL_BODY = node ? node.body : null;
  } catch {
    MODEL_BODY = null; // fall back to last-appended if the model can't load
  }
  return MODEL_BODY;
}

// The reduce. Authored in reconcile.rvm; executed here. If the model is loaded,
// the rvm dataflow picks the head (calling PICK_HEAD); otherwise we fall back to
// last-appended so the app still works.
export function canonicalHead(versions) {
  if (!versions || versions.length === 0) return null;
  if (MODEL_BODY) {
    try {
      const ev = evaluateModel(MODEL_BODY, { params: { versions }, functions: { pick_head: PICK_HEAD } });
      const headId = ev?.fields?.headId?.data;
      const picked = versions.find(v => v.versionId === headId);
      if (picked) return picked;
    } catch { /* fall through */ }
  }
  return versions[versions.length - 1];
}

// --- projection: fold the version-witnesses into canonical docs --------------
// Every doc.put is an append-only fact. Nothing is overwritten; all versions
// from all actors are retained (the union). The canonical head is derived.
export function projectDocs(witnesses) {
  const docs = new Map();
  for (const w of witnesses) {
    if (w.process !== "doc.put") continue;
    const b = w.body ?? {};
    if (!b.docId || !b.versionId) continue;
    if (!docs.has(b.docId)) docs.set(b.docId, { id: b.docId, versions: [] });
    docs.get(b.docId).versions.push({
      versionId: b.versionId,
      label: String(b.label || ""),
      content: String(b.content ?? ""),
      actor: w.actor || String(b.actor || ""),
      at: String(b.at || "")
    });
  }

  const out = [];
  for (const d of docs.values()) {
    const head = canonicalHead(d.versions);
    out.push({
      id: d.id,
      headLabel: head ? head.label : "",
      headActor: head ? head.actor : "",
      headContent: head ? head.content : "",
      versionCount: d.versions.length,
      // the union, shown plainly: every version, who authored it
      historyText: d.versions.map(v => `${v.label} ${v.actor}`).join("  ·  "),
      at: head ? head.at : ""
    });
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id));
  return out;
}

// --- the only writer: append a new version -----------------------------------
export function requestDocPut(world, { actor, backendHost, body }) {
  const docId = stringOrNull(body?.docId);
  if (!docId) return { ok: false, status: 400, error: "docId required" };

  const content = String(body?.content ?? "");
  // actor comes from the body so we can simulate two peers in one local world
  const who = stringOrNull(body?.actor) || actor || backendHost;
  const existing = projectDocs(world.allWitnesses()).find(d => d.id === docId);
  const seq = (existing ? existing.versionCount : 0) + 1;
  const versionId = `${docId}@v${seq}`;
  const label = `v${seq}`;
  const at = new Date().toISOString();

  const witness = world.emit({
    process: "doc.put",
    actor: who,
    claims: [thing(docId), relation(docId, "hasVersion", versionId)],
    body: { docId, versionId, label, content, actor: who, at }
  });
  return { ok: true, status: 201, docId, versionId, label, witness };
}

// --- handler registration (eden/tilth dispatch pattern) ----------------------
export function createTilthNetHandlers({ world, backendHost, sendJson, readJson }) {
  return {
    "docs.read": async ({ res }) => {
      await ensureModel();
      sendJson(res, 200, { docs: projectDocs(world.allWitnesses()) });
    },
    "doc.put": async ({ req, res, requestActor }) => {
      await ensureModel();
      const body = await readJson(req);
      const result = requestDocPut(world, { actor: requestActor, backendHost, body });
      if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
      sendJson(res, result.status, result);
    }
  };
}

function stringOrNull(v) {
  if (typeof v !== "string") return v == null ? null : String(v).trim() || null;
  const t = v.trim();
  return t || null;
}
