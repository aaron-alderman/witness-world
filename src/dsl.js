import fs from "node:fs/promises";
import path from "node:path";
import { compileWtomlDocsToDesirePlus, normalizeDesirePlusToDesire, applyDesire } from "./desire/index.js";

// Tiny TOML-ish DSL parser. Intentional subset:
//   [[section]]
//   key = "value"
//   key = 123
//   key = true
//   key = { a = "b", n = 1 }
//   key = ["a", "b"]
//
// v0.14 adds ergonomic surface sugar while keeping the same witnessed runtime:
//   [[defaults]] actor = "adam"
//   [[heading]] id = "title" text = "Hello" level = 1
//   [[form]] id = "todo_form" role = "todo-form" children = ["todo_input", "todo_add"]
//   [[step]] program = "p" on = "load" op = "fetchJson" url = "/api" into = "response"
// Unknown widget keys become props. Unknown step keys become params.
export function parseWitnessToml(source) {
  const docs = [];
  let current = null;
  let lineNum = 0;

  for (const raw of source.split(/\r?\n/)) {
    lineNum++;
    const line = stripComment(raw).trim();
    if (!line) continue;

    const arraySection = line.match(/^\[\[\s*([A-Za-z_][A-Za-z0-9_-]*)\s*\]\]$/);
    if (arraySection) {
      current = { kind: arraySection[1], values: {}, line: lineNum, sectionStyle: "array" };
      docs.push(current);
      continue;
    }

    const tableSection = line.match(/^\[\s*([A-Za-z_][A-Za-z0-9_-]*)(?:\.([A-Za-z_][A-Za-z0-9_-]*))?\s*\]$/);
    if (tableSection) {
      current = { kind: tableSection[1], values: tableSection[2] ? { id: tableSection[2] } : {}, line: lineNum, sectionStyle: "table" };
      docs.push(current);
      continue;
    }

    if (!current) throw new Error(`key/value before section: ${line}`);

    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`expected key = value: ${line}`);

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) throw new Error(`invalid key: ${key}`);
    current.values[key] = parseValue(value);
  }

  return docs;
}

export async function loadWitnessTomlFile(file, { seen = new Set() } = {}) {
  const resolved = path.resolve(file);
  if (seen.has(resolved)) return [];
  seen.add(resolved);

  const source = await fs.readFile(resolved, "utf8");
  const docs = parseWitnessToml(source).map(doc => ({ ...doc, file: resolved }));
  const imports = docs
    .filter(doc => doc.kind === "app" && Array.isArray(doc.values.imports))
    .flatMap(doc => doc.values.imports);

  const imported = [];
  for (const spec of imports) {
    imported.push(...await loadWitnessTomlFile(path.resolve(path.dirname(resolved), spec), { seen }));
  }

  return [...docs, ...imported];
}

export function applyWitnessToml(world, source) {
  return applyWitnessDocs(world, parseWitnessToml(source));
}

export function applyWitnessDocs(world, docs) {
  const desirePlus = compileWtomlDocsToDesirePlus(docs);
  const desire = normalizeDesirePlusToDesire(desirePlus);
  return applyDesire(world, desire);
}

export function applyWitnessDocsLegacy(world, docs) {
  return applyWitnessDocs(world, docs);
}

function stripComment(line) {
  let quote = false;
  let braceDepth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && braceDepth === 0 && ch === "#") return line.slice(0, i);
  }
  return line;
}

function parseValue(text) {
  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) return JSON.parse(text);
  if (text === "true") return true;
  if (text === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (text.startsWith("{") && text.endsWith("}")) return parseInlineTable(text);
  if (text.startsWith("[") && text.endsWith("]")) return parseArray(text);
  throw new Error(`unsupported value: ${text}`);
}

function parseInlineTable(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return {};
  const out = {};
  for (const part of splitTopLevel(inner, ",")) {
    const eq = part.indexOf("=");
    if (eq < 0) throw new Error(`bad inline table entry: ${part}`);
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    out[key] = parseValue(value);
  }
  return out;
}

function parseArray(text) {
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return splitTopLevel(inner, ",").map(x => parseValue(x.trim()));
}

function splitTopLevel(text, delimiter) {
  const parts = [];
  let quote = false;
  let braceDepth = 0;
  let bracketDepth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' && text[i - 1] !== "\\") quote = !quote;
    if (!quote && ch === "{") braceDepth++;
    if (!quote && ch === "}") braceDepth--;
    if (!quote && ch === "[") bracketDepth++;
    if (!quote && ch === "]") bracketDepth--;
    if (!quote && braceDepth === 0 && bracketDepth === 0 && ch === delimiter) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}
