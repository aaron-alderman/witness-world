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
import { verifyIdentity, canonical } from "./identity-verify.js";
import { fileURLToPath } from "node:url";
import path from "node:path";

// --- the founder root (canonical by agreement) -------------------------------
// You can't witness your way to the first member, so the founding identity is
// agreed out of band and seeded here. Everything past it IS witnessed: the
// roster is the recognition closure from the founder (see projectRecognized).
// Each member is sovereign over their own scheme + key; the world stays
// scheme-agnostic and only verifies what a claim declares (the verify leaf).
const FOUNDER = Object.freeze({
  label: "callan",
  scheme: "eth",
  id: "0x151ac82fa54c3b31defee8b0a4c4fd6d4443c01b"   // derived from callan's eth phrase
});

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
      signerId: String(b.signerId || ""),
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
      headPubkey: head ? (head.signerId || "").slice(0, 14) : "",
      headContent: head ? head.content : "",
      versionCount: d.versions.length,
      // the union, shown plainly: every version, who authored it (verified)
      historyText: d.versions.map(v => `${v.label} ${v.actor}`).join("  ·  "),
      at: head ? head.at : ""
    });
  }
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || a.id.localeCompare(b.id));
  return out;
}

// --- membership: claims + recognitions, folded into the recognized set -------
// "I am X" = a self-signed identity.claim (proves control of the key, claims a
// label). "I recognize X" = an identity.recognize signed by the recognizer.
// You're recognized iff you're reachable from the founder by recognitions made
// by already-recognized members. The world verifies every signature before
// witnessing (the leaf); the closure below is the authored policy.
export function projectRecognized(witnesses) {
  const claims = new Map();          // id -> { label, scheme, id }
  const edges = [];                  // { byId, ofId }
  for (const w of witnesses) {
    const b = w.body ?? {};
    if (w.process === "identity.claim" && b.id) {
      claims.set(b.id, { label: String(b.label || ""), scheme: String(b.scheme || ""), id: b.id });
    } else if (w.process === "identity.recognize" && b.byId && b.ofId) {
      edges.push({ byId: b.byId, ofId: b.ofId });
    }
  }
  // the founder is recognized by axiom (the agreed root); the rest is closure
  const recognized = new Map();
  recognized.set(FOUNDER.id, { ...FOUNDER, recognizedBy: "(founder)" });
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of edges) {
      if (recognized.has(e.byId) && !recognized.has(e.ofId) && claims.has(e.ofId)) {
        recognized.set(e.ofId, { ...claims.get(e.ofId), recognizedBy: recognized.get(e.byId).label || e.byId });
        changed = true;
      }
    }
  }
  return recognized;                 // Map: id -> { label, scheme, id, recognizedBy }
}

// The directory: every declared identity, recognized or pending. This is how a
// member discovers a newcomer's claim in order to recognize it.
export function projectIdentities(witnesses) {
  const recognized = projectRecognized(witnesses);
  const claims = new Map();
  for (const w of witnesses) {
    const b = w.body ?? {};
    if (w.process === "identity.claim" && b.id) {
      claims.set(b.id, {
        label: String(b.label || ""), scheme: String(b.scheme || ""), id: b.id, claimedAt: String(b.at || "")
      });
    }
  }
  return [...claims.values()].map(c => ({
    ...c,
    recognized: recognized.has(c.id),
    recognizedBy: recognized.get(c.id)?.recognizedBy || null
  })).sort((a, b) => (a.recognized === b.recognized ? a.label.localeCompare(b.label) : (a.recognized ? -1 : 1)));
}

// "I am <label>" — a self-signed identity claim (proves control of the key).
export function requestIdentityClaim(world, { body }) {
  const label = stringOrNull(body?.label);
  const scheme = stringOrNull(body?.scheme);
  const id = stringOrNull(body?.id);
  const sig = stringOrNull(body?.sig);
  if (!label || !scheme || !id || !sig) return { ok: false, status: 400, error: "label, scheme, id, sig required" };
  if (!verifyIdentity({ scheme, id, message: canonical.claim({ label, scheme, id }), sig })) {
    return { ok: false, status: 401, error: "claim signature does not prove control of id" };
  }
  const at = new Date().toISOString();
  const witness = world.emit({
    process: "identity.claim",
    actor: label,
    claims: [
      thing(`identity:${id}`),
      relation(`identity:${id}`, "claimsLabel", label),
      relation(`identity:${id}`, "usesScheme", scheme)
    ],
    body: { label, scheme, id, sig, at }
  });
  return { ok: true, status: 201, label, scheme, id, witness };
}

// "I recognize <ofLabel> as <ofId>" — signed by the recognizer's key.
export function requestIdentityRecognize(world, { body }) {
  const byScheme = stringOrNull(body?.byScheme);
  const byId = stringOrNull(body?.byId);
  const ofLabel = stringOrNull(body?.ofLabel);
  const ofId = stringOrNull(body?.ofId);
  const sig = stringOrNull(body?.sig);
  if (!byScheme || !byId || !ofLabel || !ofId || !sig) {
    return { ok: false, status: 400, error: "byScheme, byId, ofLabel, ofId, sig required" };
  }
  if (!verifyIdentity({ scheme: byScheme, id: byId, message: canonical.recognize({ ofLabel, ofId }), sig })) {
    return { ok: false, status: 401, error: "recognition signature invalid" };
  }
  const at = new Date().toISOString();
  const witness = world.emit({
    process: "identity.recognize",
    actor: byId,
    claims: [ relation(`identity:${byId}`, "recognizes", `identity:${ofId}`) ],
    body: { byScheme, byId, ofLabel, ofId, sig, at }
  });
  return { ok: true, status: 201, byId, ofId, witness };
}

// --- the only writer: append a new version -----------------------------------
export function requestDocPut(world, { body }) {
  const docId = stringOrNull(body?.docId);
  const scheme = stringOrNull(body?.scheme);
  const id = stringOrNull(body?.id);
  const sig = stringOrNull(body?.sig);
  const content = String(body?.content ?? "");
  if (!docId || !scheme || !id || !sig) {
    return { ok: false, status: 400, error: "docId, scheme, id, sig all required" };
  }
  // 1) the signature must be valid over the agreed bytes (the verify leaf)
  if (!verifyIdentity({ scheme, id, message: canonical.docPut({ docId, content, id }), sig })) {
    return { ok: false, status: 401, error: "invalid signature" };
  }
  // 2) the signer must be a recognized member (authored policy over the log)
  const member = projectRecognized(world.allWitnesses()).get(id);
  if (!member) return { ok: false, status: 403, error: "identity not recognized on this network" };

  const existing = projectDocs(world.allWitnesses()).find(d => d.id === docId);
  const seq = (existing ? existing.versionCount : 0) + 1;
  const versionId = `${docId}@v${seq}`;
  const label = `v${seq}`;
  const at = new Date().toISOString();
  const witness = world.emit({
    process: "doc.put",
    actor: member.label,                     // recognized identity
    claims: [
      thing(docId),
      relation(docId, "hasVersion", versionId),
      relation(versionId, "signedBy", id)
    ],
    body: { docId, versionId, label, content, actor: member.label, signerId: id, scheme, sig, at }
  });
  return { ok: true, status: 201, docId, versionId, label, actor: member.label, signerId: id, witness };
}

// --- handler registration (eden/tilth dispatch pattern) ----------------------
// --- repos: announced by the daemon, opened/closed from the browser ----------
// The daemon announces available repos (sanitized metadata — no path, no key).
// The browser toggles sync open/closed; that's local POLICY (unsigned), not an
// identity or content claim. The daemon polls projectRepos to learn what's open.
export function requestRepoAnnounce(world, { body }) {
  const repoName = stringOrNull(body?.repoName);
  if (!repoName) return { ok: false, status: 400, error: "repoName required" };
  const remote = String(body?.remote || "");
  const fileCount = Number.isFinite(Number(body?.fileCount)) ? Number(body.fileCount) : 0;
  // which DESIRE conversation(s) surfaced this repo (sanitized titles, for display)
  const sessions = Array.isArray(body?.sessions) ? body.sessions.map(String) : [];
  const witness = world.emit({
    process: "repo.announce",
    actor: "daemon",
    claims: [thing(`repo:${repoName}`), relation(`repo:${repoName}`, "hasFileCount", String(fileCount))],
    body: { repoName, remote, fileCount, sessions, at: new Date().toISOString() }
  });
  return { ok: true, status: 201, repoName, witness };
}

export function requestRepoSetSync(world, { repoName, open }) {
  const name = stringOrNull(repoName);
  if (!name) return { ok: false, status: 400, error: "repoName required" };
  const witness = world.emit({
    process: open ? "repo.sync.open" : "repo.sync.close",
    actor: "local",                              // your node's policy, not signed
    claims: [relation(`repo:${name}`, "syncState", open ? "open" : "closed")],
    body: { repoName: name, open: !!open, at: new Date().toISOString() }
  });
  return { ok: true, status: 200, repoName: name, open: !!open, witness };
}

export function projectRepos(witnesses) {
  const repos = new Map();
  for (const w of witnesses) {
    const b = w.body ?? {};
    if (w.process === "repo.announce" && b.repoName) {
      const ex = repos.get(b.repoName);
      repos.set(b.repoName, {
        repoName: b.repoName,
        remote: String(b.remote || ""),
        fileCount: Number(b.fileCount || 0),
        sessions: Array.isArray(b.sessions) ? b.sessions : (ex ? ex.sessions : []),
        open: ex ? ex.open : false
      });
    } else if ((w.process === "repo.sync.open" || w.process === "repo.sync.close") && b.repoName) {
      const ex = repos.get(b.repoName) || { repoName: b.repoName, remote: "", fileCount: 0, sessions: [], open: false };
      repos.set(b.repoName, { ...ex, open: w.process === "repo.sync.open" });
    }
  }
  return [...repos.values()].map(r => ({
    ...r,
    sessionsText: r.sessions.length ? `from: ${r.sessions.join(", ")}` : ""
  })).sort((a, b) => a.repoName.localeCompare(b.repoName));
}

// --- conversations: DESIRE-marked sessions announced from tilth ---------------
// The daemon reads tilth's DESIRE-marked sessions and announces each here
// (sanitized: id, title, AI summary, project — no transcript, no path). The
// browser shows them; "Share conversation" witnesses share-intent (local policy,
// unsigned); the daemon then publishes that session's content to the commons.
export function requestSessionAnnounce(world, { body }) {
  const sessionId = stringOrNull(body?.sessionId);
  if (!sessionId) return { ok: false, status: 400, error: "sessionId required" };
  const title = String(body?.title || "");
  const aiSummary = String(body?.aiSummary || "");
  const project = String(body?.project || "");
  const repos = Array.isArray(body?.repos) ? body.repos.map(String) : [];
  const witness = world.emit({
    process: "session.announce",
    actor: "daemon",
    claims: [thing(`session:${sessionId}`), relation(`session:${sessionId}`, "hasTitle", title)],
    body: { sessionId, title, aiSummary, project, repos, at: new Date().toISOString() }
  });
  return { ok: true, status: 201, sessionId, witness };
}

export function requestSessionSetShare(world, { sessionId, share }) {
  const id = stringOrNull(sessionId);
  if (!id) return { ok: false, status: 400, error: "sessionId required" };
  const witness = world.emit({
    process: share ? "session.share" : "session.unshare",
    actor: "local",                              // your node's policy, not signed
    claims: [relation(`session:${id}`, "shareState", share ? "shared" : "private")],
    body: { sessionId: id, share: !!share, at: new Date().toISOString() }
  });
  return { ok: true, status: 200, sessionId: id, share: !!share, witness };
}

export function projectSessions(witnesses) {
  const sessions = new Map();
  for (const w of witnesses) {
    const b = w.body ?? {};
    if (w.process === "session.announce" && b.sessionId) {
      const ex = sessions.get(b.sessionId);
      sessions.set(b.sessionId, {
        sessionId: b.sessionId,
        title: String(b.title || ""),
        aiSummary: String(b.aiSummary || ""),
        project: String(b.project || ""),
        repos: Array.isArray(b.repos) ? b.repos : (ex ? ex.repos : []),
        shared: ex ? ex.shared : false
      });
    } else if ((w.process === "session.share" || w.process === "session.unshare") && b.sessionId) {
      const ex = sessions.get(b.sessionId)
        || { sessionId: b.sessionId, title: "", aiSummary: "", project: "", repos: [], shared: false };
      sessions.set(b.sessionId, { ...ex, shared: w.process === "session.share" });
    }
  }
  return [...sessions.values()].map(s => ({
    ...s,
    reposText: s.repos.length ? `repos: ${s.repos.join(", ")}` : "no repos detected"
  })).sort((a, b) => a.title.localeCompare(b.title));
}

export function createTilthNetHandlers({ world, sendJson, readJson }) {
  const dispatch = (fn) => async ({ req, res }) => {
    await ensureModel();
    const body = await readJson(req);
    const result = fn(world, { body });
    if (!result.ok) { sendJson(res, result.status, { error: result.error }); return; }
    sendJson(res, result.status, result);
  };
  return {
    "docs.read": async ({ res }) => {
      await ensureModel();
      sendJson(res, 200, { docs: projectDocs(world.allWitnesses()) });
    },
    "recognized.read": async ({ res }) => {
      sendJson(res, 200, { recognized: [...projectRecognized(world.allWitnesses()).values()] });
    },
    "identities.read": async ({ res }) => {
      sendJson(res, 200, { identities: projectIdentities(world.allWitnesses()) });
    },
    "identity.claim": dispatch(requestIdentityClaim),
    "identity.recognize": dispatch(requestIdentityRecognize),
    "doc.put": dispatch(requestDocPut),

    "repos.read": async ({ res }) => {
      sendJson(res, 200, { repos: projectRepos(world.allWitnesses()) });
    },
    "repo.announce": dispatch(requestRepoAnnounce),
    "repo.open": async ({ res, params }) => {
      const r = requestRepoSetSync(world, { repoName: params?.name, open: true });
      sendJson(res, r.status, r.ok ? r : { error: r.error });
    },
    "repo.close": async ({ res, params }) => {
      const r = requestRepoSetSync(world, { repoName: params?.name, open: false });
      sendJson(res, r.status, r.ok ? r : { error: r.error });
    },

    "sessions.read": async ({ res }) => {
      sendJson(res, 200, { sessions: projectSessions(world.allWitnesses()) });
    },
    "session.announce": dispatch(requestSessionAnnounce),
    "session.share": async ({ res, params }) => {
      const r = requestSessionSetShare(world, { sessionId: params?.id, share: true });
      sendJson(res, r.status, r.ok ? r : { error: r.error });
    },
    "session.unshare": async ({ res, params }) => {
      const r = requestSessionSetShare(world, { sessionId: params?.id, share: false });
      sendJson(res, r.status, r.ok ? r : { error: r.error });
    }
  };
}

function stringOrNull(v) {
  if (typeof v !== "string") return v == null ? null : String(v).trim() || null;
  const t = v.trim();
  return t || null;
}
