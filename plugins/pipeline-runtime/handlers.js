import { relation } from "../../src/kernel.js";
import {
  grantIdentityActorAssumption,
  grantIdentityRole,
  moduleProjectors,
  revokeIdentityActorAssumption,
  revokeIdentityRole,
  setAppFeatureAccessPolicy,
  updateIdentity
} from "../../src/modules.js";
import {
  authSummaryForAuthority,
  identityActorAssumptionGrantHistory,
  resolveSessionAuthorityForIdentity
} from "../../src/runtime-authz.js";
import { createSecretStoreHandlers } from "../secret/handlers.js";
import { createSqlDbHandlers, normalizeDatasourcePayload } from "../sql/handlers.js";

const SELECT_SLOT_LIMIT = 10;

function normalizeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeQuery(value) {
  return normalizeText(value, "").toLowerCase();
}

function normalizeScriptName(value) {
  return normalizeText(value, "unnamed-script");
}

function normalizeDatasourceId(value) {
  return normalizeText(value, "") || null;
}

function normalizeCsvList(value) {
  return [...new Set(String(value ?? "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean))];
}

function normalizeRoleList(value, fallbackCsv = null) {
  const list = Array.isArray(value)
    ? value.map(entry => normalizeText(entry, "")).filter(Boolean)
    : normalizeCsvList(fallbackCsv ?? value);
  return [...new Set(list)];
}

function safeIso(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatRelativeTime(value, now = Date.now()) {
  const iso = safeIso(value);
  if (!iso) return "Never";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return iso;
  const deltaMs = now - timestamp;
  const future = deltaMs < 0;
  const absSeconds = Math.abs(Math.round(deltaMs / 1000));
  if (absSeconds < 10) return future ? "in a few seconds" : "just now";
  if (absSeconds < 60) return future ? `in ${pluralize(absSeconds, "second")}` : `${pluralize(absSeconds, "second")} ago`;
  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) return future ? `in ${pluralize(absMinutes, "minute")}` : `${pluralize(absMinutes, "minute")} ago`;
  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) return future ? `in ${pluralize(absHours, "hour")}` : `${pluralize(absHours, "hour")} ago`;
  const absDays = Math.round(absHours / 24);
  if (absDays < 7) return future ? `in ${pluralize(absDays, "day")}` : `${pluralize(absDays, "day")} ago`;
  const absWeeks = Math.round(absDays / 7);
  if (absWeeks < 5) return future ? `in ${pluralize(absWeeks, "week")}` : `${pluralize(absWeeks, "week")} ago`;
  const absMonths = Math.round(absDays / 30);
  if (absMonths < 12) return future ? `in ${pluralize(absMonths, "month")}` : `${pluralize(absMonths, "month")} ago`;
  const absYears = Math.round(absDays / 365);
  return future ? `in ${pluralize(absYears, "year")}` : `${pluralize(absYears, "year")} ago`;
}

function summarizeSecretEditor(secret) {
  const title = titleForRow(secret, "secret");
  const updatedAt = formatRelativeTime(secret?.updatedAt);
  const hasValue = secret?.hasValue === true ? "A value is stored." : "No value is stored yet.";
  return `Selected secret "${title}". ${hasValue} Values stay hidden; enter a new value to rotate it. Updated ${updatedAt}.`;
}

function summarizeDatasourceEditor(datasource) {
  const title = titleForRow(datasource, "datasource");
  const provider = normalizeText(datasource?.provider, "sql");
  const status = normalizeText(datasource?.status, "configured");
  const lastTest = normalizeText(datasource?.lastTestResult, "") ? `Last test ${datasource.lastTestResult}.` : "No connection test has been recorded yet.";
  return `Selected datasource "${title}" (${provider}). Current status is ${status}. ${lastTest}`;
}

function summarizeDatasourceTestResult(result, datasource) {
  const title = titleForRow(datasource, "datasource");
  if (!result || result.ok !== true) {
    const reason = normalizeText(result?.reason, "Connection test failed.");
    return `Connection test failed for "${title}": ${reason}`;
  }
  return `Connection test succeeded for "${title}".`;
}

function summarizeScriptStub(scriptName, datasourceId) {
  return datasourceId
    ? `Script stub only. "${scriptName}" would run against datasource "${datasourceId}" once execution is implemented.`
    : `Script stub only. "${scriptName}" would run once execution is implemented.`;
}

function decorateSecretRow(row, now = Date.now()) {
  return {
    ...row,
    title: titleForRow(row),
    hasValueText: row?.hasValue === true ? "Stored" : "Missing",
    updatedAtText: formatRelativeTime(row?.updatedAt, now),
    updatedAtTitle: safeIso(row?.updatedAt) ?? "Unknown update time"
  };
}

function decorateDatasourceRow(row, now = Date.now()) {
  const provider = normalizeText(row?.provider, "");
  const providerText = provider === "postgres"
    ? "Postgres"
    : provider === "mysql"
      ? "MySQL"
      : provider;
  const lastTestResult = normalizeText(row?.lastTestResult, "");
  return {
    ...row,
    title: titleForRow(row),
    providerText: providerText || "Unknown",
    lastTestResultText: lastTestResult || "Not tested",
    updatedAtText: formatRelativeTime(row?.updatedAt, now),
    updatedAtTitle: safeIso(row?.updatedAt) ?? "Unknown update time"
  };
}

function titleForRow(row, fallback = "") {
  return normalizeText(row?.title, normalizeText(row?.label, normalizeText(row?.datasourceName, normalizeText(row?.id, fallback))));
}

function rolesHint(roleRows = []) {
  if (!roleRows.length) return "No roles are currently defined.";
  return `Available roles: ${roleRows.map(row => row.id).join(", ")}`;
}

function decorateIdentityRow(row) {
  return {
    ...row,
    displayName: normalizeText(row?.displayName, normalizeText(row?.label, normalizeText(row?.username, ""))),
    jobTitle: normalizeText(row?.jobTitle, ""),
    initials: normalizeText(row?.initials, ""),
    rolesText: Array.isArray(row?.roles) && row.roles.length ? row.roles.join(", ") : "No roles"
  };
}

function decorateFeaturePolicyRow(row) {
  return {
    ...row,
    label: normalizeText(row?.label, normalizeText(row?.featureId, "")),
    allowedRolesText: Array.isArray(row?.allowedRoles) && row.allowedRoles.length ? row.allowedRoles.join(", ") : "No role gate"
  };
}

function authorityTargetLabel(row) {
  const identityLabel = normalizeText(row?.targetIdentity?.displayName, normalizeText(row?.targetIdentity?.label, normalizeText(row?.targetIdentity?.username, "")));
  if (identityLabel) return `${identityLabel} (${row.targetActor})`;
  return normalizeText(row?.targetActor, "unknown actor");
}

function decorateAuthorityGrantRow(row) {
  const identity = row?.identity ?? null;
  const targetIdentity = row?.targetIdentity ?? null;
  const sourceLabel = normalizeText(identity?.displayName, normalizeText(identity?.label, normalizeText(identity?.username, normalizeText(row?.identityId, ""))));
  const targetIdentityLabel = normalizeText(targetIdentity?.displayName, normalizeText(targetIdentity?.label, normalizeText(targetIdentity?.username, "")));
  const statusText = row?.active ? "Active" : "Revoked";
  const provenanceParts = [];
  if (row?.grantedBy) provenanceParts.push(`Granted by ${row.grantedBy}`);
  if (row?.revokedBy) provenanceParts.push(`Revoked by ${row.revokedBy}`);
  return {
    ...row,
    sourceIdentityLabel: sourceLabel || normalizeText(row?.identityId, "Unknown identity"),
    targetActorLabel: authorityTargetLabel(row),
    targetIdentityLabel: targetIdentityLabel || "No linked identity",
    statusText,
    provenanceText: provenanceParts.join(" · ") || "No provenance recorded"
  };
}

function authorityGrantReadShape(grantRow, projectionWorld) {
  const identityIndex = projectionWorld?.project?.(moduleProjectors.identityIndex) ?? { byId: {}, byActor: {} };
  return {
    ...grantRow,
    identity: identityIndex?.byId?.[grantRow.identityId] ?? null,
    targetIdentity: identityIndex?.byActor?.[grantRow.targetActor]?.[0] ?? null
  };
}

function authorityActorOptionRows(identityIndex) {
  return Object.entries(identityIndex?.byActor ?? {})
    .map(([actor, identities]) => {
      const identity = Array.isArray(identities) ? identities[0] ?? null : null;
      const label = normalizeText(identity?.displayName, normalizeText(identity?.label, normalizeText(identity?.username, actor)));
      return {
        id: actor,
        actor,
        title: label ? `${label} (${actor})` : actor,
        label: label || actor,
        identityId: identity?.id ?? null
      };
    })
    .sort((left, right) => String(left.actor).localeCompare(String(right.actor)));
}

function authoritySummaryPayload(summary, extras = {}) {
  return {
    PlatformConfigAuthorityAuthenticatedIdentity: normalizeText(summary?.authenticatedIdentity?.id, ""),
    PlatformConfigAuthorityAuthenticatedActor: normalizeText(summary?.authenticatedActor, ""),
    PlatformConfigAuthorityEffectiveIdentity: normalizeText(summary?.effectiveIdentity?.id, ""),
    PlatformConfigAuthorityEffectiveActor: normalizeText(summary?.effectiveActor, ""),
    PlatformConfigAuthorityMode: normalizeText(summary?.authorityMode, "direct"),
    PlatformConfigAuthorityAssumptionGrantId: normalizeText(summary?.assumptionGrantId, ""),
    PlatformConfigAuthoritySummary: summary
      ? [
          `Authenticated identity: ${normalizeText(summary.authenticatedIdentity?.id, "None")}`,
          `Authenticated actor: ${normalizeText(summary.authenticatedActor, "None")}`,
          `Effective identity: ${normalizeText(summary.effectiveIdentity?.id, "None")}`,
          `Effective actor: ${normalizeText(summary.effectiveActor, "None")}`,
          `Authority mode: ${normalizeText(summary.authorityMode, "direct")}`,
          `Assumption grant: ${normalizeText(summary.assumptionGrantId, "None")}`
        ].join("\n")
      : "No authority summary available.",
    ...extras
  };
}

function authorityGrantEditorPayload({ identityId = "", targetActor = "", summary = "" } = {}) {
  return {
    PlatformConfigGrantSourceIdentityId: normalizeText(identityId, ""),
    PlatformConfigGrantTargetActor: normalizeText(targetActor, ""),
    PlatformConfigGrantSelectedId: "",
    PlatformConfigGrantSummary: normalizeText(summary, "Choose a source identity and target actor, then create a grant.")
  };
}

function assumedSessionEditorPayload({ identityId = "", targetActor = "", summary = "" } = {}) {
  return {
    PlatformConfigAssumeIdentityId: normalizeText(identityId, ""),
    PlatformConfigAssumeTargetActor: normalizeText(targetActor, ""),
    PlatformConfigAssumeSummary: normalizeText(summary, "Choose a source identity and target actor, then open an assumed session.")
  };
}

function platformConfigRouteKeyForSession(session = {}) {
  const access = normalizeText(session?.featureAccess?.engentus_platform_config, "hidden");
  if (access === "granted") return "platform-config-access";
  if (access === "locked") return "access-denied";
  if (access === "hidden") return "not-found";
  if (access === "login") return "login";
  return "home";
}

function engentusSessionPayload(session = {}, { routeKey = null } = {}) {
  return {
    EngentusSessionActor: normalizeText(session?.effectiveActor, normalizeText(session?.actor, "")),
    EngentusSessionIdentityId: normalizeText(session?.effectiveIdentity, normalizeText(session?.identity, "")),
    EngentusProfileDisplayName: normalizeText(session?.profile?.displayName, normalizeText(session?.displayName, "")),
    EngentusProfileJobTitle: normalizeText(session?.profile?.jobTitle, normalizeText(session?.jobTitle, "")),
    EngentusProfileInitials: normalizeText(session?.profile?.initials, normalizeText(session?.initials, "")),
    EngentusMillForceAccess: normalizeText(session?.featureAccess?.engentus_mill_force, "login"),
    EngentusPlatformConfigAccess: normalizeText(session?.featureAccess?.engentus_platform_config, "hidden"),
    ...(routeKey ? { EngentusShellActiveRoute: routeKey } : {})
  };
}

function matchesQuery(row, query) {
  if (!query) return true;
  const haystacks = [
    row?.title,
    row?.label,
    row?.datasourceName,
    row?.provider,
    row?.id
  ].map(value => String(value ?? "").toLowerCase());
  return haystacks.some(value => value.includes(query));
}

function filterCollectionRows(rows, query) {
  const now = Date.now();
  const filtered = rows.filter(row => matchesQuery(row, query));
  const searchVisible = rows.length > SELECT_SLOT_LIMIT;
  const limited = searchVisible && !query
    ? filtered.slice(0, SELECT_SLOT_LIMIT)
    : filtered.slice(0, searchVisible ? SELECT_SLOT_LIMIT : filtered.length);
  return {
    rows: limited.map(row => ({
      ...row,
      title: titleForRow(row),
      updatedAtText: formatRelativeTime(row?.updatedAt, now),
      updatedAtTitle: safeIso(row?.updatedAt) ?? "Unknown update time"
    })),
    totalCount: rows.length,
    filteredCount: filtered.length,
    searchVisible
  };
}

function summarizeRows(kind, totalCount, filteredCount, query) {
  if (!totalCount) return `No ${kind} configured yet.`;
  if (query && !filteredCount) return `No ${kind} matched "${query}".`;
  if (totalCount > SELECT_SLOT_LIMIT && !query) return `More than ${SELECT_SLOT_LIMIT} ${kind} exist. Use search to narrow the list.`;
  if (query) return `Matched ${filteredCount} ${kind} for "${query}".`;
  return `Loaded ${filteredCount} ${kind}.`;
}

function secretEditorPayload(secret, extras = {}) {
  return {
    PlatformConfigSecretSelectedId: String(secret?.id ?? ""),
    PlatformConfigSecretLabel: titleForRow(secret),
    PlatformConfigSecretValue: "",
    PlatformConfigSecretSummary: summarizeSecretEditor(secret),
    ...extras
  };
}

function blankSecretPayload(extras = {}) {
  return {
    PlatformConfigSecretSelectedId: "",
    PlatformConfigSecretLabel: "",
    PlatformConfigSecretValue: "",
    ...extras
  };
}

function datasourceEditorPayload(datasource, extras = {}) {
  return {
    PlatformConfigDatasourceSelectedId: String(datasource?.id ?? ""),
    PlatformConfigDatasourceLabel: titleForRow(datasource),
    PlatformConfigDatasourceProvider: normalizeText(datasource?.provider, "postgres"),
    PlatformConfigDatasourceHost: normalizeText(datasource?.host, ""),
    PlatformConfigDatasourcePort: datasource?.port == null ? "" : String(datasource.port),
    PlatformConfigDatasourceDatabase: normalizeText(datasource?.database, ""),
    PlatformConfigDatasourceUser: normalizeText(datasource?.user, ""),
    PlatformConfigDatasourcePasswordSecretId: normalizeText(datasource?.passwordSecretId, ""),
    PlatformConfigDatasourcePath: normalizeText(datasource?.path, ""),
    PlatformConfigDatasourceSsl: datasource?.ssl === true,
    PlatformConfigScriptDatasourceId: String(datasource?.id ?? ""),
    PlatformConfigDatasourceSummary: summarizeDatasourceEditor(datasource),
    ...extras
  };
}

function blankDatasourcePayload(extras = {}) {
  return {
    PlatformConfigDatasourceSelectedId: "",
    PlatformConfigDatasourceLabel: "",
    PlatformConfigDatasourceProvider: "postgres",
    PlatformConfigDatasourceHost: "",
    PlatformConfigDatasourcePort: "",
    PlatformConfigDatasourceDatabase: "",
    PlatformConfigDatasourceUser: "",
    PlatformConfigDatasourcePasswordSecretId: "",
    PlatformConfigDatasourcePath: "",
    PlatformConfigDatasourceSsl: false,
    PlatformConfigScriptDatasourceId: "",
    ...extras
  };
}

function accessIdentityEditorPayload(identity, extras = {}) {
  return {
    PlatformConfigAccessIdentitySelectedId: String(identity?.id ?? ""),
    PlatformConfigAccessIdentityUsername: normalizeText(identity?.username, ""),
    PlatformConfigAccessIdentityDisplayName: normalizeText(identity?.displayName, normalizeText(identity?.label, "")),
    PlatformConfigAccessIdentityJobTitle: normalizeText(identity?.jobTitle, ""),
    PlatformConfigAccessIdentityInitials: normalizeText(identity?.initials, ""),
    PlatformConfigAccessIdentityRoles: Array.isArray(identity?.roles) ? [...identity.roles] : [],
    PlatformConfigAccessIdentitySummary: `Selected identity "${normalizeText(identity?.username, "identity")}". Update profile fields or role grants and save.`,
    ...extras
  };
}

function accessFeatureEditorPayload(policy, extras = {}) {
  return {
    PlatformConfigAccessFeatureSelectedId: String(policy?.featureId ?? policy?.id ?? ""),
    PlatformConfigAccessFeatureLabel: normalizeText(policy?.label, normalizeText(policy?.featureId, "")),
    PlatformConfigAccessFeatureVisibilityMode: normalizeText(policy?.visibilityMode, "normal"),
    PlatformConfigAccessFeatureAllowedRoles: Array.isArray(policy?.allowedRoles) ? [...policy.allowedRoles] : [],
    PlatformConfigAccessFeatureSummary: `Selected feature policy "${normalizeText(policy?.label, normalizeText(policy?.featureId, "feature"))}".`,
    ...extras
  };
}

async function delegateJsonHandler(factory, deps, handlerId, args) {
  const responses = [];
  const handlers = factory({
    ...deps,
    sendJson: (_res, status, body) => responses.push({ status, body })
  });
  await handlers[handlerId](args);
  return responses[0] ?? { status: 500, body: { error: `no response from ${handlerId}` } };
}

function sendDelegated(sendJson, res, delegated, body) {
  sendJson(res, Number(delegated?.status || 500), body);
}

export async function pipelineSnapshotPayload(appContext, projectionWorld, {
  secretQuery = "",
  datasourceQuery = "",
  requestSession = null,
  requestActor = null
} = {}) {
  const secrets = await (appContext?.secretStore?.listMetadata?.() ?? []);
  const datasources = appContext?.dbSql?.listDatasources?.() ?? [];
  const identityRows = projectionWorld?.project?.(moduleProjectors.identities)
    ?? [];
  const identityIndex = projectionWorld?.project?.(moduleProjectors.identityIndex)
    ?? { byId: {}, byActor: {} };
  const roleGrantIndex = projectionWorld?.project?.(moduleProjectors.identityRoleGrantIndex)
    ?? { byIdentity: {} };
  const featurePolicyRows = projectionWorld?.project?.(moduleProjectors.appFeatureAccessPolicies)
    ?? [];
  const authRoleRows = projectionWorld?.project?.(moduleProjectors.authRoles)
    ?? [];
  const authoritySummary = authSummaryForAuthority(projectionWorld, requestSession ?? {
    authenticatedActor: requestActor,
    effectiveActor: requestActor,
    authorityMode: "direct"
  });
  const authorityGrants = identityActorAssumptionGrantHistory(projectionWorld).map(row =>
    decorateAuthorityGrantRow(authorityGrantReadShape(row, projectionWorld))
  );
  const authorityActors = authorityActorOptionRows(identityIndex);
  const secretSelection = filterCollectionRows(secrets.map(row => decorateSecretRow(row)), normalizeQuery(secretQuery));
  const datasourceSelection = filterCollectionRows(datasources.map(row => decorateDatasourceRow(row)), normalizeQuery(datasourceQuery));
  const identities = identityRows.map(row => decorateIdentityRow({
    ...row,
    roles: roleGrantIndex?.byIdentity?.[row.id] ?? []
  }));
  const featurePolicies = featurePolicyRows.map(row => decorateFeaturePolicyRow(row));
  return {
    secrets: secretSelection.rows,
    datasources: datasourceSelection.rows,
    identities,
    featurePolicies,
    authorityGrants,
    authorityActors,
    authRoles: authRoleRows,
    PlatformConfigSecretSearchVisible: secretSelection.searchVisible,
    PlatformConfigDatasourceSearchVisible: datasourceSelection.searchVisible,
    PlatformConfigSecretSummary: summarizeRows("secrets", secretSelection.totalCount, secretSelection.filteredCount, secretQuery),
    PlatformConfigDatasourceSummary: summarizeRows("datasources", datasourceSelection.totalCount, datasourceSelection.filteredCount, datasourceQuery),
    PlatformConfigAccessRolesHint: rolesHint(authRoleRows),
    ...authoritySummaryPayload(authoritySummary),
    ...authorityGrantEditorPayload({
      identityId: authoritySummary?.authenticatedIdentity?.id ?? identities[0]?.id ?? "",
      targetActor: authoritySummary?.effectiveActor ?? authorityActors[0]?.actor ?? "",
      summary: authorityGrants.length
        ? `Loaded ${pluralize(authorityGrants.length, "assumption grant")}.`
        : "No assumption grants defined yet."
    }),
    ...assumedSessionEditorPayload({
      identityId: authoritySummary?.authenticatedIdentity?.id ?? identities[0]?.id ?? "",
      targetActor: authoritySummary?.authorityMode === "assumed"
        ? authoritySummary?.effectiveActor ?? authorityActors[0]?.actor ?? ""
        : authorityActors[0]?.actor ?? "",
      summary: authoritySummary?.authorityMode === "assumed"
        ? `Currently acting as ${normalizeText(authoritySummary?.effectiveActor, "unknown actor")} via ${normalizeText(authoritySummary?.assumptionGrantId, "direct authority")}.`
        : "Choose a source identity and target actor, then open an assumed session."
    })
  };
}

export async function pipelineSessionOpenResponsePayloadHook({
  world,
  appContext,
  syncedSession,
  session,
  resumeRouteKey
} = {}) {
  const routeKey = normalizeText(resumeRouteKey, "");
  if (!routeKey.startsWith("platform-config")) return null;
  const activeSession = session ?? syncedSession ?? null;
  const effectiveActor = normalizeText(
    syncedSession?.effectiveActor,
    normalizeText(activeSession?.effectiveActor, "")
  );
  return pipelineSnapshotPayload(appContext, world, {
    requestActor: effectiveActor || null,
    requestSession: activeSession
  });
}

export function createPipelineRuntimeHandlers(deps) {
  const {
    world,
    backendHost,
    sendJson,
    readJson,
    sessionStore,
    createSessionForIdentity,
    sessionResponseShape,
    sessionCookieHeader
  } = deps;

  return {
    "pipeline.platform-config.snapshot": async ({ req, res, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const body = await readJson(req);
      const payload = await pipelineSnapshotPayload(appContext, world, {
        secretQuery: normalizeText(body?.secretQuery, ""),
        datasourceQuery: normalizeText(body?.datasourceQuery, ""),
        requestActor,
        requestSession
      });
      sendJson(res, 200, {
        ...payload,
        message: "Platform config snapshot refreshed."
      });
    },

    "pipeline.platform-config.secret.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSecretStoreHandlers, deps, "secret.store.read", {
        req: {},
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status !== 200) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...secretEditorPayload(decorateSecretRow(delegated.body.secret)),
        message: `Loaded secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSecretStoreHandlers, deps, "secret.store.create", {
        req,
        res: {},
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...secretEditorPayload(decorateSecretRow(delegated.body.secret)),
        message: `Saved secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.write": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSecretStoreHandlers, deps, "secret.store.write", {
        req,
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...secretEditorPayload(decorateSecretRow(delegated.body.secret)),
        message: `Updated secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.delete": async ({ res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSecretStoreHandlers, deps, "secret.store.delete", {
        req: {},
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...blankSecretPayload({
          PlatformConfigSecretSummary: "Secret deleted."
        }),
        message: "Deleted secret."
      });
    },

    "pipeline.platform-config.datasource.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSqlDbHandlers, deps, "db.sql.datasource.read", {
        req: {},
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status !== 200) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...datasourceEditorPayload(decorateDatasourceRow(delegated.body.datasource)),
        message: `Loaded datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSqlDbHandlers, deps, "db.sql.datasource.create", {
        req,
        res: {},
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...datasourceEditorPayload(decorateDatasourceRow(delegated.body.datasource)),
        message: `Saved datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.update": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSqlDbHandlers, deps, "db.sql.datasource.update", {
        req,
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...datasourceEditorPayload(decorateDatasourceRow(delegated.body.datasource)),
        message: `Updated datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.delete": async ({ res, params, requestActor, requestSession, appContext }) => {
      const delegated = await delegateJsonHandler(createSqlDbHandlers, deps, "db.sql.datasource.delete", {
        req: {},
        res: {},
        params,
        requestActor,
        appContext
      });
      if (delegated.status >= 400) {
        sendDelegated(sendJson, res, delegated, delegated.body);
        return;
      }
      sendJson(res, delegated.status, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...blankDatasourcePayload({
          PlatformConfigDatasourceSummary: "Datasource deleted."
        }),
        message: "Deleted datasource."
      });
    },

    "pipeline.platform-config.datasource.test": async ({ req, res, requestActor, requestSession, appContext }) => {
      const body = await readJson(req);
      const datasourceId = normalizeDatasourceId(body?.id);
      const existing = datasourceId ? (appContext?.dbSql?.getDatasource?.(datasourceId) ?? null) : null;
      const normalized = normalizeDatasourcePayload({
        ...body,
        id: datasourceId ?? existing?.id ?? "draft_test_connection"
      }, existing);
      const delegated = !normalized.ok
        ? {
            status: normalized.status || 400,
            body: { error: normalized.reason, datasource: existing ?? null }
          }
        : await (async () => {
            const responses = [];
            const handlers = createSqlDbHandlers({
              ...deps,
              readJson: async () => normalized.payload,
              sendJson: (_res, status, body) => responses.push({ status, body })
            });
            await handlers["db.sql.datasource.testDraft"]({
              req: {},
              res: {},
              requestActor,
              appContext
            });
            return responses[0] ?? { status: 500, body: { error: "no response from db.sql.datasource.testDraft" } };
          })();
      const datasource = delegated.body?.datasource
        ?? existing
        ?? normalized.payload
        ?? null;
      const decoratedDatasource = datasource ? decorateDatasourceRow(datasource) : null;
      const basePayload = {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...(decoratedDatasource ? datasourceEditorPayload(decoratedDatasource) : {}),
        PlatformConfigDatasourceSummary: summarizeDatasourceTestResult(delegated, decoratedDatasource)
      };
      if (delegated.status >= 400) {
        sendJson(res, delegated.status, {
          ...basePayload,
          message: delegated.body?.error || "Datasource test failed."
        });
        return;
      }
      sendJson(res, 200, {
        ...basePayload,
        message: `Datasource test succeeded for ${titleForRow(datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.access.identity.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const identityId = normalizeText(params?.id, "");
      const identityIndex = world.project(moduleProjectors.identityIndex);
      const roleGrantIndex = world.project(moduleProjectors.identityRoleGrantIndex);
      const identity = identityIndex?.byId?.[identityId] ?? null;
      if (!identity) {
        sendJson(res, 404, { error: "identity not found" });
        return;
      }
      const decoratedIdentity = decorateIdentityRow({
        ...identity,
        roles: roleGrantIndex?.byIdentity?.[identity.id] ?? []
      });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...accessIdentityEditorPayload(decoratedIdentity),
        message: `Loaded identity ${normalizeText(identity.username, identity.id)}.`
      });
    },

    "pipeline.platform-config.access.identity.update": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const identityId = normalizeText(params?.id, "");
      const body = await readJson(req);
      const identityIndex = world.project(moduleProjectors.identityIndex);
      const roleGrantIndex = world.project(moduleProjectors.identityRoleGrantIndex);
      const authRoleIndex = world.project(moduleProjectors.authRoleIndex);
      const existing = identityIndex?.byId?.[identityId] ?? null;
      if (!existing) {
        sendJson(res, 404, { error: "identity not found" });
        return;
      }
      const requestedRoles = normalizeRoleList(body?.roles, body?.rolesCsv);
      const unknownRoles = requestedRoles.filter(roleId => !authRoleIndex?.byId?.[roleId]);
      if (unknownRoles.length) {
        sendJson(res, 400, { error: `unknown roles: ${unknownRoles.join(", ")}` });
        return;
      }
      updateIdentity(world, {
        actor: requestActor,
        id: existing.id,
        label: existing.label,
        username: existing.username,
        password: existing.password,
        displayName: normalizeText(body?.displayName, existing.displayName ?? existing.label),
        jobTitle: normalizeText(body?.jobTitle, ""),
        initials: normalizeText(body?.initials, ""),
        homeContext: existing.homeContext,
        homePerspective: existing.homePerspective
      });
      const currentRoles = new Set(roleGrantIndex?.byIdentity?.[existing.id] ?? []);
      const nextRoles = new Set(requestedRoles);
      for (const roleId of currentRoles) {
        if (nextRoles.has(roleId)) continue;
        revokeIdentityRole(world, { actor: requestActor, identityId: existing.id, roleId });
      }
      for (const roleId of nextRoles) {
        if (currentRoles.has(roleId)) continue;
        grantIdentityRole(world, { actor: requestActor, identityId: existing.id, roleId });
      }
      const refreshedIdentity = world.project(moduleProjectors.identityIndex)?.byId?.[existing.id] ?? existing;
      const refreshedRoles = world.project(moduleProjectors.identityRoleGrantIndex)?.byIdentity?.[existing.id] ?? requestedRoles;
      const decoratedIdentity = decorateIdentityRow({
        ...refreshedIdentity,
        roles: refreshedRoles
      });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...accessIdentityEditorPayload(decoratedIdentity),
        message: `Updated identity ${normalizeText(refreshedIdentity.username, refreshedIdentity.id)}.`
      });
    },

    "pipeline.platform-config.access.feature.read": async ({ res, params, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const featureId = normalizeText(params?.id, "");
      const policyIndex = world.project(moduleProjectors.appFeatureAccessPolicyIndex);
      const policy = policyIndex?.byFeatureId?.[featureId] ?? null;
      if (!policy) {
        sendJson(res, 404, { error: "feature policy not found" });
        return;
      }
      const decoratedPolicy = decorateFeaturePolicyRow(policy);
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...accessFeatureEditorPayload(decoratedPolicy),
        message: `Loaded feature policy ${normalizeText(policy.label, policy.featureId)}.`
      });
    },

    "pipeline.platform-config.access.feature.update": async ({ req, res, params, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const featureId = normalizeText(params?.id, "");
      const body = await readJson(req);
      const policyIndex = world.project(moduleProjectors.appFeatureAccessPolicyIndex);
      const authRoleIndex = world.project(moduleProjectors.authRoleIndex);
      const existing = policyIndex?.byFeatureId?.[featureId] ?? null;
      if (!existing) {
        sendJson(res, 404, { error: "feature policy not found" });
        return;
      }
      const requestedRoles = normalizeRoleList(body?.allowedRoles, body?.allowedRolesCsv);
      const unknownRoles = requestedRoles.filter(roleId => !authRoleIndex?.byId?.[roleId]);
      if (unknownRoles.length) {
        sendJson(res, 400, { error: `unknown roles: ${unknownRoles.join(", ")}` });
        return;
      }
      setAppFeatureAccessPolicy(world, {
        actor: requestActor,
        featureId: existing.featureId,
        label: existing.label,
        appId: existing.appId,
        requireAuth: existing.requireAuth,
        visibilityMode: normalizeText(body?.visibilityMode, existing.visibilityMode || "normal"),
        allowedRoles: requestedRoles,
        guestBehavior: existing.guestBehavior,
        deniedBehavior: existing.deniedBehavior
      });
      const refreshedPolicy = world.project(moduleProjectors.appFeatureAccessPolicyIndex)?.byFeatureId?.[existing.featureId] ?? existing;
      const decoratedPolicy = decorateFeaturePolicyRow(refreshedPolicy);
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...accessFeatureEditorPayload(decoratedPolicy),
        message: `Updated feature policy ${normalizeText(refreshedPolicy.label, refreshedPolicy.featureId)}.`
      });
    },

    "pipeline.platform-config.access.grant.create": async ({ req, res, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const body = await readJson(req);
      const identityId = normalizeText(body?.identityId, "");
      const targetActor = normalizeText(body?.targetActor, "");
      const identityIndex = world.project(moduleProjectors.identityIndex);
      const existingIdentity = identityIndex?.byId?.[identityId] ?? null;
      if (!existingIdentity) {
        sendJson(res, 400, {
          error: "identity not found",
          message: "Select a valid source identity.",
          grantSummary: "Select a valid source identity before creating a grant."
        });
        return;
      }
      if (!targetActor || !(identityIndex?.byActor?.[targetActor]?.length)) {
        sendJson(res, 400, {
          error: "target actor not found",
          message: "Select a valid target actor.",
          grantSummary: "Select a valid target actor before creating a grant."
        });
        return;
      }
      const existingGrant = identityActorAssumptionGrantHistory(world, { identityId, targetActor }).find(row => row.active);
      if (existingGrant) {
        sendJson(res, 409, {
          error: "active grant already exists",
          message: `Grant ${existingGrant.id} already exists.`,
          grantSummary: `Grant ${existingGrant.id} is already active.`
        });
        return;
      }
      const granted = grantIdentityActorAssumption(world, { actor: requestActor, identityId, targetActor });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...authorityGrantEditorPayload({
          identityId,
          targetActor,
          summary: `Created grant ${granted.body?.id ?? `${identityId}=>${targetActor}`}.`
        }),
        PlatformConfigGrantSelectedId: granted.body?.id ?? `${identityId}=>${targetActor}`,
        message: `Created assumption grant for ${identityId} -> ${targetActor}.`
      });
    },

    "pipeline.platform-config.access.grant.revoke": async ({ res, params, requestActor, requestSession, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const grantId = normalizeText(params?.grantId, "");
      const grant = identityActorAssumptionGrantHistory(world, { grantId })[0] ?? null;
      if (!grant) {
        sendJson(res, 404, {
          error: "grant not found",
          message: "Grant not found.",
          grantSummary: "Select an active grant to revoke."
        });
        return;
      }
      revokeIdentityActorAssumption(world, {
        actor: requestActor,
        identityId: grant.identityId,
        targetActor: grant.targetActor
      });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor, requestSession })),
        ...authorityGrantEditorPayload({
          identityId: grant.identityId,
          targetActor: grant.targetActor,
          summary: `Revoked grant ${grant.id}.`
        }),
        PlatformConfigGrantSelectedId: grant.id,
        message: `Revoked assumption grant ${grant.id}.`
      });
    },

    "pipeline.platform-config.access.session.assume": async ({ req, res, requestActor, requestSession, appContext }) => {
      if (!requestActor || !requestSession) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      if (typeof createSessionForIdentity !== "function" || typeof sessionResponseShape !== "function" || typeof sessionCookieHeader !== "function") {
        sendJson(res, 500, { error: "session switching unavailable" });
        return;
      }
      const body = await readJson(req);
      const identityId = normalizeText(body?.identityId, "");
      const targetActor = normalizeText(body?.targetActor, "");
      const identityIndex = world.project(moduleProjectors.identityIndex);
      const identity = identityIndex?.byId?.[identityId] ?? null;
      if (!identity) {
        sendJson(res, 400, {
          error: "identity not found",
          message: "Select a valid source identity.",
          ...assumedSessionEditorPayload({
            identityId,
            targetActor,
            summary: "Select a valid source identity before opening an assumed session."
          })
        });
        return;
      }
      if (!normalizeText(identity?.password, "")) {
        sendJson(res, 400, {
          error: "identity cannot authenticate",
          message: "Selected identity cannot authenticate through the current session path.",
          ...assumedSessionEditorPayload({
            identityId,
            targetActor,
            summary: "Selected identity cannot authenticate through the current session path."
          })
        });
        return;
      }
      const authority = resolveSessionAuthorityForIdentity(world, identity, { assumeActor: targetActor });
      if (!authority.ok) {
        world.emit({
          process: "session.open.failed",
          actor: identity.actor,
          claims: [],
          body: {
            username: identity.username ?? null,
            assumeActor: targetActor || null,
            reason: authority.reason
          }
        });
        sendJson(res, Number(authority.status || 403), {
          error: authority.reason || "assumption denied",
          message: authority.reason || "assumption denied",
          ...assumedSessionEditorPayload({
            identityId,
            targetActor,
            summary: authority.reason || "assumption denied"
          })
        });
        return;
      }
      const session = createSessionForIdentity({
        ...identity,
        displayName: authority.authenticatedIdentity?.displayName ?? identity.displayName ?? null,
        jobTitle: authority.authenticatedIdentity?.jobTitle ?? identity.jobTitle ?? null,
        initials: authority.authenticatedIdentity?.initials ?? identity.initials ?? null
      }, authority);
      if (requestSession?.id && sessionStore?.delete) sessionStore.delete(requestSession.id);
      const shapedSession = sessionResponseShape(session);
      const routeKey = platformConfigRouteKeyForSession(shapedSession);
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: session.identity ?? null,
          actor: session.actor ?? null,
          authenticatedIdentity: session.authenticatedIdentity ?? null,
          authenticatedActor: session.authenticatedActor ?? null,
          effectiveIdentity: session.effectiveIdentity ?? null,
          effectiveActor: session.effectiveActor ?? null,
          authorityMode: session.authorityMode ?? "direct",
          assumptionGrantId: session.assumptionGrantId ?? null,
          label: session.label ?? identity.label ?? null,
          homeContext: session.homeContext ?? null,
          perspective: session.perspective ?? null,
          resumeRouteKey: routeKey
        }
      });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor: shapedSession.effectiveActor, requestSession: session })),
        ...engentusSessionPayload(shapedSession, { routeKey }),
        ...assumedSessionEditorPayload({
          identityId,
          targetActor,
          summary: `Opened assumed session for ${normalizeText(identity.username, identity.id)} as ${targetActor}.`
        }),
        message: `Assumed session opened for ${normalizeText(identity.username, identity.id)} as ${targetActor}.`
      }, { "set-cookie": sessionCookieHeader(session.id) });
    },

    "pipeline.platform-config.access.session.direct": async ({ res, requestActor, requestSession, appContext }) => {
      if (!requestActor || !requestSession) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      if (typeof createSessionForIdentity !== "function" || typeof sessionResponseShape !== "function" || typeof sessionCookieHeader !== "function") {
        sendJson(res, 500, { error: "session switching unavailable" });
        return;
      }
      const authenticatedIdentityId = normalizeText(requestSession?.authenticatedIdentity, "");
      const identityIndex = world.project(moduleProjectors.identityIndex);
      const identity = identityIndex?.byId?.[authenticatedIdentityId] ?? null;
      if (!identity) {
        sendJson(res, 400, {
          error: "authenticated identity not found",
          message: "Current authenticated identity is unavailable.",
          ...assumedSessionEditorPayload({
            summary: "Current authenticated identity is unavailable."
          })
        });
        return;
      }
      const authority = resolveSessionAuthorityForIdentity(world, identity, { assumeActor: identity.actor });
      if (!authority.ok) {
        sendJson(res, Number(authority.status || 403), {
          error: authority.reason || "direct authority unavailable",
          message: authority.reason || "direct authority unavailable",
          ...assumedSessionEditorPayload({
            identityId: identity.id,
            targetActor: identity.actor,
            summary: authority.reason || "direct authority unavailable"
          })
        });
        return;
      }
      const session = createSessionForIdentity({
        ...identity,
        displayName: authority.authenticatedIdentity?.displayName ?? identity.displayName ?? null,
        jobTitle: authority.authenticatedIdentity?.jobTitle ?? identity.jobTitle ?? null,
        initials: authority.authenticatedIdentity?.initials ?? identity.initials ?? null
      }, authority);
      if (requestSession?.id && sessionStore?.delete) sessionStore.delete(requestSession.id);
      const shapedSession = sessionResponseShape(session);
      const routeKey = platformConfigRouteKeyForSession(shapedSession);
      world.emit({
        process: "session.open",
        actor: identity.actor,
        claims: [
          relation(identity.id, "authenticatedAs", identity.actor),
          ...(identity.homePerspective ? [relation(identity.id, "openedPerspective", identity.homePerspective)] : [])
        ],
        body: {
          identity: session.identity ?? null,
          actor: session.actor ?? null,
          authenticatedIdentity: session.authenticatedIdentity ?? null,
          authenticatedActor: session.authenticatedActor ?? null,
          effectiveIdentity: session.effectiveIdentity ?? null,
          effectiveActor: session.effectiveActor ?? null,
          authorityMode: session.authorityMode ?? "direct",
          assumptionGrantId: session.assumptionGrantId ?? null,
          label: session.label ?? identity.label ?? null,
          homeContext: session.homeContext ?? null,
          perspective: session.perspective ?? null,
          resumeRouteKey: routeKey
        }
      });
      sendJson(res, 200, {
        ...(await pipelineSnapshotPayload(appContext, world, { requestActor: shapedSession.effectiveActor, requestSession: session })),
        ...engentusSessionPayload(shapedSession, { routeKey }),
        ...assumedSessionEditorPayload({
          identityId: identity.id,
          targetActor: shapedSession.effectiveActor ?? identity.actor,
          summary: `Returned to direct session for ${normalizeText(identity.username, identity.id)}.`
        }),
        message: `Returned to direct session for ${normalizeText(identity.username, identity.id)}.`
      }, { "set-cookie": sessionCookieHeader(session.id) });
    },

    "pipeline.script.run": async ({ req, res, requestActor, appContext }) => {
      if (!requestActor) {
        world.observe({
          process: "pipeline.script.run.failed",
          actor: backendHost,
          claims: [],
          body: { reason: "no actor", serverRunner: appContext?.serverRunnerId || "" }
        });
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const body = await readJson(req);
      const scriptName = normalizeScriptName(body?.scriptName);
      const datasourceId = normalizeDatasourceId(body?.datasourceId);
      world.observe({
        process: "pipeline.script.run",
        actor: requestActor,
        claims: [relation(requestActor, "requested", "pipelineScriptStub")],
        body: {
          serverRunner: appContext?.serverRunnerId || "",
          scriptName,
          datasourceId
        }
      });
      sendJson(res, 200, {
        ok: false,
        stub: true,
        status: "not-implemented",
        message: "Script execution is not implemented yet. This endpoint is a demo-app stub.",
        summary: summarizeScriptStub(scriptName, datasourceId),
        request: {
          serverRunner: appContext?.serverRunnerId || "",
          scriptName,
          datasourceId,
          payload: body?.payload ?? {}
        }
      });
    }
  };
}
