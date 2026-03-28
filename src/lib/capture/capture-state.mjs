import path from 'node:path';
import { ensureDir, fileExists, readJson, toPosixPath, writeJson } from '../util/fs.mjs';

const STATE_VERSION = 1;

export function getCaptureStatePath(config, stage) {
  return path.join(config.meta.runtimeStateRoot, 'capture', `${stage.id}.json`);
}

export function buildCaptureStateKey({ phase, screenId, viewportId }) {
  return `${phase}::${screenId}::${viewportId}`;
}

export async function loadCaptureState(config, stage) {
  const filePath = getCaptureStatePath(config, stage);
  if (!(await fileExists(filePath))) {
    return {
      version: STATE_VERSION,
      updatedAt: null,
      entries: {},
    };
  }

  const parsed = await readJson(filePath);
  return {
    version: STATE_VERSION,
    updatedAt: parsed.updatedAt ?? null,
    entries: parsed.entries ?? {},
  };
}

export async function saveCaptureState(config, stage, state) {
  const filePath = getCaptureStatePath(config, stage);
  await ensureDir(path.dirname(filePath));
  await writeJson(filePath, {
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    entries: state.entries ?? {},
  });
}

export function buildCaptureStateEntry({
  config,
  phase,
  stage,
  screen,
  viewport,
  locale,
  execution,
  outputPath,
}) {
  return {
    phase,
    screenId: screen.id,
    fileId: screen.fileId ?? screen.id,
    viewportId: viewport.id,
    locale,
    status: execution.status,
    outputPath: outputPath ? toPosixPath(path.relative(config.meta.projectRoot, outputPath)) : null,
    startedAt: execution.startedAt ?? null,
    finishedAt: execution.finishedAt ?? null,
    totalMs: execution.totalMs ?? null,
    timings: execution.timings ?? {},
    failure: execution.failure ?? null,
  };
}
