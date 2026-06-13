import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SRC_DIR, "..");
const STORE_SEED_DIR = path.join(REPO_ROOT, "store", "seeds");

function readSeedJson(fileName) {
  const filePath = path.join(STORE_SEED_DIR, fileName);
  const text = fs.readFileSync(filePath, "utf8");
  try {
    return JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`store seed ${fileName} is not valid JSON: ${message}`);
  }
}

function stringList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`store seed ${label} must be an array`);
  }
  return [...new Set(value.map(entry => String(entry || "").trim()).filter(Boolean))];
}

function normalizeRuntimeProfiles(seed) {
  if (!seed || typeof seed !== "object" || Array.isArray(seed)) {
    throw new Error("runtime profile seed must be an object");
  }
  const profiles = seed.profiles && typeof seed.profiles === "object" && !Array.isArray(seed.profiles)
    ? seed.profiles
    : null;
  if (!profiles) throw new Error("runtime profile seed must include profiles");
  return Object.freeze(Object.fromEntries(Object.entries(profiles).map(([profileId, profile]) => [
    String(profileId),
    Object.freeze({
      coreBundles: Object.freeze(stringList(profile?.coreBundles ?? [], `profiles.${profileId}.coreBundles`)),
      plugins: Object.freeze(stringList(profile?.plugins ?? [], `profiles.${profileId}.plugins`))
    })
  ])));
}

function normalizeFirstPartyCatalog(seed) {
  if (!seed || typeof seed !== "object" || Array.isArray(seed)) {
    throw new Error("first-party plugin catalog seed must be an object");
  }
  const packages = (seed.packages ?? []).map((row, index) => {
    const id = String(row?.id || "").trim();
    const directory = String(row?.directory || "").trim();
    if (!id || !directory) {
      throw new Error(`first-party plugin catalog package row ${index} must include id and directory`);
    }
    return Object.freeze({
      id,
      directory,
      order: Number.isFinite(Number(row?.order)) ? Number(row.order) : index
    });
  });
  const bundles = (seed.bundles ?? []).map((row, index) => {
    const id = String(row?.id || "").trim();
    if (!id) throw new Error(`first-party plugin catalog bundle row ${index} must include id`);
    return Object.freeze({
      id,
      plugin: String(row?.plugin || "").trim() || null,
      displayName: String(row?.displayName || id),
      description: String(row?.description || "")
    });
  });
  return Object.freeze({
    schemaVersion: Number(seed.schemaVersion ?? 1),
    packageRoot: String(seed.packageRoot || "plugins"),
    packages: Object.freeze(packages),
    bundles: Object.freeze(bundles)
  });
}

const RUNTIME_PROFILE_SEED = readSeedJson("runtime-profiles.json");
const FIRST_PARTY_PLUGIN_CATALOG_SEED = readSeedJson("first-party-plugin-catalog.json");
const RUNTIME_PROFILE_PRESETS = normalizeRuntimeProfiles(RUNTIME_PROFILE_SEED);
const FIRST_PARTY_PLUGIN_CATALOG = normalizeFirstPartyCatalog(FIRST_PARTY_PLUGIN_CATALOG_SEED);

export function runtimeProfilePresetsFromSeeds() {
  return RUNTIME_PROFILE_PRESETS;
}

export function firstPartyPluginCatalogSeed() {
  return FIRST_PARTY_PLUGIN_CATALOG;
}

export function firstPartyPluginPackageRows() {
  return [...FIRST_PARTY_PLUGIN_CATALOG.packages].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id)
  );
}

export function firstPartyBundleRows() {
  return [...FIRST_PARTY_PLUGIN_CATALOG.bundles];
}

export function knownFirstPartyBundleIds() {
  return FIRST_PARTY_PLUGIN_CATALOG.bundles.map(bundle => bundle.id);
}

export function firstPartyBundleSeed(bundleId) {
  const id = String(bundleId || "");
  return FIRST_PARTY_PLUGIN_CATALOG.bundles.find(bundle => bundle.id === id) ?? null;
}
