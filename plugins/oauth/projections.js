import { projectors } from "../../src/kernel.js";
import { moduleProjectors } from "../../src/modules.js";

function titleMap(witnesses) {
  return new Map(
    projectors.currentRelations(witnesses)
      .filter(row => row.rel === "hasTitle")
      .map(row => [row.from, row.to])
  );
}

function defaultOauthFlowRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    provider: null,
    state: null,
    action: null,
    requestedIdentity: null,
    linkedIdentity: null,
    createdIdentity: null,
    providerAccountId: null,
    status: "started",
    callbackUrl: null,
    authorizeUrl: null,
    lastError: null
  };
}

export function oauthFlows(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "oauthFlow") continue;
    rows.set(id, defaultOauthFlowRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!witness.process.startsWith("auth.oauth.") || !witness.body?.id) continue;
    const id = String(witness.body.id);
    const row = rows.get(id) ?? defaultOauthFlowRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.state = typeof witness.body.state === "string" ? witness.body.state : row.state;
    row.action = typeof witness.body.action === "string" ? witness.body.action : row.action;
    row.requestedIdentity = typeof witness.body.requestedIdentity === "string" ? witness.body.requestedIdentity : row.requestedIdentity;
    row.linkedIdentity = typeof witness.body.identity === "string" ? witness.body.identity : row.linkedIdentity;
    row.createdIdentity = witness.body.createdIdentity === true ? row.linkedIdentity : row.createdIdentity;
    row.providerAccountId = typeof witness.body.providerAccountId === "string" ? witness.body.providerAccountId : row.providerAccountId;
    row.callbackUrl = typeof witness.body.callbackUrl === "string" ? witness.body.callbackUrl : row.callbackUrl;
    row.authorizeUrl = typeof witness.body.authorizeUrl === "string" ? witness.body.authorizeUrl : row.authorizeUrl;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    if (witness.process === "auth.oauth.start") row.status = "started";
    if (witness.process === "auth.oauth.callback") row.status = "callback";
    if (witness.process === "auth.oauth.link") row.status = witness.body.createdIdentity === true ? "created" : "linked";
    if (witness.process === "auth.oauth.session") row.status = "authenticated";
    if (witness.process.endsWith(".failed")) row.status = "failed";
    row.title = titles.get(id) ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function oauthFlowIndex(witnesses, options = {}) {
  const rows = oauthFlows(witnesses, options);
  const byId = Object.create(null);
  const byState = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.state) byState[row.state] = row;
  }
  return { rows, byId, byState };
}

function defaultOauthLinkRow(id, { titles, owners, contexts }) {
  return {
    id,
    title: titles.get(id) ?? id,
    owner: owners.get(id) ?? null,
    context: contexts.get(id) ?? null,
    serverRunner: null,
    provider: null,
    providerAccountId: null,
    identity: null,
    actor: null,
    label: null,
    flowId: null,
    status: "linked",
    createdIdentity: false,
    lastError: null
  };
}

export function oauthLinks(witnesses, options = {}) {
  const rows = new Map();
  const owners = projectors.owners(witnesses);
  const contexts = moduleProjectors.objectContexts(witnesses, options);
  const modules = moduleProjectors.modules(witnesses, options);
  const identities = moduleProjectors.identityIndex(witnesses, options).byId;
  const titles = titleMap(witnesses);

  for (const [id, kind] of modules) {
    if (kind !== "oauthLink") continue;
    rows.set(id, defaultOauthLinkRow(id, { titles, owners, contexts }));
  }

  for (const witness of witnesses) {
    if (!["auth.oauth.link", "auth.oauth.link.failed"].includes(witness.process) || !witness.body?.linkId) continue;
    const id = String(witness.body.linkId);
    const row = rows.get(id) ?? defaultOauthLinkRow(id, { titles, owners, contexts });
    row.serverRunner = typeof witness.body.serverRunner === "string" ? witness.body.serverRunner : row.serverRunner;
    row.provider = typeof witness.body.provider === "string" ? witness.body.provider : row.provider;
    row.providerAccountId = typeof witness.body.providerAccountId === "string" ? witness.body.providerAccountId : row.providerAccountId;
    row.identity = typeof witness.body.identity === "string" ? witness.body.identity : row.identity;
    const identity = row.identity ? identities[row.identity] ?? null : null;
    row.actor = typeof witness.body.actor === "string" ? witness.body.actor : (identity?.actor ?? row.actor);
    row.label = typeof witness.body.label === "string" ? witness.body.label : (identity?.label ?? row.label);
    row.flowId = typeof witness.body.id === "string" ? witness.body.id : row.flowId;
    row.createdIdentity = witness.body.createdIdentity === true || row.createdIdentity === true;
    row.lastError = typeof witness.body.reason === "string" ? witness.body.reason : row.lastError;
    row.status = witness.process.endsWith(".failed") ? "failed" : "linked";
    row.title = titles.get(id) ?? row.title;
    rows.set(id, row);
  }

  return [...rows.values()].sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

export function oauthLinkIndex(witnesses, options = {}) {
  const rows = oauthLinks(witnesses, options);
  const byId = Object.create(null);
  const byProviderAccount = Object.create(null);
  for (const row of rows) {
    byId[row.id] = row;
    if (row.provider && row.providerAccountId) byProviderAccount[`${row.provider}:${row.providerAccountId}`] = row;
  }
  return { rows, byId, byProviderAccount };
}

export const oauthModuleProjectors = Object.freeze({
  oauthFlows,
  oauthFlowIndex,
  oauthLinks,
  oauthLinkIndex
});
