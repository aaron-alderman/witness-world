import { relation } from "../../src/kernel.js";
import { createSecretStoreHandlers } from "../secret/handlers.js";
import { createSqlDbHandlers } from "../sql/handlers.js";

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

function titleForRow(row, fallback = "") {
  return normalizeText(row?.title, normalizeText(row?.label, normalizeText(row?.datasourceName, normalizeText(row?.id, fallback))));
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
  const filtered = rows.filter(row => matchesQuery(row, query));
  const searchVisible = rows.length > SELECT_SLOT_LIMIT;
  const limited = searchVisible && !query
    ? filtered.slice(0, SELECT_SLOT_LIMIT)
    : filtered.slice(0, searchVisible ? SELECT_SLOT_LIMIT : filtered.length);
  return {
    rows: limited.map(row => ({
      ...row,
      title: titleForRow(row)
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
    PlatformConfigSecretSummary: JSON.stringify(secret ?? {}, null, 2),
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
    PlatformConfigDatasourceSummary: JSON.stringify(datasource ?? {}, null, 2),
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

async function pipelineSnapshotPayload(appContext, {
  secretQuery = "",
  datasourceQuery = ""
} = {}) {
  const secrets = await (appContext?.secretStore?.listMetadata?.() ?? []);
  const datasources = appContext?.dbSql?.listDatasources?.() ?? [];
  const secretSelection = filterCollectionRows(secrets, normalizeQuery(secretQuery));
  const datasourceSelection = filterCollectionRows(datasources, normalizeQuery(datasourceQuery));
  return {
    secrets: secretSelection.rows,
    datasources: datasourceSelection.rows,
    PlatformConfigSecretSearchVisible: secretSelection.searchVisible,
    PlatformConfigDatasourceSearchVisible: datasourceSelection.searchVisible,
    PlatformConfigSecretSummary: summarizeRows("secrets", secretSelection.totalCount, secretSelection.filteredCount, secretQuery),
    PlatformConfigDatasourceSummary: summarizeRows("datasources", datasourceSelection.totalCount, datasourceSelection.filteredCount, datasourceQuery)
  };
}

export function createPipelineRuntimeHandlers(deps) {
  const {
    world,
    backendHost,
    sendJson,
    readJson
  } = deps;

  return {
    "pipeline.platform-config.snapshot": async ({ req, res, requestActor, appContext }) => {
      if (!requestActor) {
        sendJson(res, 401, { error: "sign in first" });
        return;
      }
      const body = await readJson(req);
      const payload = await pipelineSnapshotPayload(appContext, {
        secretQuery: normalizeText(body?.secretQuery, ""),
        datasourceQuery: normalizeText(body?.datasourceQuery, "")
      });
      sendJson(res, 200, {
        ...payload,
        message: "Platform config snapshot refreshed."
      });
    },

    "pipeline.platform-config.secret.read": async ({ res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...secretEditorPayload(delegated.body.secret),
        message: `Loaded secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.create": async ({ req, res, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...secretEditorPayload(delegated.body.secret),
        message: `Saved secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.write": async ({ req, res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...secretEditorPayload(delegated.body.secret),
        message: `Updated secret ${titleForRow(delegated.body.secret, "secret")}.`
      });
    },

    "pipeline.platform-config.secret.delete": async ({ res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...blankSecretPayload({
          PlatformConfigSecretSummary: "Secret deleted."
        }),
        message: "Deleted secret."
      });
    },

    "pipeline.platform-config.datasource.read": async ({ res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...datasourceEditorPayload(delegated.body.datasource),
        message: `Loaded datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.create": async ({ req, res, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...datasourceEditorPayload(delegated.body.datasource),
        message: `Saved datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.update": async ({ req, res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...datasourceEditorPayload(delegated.body.datasource),
        message: `Updated datasource ${titleForRow(delegated.body.datasource, "datasource")}.`
      });
    },

    "pipeline.platform-config.datasource.delete": async ({ res, params, requestActor, appContext }) => {
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
        ...(await pipelineSnapshotPayload(appContext)),
        ...blankDatasourcePayload({
          PlatformConfigDatasourceSummary: "Datasource deleted."
        }),
        message: "Deleted datasource."
      });
    },

    "pipeline.platform-config.datasource.test": async ({ res, params, requestActor, appContext }) => {
      const delegated = await delegateJsonHandler(createSqlDbHandlers, deps, "db.sql.datasource.test", {
        req: {},
        res: {},
        params,
        requestActor,
        appContext
      });
      const datasource = delegated.body?.datasource
        ?? appContext?.dbSql?.getDatasource?.(normalizeDatasourceId(params?.id) || "") ?? null;
      const basePayload = {
        ...(await pipelineSnapshotPayload(appContext)),
        ...(datasource ? datasourceEditorPayload(datasource) : {}),
        PlatformConfigDatasourceSummary: JSON.stringify(delegated.body ?? {}, null, 2)
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
