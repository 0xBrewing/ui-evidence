import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildStageManifest, ensureStageStructure, getStagePaths } from '../util/stage-notes.mjs';
import { resolveCapturePlan } from '../util/selection.mjs';
import { toPosixPath } from '../util/fs.mjs';

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

function buildStageCommand(config, {
  command = 'run',
  stageId,
  screenIds = [],
  viewportIds = [],
  profileId = null,
  paramsFilter = {},
  resume = false,
}) {
  const parts = ['ui-evidence', command, '--config', relativeConfigPath(config), '--stage', stageId];
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
  if (resume) {
    parts.push('--resume');
  }
  return parts.join(' ');
}

function pickDiagnostic(item) {
  const afterFailure = item.execution?.after?.status === 'failed' ? item.execution.after.failure : null;
  if (afterFailure) {
    return { phase: 'after', ...afterFailure };
  }
  const beforeFailure = item.execution?.before?.status === 'failed' ? item.execution.before.failure : null;
  if (beforeFailure) {
    return { phase: 'before', ...beforeFailure };
  }
  return null;
}

function summarizeIssues(manifest) {
  const failed = [];
  const missing = [];
  const currentOnly = [];

  for (const item of manifest.captures) {
    const diagnostic = pickDiagnostic(item);
    if (diagnostic) {
      failed.push(`${item.label} (${item.viewportId}): ${diagnostic.phase} · ${diagnostic.step ?? 'capture'} · ${diagnostic.message ?? 'Unknown failure'}`);
      continue;
    }

    if (item.status === 'current-only') {
      currentOnly.push(`${item.label} (${item.viewportId})`);
      continue;
    }

    if (item.status !== 'complete') {
      missing.push(`${item.label} (${item.viewportId}): ${item.status}`);
    }
  }

  return { failed, missing, currentOnly };
}

function renderIssueBlock(lines, emptyLabel) {
  return lines.length ? lines.map((line) => `- ${line}`).join('\n') : `- ${emptyLabel}`;
}

function renderKoreanReport(config, stage, manifest, notesPath, options = {}) {
  const { failed, missing, currentOnly } = summarizeIssues(manifest);
  const rerunScreens = Array.from(new Set(
    manifest.captures
      .filter((item) => pickDiagnostic(item) || item.status !== 'complete')
      .map((item) => item.screenId),
  ));
  const selectedViewportIds = options.viewportIds ?? [];
  const rerunCommand = buildStageCommand(config, {
    command: 'run',
    stageId: stage.id,
    screenIds: rerunScreens,
    viewportIds: selectedViewportIds,
    profileId: options.profileId,
    paramsFilter: options.paramsFilter,
    resume: true,
  });
  const reviewCommand = buildStageCommand(config, {
    command: 'review',
    stageId: stage.id,
    screenIds: options.screenIds ?? [],
    viewportIds: selectedViewportIds,
    profileId: options.profileId,
    paramsFilter: options.paramsFilter,
  });

  return `# ${stage.title}

## 한줄 요약
- 검토 가능한 카드: ${manifest.counts.reviewableCaptures}/${manifest.counts.expectedCaptures}
- 실패한 raw 캡처: ${manifest.counts.failedCaptures}
- 누락된 카드: ${manifest.counts.pendingCaptures}
- 번들 origin: ${manifest.bundle?.origin ?? 'local-stage'}${manifest.snapshot?.runId ? ` (\`${manifest.snapshot.runId}\`)` : ''}

## 먼저 볼 항목
### 실패한 캡처
${renderIssueBlock(failed, '없음')}

### 누락되거나 아직 reviewable 하지 않은 카드
${renderIssueBlock(missing, '없음')}

### snapshot current-only 카드
${renderIssueBlock(currentOnly, '없음')}

## 바로 다시 실행
- 캡처 재실행: \`${rerunCommand}\`
- review 다시 생성: \`${reviewCommand}\`

## 참고 링크
- notes: \`${notesPath}\`
- manifest: \`${manifest.artifacts.report.replace(/report\.[^.]+\.md$/, 'manifest.json')}\`
- review: \`${manifest.artifacts.review}\`
`;
}

function renderEnglishReport(config, stage, manifest, notesPath, options = {}) {
  const { failed, missing, currentOnly } = summarizeIssues(manifest);
  const rerunScreens = Array.from(new Set(
    manifest.captures
      .filter((item) => pickDiagnostic(item) || item.status !== 'complete')
      .map((item) => item.screenId),
  ));
  const selectedViewportIds = options.viewportIds ?? [];
  const rerunCommand = buildStageCommand(config, {
    command: 'run',
    stageId: stage.id,
    screenIds: rerunScreens,
    viewportIds: selectedViewportIds,
    profileId: options.profileId,
    paramsFilter: options.paramsFilter,
    resume: true,
  });
  const reviewCommand = buildStageCommand(config, {
    command: 'review',
    stageId: stage.id,
    screenIds: options.screenIds ?? [],
    viewportIds: selectedViewportIds,
    profileId: options.profileId,
    paramsFilter: options.paramsFilter,
  });

  return `# ${stage.title}

## Summary
- Reviewable cards: ${manifest.counts.reviewableCaptures}/${manifest.counts.expectedCaptures}
- Failed raw captures: ${manifest.counts.failedCaptures}
- Missing cards: ${manifest.counts.pendingCaptures}
- Bundle origin: ${manifest.bundle?.origin ?? 'local-stage'}${manifest.snapshot?.runId ? ` (\`${manifest.snapshot.runId}\`)` : ''}

## Review First
### Failed captures
${renderIssueBlock(failed, 'none')}

### Missing or not-yet-reviewable cards
${renderIssueBlock(missing, 'none')}

### Snapshot current-only cards
${renderIssueBlock(currentOnly, 'none')}

## Rerun
- capture run: \`${rerunCommand}\`
- review rebuild: \`${reviewCommand}\`

## References
- notes: \`${notesPath}\`
- manifest: \`${manifest.artifacts.report.replace(/report\.[^.]+\.md$/, 'manifest.json')}\`
- review: \`${manifest.artifacts.review}\`
`;
}

export async function generateReports({ config, stageArg, screenIds = [], viewportIds = [], profileId = null, paramsFilter = {}, language }) {
  const plan = resolveCapturePlan(config, {
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });
  const written = [];

  for (const selection of plan.selections) {
    const { stage, screens, viewports } = selection;
    await ensureStageStructure(config, stage, language);
    const manifest = await buildStageManifest(config, stage, language, { screens, viewports });
    const stagePaths = getStagePaths(config, stage, language);
    const notesRelativePath = toPosixPath(path.relative(config.meta.projectRoot, stagePaths.notesPath));
    const content =
      language === 'ko'
        ? renderKoreanReport(config, stage, manifest, notesRelativePath, {
          screenIds: screens.map((screen) => screen.id),
          viewportIds: viewports.map((viewport) => viewport.id),
          profileId,
          paramsFilter,
        })
        : renderEnglishReport(config, stage, manifest, notesRelativePath, {
          screenIds: screens.map((screen) => screen.id),
          viewportIds: viewports.map((viewport) => viewport.id),
          profileId,
          paramsFilter,
        });
    await writeFile(stagePaths.reportPath, content, 'utf8');
    written.push(stagePaths.reportPath);
    console.log(`report ${stage.id}: ${stagePaths.reportPath}`);
  }

  return written;
}
