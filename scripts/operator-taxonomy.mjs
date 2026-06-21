import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  OPERATOR_ACTION_FAMILIES,
  OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS,
  OPERATOR_CANONICAL_DOMAINS,
  OPERATOR_CANONICAL_ROOTS,
  OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS,
  OPERATOR_LEGACY_BROWSE_ROOTS,
  OPERATOR_SESSION_SIDECAR_FIELDS,
  OPERATOR_WORKBENCH_FORM_MAPPINGS
} from "../plugins/operator-workbench/canonical-model.js";
import { operatorWorkbenchRvmForms } from "../plugins/operator-workbench/desire-rvm.js";
import { parseOperatorWorkbenchRvm } from "../examples/operator/browser/operator-rvm.js";

const cwd = process.cwd();
const OPERATOR_TUI_PATH = path.join(cwd, "plugins", "operator-workbench", "tui-engine.js");
const OPERATOR_BROWSER_EXAMPLE_PATH = path.join(cwd, "examples", "operator", "browser", "operator.workbench.rvm");

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseArrayConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map(entry => entry[1]);
}

function parseObjectConst(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*Object\\.freeze\\(\\{([\\s\\S]*?)\\}\\);`));
  if (!match) return {};
  return Object.fromEntries(
    [...match[1].matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]+)"/g)].map(entry => [entry[1], entry[2]])
  );
}

function parseRootContainers(source) {
  if (source.includes("return CANONICAL_ROOT_CONTAINER_IDS.map(id => ({")) {
    return OPERATOR_CANONICAL_ROOTS.map(entry => ({ id: entry.id, label: entry.label }));
  }
  return [
    { id: "session", label: "Session" },
    { id: "world", label: "World" },
    { id: "platform", label: "Platform" }
  ];
}

function buildLegacyBrowseTaxonomy(source) {
  const sessionOrder = parseArrayConst(source, "SESSION_SECTION_ORDER");
  const worldOrder = parseArrayConst(source, "WORLD_KIND_ORDER");
  const platformOrder = parseArrayConst(source, "PLATFORM_KIND_ORDER");
  const worldLabels = parseObjectConst(source, "WORLD_GROUP_LABELS");
  const platformLabels = parseObjectConst(source, "PLATFORM_GROUP_LABELS");

  return {
    root: parseRootContainers(source),
    session: sessionOrder.map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
    world: worldOrder.map(id => ({ id, label: worldLabels[id] ?? id })),
    platform: platformOrder.map(id => ({ id, label: platformLabels[id] ?? id })),
    kinds: {
      world: uniqueSorted(worldOrder),
      platform: uniqueSorted(platformOrder)
    }
  };
}

function buildCanonicalTaxonomy({ browserExampleSource }) {
  const browserParsed = parseOperatorWorkbenchRvm(browserExampleSource);
  const browserKinds = uniqueSorted([
    browserParsed.themes.length ? "theme" : null,
    browserParsed.surfaces.length ? "surface" : null,
    browserParsed.viewports.length ? "viewport" : null
  ]);
  return {
    roots: OPERATOR_CANONICAL_ROOTS,
    domains: OPERATOR_CANONICAL_DOMAINS,
    sessionSidecar: OPERATOR_SESSION_SIDECAR_FIELDS,
    actions: OPERATOR_ACTION_FAMILIES,
    legacyBrowseRoots: OPERATOR_LEGACY_BROWSE_ROOTS,
    legacyBrowseGroupMappings: OPERATOR_LEGACY_BROWSE_GROUP_MAPPINGS,
    adapters: {
      workbenchForms: OPERATOR_WORKBENCH_FORM_MAPPINGS,
      browserPrototypeForms: OPERATOR_BROWSER_PROTOTYPE_FORM_MAPPINGS,
      liveWorkbenchForms: operatorWorkbenchRvmForms.map(form => form.kind),
      liveBrowserPrototypeForms: browserKinds
    }
  };
}

export function buildOperatorTaxonomySnapshot({ tuiSource, browserExampleSource }) {
  return {
    canonical: buildCanonicalTaxonomy({ browserExampleSource }),
    legacyBrowse: buildLegacyBrowseTaxonomy(tuiSource)
  };
}

function renderText(taxonomy) {
  const lines = [];
  lines.push("Operator canonical taxonomy");
  lines.push("");
  lines.push("Canonical roots");
  for (const entry of taxonomy.canonical.roots) {
    lines.push(`- ${entry.label} (${entry.id})`);
  }
  lines.push("");
  lines.push("Session sidecar");
  for (const entry of taxonomy.canonical.sessionSidecar) {
    lines.push(`- ${entry.label} (${entry.id})`);
  }
  lines.push("");
  lines.push("Canonical domains");
  for (const entry of taxonomy.canonical.domains) {
    lines.push(`- ${entry.label} (${entry.id}) -> ${entry.rootId}`);
  }
  lines.push("");
  lines.push("Action families");
  for (const entry of taxonomy.canonical.actions) {
    lines.push(`- ${entry.id} -> ${entry.layer}`);
  }
  lines.push("");
  lines.push("Legacy browse roots");
  for (const entry of taxonomy.canonical.legacyBrowseRoots) {
    lines.push(`- ${entry.label} (${entry.id}) -> ${entry.layer}`);
  }
  lines.push("");
  lines.push("Legacy browse mappings");
  for (const entry of taxonomy.canonical.legacyBrowseGroupMappings) {
    const suffix = entry.followOnPhase ? ` [follow-on:${entry.followOnPhase}]` : "";
    lines.push(`- ${entry.projection}.${entry.id} -> ${entry.targetDomainId}${suffix}`);
  }
  lines.push("");
  lines.push("Legacy workbench forms");
  for (const entry of taxonomy.canonical.adapters.workbenchForms) {
    lines.push(`- ${entry.id} -> ${entry.layer}:${entry.targetId}`);
  }
  lines.push("");
  lines.push("Browser prototype forms");
  for (const entry of taxonomy.canonical.adapters.browserPrototypeForms) {
    lines.push(`- ${entry.id} -> ${entry.layer}:${entry.targetId}`);
  }
  lines.push("");
  lines.push("Compatibility browse kinds");
  lines.push("");
  lines.push("Session");
  for (const entry of taxonomy.legacyBrowse.session) lines.push(`- ${entry.label} (${entry.id})`);
  lines.push("");
  lines.push("World");
  for (const entry of taxonomy.legacyBrowse.world) lines.push(`- ${entry.label} (${entry.id})`);
  lines.push("");
  lines.push("Platform");
  for (const entry of taxonomy.legacyBrowse.platform) lines.push(`- ${entry.label} (${entry.id})`);
  return lines.join("\n");
}

async function main() {
  const [tuiSource, browserExampleSource] = await Promise.all([
    fs.readFile(OPERATOR_TUI_PATH, "utf8"),
    fs.readFile(OPERATOR_BROWSER_EXAMPLE_PATH, "utf8")
  ]);
  const taxonomy = buildOperatorTaxonomySnapshot({
    tuiSource,
    browserExampleSource
  });
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(taxonomy, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${renderText(taxonomy)}\n`);
}

const directModuleUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;

if (import.meta.url === directModuleUrl) {
  await main();
}
