import { createHash } from "node:crypto";

const CANONICAL_FIELD_PREFIX = ["id", "package", "revision", "kind", "version"];

export function materializeCanonicalPackageBundle({
  packageRecord,
  revisionRecord,
  patches = [],
  namespaces = [],
  dependencies = [],
  transformers = [],
  materializedFiles = []
}) {
  if (!packageRecord || typeof packageRecord !== "object" || Array.isArray(packageRecord)) {
    throw new Error("packageRecord must be an object");
  }
  if (!revisionRecord || typeof revisionRecord !== "object" || Array.isArray(revisionRecord)) {
    throw new Error("revisionRecord must be an object");
  }

  const normalizedPackage = normalizeCanonicalRecord(packageRecord);
  const normalizedRevision = normalizeCanonicalRecord({
    package: normalizedPackage.id ?? null,
    ...revisionRecord
  });
  const canonicalPatches = patches.map(patch =>
    createCanonicalPackagePatch(patch, {
      packageId: normalizedPackage.id ?? null,
      revisionId: normalizedRevision.id ?? null
    })
  )
    .sort(compareCanonicalPatchOrder)
    .map((patch, index) => normalizeCanonicalRecord({
      ...patch,
      ordinal: index + 1
    }));
  const canonicalNamespaces = normalizeCanonicalNamespaces(namespaces);
  const canonicalDependencies = normalizeCanonicalDependencies(dependencies);
  const canonicalTransformers = normalizeCanonicalTransformers(transformers);

  const files = [
    {
      path: "package.wtoml",
      content: serializeCanonicalWtomlDocument("package", normalizedPackage)
    },
    {
      path: "revision.wtoml",
      content: serializeCanonicalWtomlDocument("packageRevision", normalizedRevision)
    },
    ...canonicalPatches.map((patch, index) => ({
      path: `patches/${String(index + 1).padStart(4, "0")}-${slugifyBundlePath(patch.path)}.wtoml`,
      content: serializeCanonicalWtomlDocument("packagePatch", patch)
    })),
    ...canonicalNamespaces.map((namespace, index) => ({
      path: `namespaces/${String(index + 1).padStart(4, "0")}-${slugifyBundlePath(`${namespace.context}-${namespace.name}`)}.wtoml`,
      content: serializeCanonicalWtomlDocument("packageNamespace", namespace)
    })),
    ...canonicalDependencies.map((dependency, index) => ({
      path: `dependencies/${String(index + 1).padStart(4, "0")}-${slugifyBundlePath(`${dependency.targetKind}-${dependency.targetId}`)}.wtoml`,
      content: serializeCanonicalWtomlDocument("packageDependency", dependency)
    })),
    ...canonicalTransformers.map((transformer, index) => ({
      path: `transformers/${String(index + 1).padStart(4, "0")}-${slugifyBundlePath(transformer.id)}.wtoml`,
      content: serializeCanonicalWtomlDocument("packageTransformer", transformer)
    })),
    ...normalizeMaterializedFiles(materializedFiles)
  ].map(file => ({
    path: file.path,
    content: file.content,
    sha256: sha256(file.content)
  }));

  const bundleHash = sha256(files.map(file => `${file.path}\n${file.content}`).join("\n---\n"));
  return {
    packageRecord: normalizedPackage,
    revisionRecord: normalizedRevision,
    patches: canonicalPatches,
    namespaces: canonicalNamespaces,
    dependencies: canonicalDependencies,
    transformers: canonicalTransformers,
    files,
    bundleHash
  };
}

export function createCanonicalPackagePatch(patch, {
  packageId = null,
  revisionId = null
} = {}) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new Error("patch must be an object");
  }
  const normalized = normalizeCanonicalRecord({
    package: patch.package ?? packageId,
    revision: patch.revision ?? revisionId,
    ordinal: Number.isFinite(Number(patch.ordinal)) ? Number(patch.ordinal) : null,
    path: normalizeCanonicalPath(patch.path),
    operation: requiredString(patch.operation, "patch.operation"),
    sourceLanguage: requiredString(patch.sourceLanguage, "patch.sourceLanguage"),
    transformer: optionalString(patch.transformer),
    previousHash: optionalString(patch.previousHash),
    nextHash: optionalString(patch.nextHash),
    body: cleanCanonicalValue(patch.body)
  });
  const contentAddress = hashCanonicalValue({
    package: normalized.package,
    revision: normalized.revision,
    path: normalized.path,
    operation: normalized.operation,
    sourceLanguage: normalized.sourceLanguage,
    transformer: normalized.transformer,
    previousHash: normalized.previousHash,
    nextHash: normalized.nextHash,
    body: normalized.body
  });
  return normalizeCanonicalRecord({
    ...normalized,
    id: `packagePatch:${contentAddress}`
  });
}

export function serializeCanonicalWtomlDocument(docKind, values) {
  const normalized = normalizeCanonicalRecord(values);
  const lines = [`[[${docKind}]]`];
  for (const key of orderedFieldNames(normalized)) {
    lines.push(`${key} = ${serializeCanonicalWtomlValue(normalized[key])}`);
  }
  return lines.join("\n");
}

export function serializeCanonicalWtomlValue(value) {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonicalWtomlValue).join(", ")}]`;
  if (value && typeof value === "object") {
    return `{ ${orderedFieldNames(value).map(key =>
      `${key} = ${serializeCanonicalWtomlValue(value[key])}`
    ).join(", ")} }`;
  }
  throw new Error("canonical WTOML serialization does not support null or undefined values");
}

export function normalizeCanonicalPath(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
  if (!normalized) throw new Error("path is required");
  return normalized;
}

function normalizeMaterializedFiles(files) {
  const rows = Array.isArray(files)
    ? files.map(file => ({
        path: normalizeMaterializedFilePath(file?.path),
        content: String(file?.content ?? "")
      }))
    : Object.entries(files ?? {}).map(([path, content]) => ({
        path: normalizeMaterializedFilePath(path),
        content: String(content ?? "")
      }));
  return rows.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeCanonicalNamespaces(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => normalizeCanonicalRecord(row))
    .sort(compareCanonicalNamespaceOrder);
}

function normalizeCanonicalDependencies(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => normalizeCanonicalRecord(row))
    .sort(compareCanonicalDependencyOrder);
}

function normalizeCanonicalTransformers(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => normalizeCanonicalRecord(row))
    .sort(compareCanonicalTransformerOrder);
}

function normalizeMaterializedFilePath(value) {
  const normalized = normalizeCanonicalPath(value);
  return normalized.startsWith("materialized/")
    ? normalized
    : `materialized/${normalized}`;
}

function normalizeCanonicalRecord(value) {
  const cleaned = cleanCanonicalValue(value);
  if (!cleaned || typeof cleaned !== "object" || Array.isArray(cleaned)) {
    throw new Error("canonical record must be an object");
  }
  return cleaned;
}

function cleanCanonicalValue(value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value)) {
    return value
      .map(entry => cleanCanonicalValue(entry))
      .filter(entry => entry !== undefined);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, entry]) => [key, cleanCanonicalValue(entry)])
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareFieldNames(left, right));
    return Object.fromEntries(entries);
  }
  return value;
}

function orderedFieldNames(value) {
  return Object.keys(value).sort(compareFieldNames);
}

function compareFieldNames(left, right) {
  const leftIndex = CANONICAL_FIELD_PREFIX.indexOf(left);
  const rightIndex = CANONICAL_FIELD_PREFIX.indexOf(right);
  if (leftIndex >= 0 || rightIndex >= 0) {
    if (leftIndex < 0) return 1;
    if (rightIndex < 0) return -1;
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  }
  return left.localeCompare(right);
}

function hashCanonicalValue(value) {
  return sha256(JSON.stringify(value));
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function requiredString(value, label) {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${label} must be a non-empty string`);
  return normalized;
}

function optionalString(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function slugifyBundlePath(value) {
  const normalized = normalizeCanonicalPath(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "patch";
}

function compareCanonicalPatchOrder(left, right) {
  const leftOrdinal = Number.isFinite(left.ordinal) ? left.ordinal : Number.POSITIVE_INFINITY;
  const rightOrdinal = Number.isFinite(right.ordinal) ? right.ordinal : Number.POSITIVE_INFINITY;
  if (leftOrdinal !== rightOrdinal) return leftOrdinal - rightOrdinal;
  const pathOrder = left.path.localeCompare(right.path);
  if (pathOrder !== 0) return pathOrder;
  const operationOrder = left.operation.localeCompare(right.operation);
  if (operationOrder !== 0) return operationOrder;
  return left.id.localeCompare(right.id);
}

function compareCanonicalNamespaceOrder(left, right) {
  const contextOrder = String(left.context ?? "").localeCompare(String(right.context ?? ""));
  if (contextOrder !== 0) return contextOrder;
  const nameOrder = String(left.name ?? "").localeCompare(String(right.name ?? ""));
  if (nameOrder !== 0) return nameOrder;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function compareCanonicalDependencyOrder(left, right) {
  const revisionOrder = String(left.sourceRevision ?? "").localeCompare(String(right.sourceRevision ?? ""));
  if (revisionOrder !== 0) return revisionOrder;
  const kindOrder = String(left.targetKind ?? "").localeCompare(String(right.targetKind ?? ""));
  if (kindOrder !== 0) return kindOrder;
  const targetOrder = String(left.targetId ?? "").localeCompare(String(right.targetId ?? ""));
  if (targetOrder !== 0) return targetOrder;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}

function compareCanonicalTransformerOrder(left, right) {
  const packageOrder = String(left.package ?? "").localeCompare(String(right.package ?? ""));
  if (packageOrder !== 0) return packageOrder;
  const sourceRevisionOrder = String(left.sourceRevision ?? "").localeCompare(String(right.sourceRevision ?? ""));
  if (sourceRevisionOrder !== 0) return sourceRevisionOrder;
  const targetRevisionOrder = String(left.targetRevision ?? "").localeCompare(String(right.targetRevision ?? ""));
  if (targetRevisionOrder !== 0) return targetRevisionOrder;
  const sourceNamespaceOrder = String(left.sourceNamespace ?? "").localeCompare(String(right.sourceNamespace ?? ""));
  if (sourceNamespaceOrder !== 0) return sourceNamespaceOrder;
  const targetNamespaceOrder = String(left.targetNamespace ?? "").localeCompare(String(right.targetNamespace ?? ""));
  if (targetNamespaceOrder !== 0) return targetNamespaceOrder;
  return String(left.id ?? "").localeCompare(String(right.id ?? ""));
}
