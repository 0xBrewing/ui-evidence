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
import { fileExists, readJson } from '../src/lib/util/fs.mjs';

const CONFIG_YAML = `version: 1
project:
  name: smoke-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
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
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(path.join(tempDir, 'ui-evidence', 'config.yaml'), CONFIG_YAML, 'utf8');
    const beforeDir = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'before');
    const afterDir = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'after');
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

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    await buildComparisons({ config, stageArg: 'landing', language: 'en' });
    await generateReports({ config, stageArg: 'landing', language: 'en' });
    await buildReviewPages({ config, stageArg: 'landing', language: 'en' });

    const stageDir = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing');
    const reviewDir = path.join(stageDir, 'review');
    const manifest = await readJson(path.join(stageDir, 'manifest.json'));
    const reviewHtml = await readFile(path.join(reviewDir, 'index.html'), 'utf8');
    const report = await readFile(path.join(stageDir, 'report.en.md'), 'utf8');

    assert.equal(manifest.counts.completeCaptures, 1);
    assert.equal(manifest.captures[0].status, 'complete');
    assert.equal(manifest.bundle.selfContained, true);
    assert.equal(manifest.bundle.origin, 'local-stage');
    assert.ok(manifest.artifacts.review.endsWith('review/index.html'));
    assert.match(reviewHtml, /Quick Scan/);
    assert.match(reviewHtml, /hero__default__mobile-390__compare\.png/);
    assert.match(reviewHtml, /\.\.\/comparison\/pairs\/hero__default__mobile-390__compare\.png/);
    assert.doesNotMatch(reviewHtml, /overview\.png/);
    assert.match(report, /capture run:/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('review HTML escapes inline JSON payload before embedding it in a script tag', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-review-escape-'));

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'ui-evidence', 'config.yaml'),
      `version: 1
project:
  name: smoke-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
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
    title: Landing </script><script>globalThis.__x = 1</script>
    description: Safe < unsafe
    defaultViewports:
      - mobile-390
    screens:
      - id: hero
        fileId: hero
        label: Hero
        path: /
        waitFor:
          selector: body
`,
      'utf8',
    );
    const beforeDir = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'before');
    const afterDir = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'after');
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

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    await buildComparisons({ config, stageArg: 'landing', language: 'en' });
    await generateReports({ config, stageArg: 'landing', language: 'en' });
    await buildReviewPages({ config, stageArg: 'landing', language: 'en' });

    const reviewHtml = await readFile(path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'review', 'index.html'), 'utf8');

    assert.doesNotMatch(reviewHtml, /<\/script><script>globalThis\.__x = 1<\/script>/);
    assert.match(reviewHtml, /\\u003c\/script\\u003e\\u003cscript\\u003eglobalThis\.__x = 1\\u003c\/script\\u003e/);
    assert.match(reviewHtml, /Safe \\u003c unsafe/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('buildReviewPages fails clearly when a stage has no raw or snapshot artifacts', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-review-empty-'));

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'ui-evidence', 'config.yaml'),
      `version: 1
project:
  name: smoke-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
  notesLanguage: en
  reportLanguage: en
capture:
  baseUrl: http://127.0.0.1:3000
  browser:
    headless: true
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
`,
      'utf8',
    );

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));

    await assert.rejects(
      () => buildReviewPages({ config, stageArg: 'landing', language: 'en' }),
      /No reviewable artifacts found for stage "landing"/,
    );
    assert.equal(
      await fileExists(path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'review', 'index.html')),
      false,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
