import path from 'node:path';
import sharp from 'sharp';
import { ensureStageStructure } from '../util/stage-notes.mjs';
import { resolveOverviewViewport, selectStages } from '../util/selection.mjs';
import { listFiles } from '../util/fs.mjs';

const pairFilePattern = /^(?<screen>.+?)__(?<locale>[^_]+)__(?<viewport>[^_]+)__(?<phase>before|after)\.png$/;

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderTextSvg({ width, height, text, fill = 'transparent', color = '#2b1e14', fontSize = 18, weight = 600 }) {
  return Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${fill}" rx="12" ry="12" />
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

function parseCaptureFile(filePath) {
  const match = pairFilePattern.exec(path.basename(filePath));
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

async function collectPairs(stageDir) {
  const beforeDir = path.join(stageDir, 'before');
  const afterDir = path.join(stageDir, 'after');
  const [beforeFiles, afterFiles] = await Promise.all([listFiles(beforeDir, '.png'), listFiles(afterDir, '.png')]);

  const beforeMap = new Map();
  const afterMap = new Map();

  for (const filePath of beforeFiles) {
    const parsed = parseCaptureFile(filePath);
    if (!parsed) {
      continue;
    }
    beforeMap.set(`${parsed.screen}::${parsed.locale}::${parsed.viewport}`, parsed);
  }

  for (const filePath of afterFiles) {
    const parsed = parseCaptureFile(filePath);
    if (!parsed) {
      continue;
    }
    afterMap.set(`${parsed.screen}::${parsed.locale}::${parsed.viewport}`, parsed);
  }

  return Array.from(beforeMap.keys())
    .filter((key) => afterMap.has(key))
    .sort()
    .map((key) => ({
      key,
      before: beforeMap.get(key),
      after: afterMap.get(key),
    }));
}

async function buildPairImage(pair, outputPath) {
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(pair.before.filePath).metadata(),
    sharp(pair.after.filePath).metadata(),
  ]);
  const imageWidth = Math.max(beforeMeta.width ?? 1, afterMeta.width ?? 1);
  const imageHeight = Math.max(beforeMeta.height ?? 1, afterMeta.height ?? 1);

  const outerPadding = 24;
  const gutter = 20;
  const titleHeight = 48;
  const labelHeight = 42;
  const footerHeight = 30;
  const canvasWidth = outerPadding * 2 + imageWidth * 2 + gutter;
  const canvasHeight = outerPadding * 2 + titleHeight + labelHeight + imageHeight + footerHeight;

  const leftX = outerPadding;
  const rightX = outerPadding + imageWidth + gutter;
  const imageTop = outerPadding + titleHeight + labelHeight;

  const beforeBuffer = await sharp(pair.before.filePath).png().toBuffer();
  const afterBuffer = await sharp(pair.after.filePath).png().toBuffer();
  const composites = [
    {
      input: renderTextSvg({
        width: canvasWidth - outerPadding * 2,
        height: titleHeight,
        text: `${pair.before.screen} / ${pair.before.locale} / ${pair.before.viewport}`,
        color: '#2b1e14',
        fontSize: 20,
        weight: 700,
      }),
      left: outerPadding,
      top: outerPadding,
    },
    {
      input: renderTextSvg({
        width: imageWidth,
        height: labelHeight,
        text: 'BEFORE',
        fill: '#ded6c8',
        color: '#4d3a26',
        fontSize: 16,
      }),
      left: leftX,
      top: outerPadding + titleHeight,
    },
    {
      input: renderTextSvg({
        width: imageWidth,
        height: labelHeight,
        text: 'AFTER',
        fill: '#e0cdb9',
        color: '#7a5527',
        fontSize: 16,
      }),
      left: rightX,
      top: outerPadding + titleHeight,
    },
    {
      input: beforeBuffer,
      left: leftX + Math.floor((imageWidth - (beforeMeta.width ?? imageWidth)) / 2),
      top: imageTop,
    },
    {
      input: afterBuffer,
      left: rightX + Math.floor((imageWidth - (afterMeta.width ?? imageWidth)) / 2),
      top: imageTop,
    },
    {
      input: renderTextSvg({
        width: canvasWidth - outerPadding * 2,
        height: footerHeight,
        text: 'UI evidence before/after comparison',
        color: '#6d5a44',
        fontSize: 14,
        weight: 400,
      }),
      left: outerPadding,
      top: imageTop + imageHeight,
    },
  ];

  await sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: '#f5f1ea',
    },
  })
    .composite(composites)
    .png()
    .toFile(outputPath);
}

async function buildOverviewImage(stageId, pairOutputs, outputPath) {
  const columns = 2;
  const pagePadding = 28;
  const gap = 20;
  const titleHeight = 60;
  const cardWidth = 420;
  const cardHeight = 260;

  const resized = await Promise.all(
    pairOutputs.map(async (item) => {
      const metadata = await sharp(item.outputPath).metadata();
      const size = fitWithin(metadata.width ?? 1, metadata.height ?? 1, cardWidth, cardHeight);
      const buffer = await sharp(item.outputPath).resize({ width: size.width, height: size.height, fit: 'inside' }).png().toBuffer();
      return { ...item, buffer, width: size.width, height: size.height };
    }),
  );

  const rows = Math.ceil(resized.length / columns);
  const canvasWidth = pagePadding * 2 + cardWidth * columns + gap * (columns - 1);
  const canvasHeight = pagePadding * 2 + titleHeight + cardHeight * rows + gap * Math.max(0, rows - 1);

  const composites = [
    {
      input: renderTextSvg({
        width: canvasWidth - pagePadding * 2,
        height: titleHeight,
        text: `${stageId} / overview`,
        color: '#2b1e14',
        fontSize: 24,
        weight: 700,
      }),
      left: pagePadding,
      top: pagePadding,
    },
  ];

  resized.forEach((item, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const left = pagePadding + column * (cardWidth + gap) + Math.floor((cardWidth - item.width) / 2);
    const top = pagePadding + titleHeight + row * (cardHeight + gap) + Math.floor((cardHeight - item.height) / 2);
    composites.push({
      input: item.buffer,
      left,
      top,
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

export async function buildComparisons({ config, stageArg, overviewViewport, language }) {
  const stages = selectStages(config, stageArg);
  const resolvedOverviewViewport = resolveOverviewViewport(config, overviewViewport);
  let pairCount = 0;
  let overviewCount = 0;

  for (const stage of stages) {
    const stagePaths = await ensureStageStructure(config, stage, language);
    const pairs = await collectPairs(stagePaths.stageDir);
    const outputs = [];

    for (const pair of pairs) {
      const outputPath = path.join(
        stagePaths.pairDir,
        `${pair.before.screen}__${pair.before.locale}__${pair.before.viewport}__compare.png`,
      );
      await buildPairImage(pair, outputPath);
      pairCount += 1;
      outputs.push({
        ...pair,
        outputPath,
      });
    }

    const overviewPairs = outputs.filter((item) => item.before.viewport === resolvedOverviewViewport);
    if (overviewPairs.length) {
      const overviewPath = path.join(stagePaths.overviewDir, `${stage.id}__${resolvedOverviewViewport}__overview.png`);
      await buildOverviewImage(stage.id, overviewPairs, overviewPath);
      overviewCount += 1;
    }

    console.log(`built ${stage.id}: ${outputs.length} pair comparison(s)`);
  }

  return { pairCount, overviewCount };
}
