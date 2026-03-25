import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/load-config.mjs';
import { buildReviewPages } from '../src/lib/review/build-review.mjs';
import { runSnapshot } from '../src/lib/snapshot/run-snapshot.mjs';
import { readJson } from '../src/lib/util/fs.mjs';

function createServer(routes) {
  const server = http.createServer((request, response) => {
    const html = routes[request.url] ?? '<main data-testid="screen-missing">Missing</main>';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

test('runSnapshot captures a named scope into a history run bundle', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-snapshot-'));
  const runtime = await createServer({
    '/': '<main data-testid="screen-hero"><button>Hero button</button></main>',
    '/settings': '<main data-testid="screen-preferences"><button>Preferences button</button></main>',
    '/billing': '<main data-testid="screen-billing"><button>Billing button</button></main>',
  });

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'ui-evidence', 'config.yaml'),
      `version: 1
project:
  name: snapshot-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
  notesLanguage: en
  reportLanguage: en
capture:
  baseUrl: ${runtime.baseUrl}
  browser:
    headless: true
    freezeAnimations: true
    waitForFonts: true
    waitForNetworkIdleMs: 0
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
      locale: en-US
      timezoneId: UTC
servers:
  after:
    baseUrl: ${runtime.baseUrl}
scopes:
  - id: button-rollout
    title: Button Rollout
    description: Current UI snapshot for rollout screens.
    defaultViewports:
      - mobile-390
    targets:
      - stageId: landing
        screenIds:
          - hero
      - stageId: settings
        screenIds:
          - preferences
stages:
  - id: landing
    title: Landing
    description: Landing page
    defaultViewports:
      - mobile-390
    screens:
      - id: hero
        fileId: hero
        label: Hero
        path: /
        waitFor:
          testId: screen-hero
  - id: settings
    title: Settings
    description: Settings page
    defaultViewports:
      - mobile-390
    screens:
      - id: preferences
        fileId: preferences
        label: Preferences
        path: /settings
        waitFor:
          testId: screen-preferences
      - id: billing
        fileId: billing
        label: Billing
        path: /billing
        waitFor:
          testId: screen-billing
`,
      'utf8',
    );

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    const result = await runSnapshot({
      config,
      scopeId: 'button-rollout',
      label: 'buttons',
      language: 'en',
      now: new Date('2026-03-25T12:34:56Z'),
    });

    const manifest = await readJson(path.join(tempDir, 'ui-evidence', 'screenshots', 'snapshots', result.runId, 'manifest.json'));
    const reviewHtml = await readFile(path.join(tempDir, 'ui-evidence', 'screenshots', 'snapshots', result.runId, 'review', 'index.html'), 'utf8');

    assert.equal(result.runId, '20260325-123456--buttons');
    assert.equal(manifest.kind, 'snapshot-run');
    assert.equal(manifest.scope.id, 'button-rollout');
    assert.equal(manifest.counts.captures, 2);
    assert.equal(manifest.counts.overviews, 2);
    assert.equal(manifest.captures.length, 2);
    assert.ok(manifest.captures.every((item) => item.current.endsWith('__current.png')));
    assert.ok(manifest.artifacts.review.endsWith('review/index.html'));
    assert.match(reviewHtml, /Button Rollout/);
    assert.match(reviewHtml, /hero__default__mobile-390__current\.png/);
    assert.doesNotMatch(reviewHtml, /billing__default__mobile-390__current\.png/);
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('runSnapshot rejects mixed scope and stage selection', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-snapshot-error-'));

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'ui-evidence', 'config.yaml'),
      `version: 1
project:
  name: snapshot-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
capture:
  baseUrl: http://127.0.0.1:3000
  browser:
    headless: true
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
scopes:
  - id: button-rollout
    title: Button Rollout
    description: Current UI snapshot for rollout screens.
    targets:
      - stageId: landing
stages:
  - id: landing
    title: Landing
    description: Landing page
    screens:
      - id: hero
        label: Hero
        path: /
`,
      'utf8',
    );

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    await assert.rejects(
      () => runSnapshot({
        config,
        scopeId: 'button-rollout',
        stageArg: 'landing',
      }),
      /Cannot combine --scope with --stage or --screens/,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('buildReviewPages reuses the latest snapshot artifacts for stage-only reviews', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-snapshot-stage-review-'));
  const runtime = await createServer({
    '/': '<main data-testid="screen-hero"><button>Hero button</button></main>',
  });

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'ui-evidence', 'config.yaml'),
      `version: 1
project:
  name: snapshot-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
  notesLanguage: en
  reportLanguage: en
capture:
  baseUrl: ${runtime.baseUrl}
  browser:
    headless: true
    freezeAnimations: true
    waitForFonts: true
    waitForNetworkIdleMs: 0
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
      locale: en-US
      timezoneId: UTC
servers:
  after:
    baseUrl: ${runtime.baseUrl}
stages:
  - id: landing
    title: Landing
    description: Landing page
    defaultViewports:
      - mobile-390
    screens:
      - id: hero
        fileId: hero
        label: Hero
        path: /
        waitFor:
          testId: screen-hero
`,
      'utf8',
    );

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    await runSnapshot({
      config,
      stageArg: 'landing',
      label: 'first',
      language: 'en',
      now: new Date('2026-03-25T12:34:56Z'),
    });
    const latestSnapshot = await runSnapshot({
      config,
      stageArg: 'landing',
      label: 'second',
      language: 'en',
      now: new Date('2026-03-25T12:35:56Z'),
    });

    const written = await buildReviewPages({
      config,
      stageArg: 'landing',
      language: 'en',
    });

    const manifest = await readJson(path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'manifest.json'));
    const reviewHtml = await readFile(path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'review', 'index.html'), 'utf8');

    assert.equal(written.length, 1);
    assert.equal(manifest.snapshot.runId, latestSnapshot.runId);
    assert.equal(manifest.counts.currentCaptures, 1);
    assert.equal(manifest.counts.reviewableCaptures, 1);
    assert.equal(manifest.counts.pendingCaptures, 0);
    assert.equal(manifest.counts.overviews, 1);
    assert.equal(manifest.captures[0].status, 'current-only');
    assert.ok(manifest.captures[0].current.includes(latestSnapshot.runId));
    assert.ok(manifest.artifacts.current[0].includes(latestSnapshot.runId));
    assert.match(reviewHtml, /Current Only/);
    assert.match(reviewHtml, new RegExp(latestSnapshot.runId));
    assert.match(reviewHtml, /Current/);
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});
