import fs from "node:fs/promises";
import path from "node:path";
import { moduleProjectors } from "../../src/modules.js";

function secretsRootFor({ runtimeRoot, storage }) {
  return storage?.secretsRoot || path.resolve(runtimeRoot || process.cwd(), "secrets");
}

async function loadSecretMap(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error?.code === "ENOENT") return {};
    throw error;
  }
}

async function writeSecretMap(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function secretReadShape(row) {
  return {
    id: row.id,
    title: row.title,
    serverRunner: row.serverRunner,
    provider: row.provider,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    hasValue: row.hasValue,
    lastError: row.lastError
  };
}

export function createSecretStoreRuntime({
  project,
  runtimeRoot,
  storage,
  serverRunnerId
}) {
  const filePath = path.resolve(secretsRootFor({ runtimeRoot, storage }), `${serverRunnerId}.json`);
  const currentRows = () => project(moduleProjectors.secrets).filter(row => row.serverRunner === serverRunnerId);
  const currentById = () => project(moduleProjectors.secretIndex).byId;

  return {
    filePath,
    async listMetadata() {
      const rows = currentRows().filter(row => row.serverRunner === serverRunnerId);
      const stored = await loadSecretMap(filePath);
      return rows.map(row => ({
        ...row,
        hasValue: Object.prototype.hasOwnProperty.call(stored, row.id) ? true : row.hasValue
      }));
    },
    async metadata(secretId) {
      const row = currentById()[secretId] ?? null;
      if (!row || row.serverRunner !== serverRunnerId) return null;
      const stored = await loadSecretMap(filePath);
      return {
        ...row,
        hasValue: Object.prototype.hasOwnProperty.call(stored, secretId) ? true : row.hasValue
      };
    },
    async hasValue(secretId) {
      const stored = await loadSecretMap(filePath);
      return Object.prototype.hasOwnProperty.call(stored, secretId);
    },
    async resolveSecretValue(secretId) {
      const row = currentById()[secretId] ?? null;
      if (!row || row.serverRunner !== serverRunnerId) {
        return { ok: false, status: 404, reason: "secret not found" };
      }
      const stored = await loadSecretMap(filePath);
      if (!Object.prototype.hasOwnProperty.call(stored, secretId)) {
        return { ok: false, status: 503, reason: "secret value missing" };
      }
      return { ok: true, value: stored[secretId] };
    },
    async writeSecretValue(secretId, value) {
      const stored = await loadSecretMap(filePath);
      stored[secretId] = String(value ?? "");
      await writeSecretMap(filePath, stored);
      return { ok: true };
    },
    async deleteSecretValue(secretId) {
      const stored = await loadSecretMap(filePath);
      if (Object.prototype.hasOwnProperty.call(stored, secretId)) {
        delete stored[secretId];
        await writeSecretMap(filePath, stored);
      }
      return { ok: true };
    },
    close() {}
  };
}
