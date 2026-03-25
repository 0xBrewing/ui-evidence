import path from 'node:path';
import { ensureDir, fileExists, listFiles, toPosixPath, writeJson } from './fs.mjs';
import { writeFile } from 'node:fs/promises';
import { inferLocale, selectViewports } from './selection.mjs';
import { getCaptureStatePath, loadCaptureState } from '../capture/capture-state.mjs';

const RAW_CAPTURE_PATTERN = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__(?<phase>before|after)\.png$/;
const PAIR_CAPTURE_PATTERN = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__compare\.png$/;

function parseRawCapture(filePath) {
  const match = RAW_CAPTURE_PATTERN.exec(path.basename(filePath));
  if (!match) {
    return null;
  }
  return {
    screen: match.groups.screen,
    locale: match.groups.locale,
    viewport: match.groups.viewport,
    phase: match.groups.phase,
    filePath,
  };
}

function parsePairCapture(filePath) {
  const match = PAIR_CAPTURE_PATTERN.exec(path.basename(filePath));
  if (!match) {
    return null;
  }
  return {
    screen: match.groups.screen,
    locale: match.groups.locale,
    viewport: match.groups.viewport,
    filePath,
  };
}

export function getStagePaths(config, stage, language) {
  const stageDir = path.join(config.meta.artifactsRoot, stage.id);
  return {
    stageDir,
    beforeDir: path.join(stageDir, 'before'),
    afterDir: path.join(stageDir, 'after'),
    comparisonDir: path.join(stageDir, 'comparison'),
    pairDir: path.join(stageDir, 'comparison', 'pairs'),
    overviewDir: path.join(stageDir, 'comparison', 'overview'),
    reviewDir: path.join(stageDir, 'review'),
    notesPath: path.join(stageDir, `notes.${language}.md`),
    reportPath: path.join(stageDir, `report.${language}.md`),
    manifestPath: path.join(stageDir, 'manifest.json'),
    captureStatePath: getCaptureStatePath(config, stage),
    reviewPath: path.join(stageDir, 'review', 'index.html'),
  };
}

function buildNotesTemplate(config, stage, language) {
  const checklist = config.report?.checklist?.length
    ? config.report.checklist.map((item) => `- ${item}`).join('\n')
    : '- button height\n- font weight\n- spacing\n- alignment';
  const screenChecklist = stage.screens
    .map((screen) => `- ${screen.label}: \`${screen.fileId ?? screen.id}__${inferLocale(screen)}__*__*.png\``)
    .join('\n');

  if (language === 'ko') {
    return `# ${stage.title}

## 작업 목적
- ${stage.description}

## 캡처 대상 화면
${screenChecklist}

## 수정 전 관찰
- 

## 설정/훅
- 인증:
- setup hook:
- prepare hook:

## 시각 확인 포인트
${checklist}

## 수정 후 요약
- 

## 검증
- 실행 명령:
- 결과:

## 커밋/PR
- 브랜치:
- 커밋:
- PR:
`;
  }

  return `# ${stage.title}

## Purpose
- ${stage.description}

## Capture Targets
${screenChecklist}

## Before Observations
- 

## Config and Hooks
- Auth:
- setup hook:
- prepare hook:

## Visual Checklist
${checklist}

## After Summary
- 

## Verification
- Commands:
- Results:

## Commit or PR
- Branch:
- Commit:
- PR:
`;
}

export async function ensureStageStructure(config, stage, language) {
  const stagePaths = getStagePaths(config, stage, language);
  await Promise.all([
    ensureDir(stagePaths.beforeDir),
    ensureDir(stagePaths.afterDir),
    ensureDir(stagePaths.pairDir),
    ensureDir(stagePaths.overviewDir),
    ensureDir(stagePaths.reviewDir),
  ]);

  if (!(await fileExists(stagePaths.notesPath))) {
    await writeFile(stagePaths.notesPath, buildNotesTemplate(config, stage, language), 'utf8');
  }

  return stagePaths;
}

export async function buildStageManifest(config, stage, language) {
  const stagePaths = getStagePaths(config, stage, language);
  const [beforeFiles, afterFiles, pairFiles, overviewFiles, captureState] = await Promise.all([
    listFiles(stagePaths.beforeDir, '.png'),
    listFiles(stagePaths.afterDir, '.png'),
    listFiles(stagePaths.pairDir, '.png'),
    listFiles(stagePaths.overviewDir, '.png'),
    loadCaptureState(config, stage),
  ]);

  const beforeMap = new Map(
    beforeFiles
      .map((filePath) => parseRawCapture(filePath))
      .filter(Boolean)
      .map((item) => [`${item.screen}::${item.locale}::${item.viewport}`, item]),
  );
  const afterMap = new Map(
    afterFiles
      .map((filePath) => parseRawCapture(filePath))
      .filter(Boolean)
      .map((item) => [`${item.screen}::${item.locale}::${item.viewport}`, item]),
  );
  const pairMap = new Map(
    pairFiles
      .map((filePath) => parsePairCapture(filePath))
      .filter(Boolean)
      .map((item) => [`${item.screen}::${item.locale}::${item.viewport}`, item]),
  );
  const stateEntries = captureState.entries ?? {};

  function resolveExecution({ phase, screenId, viewportId, fallbackOutput }) {
    const entry = stateEntries[`${phase}::${screenId}::${viewportId}`];
    if (entry) {
      return {
        status: entry.status ?? 'missing',
        startedAt: entry.startedAt ?? null,
        finishedAt: entry.finishedAt ?? null,
        totalMs: entry.totalMs ?? null,
        timings: entry.timings ?? {},
        failure: entry.failure ?? null,
        outputPath: entry.outputPath ?? fallbackOutput ?? null,
      };
    }

    if (fallbackOutput) {
      return {
        status: 'success',
        startedAt: null,
        finishedAt: null,
        totalMs: null,
        timings: {},
        failure: null,
        outputPath: fallbackOutput,
      };
    }

    return {
      status: 'missing',
      startedAt: null,
      finishedAt: null,
      totalMs: null,
      timings: {},
      failure: null,
      outputPath: null,
    };
  }

  const captures = [];
  for (const viewport of selectViewports(config, stage)) {
    for (const screen of stage.screens) {
      const fileId = screen.fileId ?? screen.id;
      const locale = inferLocale(screen);
      const key = `${fileId}::${locale}::${viewport.id}`;
      const before = beforeMap.get(key);
      const after = afterMap.get(key);
      const pair = pairMap.get(key);
      const status = before && after ? 'complete' : before ? 'missing-after' : after ? 'missing-before' : 'missing-both';
      const beforePath = before ? toPosixPath(path.relative(config.meta.projectRoot, before.filePath)) : null;
      const afterPath = after ? toPosixPath(path.relative(config.meta.projectRoot, after.filePath)) : null;
      const pairPath = pair ? toPosixPath(path.relative(config.meta.projectRoot, pair.filePath)) : null;

      captures.push({
        screenId: screen.id,
        fileId,
        label: screen.label,
        locale,
        viewportId: viewport.id,
        before: beforePath,
        after: afterPath,
        pair: pairPath,
        status,
        execution: {
          before: resolveExecution({
            phase: 'before',
            screenId: screen.id,
            viewportId: viewport.id,
            fallbackOutput: beforePath,
          }),
          after: resolveExecution({
            phase: 'after',
            screenId: screen.id,
            viewportId: viewport.id,
            fallbackOutput: afterPath,
          }),
        },
      });
    }
  }

  const completeCaptures = captures.filter((item) => item.status === 'complete').length;
  const failedCaptures = captures.reduce(
    (sum, item) =>
      sum
      + Number(item.execution.before.status === 'failed')
      + Number(item.execution.after.status === 'failed'),
    0,
  );

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    stage: {
      id: stage.id,
      title: stage.title,
      description: stage.description,
    },
    artifacts: {
      notes: toPosixPath(path.relative(config.meta.projectRoot, stagePaths.notesPath)),
      report: toPosixPath(path.relative(config.meta.projectRoot, stagePaths.reportPath)),
      review: toPosixPath(path.relative(config.meta.projectRoot, stagePaths.reviewPath)),
      captureState: toPosixPath(path.relative(config.meta.projectRoot, stagePaths.captureStatePath)),
      before: beforeFiles.map((filePath) => toPosixPath(path.relative(config.meta.projectRoot, filePath))),
      after: afterFiles.map((filePath) => toPosixPath(path.relative(config.meta.projectRoot, filePath))),
      pairs: pairFiles.map((filePath) => toPosixPath(path.relative(config.meta.projectRoot, filePath))),
      overviews: overviewFiles.map((filePath) => toPosixPath(path.relative(config.meta.projectRoot, filePath))),
    },
    captures,
    counts: {
      before: beforeFiles.length,
      after: afterFiles.length,
      pairs: pairFiles.length,
      overviews: overviewFiles.length,
      expectedCaptures: captures.length,
      completeCaptures,
      failedCaptures,
      pendingCaptures: captures.length - completeCaptures,
    },
  };

  await writeJson(stagePaths.manifestPath, manifest);
  return manifest;
}
