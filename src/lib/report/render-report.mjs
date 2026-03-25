import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { buildStageManifest, ensureStageStructure, getStagePaths } from '../util/stage-notes.mjs';
import { inferLocale, selectStages } from '../util/selection.mjs';
import { toPosixPath } from '../util/fs.mjs';

function renderKoreanReport(config, stage, manifest, notesPath) {
  const screenLines = stage.screens
    .map((screen) => `- ${screen.label}: \`${screen.fileId ?? screen.id}__${inferLocale(screen)}__*__*.png\``)
    .join('\n');
  const checklist = config.report?.checklist?.length
    ? config.report.checklist.map((item) => `- ${item}`).join('\n')
    : '- spacing\n- button alignment\n- font weight';

  return `# ${stage.title}

## 목적
- ${stage.description}

## 캡처 대상
${screenLines}

## 산출물 요약
- before: ${manifest.counts.before}장
- after: ${manifest.counts.after}장
- pair 비교 이미지: ${manifest.counts.pairs}장
- current 캡처: ${manifest.counts.currentCaptures ?? 0}장
- overview 이미지: ${manifest.counts.overviews}장
- 완료된 비교 카드: ${manifest.counts.completeCaptures}/${manifest.counts.expectedCaptures}
- 검토 가능한 카드: ${manifest.counts.reviewableCaptures ?? manifest.counts.completeCaptures}/${manifest.counts.expectedCaptures}
- 실패한 raw 캡처: ${manifest.counts.failedCaptures}

## 체크리스트
${checklist}

## 참고 경로
- notes: \`${notesPath}\`
- manifest: \`${manifest.artifacts.report.replace(/report\.[^.]+\.md$/, 'manifest.json')}\`
- review: \`${manifest.artifacts.review}\`

## 비교 이미지
${manifest.artifacts.overviews.map((item) => `- \`${item}\``).join('\n') || '- 없음'}

## current 이미지
${(manifest.artifacts.current ?? []).map((item) => `- \`${item}\``).join('\n') || '- 없음'}

## pair 이미지
${manifest.artifacts.pairs.map((item) => `- \`${item}\``).join('\n') || '- 없음'}

## 비고
- 상세 관찰과 서술형 리뷰는 notes 파일에 이어서 기록하세요.
- 사람 검토는 review HTML에서 먼저 보고, 자세한 기록은 notes에 남기세요.
`;
}

function renderEnglishReport(config, stage, manifest, notesPath) {
  const screenLines = stage.screens
    .map((screen) => `- ${screen.label}: \`${screen.fileId ?? screen.id}__${inferLocale(screen)}__*__*.png\``)
    .join('\n');
  const checklist = config.report?.checklist?.length
    ? config.report.checklist.map((item) => `- ${item}`).join('\n')
    : '- spacing\n- button alignment\n- font weight';

  return `# ${stage.title}

## Purpose
- ${stage.description}

## Capture Targets
${screenLines}

## Artifact Summary
- before: ${manifest.counts.before}
- after: ${manifest.counts.after}
- pair comparisons: ${manifest.counts.pairs}
- current captures: ${manifest.counts.currentCaptures ?? 0}
- overview sheets: ${manifest.counts.overviews}
- completed review cards: ${manifest.counts.completeCaptures}/${manifest.counts.expectedCaptures}
- reviewable cards: ${manifest.counts.reviewableCaptures ?? manifest.counts.completeCaptures}/${manifest.counts.expectedCaptures}
- failed raw captures: ${manifest.counts.failedCaptures}

## Checklist
${checklist}

## References
- notes: \`${notesPath}\`
- manifest: \`${manifest.artifacts.report.replace(/report\.[^.]+\.md$/, 'manifest.json')}\`
- review: \`${manifest.artifacts.review}\`

## Overview Images
${manifest.artifacts.overviews.map((item) => `- \`${item}\``).join('\n') || '- none'}

## Current Images
${(manifest.artifacts.current ?? []).map((item) => `- \`${item}\``).join('\n') || '- none'}

## Pair Images
${manifest.artifacts.pairs.map((item) => `- \`${item}\``).join('\n') || '- none'}

## Notes
- Keep detailed visual observations in the notes file.
- Use the review HTML as the primary human-facing comparison surface.
`;
}

export async function generateReports({ config, stageArg, language }) {
  const stages = selectStages(config, stageArg);
  const written = [];

  for (const stage of stages) {
    await ensureStageStructure(config, stage, language);
    const manifest = await buildStageManifest(config, stage, language);
    const stagePaths = getStagePaths(config, stage, language);
    const notesRelativePath = toPosixPath(path.relative(config.meta.projectRoot, stagePaths.notesPath));
    const content =
      language === 'ko'
        ? renderKoreanReport(config, stage, manifest, notesRelativePath)
        : renderEnglishReport(config, stage, manifest, notesRelativePath);
    await writeFile(stagePaths.reportPath, content, 'utf8');
    written.push(stagePaths.reportPath);
    console.log(`report ${stage.id}: ${stagePaths.reportPath}`);
  }

  return written;
}
