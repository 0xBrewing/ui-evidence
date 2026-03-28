import path from 'node:path';
import { copyFile, readdir } from 'node:fs/promises';
import { directoryExists, ensureDir, fileExists, listFiles, readJson, toPosixPath, writeJson } from './fs.mjs';
import { writeFile } from 'node:fs/promises';
import { inferLocale, selectViewports } from './selection.mjs';
import { getCaptureStatePath, loadCaptureState } from '../capture/capture-state.mjs';

const RAW_CAPTURE_PATTERN = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__(?<phase>before|after)\.png$/;
const PAIR_CAPTURE_PATTERN = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__compare\.png$/;
const CURRENT_CAPTURE_PATTERN = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__current\.png$/;

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

function parseCurrentCapture(filePath) {
  const match = CURRENT_CAPTURE_PATTERN.exec(path.basename(filePath));
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

function buildCaptureKey(screenOrFileId, locale, viewportId) {
  return `${screenOrFileId}::${locale}::${viewportId}`;
}

function relativeToProject(config, absolutePath) {
  return toPosixPath(path.relative(config.meta.projectRoot, absolutePath));
}

async function materializeSnapshotStageArtifacts(config, stagePaths, snapshotFallback, screens, viewportIds) {
  const screenById = new Map(screens.map((screen) => [screen.id, screen]));
  const allowedScreenIds = new Set(screens.map((screen) => screen.id));
  const allowedViewportIds = new Set(viewportIds);

  const captures = [];
  for (const item of snapshotFallback.captures ?? []) {
    if (!allowedScreenIds.has(item.screenId) || !allowedViewportIds.has(item.viewportId)) {
      continue;
    }

    const screen = screenById.get(item.screenId);
    if (!screen) {
      continue;
    }

    const fileId = item.fileId ?? screen.fileId ?? screen.id;
    const destinationPath = path.join(stagePaths.currentDir, `${fileId}__${item.locale}__${item.viewportId}__current.png`);
    await ensureDir(path.dirname(destinationPath));
    await copyFile(path.resolve(config.meta.projectRoot, item.current), destinationPath);
    captures.push({
      ...item,
      fileId,
      current: relativeToProject(config, destinationPath),
    });
  }

  const overviews = [];
  for (const item of snapshotFallback.overviews ?? []) {
    if (!allowedViewportIds.has(item.viewportId)) {
      continue;
    }

    const destinationPath = path.join(stagePaths.overviewDir, path.basename(item.path));
    await ensureDir(path.dirname(destinationPath));
    await copyFile(path.resolve(config.meta.projectRoot, item.path), destinationPath);
    overviews.push({
      ...item,
      path: relativeToProject(config, destinationPath),
    });
  }

  return {
    ...snapshotFallback,
    captures,
    overviews,
  };
}

async function loadLatestSnapshotStageArtifacts(config, stage) {
  const snapshotsDir = path.join(config.meta.artifactsRoot, 'snapshots');
  if (!(await directoryExists(snapshotsDir))) {
    return null;
  }

  const runDirs = (await readdir(snapshotsDir, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const runId of runDirs) {
    const manifestPath = path.join(snapshotsDir, runId, 'manifest.json');
    if (!(await fileExists(manifestPath))) {
      continue;
    }

    let manifest;
    try {
      manifest = await readJson(manifestPath);
    } catch {
      continue;
    }

    if (manifest?.kind !== 'snapshot-run') {
      continue;
    }

    const captures = [];
    for (const item of manifest.captures ?? []) {
      if (item?.stageId !== stage.id || !item?.current) {
        continue;
      }

      const absoluteCurrentPath = path.join(config.meta.projectRoot, item.current);
      if (!(await fileExists(absoluteCurrentPath))) {
        continue;
      }

      captures.push(item);
    }

    const overviews = [];
    for (const item of manifest.overviewEntries ?? []) {
      if (item?.stageId !== stage.id || !item?.path) {
        continue;
      }

      const absoluteOverviewPath = path.join(config.meta.projectRoot, item.path);
      if (!(await fileExists(absoluteOverviewPath))) {
        continue;
      }

      overviews.push(item);
    }

    if (!captures.length && !overviews.length) {
      continue;
    }

    return {
      runId: manifest.run?.id ?? runId,
      generatedAt: manifest.generatedAt ?? null,
      manifest: manifest.artifacts?.manifest ?? toPosixPath(path.relative(config.meta.projectRoot, manifestPath)),
      review: manifest.artifacts?.review ?? null,
      captures,
      overviews,
    };
  }

  return null;
}

export function getStagePaths(config, stage, language) {
  const stageDir = path.join(config.meta.artifactsRoot, stage.id);
  return {
    stageDir,
    beforeDir: path.join(stageDir, 'before'),
    afterDir: path.join(stageDir, 'after'),
    currentDir: path.join(stageDir, 'current'),
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
    .map((screen) => `### ${screen.label} (\`${screen.id}\`)\n- `)
    .join('\n');

  if (language === 'ko') {
    return `# ${stage.title}

## 한줄 목적
- ${stage.description}

## 먼저 확인할 것
- 누락되거나 실패한 캡처가 있는지
- 관련 화면끼리 버튼, 타이포, 간격이 일관적인지
- 기대한 변경만 들어가고 주변 화면 회귀는 없는지

## 화면별 메모
${screenChecklist}

## 회귀 의심 / 확인 필요
- 

## 허용 가능한 차이
- 

## 시각 체크리스트
${checklist}

## 후속 조치
- 

## 최종 결론
- 
`;
  }

  return `# ${stage.title}

## Purpose
- ${stage.description}

## Review First
- Check whether any capture failed or is missing.
- Confirm the intended change is consistent across related screens.
- Note only meaningful regressions or rollout mismatches.

## Screen Notes
${screenChecklist}

## Suspected Regressions / Needs Confirmation
- 

## Acceptable Differences
- 

## Visual Checklist
${checklist}

## Follow-up Actions
- 

## Final Verdict
- 
`;
}

export async function ensureStageStructure(config, stage, language) {
  const stagePaths = getStagePaths(config, stage, language);
  await Promise.all([
    ensureDir(stagePaths.beforeDir),
    ensureDir(stagePaths.afterDir),
    ensureDir(stagePaths.currentDir),
    ensureDir(stagePaths.pairDir),
    ensureDir(stagePaths.overviewDir),
    ensureDir(stagePaths.reviewDir),
  ]);

  if (!(await fileExists(stagePaths.notesPath))) {
    await writeFile(stagePaths.notesPath, buildNotesTemplate(config, stage, language), 'utf8');
  }

  return stagePaths;
}

export async function buildStageManifest(config, stage, language, options = {}) {
  const selectedScreens = options.screens ?? stage.screens;
  const selectedViewports = options.viewports ?? selectViewports(config, stage);
  const stagePaths = getStagePaths(config, stage, language);
  const [beforeFiles, afterFiles, pairFiles, overviewFiles, currentFiles, captureState] = await Promise.all([
    listFiles(stagePaths.beforeDir, '.png'),
    listFiles(stagePaths.afterDir, '.png'),
    listFiles(stagePaths.pairDir, '.png'),
    listFiles(stagePaths.overviewDir, '.png'),
    listFiles(stagePaths.currentDir, '.png'),
    loadCaptureState(config, stage),
  ]);
  const allowedCaptureKeys = new Set(
    selectedScreens.flatMap((screen) =>
      selectedViewports.map((viewport) => buildCaptureKey(screen.fileId ?? screen.id, inferLocale(screen), viewport.id)),
    ),
  );
  const allowedScreenIds = new Set(selectedScreens.map((screen) => screen.id));
  const allowedViewportIds = new Set(selectedViewports.map((viewport) => viewport.id));

  const beforeMap = new Map(
    beforeFiles
      .map((filePath) => parseRawCapture(filePath))
      .filter((item) => item && allowedCaptureKeys.has(buildCaptureKey(item.screen, item.locale, item.viewport)))
      .map((item) => [`${item.screen}::${item.locale}::${item.viewport}`, item]),
  );
  const afterMap = new Map(
    afterFiles
      .map((filePath) => parseRawCapture(filePath))
      .filter((item) => item && allowedCaptureKeys.has(buildCaptureKey(item.screen, item.locale, item.viewport)))
      .map((item) => [`${item.screen}::${item.locale}::${item.viewport}`, item]),
  );
  const pairMap = new Map(
    pairFiles
      .map((filePath) => parsePairCapture(filePath))
      .filter((item) => item && allowedCaptureKeys.has(buildCaptureKey(item.screen, item.locale, item.viewport)))
      .map((item) => [buildCaptureKey(item.screen, item.locale, item.viewport), item]),
  );
  const localCurrentEntries = currentFiles
    .map((filePath) => parseCurrentCapture(filePath))
    .filter((item) => item && allowedCaptureKeys.has(buildCaptureKey(item.screen, item.locale, item.viewport)));
  const snapshotFallback =
    beforeFiles.length === 0 && afterFiles.length === 0 && pairFiles.length === 0 && localCurrentEntries.length === 0
      ? await loadLatestSnapshotStageArtifacts(config, stage)
      : null;
  const materializedSnapshot =
    snapshotFallback
      ? await materializeSnapshotStageArtifacts(
        config,
        stagePaths,
        snapshotFallback,
        selectedScreens,
        selectedViewports.map((viewport) => viewport.id),
      )
      : null;
  const stateEntries = captureState.entries ?? {};
  const currentMap = new Map([
    ...localCurrentEntries.map((item) => [
      buildCaptureKey(item.screen, item.locale, item.viewport),
      {
        fileId: item.screen,
        current: relativeToProject(config, item.filePath),
        locale: item.locale,
        viewportId: item.viewport,
      },
    ]),
    ...(materializedSnapshot?.captures ?? [])
      .filter((item) => allowedScreenIds.has(item.screenId) && allowedViewportIds.has(item.viewportId))
      .map((item) => [
        buildCaptureKey(item.fileId ?? item.screenId, item.locale, item.viewportId),
        item,
      ]),
  ]);
  const localOverviewPaths = overviewFiles
    .filter((filePath) => selectedViewports.some((viewport) => path.basename(filePath).includes(`__${viewport.id}__`)))
    .map((filePath) => relativeToProject(config, filePath));
  const overviewArtifactPaths = localOverviewPaths.length
    ? localOverviewPaths
    : (materializedSnapshot?.overviews ?? [])
      .filter((item) => allowedViewportIds.has(item.viewportId))
      .map((item) => item.path);
  const currentArtifactPaths = [
    ...localCurrentEntries.map((item) => relativeToProject(config, item.filePath)),
    ...(materializedSnapshot?.captures ?? [])
      .filter((item) => allowedScreenIds.has(item.screenId) && allowedViewportIds.has(item.viewportId))
      .map((item) => item.current),
  ];
  const bundleOrigin = materializedSnapshot ? 'materialized-snapshot' : 'local-stage';
  const snapshotLikeStage =
    beforeFiles.length === 0
    && afterFiles.length === 0
    && pairFiles.length === 0
    && (currentArtifactPaths.length > 0 || Boolean(materializedSnapshot));

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
  for (const viewport of selectedViewports) {
    for (const screen of selectedScreens) {
      const fileId = screen.fileId ?? screen.id;
      const locale = inferLocale(screen);
      const key = buildCaptureKey(fileId, locale, viewport.id);
      const before = beforeMap.get(key);
      const after = afterMap.get(key);
      const pair = pairMap.get(key);
      const current = currentMap.get(buildCaptureKey(fileId, locale, viewport.id))
        ?? currentMap.get(buildCaptureKey(screen.id, locale, viewport.id));
      const status = before && after
        ? 'complete'
        : current
          ? 'current-only'
          : snapshotLikeStage
            ? 'missing-current'
            : before
              ? 'missing-after'
              : after
                ? 'missing-before'
                : 'missing-both';
      const beforePath = before ? toPosixPath(path.relative(config.meta.projectRoot, before.filePath)) : null;
      const afterPath = after ? toPosixPath(path.relative(config.meta.projectRoot, after.filePath)) : null;
      const pairPath = pair ? toPosixPath(path.relative(config.meta.projectRoot, pair.filePath)) : null;
      const currentPath = current?.current ?? null;

      captures.push({
        screenId: screen.id,
        fileId,
        label: screen.label,
        locale,
        viewportId: viewport.id,
        before: beforePath,
        after: afterPath,
        pair: pairPath,
        current: currentPath,
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
  const currentCaptures = captures.filter((item) => item.status === 'current-only').length;
  const reviewableCaptures = captures.filter(
    (item) => item.status === 'complete' || item.status === 'current-only',
  ).length;
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
    snapshot:
      materializedSnapshot
        ? {
            runId: materializedSnapshot.runId,
            generatedAt: materializedSnapshot.generatedAt,
          }
        : null,
    bundle: {
      selfContained: true,
      origin: bundleOrigin,
    },
    artifacts: {
      notes: relativeToProject(config, stagePaths.notesPath),
      report: relativeToProject(config, stagePaths.reportPath),
      review: relativeToProject(config, stagePaths.reviewPath),
      captureState: relativeToProject(config, stagePaths.captureStatePath),
      before: beforeFiles.map((filePath) => relativeToProject(config, filePath)),
      after: afterFiles.map((filePath) => relativeToProject(config, filePath)),
      pairs: pairFiles.map((filePath) => relativeToProject(config, filePath)),
      current: currentArtifactPaths,
      overviews: overviewArtifactPaths,
    },
    captures,
    counts: {
      before: beforeFiles.length,
      after: afterFiles.length,
      pairs: pairFiles.length,
      currentCaptures,
      overviews: overviewArtifactPaths.length,
      expectedCaptures: captures.length,
      completeCaptures,
      reviewableCaptures,
      failedCaptures,
      pendingCaptures: captures.length - reviewableCaptures,
    },
  };

  await writeJson(stagePaths.manifestPath, manifest);
  return manifest;
}
