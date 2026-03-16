import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/load-config.mjs';
import { buildComparisons } from '../src/lib/compare/build-comparisons.mjs';
import { generateReports } from '../src/lib/report/render-report.mjs';
import { buildReviewPages } from '../src/lib/review/build-review.mjs';
import { readJson } from '../src/lib/util/fs.mjs';

const CONFIG_YAML = `version: 1
project:
  name: smoke-app
  rootDir: .
artifacts:
  rootDir: screenshots/ui-evidence
  notesLanguage: en
  reportLanguage: en
  overviewViewport: mobile-390
capture:
  baseUrl: http://127.0.0.1:3000
  browser:
    headless: true
    freezeAnimations: true
    waitForFonts: true
    waitForNetworkIdleMs: 2000
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
      locale: en-US
      timezoneId: UTC
stages:
  - id: landing
    title: Landing
    description: Landing page review
    defaultViewports:
      - mobile-390
    screens:
      - id: hero
        fileId: hero
        label: Hero
        path: /
        waitFor:
          selector: body
`;

test('compare, report, and review generate human-facing artifacts', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-review-'));

  try {
    await writeFile(path.join(tempDir, 'ui-evidence.config.yaml'), CONFIG_YAML, 'utf8');
    const beforeDir = path.join(tempDir, 'screenshots', 'ui-evidence', 'landing', 'before');
    const afterDir = path.join(tempDir, 'screenshots', 'ui-evidence', 'landing', 'after');
    await mkdir(beforeDir, { recursive: true });
    await mkdir(afterDir, { recursive: true });

    await sharp({
      create: {
        width: 200,
        height: 160,
        channels: 4,
        background: '#efddc8',
      },
    }).png().toFile(path.join(beforeDir, 'hero__default__mobile-390__before.png'));

    await sharp({
      create: {
        width: 200,
        height: 160,
        channels: 4,
        background: '#c9d9f8',
      },
    }).png().toFile(path.join(afterDir, 'hero__default__mobile-390__after.png'));

    const config = await loadConfig(path.join(tempDir, 'ui-evidence.config.yaml'));
    await buildComparisons({ config, stageArg: 'landing', language: 'en' });
    await generateReports({ config, stageArg: 'landing', language: 'en' });
    await buildReviewPages({ config, stageArg: 'landing', language: 'en' });

    const manifest = await readJson(path.join(tempDir, 'screenshots', 'ui-evidence', 'landing', 'manifest.json'));
    const reviewHtml = await readFile(path.join(tempDir, 'screenshots', 'ui-evidence', 'landing', 'review', 'index.html'), 'utf8');

    assert.equal(manifest.counts.completeCaptures, 1);
    assert.equal(manifest.captures[0].status, 'complete');
    assert.ok(manifest.artifacts.review.endsWith('review/index.html'));
    assert.match(reviewHtml, /Landing Review/);
    assert.match(reviewHtml, /hero__default__mobile-390__compare\.png/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
