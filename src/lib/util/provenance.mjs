import crypto from 'node:crypto';
import path from 'node:path';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { ensureDir, fileExists, readJson, writeJson } from './fs.mjs';

export const DIRECTORY_PROVENANCE_FILE = '.ui-evidence-provenance.json';
const MARKER = 'ui-evidence:provenance';

function digestBuffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function getCommentSyntax(filePath) {
  if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    return {
      render: (payload) => `# ${MARKER} ${payload}\n`,
      parse: (content) => {
        const [firstLine = ''] = content.split('\n');
        const match = /^# ui-evidence:provenance (.+)$/.exec(firstLine.trim());
        return match?.[1] ?? null;
      },
      strip: (content) => content.replace(/^# ui-evidence:provenance .+\n/, ''),
    };
  }

  return {
    render: (payload) => `<!-- ${MARKER} ${payload} -->\n`,
    parse: (content) => {
      const [firstLine = ''] = content.split('\n');
      const match = /^<!-- ui-evidence:provenance (.+) -->$/.exec(firstLine.trim());
      return match?.[1] ?? null;
    },
    strip: (content) => content.replace(/^<!-- ui-evidence:provenance .+ -->\n/, ''),
  };
}

export function buildProvenanceRecord({
  generatedBy = 'ui-evidence install',
  source,
  packageVersion,
  sourceDigest,
  lastSyncedAt = new Date().toISOString(),
}) {
  return {
    generatedBy,
    source,
    packageVersion,
    sourceDigest,
    lastSyncedAt,
  };
}

export function addProvenanceHeader(filePath, content, record) {
  const syntax = getCommentSyntax(filePath);
  const stripped = syntax.strip(content);
  return `${syntax.render(JSON.stringify(record))}${stripped}`;
}

export function readProvenanceHeader(filePath, content) {
  const syntax = getCommentSyntax(filePath);
  const payload = syntax.parse(content);
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function hashFile(filePath) {
  return digestBuffer(await readFile(filePath));
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === DIRECTORY_PROVENANCE_FILE) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

export async function hashDirectory(directory) {
  const hash = crypto.createHash('sha256');
  const files = await listFiles(directory);
  for (const relativePath of files) {
    hash.update(`${relativePath}\n`);
    hash.update(await readFile(path.join(directory, relativePath)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export async function writeDirectoryProvenance(directory, record) {
  await ensureDir(directory);
  await writeJson(path.join(directory, DIRECTORY_PROVENANCE_FILE), record);
}

export async function readDirectoryProvenance(directory) {
  const filePath = path.join(directory, DIRECTORY_PROVENANCE_FILE);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readJson(filePath);
}

export async function writeManagedFile(filePath, content, record) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, addProvenanceHeader(filePath, content, record), 'utf8');
}
