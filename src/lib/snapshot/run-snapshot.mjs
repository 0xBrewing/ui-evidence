import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { captureResolvedPlan } from '../capture/playwright-capture.mjs';
import { ensureDir, toPosixPath, writeJson } from '../util/fs.mjs';
import { inferLocale, resolveBaseUrl, resolveCapturePlan } from '../util/selection.mjs';
import { renderSnapshotReviewHtml } from './render-snapshot-review.mjs';

function sanitizeId(value, fallback = 'snapshot') {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function buildRunId(now, label) {
  const date = now instanceof Date ? now : new Date(now);
  const stamp = [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('') + ['-', pad(date.getUTCHours()), pad(date.getUTCMinutes()), pad(date.getUTCSeconds())].join('');
  const suffix = label ? `--${sanitizeId(label, 'snapshot')}` : '';
  return `${stamp}${suffix}`;
}

function getSnapshotPaths(config, runId, language) {
  const runDir = path.join(config.meta.artifactsRoot, 'snapshots', runId);
  return {
    runDir,
    capturesDir: path.join(runDir, 'captures'),
    overviewDir: path.join(runDir, 'overview'),
    reviewDir: path.join(runDir, 'review'),
    notesPath: path.join(runDir, `notes.${language}.md`),
    reportPath: path.join(runDir, `report.${language}.md`),
    manifestPath: path.join(runDir, 'manifest.json'),
    reviewPath: path.join(runDir, 'review', 'index.html'),
  };
}

function relativeToProject(config, absolutePath) {
  return toPosixPath(path.relative(config.meta.projectRoot, absolutePath));
}

function relativeFromReview(reviewDir, projectRoot, relativeTarget) {
  const absoluteTarget = path.join(projectRoot, relativeTarget);
  return toPosixPath(path.relative(reviewDir, absoluteTarget));
}

function buildSnapshotTitle(plan, label) {
  if (plan.scope?.title) {
    return plan.scope.title;
  }
  if (label) {
    return `Current UI Snapshot · ${label}`;
  }
  return 'Current UI Snapshot';
}

function buildSnapshotDescription(plan) {
  if (plan.scope?.description) {
    return plan.scope.description;
  }

  const stageCount = plan.selections.length;
  const screenCount = plan.selections.reduce((sum, selection) => sum + selection.screens.length, 0);
  return `Current UI snapshot for ${stageCount} stage(s) and ${screenCount} selected screen(s).`;
}

function relativeConfigPath(config) {
  return toPosixPath(path.relative(config.meta.projectRoot, config.meta.configPath));
}

function formatParamsOption(paramsFilter = {}) {
  const entries = Object.entries(paramsFilter ?? {});
  if (!entries.length) {
    return null;
  }
  return entries.map(([key, value]) => `${key}=${value}`).join(',');
}

function buildSnapshotCommand(config, {
  scopeId = null,
  stageArg = 'all',
  screenIds = [],
  viewportIds = [],
  profileId = null,
  paramsFilter = {},
  label = null,
  command = 'snapshot',
}) {
  const parts = ['ui-evidence', command, '--config', relativeConfigPath(config)];
  if (scopeId) {
    parts.push('--scope', scopeId);
  } else if (stageArg && stageArg !== 'all') {
    parts.push('--stage', stageArg);
  }
  if (screenIds.length) {
    parts.push('--screens', screenIds.join(','));
  }
  if (viewportIds.length) {
    parts.push('--viewports', viewportIds.join(','));
  }
  if (profileId) {
    parts.push('--profile', profileId);
  }
  const paramsOption = formatParamsOption(paramsFilter);
  if (paramsOption) {
    parts.push('--params', paramsOption);
  }
  if (label) {
    parts.push('--label', label);
  }
  return parts.join(' ');
}

function buildSelectionSummary(plan) {
  return plan.selections.map(({ stage, screens, viewports }) => ({
    stageId: stage.id,
    stageTitle: stage.title,
    screenIds: screens.map((screen) => screen.id),
    screenLabels: screens.map((screen) => screen.label),
    viewportIds: viewports.map((viewport) => viewport.id),
  }));
}

function buildCaptureOutputPath(paths, stage, screen, viewport) {
  const outputBaseId = screen.fileId ?? screen.id;
  const locale = inferLocale(screen);
  return path.join(paths.capturesDir, stage.id, `${outputBaseId}__${locale}__${viewport.id}__current.png`);
}

function groupCapturesByStageViewport(captures) {
  const groups = new Map();

  for (const capture of captures) {
    const key = `${capture.stageId}::${capture.viewportId}`;
    const existing = groups.get(key);
    if (existing) {
      existing.captures.push(capture);
      continue;
    }

    groups.set(key, {
      key,
      stageId: capture.stageId,
      stageTitle: capture.stageTitle,
      viewportId: capture.viewportId,
      captures: [capture],
    });
  }

  return Array.from(groups.values());
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderTextSvg({ width, height, text, fill = 'transparent', color = '#2b1e14', fontSize = 18, weight = 600 }) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${fill}" rx="16" ry="16" />
  <text x="50%" y="50%" fill="${color}" font-size="${fontSize}" font-family="Arial, sans-serif" font-weight="${weight}" text-anchor="middle" dominant-baseline="middle">${escapeXml(
    text,
  )}</text>
</svg>`);
}

function fitWithin(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function buildSnapshotOverviewImage(group, outputPath) {
  const density = 2;
  const columns = 2;
  const pagePadding = 28 * density;
  const gap = 20 * density;
  const titleHeight = 60 * density;
  const cardWidth = 420 * density;
  const cardHeight = 300 * density;
  const cardInnerPadding = 14 * density;
  const labelHeight = 42 * density;
  const imageMaxWidth = cardWidth - cardInnerPadding * 2;
  const imageMaxHeight = cardHeight - cardInnerPadding * 2 - labelHeight;

  const prepared = await Promise.all(
    group.captures.map(async (capture) => {
      const metadata = await sharp(capture.outputPath).metadata();
      const size = fitWithin(metadata.width ?? 1, metadata.height ?? 1, imageMaxWidth, imageMaxHeight);
      const buffer = await sharp(capture.outputPath)
        .resize({ width: size.width, height: size.height, fit: 'inside' })
        .png()
        .toBuffer();

      return {
        ...capture,
        buffer,
        width: size.width,
        height: size.height,
      };
    }),
  );

  const rows = Math.ceil(prepared.length / columns);
  const canvasWidth = pagePadding * 2 + cardWidth * columns + gap * Math.max(0, columns - 1);
  const canvasHeight = pagePadding * 2 + titleHeight + cardHeight * rows + gap * Math.max(0, rows - 1);
  const composites = [
    {
      input: renderTextSvg({
        width: canvasWidth - pagePadding * 2,
        height: titleHeight,
        text: `${group.stageId} / ${group.viewportId} / snapshot`,
        color: '#2b1e14',
        fontSize: 48,
        weight: 700,
      }),
      left: pagePadding,
      top: pagePadding,
    },
  ];

  prepared.forEach((capture, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const cardLeft = pagePadding + column * (cardWidth + gap);
    const cardTop = pagePadding + titleHeight + row * (cardHeight + gap);
    const imageLeft = cardLeft + Math.floor((cardWidth - capture.width) / 2);
    const imageTop = cardTop + labelHeight + cardInnerPadding + Math.floor((imageMaxHeight - capture.height) / 2);

    composites.push({
      input: renderTextSvg({
        width: cardWidth,
        height: cardHeight,
        fill: '#fcf8f1',
        color: '#fcf8f1',
      }),
      left: cardLeft,
      top: cardTop,
    });
    composites.push({
      input: renderTextSvg({
        width: cardWidth - cardInnerPadding * 2,
        height: labelHeight,
        text: capture.label,
        fill: '#e7d7c5',
        color: '#5f4528',
        fontSize: 32,
        weight: 700,
      }),
      left: cardLeft + cardInnerPadding,
      top: cardTop + cardInnerPadding,
    });
    composites.push({
      input: capture.buffer,
      left: imageLeft,
      top: imageTop,
    });
  });

  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: '#efe7db',
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function buildSnapshotOverviews(config, paths, captures) {
  const groups = groupCapturesByStageViewport(captures);
  const overviews = [];

  for (const group of groups) {
    const outputPath = path.join(paths.overviewDir, `${group.stageId}__${group.viewportId}__snapshot-overview.png`);
    await buildSnapshotOverviewImage(group, outputPath);
    overviews.push({
      stageId: group.stageId,
      stageTitle: group.stageTitle,
      viewportId: group.viewportId,
      outputPath,
    });
  }

  return overviews;
}

function renderKoreanNotes(snapshot) {
  const targetLines = snapshot.selection
    .map((item) => `- ${item.stageTitle} (\`${item.stageId}\`): ${item.screenLabels.join(', ')}`)
    .join('\n');
  const screenNotes = snapshot.selection
    .flatMap((item) => item.screenLabels.map((label, index) => `### ${label} (\`${item.screenIds[index]}\`)\n- `))
    .join('\n');

  return `# ${snapshot.run.title}

## 한줄 목적
- ${snapshot.run.description}

## 실행 범위
- 실행 ID: \`${snapshot.run.id}\`
- 선택 방식: ${snapshot.run.selectionMode}
- scope: ${snapshot.scope ? `\`${snapshot.scope.id}\`` : '없음'}
- 기준 URL: ${snapshot.run.baseUrl}

## 먼저 확인할 것
- 실패한 캡처가 있는지
- 관련 화면끼리 버튼, 타이포, 간격이 일관적인지
- 기대한 변경 외 회귀가 보이는지

## 캡처 대상
${targetLines}

## 화면별 메모
${screenNotes}

## 회귀 의심 / 확인 필요
- 

## 허용 가능한 차이
- 

## 후속 조치
- 
`;
}

function renderEnglishNotes(snapshot) {
  const targetLines = snapshot.selection
    .map((item) => `- ${item.stageTitle} (\`${item.stageId}\`): ${item.screenLabels.join(', ')}`)
    .join('\n');
  const screenNotes = snapshot.selection
    .flatMap((item) => item.screenLabels.map((label, index) => `### ${label} (\`${item.screenIds[index]}\`)\n- `))
    .join('\n');

  return `# ${snapshot.run.title}

## Purpose
- ${snapshot.run.description}

## Run Scope
- Run ID: \`${snapshot.run.id}\`
- Selection mode: ${snapshot.run.selectionMode}
- scope: ${snapshot.scope ? `\`${snapshot.scope.id}\`` : 'none'}
- base URL: ${snapshot.run.baseUrl}

## Review First
- Check whether any capture failed.
- Confirm the intended change is consistent across related screens.
- Note only meaningful regressions or rollout mismatches.

## Capture Targets
${targetLines}

## Screen Notes
${screenNotes}

## Suspected Regressions / Needs Confirmation
- 

## Acceptable Differences
- 

## Follow-up Actions
- 
`;
}

function renderFailureListKo(snapshot) {
  return snapshot.failures?.map((item) =>
    `- ${item.stageTitle} / ${item.label} / ${item.viewportId}: ${item.step} - ${item.message}`,
  ).join('\n') || '- 없음';
}

function renderFailureListEn(snapshot) {
  return snapshot.failures?.map((item) =>
    `- ${item.stageTitle} / ${item.label} / ${item.viewportId}: ${item.step} - ${item.message}`,
  ).join('\n') || '- none';
}

function renderKoreanReport(snapshot) {
  return `# ${snapshot.run.title}

## 목적
- ${snapshot.run.description}

## 한줄 요약
- 검토 가능한 current 캡처: ${snapshot.counts.captures}/${snapshot.counts.expectedCaptures}
- 실패한 캡처: ${snapshot.counts.failedCaptures}
- 번들 형태: self-contained

## 먼저 볼 항목
${renderFailureListKo(snapshot)}

## 바로 다시 실행
- snapshot 재실행: \`${snapshot.commands.rerun}\`
- 번들 다시 생성: \`${snapshot.commands.rebuild}\`

## 참고 링크
- notes: \`${snapshot.artifacts.notes}\`
- manifest: \`${snapshot.artifacts.manifest}\`
- review: \`${snapshot.artifacts.review}\`
`;
}

function renderEnglishReport(snapshot) {
  return `# ${snapshot.run.title}

## Purpose
- ${snapshot.run.description}

## Summary
- Reviewable current captures: ${snapshot.counts.captures}/${snapshot.counts.expectedCaptures}
- Failed captures: ${snapshot.counts.failedCaptures}
- Bundle type: self-contained

## Review First
${renderFailureListEn(snapshot)}

## Rerun
- snapshot: \`${snapshot.commands.rerun}\`
- rebuild bundle: \`${snapshot.commands.rebuild}\`

## References
- notes: \`${snapshot.artifacts.notes}\`
- manifest: \`${snapshot.artifacts.manifest}\`
- review: \`${snapshot.artifacts.review}\`
`;
}

function buildSnapshotReviewData(config, snapshot, paths) {
  return {
    generatedAt: snapshot.generatedAt,
    run: snapshot.run,
    counts: snapshot.counts,
    bundle: snapshot.bundle,
    failures: snapshot.failures,
    links: {
      notes: relativeFromReview(paths.reviewDir, config.meta.projectRoot, snapshot.artifacts.notes),
      report: relativeFromReview(paths.reviewDir, config.meta.projectRoot, snapshot.artifacts.report),
      manifest: relativeFromReview(paths.reviewDir, config.meta.projectRoot, snapshot.artifacts.manifest),
    },
    captures: snapshot.captures.map((item) => ({
      ...item,
      currentLink: relativeFromReview(paths.reviewDir, config.meta.projectRoot, item.current),
    })),
  };
}

export async function runSnapshot({
  config,
  scopeId = null,
  stageArg = 'all',
  screenIds = [],
  viewportIds = [],
  profileId = null,
  paramsFilter = {},
  baseUrlOverride,
  label = null,
  language = 'en',
  now = new Date(),
  logOptions = {},
}) {
  const plan = resolveCapturePlan(config, {
    scopeId,
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });
  const runId = buildRunId(now, label);
  const generatedAt = (now instanceof Date ? now : new Date(now)).toISOString();
  const paths = getSnapshotPaths(config, runId, language);
  const baseUrl = resolveBaseUrl(config, 'after', baseUrlOverride);

  await Promise.all([
    ensureDir(paths.capturesDir),
    ensureDir(paths.overviewDir),
    ensureDir(paths.reviewDir),
  ]);

  const captured = await captureResolvedPlan({
    config,
    phase: 'after',
    selections: plan.selections,
    baseUrlOverride,
    language,
    outputPathResolver: ({ stage, screen, viewport }) => buildCaptureOutputPath(paths, stage, screen, viewport),
    persistState: false,
    logOptions,
    runId,
  });
  const overviews = await buildSnapshotOverviews(config, paths, captured.outputs);

  const selection = buildSelectionSummary(plan);
  const captures = captured.outputs.map((item) => ({
    stageId: item.stageId,
    stageTitle: item.stageTitle,
    screenId: item.screenId,
    fileId: item.fileId,
    label: item.label,
    locale: item.locale,
    viewportId: item.viewportId,
    current: relativeToProject(config, item.outputPath),
  }));
  const overviewEntries = overviews.map((item) => ({
    stageId: item.stageId,
    stageTitle: item.stageTitle,
    viewportId: item.viewportId,
    path: relativeToProject(config, item.outputPath),
  }));
  const snapshot = {
    version: 1,
    kind: 'snapshot-run',
    generatedAt,
    run: {
      id: runId,
      label,
      title: buildSnapshotTitle(plan, label),
      description: buildSnapshotDescription(plan),
      selectionMode: plan.mode,
      baseUrl,
    },
    scope: plan.scope
      ? {
          id: plan.scope.id,
          title: plan.scope.title,
          description: plan.scope.description,
        }
      : null,
    selection,
    artifacts: {
      notes: relativeToProject(config, paths.notesPath),
      report: relativeToProject(config, paths.reportPath),
      manifest: relativeToProject(config, paths.manifestPath),
      review: relativeToProject(config, paths.reviewPath),
      current: captures.map((item) => item.current),
      overviews: overviewEntries.map((item) => item.path),
    },
    bundle: {
      selfContained: true,
      origin: 'snapshot-run',
    },
    failures: captured.failures.map((item) => ({
      stageId: item.stageId,
      stageTitle: item.stageTitle,
      screenId: item.screenId,
      fileId: item.fileId,
      label: item.label,
      locale: item.locale,
      viewportId: item.viewportId,
      step: item.execution.failure?.step ?? 'capture',
      message: item.execution.failure?.message ?? 'Unknown failure',
    })),
    captures,
    overviewEntries,
    commands: {
      rerun: buildSnapshotCommand(config, {
        scopeId,
        stageArg,
        screenIds,
        viewportIds,
        profileId,
        paramsFilter,
        label,
      }),
      rebuild: buildSnapshotCommand(config, {
        scopeId,
        stageArg,
        screenIds,
        viewportIds,
        profileId,
        paramsFilter,
        label,
      }),
    },
    counts: {
      stages: selection.length,
      screens: selection.reduce((sum, item) => sum + item.screenIds.length, 0),
      expectedCaptures: plan.selections.reduce((sum, item) => sum + item.screens.length * item.viewports.length, 0),
      captures: captures.length,
      overviews: overviewEntries.length,
      failedCaptures: captured.counts.failed,
    },
  };

  const notesContent = language === 'ko' ? renderKoreanNotes(snapshot) : renderEnglishNotes(snapshot);
  const reportContent = language === 'ko' ? renderKoreanReport(snapshot) : renderEnglishReport(snapshot);
  const reviewData = buildSnapshotReviewData(config, snapshot, paths);

  await Promise.all([
    writeJson(paths.manifestPath, snapshot),
    writeFile(paths.notesPath, notesContent, 'utf8'),
    writeFile(paths.reportPath, reportContent, 'utf8'),
    writeFile(paths.reviewPath, renderSnapshotReviewHtml(reviewData), 'utf8'),
  ]);

  return {
    runId,
    runDir: paths.runDir,
    reviewPath: paths.reviewPath,
    manifestPath: paths.manifestPath,
    counts: snapshot.counts,
    failedCaptures: captured.counts.failed,
    failures: captured.failures,
  };
}
