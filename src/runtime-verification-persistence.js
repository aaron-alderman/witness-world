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

function artifactFilePathForRoot(artifactRoot, artifactId) {
  return path.join(
    artifactRoot,
    encodeURIComponent(String(artifactId || "")),
    "blob"
  );
}

function cacheFilePathForRoot(cacheRoot, cacheKey) {
  return path.join(
    cacheRoot,
    `${encodeURIComponent(String(cacheKey || ""))}.json`
  );
}

function upsertRowsInState(state, bucket, rows = []) {
  for (const row of ensureArray(rows)) {
    if (!row?.id) continue;
    upsertStateRow(state, bucket, row.id, row);
  }
}

function readModelRowsFromState(state) {
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
}

function buildRemoteVerificationPersistenceInspect(resolved) {
  return {
    ...resolved,
    ledgerBackend: {
      ...resolved.ledgerBackend,
      runtimeProvider: "witness-core",
      adapterStatus: "remote"
    },
    artifactBackend: {
      ...resolved.artifactBackend,
      runtimeProvider: "witness-core",
      adapterStatus: "remote"
    },
    cacheBackend: {
      ...resolved.cacheBackend,
      runtimeProvider: "witness-core",
      adapterStatus: "remote"
    },
    diagnostics: [
      ...ensureArray(resolved.diagnostics),
      {
        id: `verificationPersistenceDiagnostic:${resolved.serverRunnerId || "runner"}:${resolved.runtimeProfile || "profile"}:witness_core`,
        severity: "info",
        code: "verification_persistence_witness_core",
        message: "Verification persistence is mediated through witness-core."
      }
    ]
  };
}

function createWitnessCoreVerificationPersistenceError(message, {
  status = 500,
  code = null,
  details = null
} = {}) {
  const error = new Error(message);
  error.status = Number(status || 500);
  if (code) error.code = String(code);
  if (details && typeof details === "object") Object.assign(error, details);
  return error;
}

async function witnessCoreVerificationPersistenceRequest({
  coreUrl,
  fetchImpl,
  body
}) {
  let response;
  try {
    response = await fetchImpl(`${coreUrl}/verification-persistence`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    throw createWitnessCoreVerificationPersistenceError("witness core unavailable", {
      status: 503,
      code: "WITNESS_CORE_UNAVAILABLE",
      details: {
        cause: error instanceof Error ? error.message : String(error)
      }
    });
  }
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response?.ok) {
    throw createWitnessCoreVerificationPersistenceError(
      `witness core verification persistence request failed (${response?.status || "unknown"})`,
      {
        status: response?.status || 500,
        code: typeof payload?.code === "string" ? payload.code : null,
        details: payload && typeof payload === "object" ? payload : null
      }
    );
  }
  return payload;
}

function createRemotePersistenceBundle(bundle = {}, resolved) {
  const artifactRoot = resolved.artifactBackend.root;
  const cacheRoot = resolved.cacheBackend.root;
  const testRun = bundle.testRun ?? null;
  const testResults = ensureArray(bundle.testResults).map(row => cloneRow(row));
  const testSuites = ensureArray(bundle.testSuites).map(row => cloneRow(row));
  const testCases = ensureArray(bundle.testCases).map(row => cloneRow(row));
  const testReports = ensureArray(bundle.testReports).map(row => cloneRow(row));
  const canonicalArtifacts = [];
  const durableTestArtifacts = [];
  const artifactContents = [];
  for (const row of ensureArray(bundle.testArtifacts)) {
    if (!row?.id) continue;
    const canonicalArtifactId = canonicalArtifactIdForTestArtifact(row.artifactId ?? row.id);
    const content = optionalText(row.content);
    const contentRef = artifactFilePathForRoot(artifactRoot, canonicalArtifactId ?? row.id);
    const canonicalRow = buildCanonicalArtifactRow({
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      contentRef: contentRef,
      preview: normalizePreview(content ?? row.preview ?? "")
    });
    const durableRow = {
      ...row,
      artifactId: canonicalArtifactId ?? row?.artifactId ?? null,
      content: undefined,
      contentRef,
      contentUrl: `/api/platform-test-artifacts/${encodeURIComponent(String(row.id))}/content`,
      preview: normalizePreview(content ?? row.preview ?? "")
    };
    if (canonicalRow?.id) canonicalArtifacts.push(canonicalRow);
    durableTestArtifacts.push(durableRow);
    if (content != null) {
      artifactContents.push({
        artifactId: canonicalArtifactId ?? String(row.id),
        contentRef,
        content,
        contentType: optionalText(row.contentType) ?? "text/plain"
      });
    }
  }
  const cacheEntries = [];
  const cacheFiles = [];
  for (const row of testResults) {
    const cacheKey = optionalText(row?.cacheIdentity?.cacheKey);
    if (!cacheKey || String(row.status || "") !== "passed") continue;
    const cacheRow = {
      cacheKey,
      gateId: row.gateId ?? null,
      runId: row.runId ?? null,
      resultId: row.id,
      producedAt: row.producedAt ?? null,
      latestResult: row,
      testRun,
      regressionSummary: bundle.regressionSummary ?? null,
      testReports
    };
    cacheEntries.push(cacheRow);
    cacheFiles.push({
      cacheKey,
      cachePath: cacheFilePathForRoot(cacheRoot, cacheKey),
      contentJson: stableJson(cacheRow)
    });
  }
  return {
    testRun: cloneRow(testRun),
    testResults,
    testArtifacts: durableTestArtifacts,
    artifacts: canonicalArtifacts,
    artifactContents,
    testSuites,
    testCases,
    testReports,
    cacheEntries,
    cacheFiles
  };
}

async function createWitnessCoreVerificationPersistence({
  resolved,
  witnessCoreBridge,
  fetchImpl = globalThis.fetch
} = {}) {
  const coreUrl = optionalText(witnessCoreBridge?.coreUrl);
  if (!coreUrl || typeof fetchImpl !== "function") {
    throw createWitnessCoreVerificationPersistenceError("witness core verification persistence unavailable", {
      status: 503,
      code: "WITNESS_CORE_UNAVAILABLE"
    });
  }
  const inspectResolved = buildRemoteVerificationPersistenceInspect(resolved);
  const state = createEmptyLedgerState();
  const initialRows = await witnessCoreVerificationPersistenceRequest({
    coreUrl,
    fetchImpl,
    body: {
      operation: "readModelRows",
      verificationRoot: resolved.verificationRoot,
      artifactRoot: resolved.artifactBackend.root,
      cacheRoot: resolved.cacheBackend.root
    }
  });
  upsertRowsInState(state, "verificationPolicies", initialRows?.verificationPolicies);
  upsertRowsInState(state, "verificationFreshness", initialRows?.verificationFreshness);
  upsertRowsInState(state, "verificationInvalidations", initialRows?.verificationInvalidations);
  upsertRowsInState(state, "verificationQueue", initialRows?.verificationQueue);
  upsertRowsInState(state, "verificationExecutions", initialRows?.verificationExecutions);
  upsertRowsInState(state, "testRuns", initialRows?.testRuns);
  upsertRowsInState(state, "testResults", initialRows?.testResults);
  upsertRowsInState(state, "artifacts", initialRows?.artifacts);
  upsertRowsInState(state, "testArtifacts", initialRows?.testArtifacts);
  upsertRowsInState(state, "testSuites", initialRows?.testSuites);
  upsertRowsInState(state, "testCases", initialRows?.testCases);
  upsertRowsInState(state, "testReports", initialRows?.testReports);

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
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "recordPolicyRows",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          rows: ensureArray(rows)
        }
      });
      upsertRowsInState(state, "verificationPolicies", rows);
    },
    async recordFreshnessRows(rows = []) {
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "recordFreshnessRows",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          rows: ensureArray(rows)
        }
      });
      upsertRowsInState(state, "verificationFreshness", rows);
    },
    async recordInvalidationRows(rows = []) {
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "recordInvalidationRows",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          rows: ensureArray(rows)
        }
      });
      upsertRowsInState(state, "verificationInvalidations", rows);
    },
    async recordQueueRow(row = null) {
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "recordQueueRow",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          row
        }
      });
      upsertRowsInState(state, "verificationQueue", row ? [row] : []);
    },
    async recordExecutionRow(row = null) {
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "recordExecutionRow",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          row
        }
      });
      upsertRowsInState(state, "verificationExecutions", row ? [row] : []);
    },
    async persistTestRunBundle(bundle = {}) {
      const durableBundle = createRemotePersistenceBundle(bundle, resolved);
      await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "persistTestRunBundle",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          ...durableBundle
        }
      });
      upsertRowsInState(state, "testRuns", durableBundle.testRun ? [durableBundle.testRun] : []);
      upsertRowsInState(state, "testResults", durableBundle.testResults);
      upsertRowsInState(state, "artifacts", durableBundle.artifacts);
      upsertRowsInState(state, "testArtifacts", durableBundle.testArtifacts);
      upsertRowsInState(state, "testSuites", durableBundle.testSuites);
      upsertRowsInState(state, "testCases", durableBundle.testCases);
      upsertRowsInState(state, "testReports", durableBundle.testReports);
    },
    readModelRows() {
      return readModelRowsFromState(state);
    },
    async findReusablePassedResult(cacheKey) {
      const payload = await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "findReusablePassedResult",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          cacheKey: optionalText(cacheKey)
        }
      });
      return cloneRow(payload?.latestResult ?? null);
    },
    async readArtifactContent(artifactId, { compatibility = "canonical" } = {}) {
      return await witnessCoreVerificationPersistenceRequest({
        coreUrl,
        fetchImpl,
        body: {
          operation: "readArtifactContent",
          verificationRoot: resolved.verificationRoot,
          artifactRoot: resolved.artifactBackend.root,
          cacheRoot: resolved.cacheBackend.root,
          artifactId: String(artifactId || ""),
          compatibility: String(compatibility || "canonical")
        }
      });
    },
    close() {}
  };
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
  sqliteError = null
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
      sqliteError
        ? {
            id: `verificationPersistenceDiagnostic:${resolved.serverRunnerId || "runner"}:${resolved.runtimeProfile || "profile"}:sqlite_unavailable`,
            severity: "warning",
            code: "verification_persistence_sqlite_unavailable",
            message: `Verification persistence is using a JSON fallback because the local SQLite adapter is unavailable. (${sqliteError instanceof Error ? sqliteError.message : String(sqliteError)})`
          }
        : {
            id: `verificationPersistenceDiagnostic:${resolved.serverRunnerId || "runner"}:${resolved.runtimeProfile || "profile"}:json_compatibility`,
            severity: "info",
            code: "verification_persistence_json_compatibility",
            message: "Verification persistence is using the local JSON compatibility adapter because witness-core verification persistence is not configured."
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

export async function createRuntimeVerificationPersistence({
  serverRunner = null,
  appProject = null,
  runtimeRoot = null,
  runtimeOperatorContract = null,
  runtimeProfile = null,
  loadSqliteModule = null,
  witnessCoreBridge = null,
  fetchImpl = globalThis.fetch
} = {}) {
  const resolved = resolveRuntimeVerificationPersistence({
    serverRunner,
    appProject,
    runtimeRoot,
    runtimeOperatorContract,
    runtimeProfile
  });

  if (witnessCoreBridge?.coreUrl) {
    return await createWitnessCoreVerificationPersistence({
      resolved,
      witnessCoreBridge,
      fetchImpl
    });
  }

  await ensureDirectory(resolved.verificationRoot);
  if (resolved.artifactBackend.root) await ensureDirectory(resolved.artifactBackend.root);
  if (resolved.cacheBackend.root) await ensureDirectory(resolved.cacheBackend.root);
  void loadSqliteModule;
  return await createJsonFallbackVerificationPersistence({
    resolved
  });
}
