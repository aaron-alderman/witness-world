#!/usr/bin/env node
/**
 * Basic reaper for stale this.folder.wtoml relations.
 *
 * Scans for this.folder.wtoml files, parses their "contains" relations,
 * and reports any targets that no longer exist on disk.
 *
 * This surfaces alignment debt for ContextHub / manual cleanup.
 *
 * Run: node scripts/reap-stale-folder-metas.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const IGNORES = new Set(['node_modules', '.git', 'tmp', 'dist', 'build', '.grok']);

function normalize(rel) {
  return rel.replace(/\\/g, '/');
}

async function findFolderMetas(dir = '') {
  const results = [];
  const full = path.join(ROOT, dir);
  let entries;
  try {
    entries = await fs.readdir(full, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (IGNORES.has(entry.name)) continue;
    const rel = normalize(path.join(dir, entry.name));
    const fullChild = path.join(ROOT, rel);

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.')) continue;
      results.push(...(await findFolderMetas(rel)));
    } else if (entry.name === 'this.folder.wtoml') {
      results.push(rel);
    }
  }
  return results;
}

async function checkStale(metaRel) {
  const fullMeta = path.join(ROOT, metaRel);
  const source = await fs.readFile(fullMeta, 'utf8');
  const lines = source.split('\n');
  const stale = [];

  // Simple parse for contains relations (robust enough for baseline)
  for (const line of lines) {
    const match = line.match(/from = "([^"]+)"\s*rel = "contains"\s*to = "([^"]+)"/);
    if (!match) continue;
    const target = match[2].replace(/^(doc|folder|file|wtoml|code):/, '');
    if (!target) continue;
    const targetPath = path.join(ROOT, target);
    try {
      await fs.access(targetPath);
    } catch {
      stale.push(target);
    }
  }
  return stale;
}

async function main() {
  console.log('Reaping stale folder metas...');
  const metas = await findFolderMetas();
  console.log(`Found ${metas.length} this.folder.wtoml files`);

  let totalStale = 0;
  for (const meta of metas) {
    const stale = await checkStale(meta);
    if (stale.length > 0) {
      console.log(`\n[STALE] ${meta}`);
      for (const s of stale) {
        console.log(`  - missing: ${s}`);
      }
      totalStale += stale.length;
    }
  }

  console.log(`\nReaper complete. ${totalStale} stale contains relations found.`);
  console.log('These can be cleaned or marked as alignment debt.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
