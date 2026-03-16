import { access, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
}

export async function removeDir(dirPath) {
  await rm(dirPath, { recursive: true, force: true });
}

export async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

export async function listFiles(dirPath, extension = null) {
  const entries = await readdir(dirPath, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dirPath, entry.name))
    .filter((filePath) => !extension || filePath.endsWith(extension));
}

export async function directoryExists(dirPath) {
  try {
    const details = await stat(dirPath);
    return details.isDirectory();
  } catch {
    return false;
  }
}

export async function walkFiles(rootDir, options = {}) {
  const {
    extensions = null,
    includeHidden = false,
    maxResults = 500,
    skipDirs = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'tmp', 'artifacts', 'screenshots']),
  } = options;

  const matches = [];

  async function visit(currentDir) {
    if (matches.length >= maxResults) {
      return;
    }

    const entries = await readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (matches.length >= maxResults) {
        return;
      }

      if (!includeHidden && entry.name.startsWith('.') && entry.name !== '.auth') {
        continue;
      }

      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) {
          continue;
        }
        await visit(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      if (extensions?.length && !extensions.includes(path.extname(entry.name).toLowerCase())) {
        continue;
      }

      matches.push(entryPath);
    }
  }

  await visit(rootDir);
  return matches;
}
