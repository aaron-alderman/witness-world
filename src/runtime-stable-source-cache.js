import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function hashText(value) {
  return crypto.createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

export function stableSourceCachePath(manifestPath, {
  cwd = process.cwd()
} = {}) {
  const resolvedManifestPath = path.resolve(String(manifestPath || ""));
  const key = hashText(resolvedManifestPath);
  return path.join(cwd, ".witness-core", "stable-app-snapshots", `${key}.json`);
}

export async function readStableAppSourceCache(manifestPath, {
  cwd = process.cwd(),
  fsModule = fs
} = {}) {
  const cachePath = stableSourceCachePath(manifestPath, { cwd });
  try {
    const text = await fsModule.readFile(cachePath, "utf8");
    const parsed = JSON.parse(text);
    const sources = Array.isArray(parsed?.sources)
      ? parsed.sources
        .map(row => ({
          file: path.resolve(String(row?.file || "")),
          sourceId: typeof row?.sourceId === "string" ? row.sourceId : null,
          sourceLanguage: typeof row?.sourceLanguage === "string" ? row.sourceLanguage : null,
          contentHash: typeof row?.contentHash === "string" ? row.contentHash : null,
          content: typeof row?.content === "string" ? row.content : ""
        }))
        .filter(row => row.file)
      : [];
    if (!sources.length) return null;
    return {
      manifestPath: path.resolve(String(parsed?.manifestPath || manifestPath || "")),
      appRoot: parsed?.appRoot ? path.resolve(String(parsed.appRoot)) : null,
      writtenAt: typeof parsed?.writtenAt === "string" ? parsed.writtenAt : null,
      sources
    };
  } catch {
    return null;
  }
}

export async function persistStableAppSourceCache(manifestPath, snapshot, {
  cwd = process.cwd(),
  fsModule = fs
} = {}) {
  const cachePath = stableSourceCachePath(manifestPath, { cwd });
  const compiledUnits = snapshot?.compiledUnits instanceof Map
    ? [...snapshot.compiledUnits.values()]
    : [];
  const sources = compiledUnits
    .map(unit => ({
      file: path.resolve(String(unit?.filePath || "")),
      sourceId: typeof unit?.sourceId === "string" ? unit.sourceId : null,
      sourceLanguage: typeof unit?.sourceLanguage === "string" ? unit.sourceLanguage : null,
      contentHash: typeof unit?.contentHash === "string" ? unit.contentHash : hashText(unit?.content ?? ""),
      content: typeof unit?.content === "string" ? unit.content : ""
    }))
    .filter(row => row.file);
  if (!sources.length) return null;
  const payload = {
    manifestPath: path.resolve(String(manifestPath || "")),
    appRoot: snapshot?.appProject?.appRoot ? path.resolve(String(snapshot.appProject.appRoot)) : null,
    writtenAt: new Date().toISOString(),
    sources
  };
  await fsModule.mkdir(path.dirname(cachePath), { recursive: true });
  await fsModule.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf8");
  return cachePath;
}

export function createStableAppOverlayReadFile(cache, {
  fsModule = fs,
  parentReadFile = null
} = {}) {
  const sourceMap = new Map((cache?.sources ?? []).map(row => [path.resolve(String(row.file || "")), String(row.content ?? "")]));
  return async (target, encoding = "utf8") => {
    const resolved = path.resolve(String(target || ""));
    if (sourceMap.has(resolved)) return sourceMap.get(resolved);
    if (typeof parentReadFile === "function") return parentReadFile(target, encoding);
    return fsModule.readFile(resolved, encoding);
  };
}
