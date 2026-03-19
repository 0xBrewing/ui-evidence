import path from 'node:path';
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

const sourceDir = path.resolve(repoRoot, readArg('--source') ?? path.join('skills', 'ui-evidence'));
const mirrorDir = path.resolve(
  repoRoot,
  readArg('--mirror') ?? path.join('plugins', 'ui-evidence', 'skills', 'ui-evidence'),
);

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
      continue;
    }

    files.push(relativePath);
  }

  return files.sort();
}

async function compareTrees() {
  const sourceFiles = await listFiles(sourceDir);
  const mirrorFiles = await listFiles(mirrorDir);

  if (JSON.stringify(sourceFiles) !== JSON.stringify(mirrorFiles)) {
    throw new Error(`skill mirror file list is out of sync\nsource: ${sourceFiles.join(', ')}\nmirror: ${mirrorFiles.join(', ')}`);
  }

  for (const relativePath of sourceFiles) {
    const sourceContent = await readFile(path.join(sourceDir, relativePath), 'utf8');
    const mirrorContent = await readFile(path.join(mirrorDir, relativePath), 'utf8');
    if (sourceContent !== mirrorContent) {
      throw new Error(`skill mirror content mismatch: ${relativePath}`);
    }
  }
}

async function syncMirror() {
  await rm(mirrorDir, { recursive: true, force: true });
  await mkdir(path.dirname(mirrorDir), { recursive: true });
  await cp(sourceDir, mirrorDir, { recursive: true });
}

async function main() {
  if (process.argv.includes('--check')) {
    await compareTrees();
    console.log('skill mirror is in sync');
    return;
  }

  await syncMirror();
  console.log(`synced ${sourceDir} -> ${mirrorDir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
