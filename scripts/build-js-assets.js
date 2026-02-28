#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');

const ROOT = process.cwd();
const ASSETS_DIR = path.join(ROOT, 'assets');
const TRANSLATIONS = ['nasb', 'cunp'];

const HEADER = 'window.__BIBLE_APP_ASSETS = window.__BIBLE_APP_ASSETS || Object.create(null);\n';

async function walkJsonFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkJsonFiles(full)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function toPosixRel(absPath) {
  return path.relative(ASSETS_DIR, absPath).split(path.sep).join('/');
}

function keyFromRelJsonPath(relPath) {
  return relPath.replace(/\.json$/i, '');
}

async function buildForTranslation(translation) {
  const baseDir = path.join(ASSETS_DIR, translation);
  const files = await walkJsonFiles(baseDir);

  let count = 0;
  for (const file of files) {
    const relJson = toPosixRel(file);
    const key = keyFromRelJsonPath(relJson);
    const raw = await fs.readFile(file, 'utf8');

    JSON.parse(raw);

    const jsOut = `${HEADER}window.__BIBLE_APP_ASSETS[${JSON.stringify(key)}] = ${raw.trimEnd()};\n`;
    const outPath = file.replace(/\.json$/i, '.js');
    await fs.writeFile(outPath, jsOut, 'utf8');
    count += 1;
  }

  return count;
}

async function main() {
  let total = 0;
  for (const translation of TRANSLATIONS) {
    const count = await buildForTranslation(translation);
    total += count;
    console.log(`${translation}: wrote ${count} js files`);
  }
  console.log(`done: ${total} js files`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
