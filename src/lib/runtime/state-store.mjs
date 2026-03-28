import path from 'node:path';
import crypto from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { ensureDir, fileExists, readJson } from '../util/fs.mjs';

function normalizeStateKey(key) {
  const normalized = String(key ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/');

  if (!normalized || normalized === '.' || normalized.includes('..')) {
    throw new Error(`Invalid state key "${key}".`);
  }

  return normalized;
}

export function createRunId(prefix = 'run') {
  const now = new Date();
  const stamp = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
  ].join('') + ['-', String(now.getUTCHours()).padStart(2, '0'), String(now.getUTCMinutes()).padStart(2, '0'), String(now.getUTCSeconds()).padStart(2, '0')].join('');
  return `${prefix}-${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

export function resolveStatePath(config, key) {
  const normalized = normalizeStateKey(key);
  return path.join(config.meta.runtimeStateRoot, `${normalized}.json`);
}

async function atomicWriteJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(tempPath, filePath);
}

export async function getState(config, key) {
  const filePath = resolveStatePath(config, key);
  if (!(await fileExists(filePath))) {
    return null;
  }
  return readJson(filePath);
}

export async function putState(config, key, value) {
  const filePath = resolveStatePath(config, key);
  await atomicWriteJson(filePath, value);
  return filePath;
}

export async function deleteState(config, key) {
  await rm(resolveStatePath(config, key), { force: true });
}

export function createRuntimeHandle(config, runId = createRunId('capture')) {
  return {
    runId,
    stateDir: config.meta.runtimeStateRoot,
    tempDir: config.meta.runtimeTempRoot,
    artifactsDir: config.meta.artifactsRoot,
  };
}

export function createStateApi(config) {
  return {
    get: (key) => getState(config, key),
    put: (key, value) => putState(config, key, value),
    delete: (key) => deleteState(config, key),
    resolvePath: (key) => resolveStatePath(config, key),
  };
}
