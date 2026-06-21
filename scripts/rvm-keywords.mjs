import fs from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();

const APPLY_PATH = path.join(cwd, "src", "desire", "apply.js");
const RVM_PATH = path.join(cwd, "src", "desire", "rvm.js");
const OPERATOR_SPECS_PATH = path.join(cwd, "plugins", "operator-workbench", "operator-screen-specs.js");
const OPERATOR_EXAMPLE_PATH = path.join(cwd, "examples", "operator", "shell.rvm");

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function matchSetLiteral(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`));
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map(entry => entry[1]);
}

function matchSwitchCases(source, anchorText) {
  const anchorIndex = source.indexOf(anchorText);
  if (anchorIndex < 0) return [];
  const slice = source.slice(anchorIndex);
  return [...slice.matchAll(/case\s+"([^"]+)":/g)].map(match => match[1]);
}

function matchConstSetValues(source, prefix) {
  const result = {};
  for (const match of source.matchAll(new RegExp(`const\\s+(${prefix}[A-Z0-9_]+)\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\);`, "g"))) {
    result[match[1]] = [...match[2].matchAll(/"([^"]+)"/g)].map(entry => entry[1]);
  }
  return result;
}

function deriveOperatorEnums(rawEnums) {
  const next = { ...rawEnums };
  if ((!next.VALID_SCREEN_SHAPES || next.VALID_SCREEN_SHAPES.length === 0)
    && (next.VALID_LEFT_SCREEN_SHAPES || next.VALID_RIGHT_SCREEN_SHAPES)) {
    next.VALID_SCREEN_SHAPES = uniqueSorted([
      ...(next.VALID_LEFT_SCREEN_SHAPES ?? []),
      ...(next.VALID_RIGHT_SCREEN_SHAPES ?? [])
    ]);
  }
  return next;
}

function matchExampleTopLevelKinds(source) {
  return uniqueSorted(
    [...source.matchAll(/^([a-z_][a-z0-9_]*)\s+[A-Za-z_][A-Za-z0-9_.:-]*\s*\{/gm)].map(match => match[1])
  );
}

function matchExampleFieldKeys(source) {
  const keys = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line === "}") continue;
    const fieldMatch = line.match(/^([a-z_][a-z0-9_]*)\s+/);
    if (!fieldMatch) continue;
    const key = fieldMatch[1];
    if (key.startsWith("operator_")) continue;
    keys.push(key);
  }
  return uniqueSorted(keys);
}

function buildTaxonomy({ applySource, rvmSource, operatorSpecsSource, operatorExampleSource }) {
  const applyKinds = uniqueSorted(matchSwitchCases(applySource, "function applyCoreRuntimeDeclaration"));
  const inlineSemanticKinds = uniqueSorted(matchSetLiteral(rvmSource, "INLINE_SEMANTIC_KINDS"));
  const sourceOnlySemanticKinds = uniqueSorted(matchSetLiteral(rvmSource, "RVM_SOURCE_ONLY_SEMANTIC_KINDS"));
  const loweredRuntimeKinds = uniqueSorted(matchSetLiteral(rvmSource, "RVM_LOWERED_RUNTIME_KINDS"));
  const graphDataKinds = uniqueSorted(matchSetLiteral(rvmSource, "RVM_GRAPH_DATA_KINDS"));
  const semanticShapeKinds = uniqueSorted(matchSwitchCases(rvmSource, "function semanticRvmShape"));
  const operatorKindEnums = deriveOperatorEnums(matchConstSetValues(operatorSpecsSource, "VALID_"));
  const operatorTopLevelForms = matchExampleTopLevelKinds(operatorExampleSource);
  const operatorFieldKeywords = matchExampleFieldKeys(operatorExampleSource);

  const sourceScaffolding = uniqueSorted([
    "import",
    "module",
    "stdlib",
    "actor",
    "unknown",
    "conflict_marker",
    ...sourceOnlySemanticKinds
  ]);

  const semanticCore = uniqueSorted([
    ...inlineSemanticKinds,
    ...semanticShapeKinds,
    ...applyKinds.filter(kind => !kind.startsWith("operator_"))
  ]);

  const operatorAuthoring = {
    topLevelForms: operatorTopLevelForms,
    fieldKeywords: operatorFieldKeywords,
    enums: Object.fromEntries(
      Object.entries(operatorKindEnums)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => [key, uniqueSorted(values)])
    )
  };

  return {
    generatedFrom: {
      apply: path.relative(cwd, APPLY_PATH),
      rvm: path.relative(cwd, RVM_PATH),
      operatorSpecs: path.relative(cwd, OPERATOR_SPECS_PATH),
      operatorExample: path.relative(cwd, OPERATOR_EXAMPLE_PATH)
    },
    sourceScaffolding,
    semanticCore,
    loweredRuntimeKinds,
    graphDataKinds,
    operatorAuthoring
  };
}

function renderText(taxonomy) {
  const lines = [];
  lines.push("RVM keyword taxonomy");
  lines.push("");
  lines.push("Source scaffolding");
  for (const value of taxonomy.sourceScaffolding) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Semantic core kinds");
  for (const value of taxonomy.semanticCore) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Lowered runtime kinds");
  for (const value of taxonomy.loweredRuntimeKinds) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Graph data kinds");
  for (const value of taxonomy.graphDataKinds) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Operator authored top-level forms");
  for (const value of taxonomy.operatorAuthoring.topLevelForms) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Operator authored field keywords");
  for (const value of taxonomy.operatorAuthoring.fieldKeywords) lines.push(`- ${value}`);
  lines.push("");
  lines.push("Operator authored enums");
  for (const [key, values] of Object.entries(taxonomy.operatorAuthoring.enums)) {
    lines.push(`- ${key}: ${values.join(", ")}`);
  }
  return lines.join("\n");
}

async function main() {
  const [applySource, rvmSource, operatorSpecsSource, operatorExampleSource] = await Promise.all([
    fs.readFile(APPLY_PATH, "utf8"),
    fs.readFile(RVM_PATH, "utf8"),
    fs.readFile(OPERATOR_SPECS_PATH, "utf8"),
    fs.readFile(OPERATOR_EXAMPLE_PATH, "utf8")
  ]);

  const taxonomy = buildTaxonomy({
    applySource,
    rvmSource,
    operatorSpecsSource,
    operatorExampleSource
  });

  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(taxonomy, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderText(taxonomy)}\n`);
}

await main();
