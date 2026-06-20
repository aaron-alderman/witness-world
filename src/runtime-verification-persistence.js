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
  const boundary = verificationPersistenceBoundaryMetadata({ remote: true });
  return {
    ...resolved,
    ledgerBackend: {
      ...resolved.ledgerBackend,
      ...boundary,
      runtimeProvider: "witness-core",
      adapterStatus: "remote"
    },
    artifactBackend: {
      ...resolved.artifactBackend,
      ...boundary,
      runtimeProvider: "witness-core",
      adapterStatus: "remote"
    },
    cacheBackend: {
      ...resolved.cacheBackend,
      ...boundary,
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

function verificationPersistenceBoundaryMetadata({
  remote = false,
  canonicalRequired = false,
  adapterStatus = remote ? "remote" : "fallback"
} = {}) {
  const canonicalBoundary = remote === true || canonicalRequired === true;
  return {
    adapterStatus,
    boundaryOwner: canonicalBoundary ? "witness-core" : "node",
    boundaryAuthority: canonicalBoundary ? "rust-owned" : "transitional-node-fallback",
    boundaryTransport: canonicalBoundary ? "verification.persistence" : "json-ledger",
    boundaryScope: canonicalBoundary ? "canonical-runtime" : "non-canonical-scratch",
    canonicalBoundary,
    boundaryFallbackAllowed: canonicalBoundary !== true,
    boundaryAvailability: String(adapterStatus || "").includes("unavailable")
      || String(adapterStatus || "").includes("required")
      ? "unavailable"
      : "available"
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

function createUnavailableVerificationPersistence({
  resolved,
  reason = "witness core verification persistence required",
  canonicalRequired = false
} = {}) {
  const inspectResolved = {
    ...resolved,
    ledgerBackend: {
      ...resolved.ledgerBackend,
      ...verificationPersistenceBoundaryMetadata({
        canonicalRequired,
        adapterStatus: "witness-core-required"
      }),
      runtimeProvider: "witness-core"
    },
    artifactBackend: {
      ...resolved.artifactBackend,
      ...verificationPersistenceBoundaryMetadata({
        canonicalRequired,
        adapterStatus: "witness-core-required"
      }),
      runtimeProvider: "witness-core"
    },
    cacheBackend: {
      ...resolved.cacheBackend,
      ...verificationPersistenceBoundaryMetadata({
        canonicalRequired,
        adapterStatus: "witness-core-required"
      }),
      runtimeProvider: "witness-core"
    },
    diagnostics: [
      ...ensureArray(resolved.diagnostics),
      {
        id: `verificationPersistenceDiagnostic:${resolved.serverRunnerId || "runner"}:${resolved.runtimeProfile || "profile"}:witness_core_required`,
        severity: "error",
        code: "verification_persistence_witness_core_required",
        message: canonicalRequired
          ? "Verification persistence requires witness-core in canonical app-serving mode; local runtime ownership has been removed."
          : "Verification persistence requires witness-core; local runtime ownership has been removed."
      }
    ]
  };
  const unavailableError = () => createWitnessCoreVerificationPersistenceError(reason, {
    status: 503,
    code: "WITNESS_CORE_REQUIRED"
  });
  const emptyRows = readModelRowsFromState(createEmptyLedgerState());
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
    async recordPolicyRows() {
      throw unavailableError();
    },
    async recordFreshnessRows() {
      throw unavailableError();
    },
    async recordInvalidationRows() {
      throw unavailableError();
    },
    async recordQueueRow() {
      throw unavailableError();
    },
    async recordExecutionRow() {
      throw unavailableError();
    },
    async persistTestRunBundle() {
      throw unavailableError();
    },
    readModelRows() {
      return { ...emptyRows };
    },
    async findReusablePassedResult() {
      return null;
    },
    async readArtifactContent() {
      return {
        ok: false,
        status: 503,
        error: reason,
        code: "WITNESS_CORE_REQUIRED"
      };
    },
    close() {}
  };
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

export async function createRuntimeVerificationPersistence({
  serverRunner = null,
  appProject = null,
  runtimeRoot = null,
  runtimeOperatorContract = null,
  runtimeProfile = null,
  witnessCoreBridge = null,
  fetchImpl = globalThis.fetch,
  requireCanonicalBoundary = false
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

  return createUnavailableVerificationPersistence({
    resolved,
    canonicalRequired: true
  });
}
