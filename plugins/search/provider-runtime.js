import fs from "node:fs/promises";
import path from "node:path";
import { moduleProjectors } from "../../src/modules.js";
import { isoAt, positiveInteger, runtimeConfigLookup } from "../../src/runtime-config-utils.js";
function parseIsoAt(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId) {
  const providerRaw = runtimeConfigLookup(runtimeConfig, "search.index.provider");
  const provider = typeof providerRaw === "string" && providerRaw.trim() ? providerRaw.trim() : "local-text";
  const searchRoot = storage?.searchRoot || path.resolve(runtimeRoot || process.cwd(), "search");
  const maxTextBytes = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.maxTextBytes"), 262144);
  const defaultLimit = positiveInteger(runtimeConfigLookup(runtimeConfig, "search.index.defaultLimit"), 10);
  const assetRefreshPolicyRaw = typeof runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy") === "string"
    ? runtimeConfigLookup(runtimeConfig, "search.index.assetRefreshPolicy").trim().toLowerCase()
    : "";
  const assetRefreshPolicy = assetRefreshPolicyRaw || "on-ingest";
  const indexId = `searchIndex:${serverRunnerId}:main`;
  const title = `${serverRunnerId} Search Index`;
  if (!["on-ingest", "manual"].includes(assetRefreshPolicy)) {
    return {
      ok: false,
      status: 400,
      reason: "search.index.assetRefreshPolicy must be on-ingest or manual",
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "failed",
        lastError: "search.index.assetRefreshPolicy must be on-ingest or manual"
      }
    };
  }
  if (provider !== "local-text") {
    return {
      ok: false,
      status: 501,
      reason: `${provider} search adapter not wired in this runtime slice`,
      index: {
        id: indexId,
        title,
        serverRunner: serverRunnerId,
        provider,
        name: "main",
        path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
        status: "unsupported",
        lastError: `${provider} search adapter not wired in this runtime slice`
      }
    };
  }
  return {
    ok: true,
    provider,
    searchRoot,
    maxTextBytes,
    defaultLimit,
    assetRefreshPolicy,
    index: {
      id: indexId,
      title,
      serverRunner: serverRunnerId,
      provider,
      name: "main",
      path: path.join(searchRoot, encodeURIComponent(serverRunnerId), "main.json"),
      status: "ready",
      lastError: null
    }
  };
}

function tokenizeSearchText(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]{2,}/g) ?? [];
}

function searchTermCounts(text) {
  const counts = Object.create(null);
  for (const term of tokenizeSearchText(text)) counts[term] = (counts[term] ?? 0) + 1;
  return counts;
}

function looksTextSearchMime(mimeType) {
  const value = String(mimeType || "").toLowerCase();
  return value.startsWith("text/")
    || value === "application/json"
    || value === "application/ld+json"
    || value === "application/xml"
    || value === "image/svg+xml"
    || value.includes("javascript")
    || value.includes("xml");
}

function searchSnippet(text, terms) {
  const source = String(text || "");
  if (!source) return "";
  const lowered = source.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const found = lowered.indexOf(term.toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return source.slice(0, 140);
  const start = Math.max(0, index - 40);
  const end = Math.min(source.length, index + 100);
  return source.slice(start, end);
}


export function createSearchIndexRuntime({ world, project = projector => world.project(projector), runtimeConfig, runtimeRoot, serverRunnerId, storage }) {
  let stateLoaded = false;
  let stateCache = null;
  let buildSequence = 0;

  const currentConfig = () => normalizeSearchIndexConfig(runtimeConfig, runtimeRoot, storage, serverRunnerId);
  const assetsRootForRuntime = () => storage?.assetsRoot || path.resolve(runtimeRoot || process.cwd(), "assets");
  const assetPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "blob");
  const assetDerivedTextPathForRuntime = assetId => path.join(assetsRootForRuntime(), encodeURIComponent(assetId), "derived", "text.txt");

  const sanitizeDocument = (document, ordinal) => {
    const id = typeof document?.id === "string" && document.id.trim() ? document.id.trim() : `document:${ordinal + 1}`;
    const title = typeof document?.title === "string" && document.title.trim() ? document.title.trim() : id;
    const text = typeof document?.text === "string" ? document.text : "";
    const context = typeof document?.context === "string" && document.context.trim() ? document.context.trim() : null;
    if (!text.trim()) return { ok: false, status: 400, reason: `document ${id} requires text` };
    return {
      ok: true,
      descriptor: {
        type: "document",
        id,
        title,
        text,
        context
      }
    };
  };

  const normalizeSourceDescriptors = ({ documents, assetIds }) => {
    const sourceDescriptors = [];
    const seenAssets = new Set();
    const seenDocs = new Set();
    for (const [index, document] of (Array.isArray(documents) ? documents : []).entries()) {
      const normalized = sanitizeDocument(document, index);
      if (!normalized.ok) return normalized;
      if (seenDocs.has(normalized.descriptor.id)) return { ok: false, status: 409, reason: `duplicate document id ${normalized.descriptor.id}` };
      seenDocs.add(normalized.descriptor.id);
      sourceDescriptors.push(normalized.descriptor);
    }
    for (const rawId of Array.isArray(assetIds) ? assetIds : []) {
      const assetId = typeof rawId === "string" ? rawId.trim() : "";
      if (!assetId) return { ok: false, status: 400, reason: "assetIds require non-empty strings" };
      if (seenAssets.has(assetId)) continue;
      seenAssets.add(assetId);
      sourceDescriptors.push({ type: "asset", assetId });
    }
    if (!sourceDescriptors.length) return { ok: false, status: 400, reason: "documents or assetIds required" };
    return { ok: true, sourceDescriptors };
  };

  const resolveDocumentSource = descriptor => ({
    ok: true,
    document: {
      id: descriptor.id,
      title: descriptor.title,
      context: descriptor.context ?? null,
      sourceKind: "document",
      assetId: null,
      mimeType: "text/plain",
      text: descriptor.text
    }
  });

  const resolveAssetSource = async (descriptor, config) => {
    const asset = project(moduleProjectors.assetIndex).byId[descriptor.assetId] ?? null;
    if (!asset) return { ok: false, status: 404, reason: `asset ${descriptor.assetId} not found` };
    const metadataText = [asset.title, asset.mimeType, asset.context].filter(Boolean).join(" ");
    let text = metadataText;
    if (typeof asset.textRef === "string" && asset.textRef) {
      try {
        const extractedText = await fs.readFile(assetDerivedTextPathForRuntime(asset.id), "utf8");
        text = `${metadataText}\n${extractedText}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} extracted text unreadable` };
      }
    } else if (looksTextSearchMime(asset.mimeType)) {
      try {
        const bytes = await fs.readFile(assetPathForRuntime(asset.id));
        text = `${metadataText}\n${bytes.subarray(0, config.maxTextBytes).toString("utf8")}`.trim();
      } catch (error) {
        return { ok: false, status: 500, reason: error instanceof Error ? error.message : `asset ${asset.id} content unreadable` };
      }
    }
    return {
      ok: true,
      document: {
        id: asset.id,
        title: asset.title,
        context: asset.context ?? null,
        sourceKind: "asset",
        assetId: asset.id,
        mimeType: asset.mimeType,
        text
      }
    };
  };

  const resolveSourceDocuments = async (sourceDescriptors, config) => {
    const documents = [];
    for (const descriptor of sourceDescriptors) {
      const resolved = descriptor.type === "asset"
        ? await resolveAssetSource(descriptor, config)
        : resolveDocumentSource(descriptor);
      if (!resolved.ok) return resolved;
      const terms = searchTermCounts(resolved.document.text);
      documents.push({
        ...resolved.document,
        termCounts: terms,
        termCount: Object.values(terms).reduce((sum, count) => sum + count, 0)
      });
    }
    return { ok: true, documents };
  };

  const summarizeState = state => ({
    id: state.id,
    title: state.title,
    serverRunner: state.serverRunner,
    provider: state.provider,
    name: state.name,
    status: state.status ?? "ready",
    sourceCount: Array.isArray(state.sourceDescriptors) ? state.sourceDescriptors.length : 0,
    documentCount: Array.isArray(state.documents) ? state.documents.length : 0,
    assetCount: (state.documents ?? []).filter(document => document.sourceKind === "asset").length,
    queryCount: Number(state.queryCount ?? 0),
    lastBuiltAt: state.lastBuiltAt ?? null,
    lastQueryAt: state.lastQueryAt ?? null,
    path: state.path,
    lastError: state.lastError ?? null
  });

  const loadState = async config => {
    if (stateLoaded) return stateCache;
    try {
      const raw = await fs.readFile(config.index.path, "utf8");
      const parsed = JSON.parse(raw);
      stateCache = {
        ...parsed,
        id: parsed?.id || config.index.id,
        title: parsed?.title || config.index.title,
        serverRunner: parsed?.serverRunner || serverRunnerId,
        provider: parsed?.provider || config.provider,
        name: parsed?.name || "main",
        path: config.index.path,
        documents: Array.isArray(parsed?.documents) ? parsed.documents : [],
        sourceDescriptors: Array.isArray(parsed?.sourceDescriptors) ? parsed.sourceDescriptors : [],
        queryCount: Number(parsed?.queryCount ?? 0),
        lastBuiltAt: parsed?.lastBuiltAt ?? null,
        lastQueryAt: parsed?.lastQueryAt ?? null,
        status: parsed?.status || "ready",
        lastError: parsed?.lastError ?? null
      };
    } catch {
      stateCache = null;
    }
    stateLoaded = true;
    return stateCache;
  };

  const persistState = async state => {
    await fs.mkdir(path.dirname(state.path), { recursive: true });
    await fs.writeFile(state.path, JSON.stringify(state, null, 2), "utf8");
    stateCache = state;
    stateLoaded = true;
    return state;
  };

  const build = async ({ documents, assetIds }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const normalized = normalizeSourceDescriptors({ documents, assetIds });
    if (!normalized.ok) return normalized;
    const resolved = await resolveSourceDocuments(normalized.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    const existing = await loadState(config);
    buildSequence += 1;
    const state = {
      version: 1,
      id: config.index.id,
      title: config.index.title,
      serverRunner: serverRunnerId,
      provider: config.provider,
      name: "main",
      path: config.index.path,
      sourceDescriptors: normalized.sourceDescriptors,
      documents: resolved.documents,
      queryCount: Number(existing?.queryCount ?? 0),
      lastQueryAt: existing?.lastQueryAt ?? null,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(state);
    return { ok: true, index: summarizeState(state), sourceDescriptors: normalized.sourceDescriptors };
  };

  const reindex = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const resolved = await resolveSourceDocuments(state.sourceDescriptors, config);
    if (!resolved.ok) return resolved;
    buildSequence += 1;
    const nextState = {
      ...state,
      provider: config.provider,
      path: config.index.path,
      documents: resolved.documents,
      lastBuiltAt: isoAt(Date.now()),
      status: "ready",
      lastError: null,
      buildSequence
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), sourceDescriptors: nextState.sourceDescriptors };
  };

  const refreshAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, changed: false, disposition: "not-built", index: null };
    if (config.assetRefreshPolicy !== "on-ingest") {
      return { ok: true, changed: false, disposition: config.assetRefreshPolicy, policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    if (!includesAsset) {
      return { ok: true, changed: false, disposition: "not-indexed", policy: config.assetRefreshPolicy, index: summarizeState(state) };
    }
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return { ok: true, changed: true, disposition: "reindexed", policy: config.assetRefreshPolicy, index: rebuilt.index, sourceDescriptors: rebuilt.sourceDescriptors };
  };

  const inspectAsset = async assetId => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) {
      return {
        ok: true,
        built: false,
        indexed: false,
        stale: false,
        policy: config.assetRefreshPolicy,
        disposition: "not-built",
        index: null,
        lastBuiltAt: null,
        assetUpdatedAt: null
      };
    }
    const includesAsset = (state.sourceDescriptors ?? []).some(descriptor => descriptor?.type === "asset" && descriptor.assetId === assetId);
    const asset = project(moduleProjectors.assetIndex).byId[assetId] ?? null;
    const lastBuiltAt = typeof state.lastBuiltAt === "string" ? state.lastBuiltAt : null;
    const assetUpdatedAt = typeof asset?.processingUpdatedAt === "string" ? asset.processingUpdatedAt : null;
    const lastBuiltAtMs = parseIsoAt(lastBuiltAt);
    const assetUpdatedAtMs = parseIsoAt(assetUpdatedAt);
    const stale = Boolean(includesAsset && assetUpdatedAtMs != null && (lastBuiltAtMs == null || assetUpdatedAtMs > lastBuiltAtMs));
    return {
      ok: true,
      built: true,
      indexed: includesAsset,
      stale,
      policy: config.assetRefreshPolicy,
      disposition: !includesAsset ? "not-indexed" : (stale ? "stale" : "ready"),
      index: summarizeState(state),
      lastBuiltAt,
      assetUpdatedAt
    };
  };

  const reindexAsset = async assetId => {
    const inspected = await inspectAsset(assetId);
    if (!inspected.ok) return inspected;
    if (!inspected.built) return { ok: false, status: 404, reason: "search index not built", repair: inspected };
    if (!inspected.indexed) return { ok: false, status: 409, reason: "asset not indexed in current search index", repair: inspected };
    const rebuilt = await reindex();
    if (!rebuilt.ok) return rebuilt;
    return {
      ok: true,
      changed: true,
      index: rebuilt.index,
      repair: {
        ...inspected,
        stale: false,
        disposition: "reindexed",
        lastBuiltAt: rebuilt.index.lastBuiltAt,
        index: rebuilt.index
      }
    };
  };

  const inspect = async () => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: true, index: null };
    return { ok: true, index: summarizeState(state) };
  };

  const query = async ({ q, limit }) => {
    const config = currentConfig();
    if (!config.ok) return config;
    const state = await loadState(config);
    if (!state) return { ok: false, status: 404, reason: "search index not built", index: null };
    const queryText = typeof q === "string" ? q.trim() : "";
    const terms = tokenizeSearchText(queryText);
    if (!terms.length) return { ok: false, status: 400, reason: "query text required", index: summarizeState(state) };
    const cappedLimit = Math.max(1, Math.min(50, positiveInteger(limit, config.defaultLimit)));
    const hits = state.documents
      .map(document => {
        let score = 0;
        for (const term of terms) score += Number(document.termCounts?.[term] ?? 0);
        return {
          ...document,
          score,
          matchedTerms: terms.filter(term => Number(document.termCounts?.[term] ?? 0) > 0)
        };
      })
      .filter(document => document.score > 0)
      .sort((left, right) => right.score - left.score || String(left.title).localeCompare(String(right.title)))
      .slice(0, cappedLimit)
      .map(document => ({
        id: document.id,
        title: document.title,
        context: document.context,
        sourceKind: document.sourceKind,
        assetId: document.assetId,
        mimeType: document.mimeType,
        score: document.score,
        matchedTerms: document.matchedTerms,
        snippet: searchSnippet(document.text, terms)
      }));
    const nextState = {
      ...state,
      queryCount: Number(state.queryCount ?? 0) + 1,
      lastQueryAt: isoAt(Date.now()),
      status: "ready",
      lastError: null
    };
    await persistState(nextState);
    return { ok: true, index: summarizeState(nextState), hits, q: queryText, limit: cappedLimit };
  };

  return {
    inspect,
    build,
    reindex,
    refreshAsset,
    inspectAsset,
    reindexAsset,
    query,
    close: () => {}
  };
}
