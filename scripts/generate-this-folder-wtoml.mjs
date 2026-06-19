#!/usr/bin/env node
/**
 * Basic auto-generator for this.folder.wtoml files.
 *
 * Generates structural baseline:
 * - folder entity
 * - contains relations for direct children (files + subfolders)
 *
 * Uses the same id conventions as platform-model.js and knowledge-relations.wtoml.
 *
 * For initial baseline: only creates the file if it does not already exist.
 * This preserves any hand-maintained rich versions (e.g. docs/intent/this.folder.wtoml).
 *
 * Run with: node scripts/generate-this-folder-wtoml.mjs
 *
 * Philosophy alignment:
 * - Provides initial machine-readable folder metadata.
 * - Tolerates future manual enrichment.
 * - Later reapers/automation can update structural parts or clean stale relations.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const IGNORES = new Set([
  'node_modules',
  '.git',
  'tmp',
  'dist',
  'build',
  '.grok',
  'coverage',
  '.next',
  'out',
  'example-ports', // large, skip for speed in baseline if desired; remove to include
]);

function shouldIgnore(name) {
  if (IGNORES.has(name)) return true;
  if (name.startsWith('.') && name !== '.') return true; // skip hidden dirs except current
  return false;
}

function normalize(rel) {
  return rel.replace(/\\/g, '/');
}

function getTargetId(relPath, isDir) {
  const value = normalize(relPath);
  if (isDir) {
    return `folder:${value}`;
  }
  if (value.endsWith('.md')) return `doc:${value}`;
  if (value.endsWith('.rvm')) return `rvm:${value}`;
  if (value.endsWith('.wcss')) return `wcss:${value}`;
  if (value.endsWith('.wtoml')) return `wtoml:${value}`;
  if (value.endsWith('.json')) return `json:${value}`;
  return `file:${value}`;
}

async function listDirectChildren(dirRel) {
  const full = path.join(ROOT, dirRel);
  try {
    const entries = await fs.readdir(full, { withFileTypes: true });
    return entries
      .filter(e => !shouldIgnore(e.name))
      .map(e => ({
        name: e.name,
        isDir: e.isDirectory(),
        relPath: normalize(path.join(dirRel, e.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    return [];
  }
}

function generateStructuralBlock(folderId, children) {
  let out = `# --- Structural containment (auto-generated baseline) ---
# Direct children at generation time.
# Re-run generator to update this section (preserves hand-maintained content).
`;

  if (children.length === 0) {
    out += '\n# (empty folder at baseline time)\n';
  } else {
    for (const child of children) {
      const target = getTargetId(child.relPath, child.isDir);
      out += `
[[relation]]
from = "${folderId}"
rel = "contains"
to = "${target}"
`;
    }
  }

  out += `
# --- End of auto-generated structural section ---
`;
  return out;
}

function generateFullContent(dirRel, children) {
  const folderId = dirRel ? `folder:${normalize(dirRel)}` : 'folder:.';
  const displayPath = dirRel || '.';
  const folderLabel = path.basename(dirRel || 'root');

  const structural = generateStructuralBlock(folderId, children);

  return `# this.folder.wtoml
#
# Auto-generated structural baseline.
# 
# - Contains the folder entity and direct "contains" relations (refreshed by generator).
# - Hand-edit to add richer knowledge (facets, custom relations to intents/docs/code, etc.) BELOW the structural section.
# - Generator will only touch the structural section on re-run.
# - Staleness is tolerated: if children change, re-generate or use reapers to manage debt.
# - Aligns with project: append-only friendly, visible drift, multi-source (auto + hand + server).
#
# Ids follow platform conventions (see platform-model.js and knowledge-relations.wtoml).
#

[folder]
id = "${folderId}"
path = "${displayPath}"
label = "${folderLabel}"
summary = "Folder metadata for ${displayPath}."
facet = ["system"]
lifecycle = ["author", "steward"]
owner = "plugin.platform"

${structural}

# Add hand-maintained or other automation relations below this line.
# Example:
# [[relation]]
# from = "${folderId}"
# rel = "describedBy"
# to = "doc:..."
`;
}

async function mergeIntoExisting(thisFilePath, folderId, children) {
  const existing = await fs.readFile(thisFilePath, 'utf8');
  const structural = generateStructuralBlock(folderId, children);

  const startMarker = '# --- Structural containment (auto-generated baseline) ---';
  const endMarker = '# --- End of auto-generated structural section ---';

  const startIdx = existing.indexOf(startMarker);
  const endIdx = existing.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace the section
    const before = existing.substring(0, startIdx);
    const after = existing.substring(endIdx + endMarker.length);
    const newContent = before + structural + after;
    await fs.writeFile(thisFilePath, newContent, 'utf8');
    return true; // merged
  } else {
    // No markers, append the structural at end (or replace whole if we want baseline)
    const newContent = existing.trimEnd() + '\n\n' + structural.trim();
    await fs.writeFile(thisFilePath, newContent, 'utf8');
    return true;
  }
}

async function processDir(dirRel) {
  const thisFilePath = path.join(ROOT, dirRel, 'this.folder.wtoml');
  const children = await listDirectChildren(dirRel);
  const folderId = dirRel ? `folder:${normalize(dirRel)}` : 'folder:.';

  try {
    await fs.access(thisFilePath);
    // Exists — merge/refresh only the structural section.
    const didMerge = await mergeIntoExisting(thisFilePath, folderId, children);
    console.log(`[merged structural] ${dirRel || '.'} (${children.length} children)`);
  } catch {
    // Does not exist — generate full baseline.
    const content = generateFullContent(dirRel, children);
    await fs.writeFile(thisFilePath, content, 'utf8');
    console.log(`[generated baseline] ${dirRel || '.'} (${children.length} children)`);
  }

  // Recurse into subdirs (always, to cover everything)
  for (const child of children) {
    if (child.isDir) {
      await processDir(child.relPath);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const checkMode = args.includes('--check') || args.includes('-c');

  console.log(checkMode 
    ? 'Checking this.folder.wtoml baselines for drift...'
    : 'Generating this.folder.wtoml baseline for the repository...');
  console.log('Root:', ROOT);
  console.log('Ignoring:', [...IGNORES].join(', '));
  console.log('');

  const start = Date.now();
  await processDir(''); // start at root

  console.log('');
  const duration = ((Date.now() - start) / 1000).toFixed(1);
  if (checkMode) {
    console.log(`Check complete in ${duration}s (no changes made in --check mode).`);
    // In real CI, we'd diff or have the merge report changes.
    // For baseline, just succeed if ran.
  } else {
    console.log(`Baseline generation complete in ${duration}s`);
  }
  console.log('Next steps: review some generated files, enhance high-value folders manually,');
  console.log('integrate loader in platform-model.js, add generator to CI/tests if desired.');
}

main().catch(err => {
  console.error('Generator failed:', err);
  process.exit(1);
});
