import fs from "node:fs/promises";
import path from "node:path";

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function stableJson(value) {
  return JSON.stringify(value ?? null);
}

function parseJson(value, fallback = null) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizePreview(content = "", limit = 400) {
  const text = String(content || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n...`;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function canonicalArtifactIdForTestArtifact(id) {
  const raw = optionalText(id);
  if (!raw) return null;
  if (raw.startsWith("artifact:")) return raw;
  if (raw.startsWith("testArtifact:")) return `artifact:${raw.slice("testArtifact:".length)}`;
  return `artifact:${raw}`;
}

function normalizeArtifactPreview(row = {}) {
  return optionalText(row.preview) ?? normalizePreview(row.content ?? "");
}

function buildCanonicalArtifactRow(row = {}) {
  const id = canonicalArtifactIdForTestArtifact(row.artifactId ?? row.id);
  if (!id) return null;
  return {
    id,
    title: optionalText(row.title) ?? id,
    artifactKind: optionalText(row.artifactKind) ?? "artifact",
    producerKind: optionalText(row.producerKind) ?? "testRun",
    producerId: optionalText(row.producerId) ?? optionalText(row.runId),
    contentType: optionalText(row.contentType) ?? "text/plain",
    sizeBytes: typeof row.sizeBytes === "number" ? row.sizeBytes : null,
    contentRef: optionalText(row.contentRef),
    contentUrl: `/api/platform-artifacts/${encodeURIComponent(id)}/content`,
    preview: normalizeArtifactPreview(row),
    producedAt: row.producedAt ?? null,
    fileName: optionalText(row.fileName),
    sessionId: optionalText(row.sessionId),
    executionId: optionalText(row.executionId),
    branchId: optionalText(row.branchId),
    changeSetId: optionalText(row.changeSetId),
    candidateSnapshotId: optionalText(row.candidateSnapshotId),
    proposalId: optionalText(row.proposalId),
    testRunId: optionalText(row.testRunId) ?? optionalText(row.runId),
    runId: optionalText(row.runId),
    resultId: optionalText(row.resultId),
    gateId: optionalText(row.gateId),
    artifactSourceId: optionalText(row.id)
  };
}

function backendDocsById(appProject = null) {
  const rows = new Map();
  for (const doc of appProject?.allDocs ?? []) {
    if (String(doc?.kind || "") !== "verificationBackend") continue;
    const id = optionalText(doc?.values?.id);
    if (!id) continue;
    rows.set(id, doc.values ?? {});
  }
  return rows;
}

function defaultVerificationRoot(runtimeRoot, operatorContract) {
  return path.resolve(
    operatorContract?.directories?.runtimeRoot
      ?? runtimeRoot
      ?? process.cwd(),
    "verification"
  );
}

function resolveBackendDefinition({
  backendId,
  role,
  appProject,
  verificationRoot
}) {
  const builtins = {
    sqlite: { id: "sqlite", provider: "sqlite" },
    disk: { id: "disk", provider: "disk" }
  };
  const docs = backendDocsById(appProject);
  const declared = backendId ? (docs.get(backendId) ?? builtins[backendId] ?? null) : null;
  const fallback = role === "ledgerBackend"
    ? { id: "sqlite", provider: "sqlite" }
    : { id: "disk", provider: "disk" };
  const resolved = declared ?? fallback;
  const provider = optionalText(resolved.provider ?? resolved.id) ?? fallback.provider;
  const definition = {
    id: optionalText(backendId) ?? fallback.id,
    provider,
    source: declared ? "authored" : "synthesized"
  };
  if (provider === "sqlite") {
    definition.path = path.resolve(verificationRoot, optionalText(resolved.path) ?? "ledger.sqlite");
  } else {
    const subdir = role === "artifactBackend"
      ? "artifacts"
      : (role === "cacheBackend" ? "cache" : "storage");
    definition.root = path.resolve(verificationRoot, optionalText(resolved.root) ?? subdir);
  }
  return definition;
}

export function resolveRuntimeVerificationPersistence({
  serverRunner = null,
  appProject = null,
  runtimeRoot = null,
  runtimeOperatorContract = null,
  runtimeProfile = null
} = {}) {
  const verificationRoot = defaultVerificationRoot(runtimeRoot, runtimeOperatorContract);
  const authored = serverRunner?.values?.verification?.persistence;
  const diagnostics = [];
  const source = authored && typeof authored === "object" ? "authored" : "synthesized";
  const persistence = authored && typeof authored === "object" ? authored : {};
  const ledgerBackend = resolveBackendDefinition({
    backendId: optionalText(persistence.ledgerBackend),
    role: "ledgerBackend",
    appProject,
    verificationRoot
  });
  const artifactBackend = resolveBackendDefinition({
    backendId: optionalText(persistence.artifactBackend),
    role: "artifactBackend",
    appProject,
    verificationRoot
  });
  const cacheBackend = resolveBackendDefinition({
    backendId: optionalText(persistence.cacheBackend),
    role: "cacheBackend",
    appProject,
    verificationRoot
  });
  if (source === "synthesized") {
    diagnostics.push({
      id: `verificationPersistenceDiagnostic:${serverRunner?.id || "runner"}:${runtimeProfile || "profile"}:synthesized`,
      severity: "info",
      code: "verification_persistence_synthesized",
      message: "Verification persistence was synthesized because serverRunner.verification.persistence is not authored."
    });
  }
  return {
    source,
    verificationRoot,
    runtimeProfile: optionalText(runtimeProfile),
    serverRunnerId: optionalText(serverRunner?.id),
    ledgerBackend,
    artifactBackend,
    cacheBackend,
    retention: persistence.retention && typeof persistence.retention === "object" ? { ...persistence.retention } : null,
    diagnostics
  };
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function loadDatabaseSync(loadSqliteModule = () => import("node:sqlite")) {
  try {
    const sqliteModule = await loadSqliteModule();
    if (typeof sqliteModule?.DatabaseSync !== "function") {
      throw new Error("node:sqlite did not export DatabaseSync");
    }
    return sqliteModule.DatabaseSync;
  } catch (error) {
    const wrapped = new Error(`node:sqlite unavailable: ${error instanceof Error ? error.message : String(error)}`);
    wrapped.code = "SQLITE_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

function createEmptyLedgerState() {
  return {
    verificationPolicies: {},
    verificationFreshness: {},
    verificationInvalidations: {},
    verificationQueue: {},
    verificationExecutions: {},
    testRuns: {},
    testResults: {},
    artifacts: {},
    testArtifacts: {},
    testSuites: {},
    testCases: {},
    testReports: {},
    cacheEntries: {}
  };
}

function cloneRow(row = null) {
  return parseJson(stableJson(row), row);
}

function upsertStateRow(state, bucket, id, row) {
  if (!id) return;
  state[bucket][String(id)] = cloneRow(row);
}

function rowsFromStateBucket(state, bucket) {
  return Object.values(state?.[bucket] ?? {}).map(row => cloneRow(row)).filter(Boolean);
}

async function createJsonFallbackVerificationPersistence({
  resolved,
  sqliteError
}) {
  const ledgerPath = path.join(resolved.verificationRoot, "ledger.json");
  let state = createEmptyLedgerState();
  try {
    const loaded = parseJson(await fs.readFile(ledgerPath, "utf8"), null);
    if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
      state = { ...createEmptyLedgerState(), ...loaded };
    }
  } catch {}

  const inspectResolved = {
    ...resolved,
    ledgerBackend: {
      ...resolved.ledgerBackend,
      runtimeProvider: "json-fallback",
      adapterStatus: "fallback",
      path: ledgerPath
    },
    diagnostics: [
      ...resolved.diagnostics,
      {
        id: `verificationPersistenceDiagnostic:${resolved.serverRunnerId || "runner"}:${resolved.runtimeProfile || "profile"}:sqlite_unavailable`,
        severity: "warning",
        code: "verification_persistence_sqlite_unavailable",
        message: `Verification persistence is using a JSON fallback because node:sqlite is unavailable. (${sqliteError instanceof Error ? sqliteError.message : String(sqliteError)})`
      }
    ]
  };

  const artifactFilePathFor = artifactId => path.join(
    resolved.artifactBackend.root,
    encodeURIComponent(String(artifactId || "")),
    "blob"
  );

  const cacheFilePathFor = cacheKey => path.join(
    resolved.cacheBackend.root,
    `${encodeURIComponent(String(cacheKey || ""))}.json`
  );

  async function persistLedger() {
    await fs.writeFile(ledgerPath, stableJson(state), "utf8");
  }

  async function persistArtifactRow(row) {
    const content = optionalText(row?.content);
    const canonicalArtifactId = canonicalArtifactIdForTestArtifact(row?.artifactId ?? row?.id);
    if (content == null) {
      const canonicalRow = buildCanonicalArtifactRow(row);
      if (canonicalRow?.id) upsertStateRow(state, "artifacts", canonicalRow.id, canonicalRow);
      const testArtifactRow = {
        ...row,
        artifactId: canonicalArtifactId ?? row?.artifactId ?? null
      };
      upsertStateRow(state, "testArtifacts", row?.id, testArtifactRow);
      return;
    }
    const contentKey = canonicalArtifactId ?? String(row.id);
    const artifactPath = artifactFilePathFor(contentKey);
    await ensureDirectory(path.dirname(artifactPath));
    await fs.writeFile(artifactPath, content, "utf8");
    const canonicalRow = buildCanonicalArtifactRow({
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      contentRef: artifactPath,
      preview: normalizePreview(content)
    });
    const durableRow = {
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      content: undefined,
      contentRef: artifactPath,
      contentUrl: `/api/platform-test-artifacts/${encodeURIComponent(String(row.id))}/content`,
      preview: normalizePreview(content)
    };
    if (canonicalRow?.id) upsertStateRow(state, "artifacts", canonicalRow.id, canonicalRow);
    upsertStateRow(state, "testArtifacts", row?.id, durableRow);
  }

  return {
    resolved: inspectResolved,
    inspect() {
      return {
        source: inspectResolved.source,
        verificationRoot: inspectResolved.verificationRoot,
        ledgerBackend: { ...inspectResolved.ledgerBackend },
        artifactBackend: { ...inspectResolved.artifactBackend },
        cacheBackend: { ...inspectResolved.cacheBackend },
        retention: inspectResolved.retention ? { ...inspectResolved.retention } : null,
        diagnostics: inspectResolved.diagnostics.map(row => ({ ...row }))
      };
    },
    async recordPolicyRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertStateRow(state, "verificationPolicies", row.id, row);
      }
      await persistLedger();
    },
    async recordFreshnessRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertStateRow(state, "verificationFreshness", row.id, row);
      }
      await persistLedger();
    },
    async recordInvalidationRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertStateRow(state, "verificationInvalidations", row.id, row);
      }
      await persistLedger();
    },
    async recordQueueRow(row = null) {
      if (!row?.id) return;
      upsertStateRow(state, "verificationQueue", row.id, row);
      await persistLedger();
    },
    async recordExecutionRow(row = null) {
      if (!row?.id) return;
      upsertStateRow(state, "verificationExecutions", row.id, row);
      await persistLedger();
    },
    async persistTestRunBundle(bundle = {}) {
      const testRun = bundle.testRun ?? null;
      if (testRun?.id) upsertStateRow(state, "testRuns", testRun.id, testRun);
      for (const row of ensureArray(bundle.testResults)) {
        if (!row?.id) continue;
        upsertStateRow(state, "testResults", row.id, row);
        const cacheKey = optionalText(row?.cacheIdentity?.cacheKey);
        if (cacheKey && String(row.status || "") === "passed") {
          const cacheRow = {
            cacheKey,
            gateId: row.gateId ?? null,
            runId: row.runId ?? null,
            resultId: row.id,
            producedAt: row.producedAt ?? null,
            latestResult: row,
            testRun,
            regressionSummary: bundle.regressionSummary ?? null,
            testReports: ensureArray(bundle.testReports)
          };
          upsertStateRow(state, "cacheEntries", cacheKey, cacheRow);
          const cachePath = cacheFilePathFor(cacheKey);
          await ensureDirectory(path.dirname(cachePath));
          await fs.writeFile(cachePath, stableJson(cacheRow), "utf8");
        }
      }
      for (const row of ensureArray(bundle.testArtifacts)) {
        if (!row?.id) continue;
        await persistArtifactRow(row);
      }
      for (const row of ensureArray(bundle.testSuites)) {
        if (!row?.id) continue;
        upsertStateRow(state, "testSuites", row.id, row);
      }
      for (const row of ensureArray(bundle.testCases)) {
        if (!row?.id) continue;
        upsertStateRow(state, "testCases", row.id, row);
      }
      for (const row of ensureArray(bundle.testReports)) {
        if (!row?.id) continue;
        upsertStateRow(state, "testReports", row.id, row);
      }
      await persistLedger();
    },
    readModelRows() {
      return {
        verificationPolicies: rowsFromStateBucket(state, "verificationPolicies"),
        verificationFreshness: rowsFromStateBucket(state, "verificationFreshness"),
        verificationInvalidations: rowsFromStateBucket(state, "verificationInvalidations"),
        verificationQueue: rowsFromStateBucket(state, "verificationQueue"),
        verificationExecutions: rowsFromStateBucket(state, "verificationExecutions"),
        testRuns: rowsFromStateBucket(state, "testRuns"),
        testResults: rowsFromStateBucket(state, "testResults"),
        artifacts: rowsFromStateBucket(state, "artifacts"),
        testArtifacts: rowsFromStateBucket(state, "testArtifacts"),
        testSuites: rowsFromStateBucket(state, "testSuites"),
        testCases: rowsFromStateBucket(state, "testCases"),
        testReports: rowsFromStateBucket(state, "testReports")
      };
    },
    async findReusablePassedResult(cacheKey) {
      return cloneRow(state.cacheEntries?.[String(cacheKey || "")]?.latestResult ?? null);
    },
    async readArtifactContent(artifactId, { compatibility = "canonical" } = {}) {
      const canonicalRows = rowsFromStateBucket(state, "artifacts");
      const testArtifactRows = rowsFromStateBucket(state, "testArtifacts");
      const requestedId = String(artifactId || "");
      const artifact = compatibility === "testArtifact"
        ? (
          testArtifactRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.artifactId || "") === requestedId)
          ?? null
        )
        : (
          canonicalRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.artifactId || "") === requestedId)
          ?? (requestedId.startsWith("artifact:")
            ? testArtifactRows.find(row => canonicalArtifactIdForTestArtifact(row?.id) === requestedId)
            : null)
        );
      if (!artifact?.contentRef) return { ok: false, status: 404, error: "artifact content not found" };
      try {
        const content = await fs.readFile(String(artifact.contentRef), "utf8");
        return {
          ok: true,
          status: 200,
          artifact,
          content,
          contentType: artifact.contentType ? String(artifact.contentType) : "text/plain"
        };
      } catch {
        return { ok: false, status: 404, error: "artifact content not found" };
      }
    },
    close() {}
  };
}

function upsertStatement(database, table, idColumn = "id") {
  return database.prepare(`
    insert into ${table} (${idColumn}, row_json)
    values (?, ?)
    on conflict(${idColumn}) do update set row_json = excluded.row_json
  `);
}

function readRowsStatement(database, table) {
  return database.prepare(`select row_json from ${table}`);
}

function setupDatabase(database) {
  database.exec(`
    create table if not exists verification_policies (
      id text primary key,
      row_json text not null
    );
    create table if not exists verification_freshness (
      id text primary key,
      row_json text not null
    );
    create table if not exists verification_invalidations (
      id text primary key,
      row_json text not null
    );
    create table if not exists verification_queue (
      id text primary key,
      row_json text not null
    );
    create table if not exists verification_executions (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_runs (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_results (
      id text primary key,
      row_json text not null
    );
    create table if not exists artifacts (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_artifacts (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_suites (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_cases (
      id text primary key,
      row_json text not null
    );
    create table if not exists test_reports (
      id text primary key,
      row_json text not null
    );
    create table if not exists cache_entries (
      cache_key text primary key,
      row_json text not null
    );
  `);
}

export async function createRuntimeVerificationPersistence({
  serverRunner = null,
  appProject = null,
  runtimeRoot = null,
  runtimeOperatorContract = null,
  runtimeProfile = null,
  loadSqliteModule = () => import("node:sqlite")
} = {}) {
  const resolved = resolveRuntimeVerificationPersistence({
    serverRunner,
    appProject,
    runtimeRoot,
    runtimeOperatorContract,
    runtimeProfile
  });

  await ensureDirectory(resolved.verificationRoot);
  if (resolved.artifactBackend.root) await ensureDirectory(resolved.artifactBackend.root);
  if (resolved.cacheBackend.root) await ensureDirectory(resolved.cacheBackend.root);
  let DatabaseSync = null;
  try {
    DatabaseSync = await loadDatabaseSync(loadSqliteModule);
  } catch (error) {
    return createJsonFallbackVerificationPersistence({
      resolved,
      sqliteError: error
    });
  }
  await ensureDirectory(path.dirname(resolved.ledgerBackend.path));
  const database = new DatabaseSync(resolved.ledgerBackend.path);
  setupDatabase(database);

  const upsertPolicies = upsertStatement(database, "verification_policies");
  const upsertFreshness = upsertStatement(database, "verification_freshness");
  const upsertInvalidations = upsertStatement(database, "verification_invalidations");
  const upsertQueue = upsertStatement(database, "verification_queue");
  const upsertExecutions = upsertStatement(database, "verification_executions");
  const upsertRuns = upsertStatement(database, "test_runs");
  const upsertResults = upsertStatement(database, "test_results");
  const upsertCanonicalArtifacts = upsertStatement(database, "artifacts");
  const upsertArtifacts = upsertStatement(database, "test_artifacts");
  const upsertSuites = upsertStatement(database, "test_suites");
  const upsertCases = upsertStatement(database, "test_cases");
  const upsertReports = upsertStatement(database, "test_reports");
  const upsertCacheEntries = upsertStatement(database, "cache_entries", "cache_key");
  const readPolicyRows = readRowsStatement(database, "verification_policies");
  const readFreshnessRows = readRowsStatement(database, "verification_freshness");
  const readInvalidationRows = readRowsStatement(database, "verification_invalidations");
  const readQueueRows = readRowsStatement(database, "verification_queue");
  const readExecutionRows = readRowsStatement(database, "verification_executions");
  const readRunRows = readRowsStatement(database, "test_runs");
  const readResultRows = readRowsStatement(database, "test_results");
  const readCanonicalArtifactRows = readRowsStatement(database, "artifacts");
  const readArtifactRows = readRowsStatement(database, "test_artifacts");
  const readSuiteRows = readRowsStatement(database, "test_suites");
  const readCaseRows = readRowsStatement(database, "test_cases");
  const readReportRows = readRowsStatement(database, "test_reports");
  const lookupCacheEntry = database.prepare("select row_json from cache_entries where cache_key = ?");

  const artifactFilePathFor = artifactId => path.join(
    resolved.artifactBackend.root,
    encodeURIComponent(String(artifactId || "")),
    "blob"
  );

  const cacheFilePathFor = cacheKey => path.join(
    resolved.cacheBackend.root,
    `${encodeURIComponent(String(cacheKey || ""))}.json`
  );

  async function persistArtifactRow(row) {
    const content = optionalText(row?.content);
    const canonicalArtifactId = canonicalArtifactIdForTestArtifact(row?.artifactId ?? row?.id);
    if (content == null) {
      const canonicalRow = buildCanonicalArtifactRow(row);
      if (canonicalRow?.id) upsertCanonicalArtifacts.run(String(canonicalRow.id), stableJson(canonicalRow));
      upsertArtifacts.run(String(row.id), stableJson({
        ...row,
        artifactId: canonicalArtifactId ?? row?.artifactId ?? null
      }));
      return {
        artifact: canonicalRow,
        testArtifact: {
          ...row,
          artifactId: canonicalArtifactId ?? row?.artifactId ?? null
        }
      };
    }
    const contentKey = canonicalArtifactId ?? String(row.id);
    const artifactPath = artifactFilePathFor(contentKey);
    await ensureDirectory(path.dirname(artifactPath));
    await fs.writeFile(artifactPath, content, "utf8");
    const canonicalRow = buildCanonicalArtifactRow({
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      contentRef: artifactPath,
      preview: normalizePreview(content)
    });
    const durableRow = {
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      content: undefined,
      contentRef: artifactPath,
      contentUrl: `/api/platform-test-artifacts/${encodeURIComponent(String(row.id))}/content`,
      preview: normalizePreview(content)
    };
    if (canonicalRow?.id) upsertCanonicalArtifacts.run(String(canonicalRow.id), stableJson(canonicalRow));
    upsertArtifacts.run(String(row.id), stableJson(durableRow));
    return {
      artifact: canonicalRow,
      testArtifact: durableRow
    };
  }

  function rowsFrom(statement) {
    return statement.all().map(row => parseJson(row.row_json, null)).filter(Boolean);
  }

  return {
    resolved,
    inspect() {
      return {
        source: resolved.source,
        verificationRoot: resolved.verificationRoot,
        ledgerBackend: { ...resolved.ledgerBackend },
        artifactBackend: { ...resolved.artifactBackend },
        cacheBackend: { ...resolved.cacheBackend },
        retention: resolved.retention ? { ...resolved.retention } : null,
        diagnostics: resolved.diagnostics.map(row => ({ ...row }))
      };
    },
    async recordPolicyRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertPolicies.run(String(row.id), stableJson(row));
      }
    },
    async recordFreshnessRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertFreshness.run(String(row.id), stableJson(row));
      }
    },
    async recordInvalidationRows(rows = []) {
      for (const row of ensureArray(rows)) {
        if (!row?.id) continue;
        upsertInvalidations.run(String(row.id), stableJson(row));
      }
    },
    async recordQueueRow(row = null) {
      if (!row?.id) return;
      upsertQueue.run(String(row.id), stableJson(row));
    },
    async recordExecutionRow(row = null) {
      if (!row?.id) return;
      upsertExecutions.run(String(row.id), stableJson(row));
    },
    async persistTestRunBundle(bundle = {}) {
      const testRun = bundle.testRun ?? null;
      if (testRun?.id) upsertRuns.run(String(testRun.id), stableJson(testRun));
      for (const row of ensureArray(bundle.testResults)) {
        if (!row?.id) continue;
        upsertResults.run(String(row.id), stableJson(row));
        const cacheKey = optionalText(row?.cacheIdentity?.cacheKey);
        if (cacheKey && String(row.status || "") === "passed") {
          const cacheRow = {
            cacheKey,
            gateId: row.gateId ?? null,
            runId: row.runId ?? null,
            resultId: row.id,
            producedAt: row.producedAt ?? null,
            latestResult: row,
            testRun,
            regressionSummary: bundle.regressionSummary ?? null,
            testReports: ensureArray(bundle.testReports)
          };
          upsertCacheEntries.run(cacheKey, stableJson(cacheRow));
          const cachePath = cacheFilePathFor(cacheKey);
          await ensureDirectory(path.dirname(cachePath));
          await fs.writeFile(cachePath, stableJson(cacheRow), "utf8");
        }
      }
      for (const row of ensureArray(bundle.testArtifacts)) {
        if (!row?.id) continue;
        await persistArtifactRow(row);
      }
      for (const row of ensureArray(bundle.testSuites)) {
        if (!row?.id) continue;
        upsertSuites.run(String(row.id), stableJson(row));
      }
      for (const row of ensureArray(bundle.testCases)) {
        if (!row?.id) continue;
        upsertCases.run(String(row.id), stableJson(row));
      }
      for (const row of ensureArray(bundle.testReports)) {
        if (!row?.id) continue;
        upsertReports.run(String(row.id), stableJson(row));
      }
    },
    readModelRows() {
      return {
        verificationPolicies: rowsFrom(readPolicyRows),
        verificationFreshness: rowsFrom(readFreshnessRows),
        verificationInvalidations: rowsFrom(readInvalidationRows),
        verificationQueue: rowsFrom(readQueueRows),
        verificationExecutions: rowsFrom(readExecutionRows),
        testRuns: rowsFrom(readRunRows),
        testResults: rowsFrom(readResultRows),
        artifacts: (() => {
          const canonicalRows = rowsFrom(readCanonicalArtifactRows);
          if (canonicalRows.length) return canonicalRows;
          return rowsFrom(readArtifactRows)
            .map(row => buildCanonicalArtifactRow(row))
            .filter(Boolean);
        })(),
        testArtifacts: rowsFrom(readArtifactRows),
        testSuites: rowsFrom(readSuiteRows),
        testCases: rowsFrom(readCaseRows),
        testReports: rowsFrom(readReportRows)
      };
    },
    async findReusablePassedResult(cacheKey) {
      const json = lookupCacheEntry.get(String(cacheKey || ""))?.row_json ?? null;
      const row = parseJson(json, null);
      return row?.latestResult ?? null;
    },
    async readArtifactContent(artifactId, { compatibility = "canonical" } = {}) {
      const canonicalRows = rowsFrom(readCanonicalArtifactRows);
      const testArtifactRows = rowsFrom(readArtifactRows);
      const requestedId = String(artifactId || "");
      const artifact = compatibility === "testArtifact"
        ? (
          testArtifactRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.artifactId || "") === requestedId)
          ?? null
        )
        : (
          canonicalRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.id || "") === requestedId)
          ?? testArtifactRows.find(row => String(row?.artifactId || "") === requestedId)
          ?? (requestedId.startsWith("artifact:")
            ? testArtifactRows.find(row => canonicalArtifactIdForTestArtifact(row?.id) === requestedId)
            : null)
        );
      if (!artifact?.contentRef) return { ok: false, status: 404, error: "artifact content not found" };
      try {
        const content = await fs.readFile(String(artifact.contentRef), "utf8");
        return {
          ok: true,
          status: 200,
          artifact,
          content,
          contentType: artifact.contentType ? String(artifact.contentType) : "text/plain"
        };
      } catch {
        return { ok: false, status: 404, error: "artifact content not found" };
      }
    },
    close() {
      try {
        database.close();
      } catch {}
    }
  };
}
