import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { handleRun } from '../src/commands/run.mjs';
import { loadConfig } from '../src/config/load-config.mjs';
import { captureStages } from '../src/lib/capture/playwright-capture.mjs';
import { buildReviewPages } from '../src/lib/review/build-review.mjs';
import { readJson } from '../src/lib/util/fs.mjs';

function createDynamicServer() {
  const counters = {
    '/': 0,
    '/screen': 0,
  };
  const state = {
    screenHtml: '<main data-testid="screen-home">Home</main>',
  };

  const server = http.createServer((request, response) => {
    counters[request.url] = (counters[request.url] ?? 0) + 1;

    const html = request.url === '/screen'
      ? state.screenHtml
      : '<main data-testid="server-ready">Ready</main>';
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(html);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}`,
        counters,
        state,
      });
    });
  });
}

function buildConfig(baseUrl) {
  return `version: 1
project:
  name: resume-app
  rootDir: ..
artifacts:
  rootDir: ui-evidence/screenshots
  notesLanguage: en
  reportLanguage: en
capture:
  baseUrl: ${baseUrl}
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
servers:
  after:
    baseUrl: ${baseUrl}
stages:
  - id: landing
    title: Landing
    description: Landing page
    defaultViewports:
      - mobile-390
    screens:
      - id: home
        label: Home
        path: /screen
        waitFor:
          testId: screen-home
          timeoutMs: 500
`;
}

test('handleRun uses afterAttach overrides and skips successful captures on resume', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-run-resume-'));
  const runtime = await createDynamicServer();
  const bogusBaseUrl = 'http://127.0.0.1:1';

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(path.join(tempDir, 'ui-evidence', 'config.yaml'), buildConfig(bogusBaseUrl), 'utf8');

    process.exitCode = undefined;
    await handleRun({
      config: path.join(tempDir, 'ui-evidence', 'config.yaml'),
      stage: 'landing',
      skipBefore: true,
      skipCompare: true,
      skipReport: true,
      skipReview: true,
      afterAttach: runtime.baseUrl,
    });

    const screenshotPath = path.join(
      tempDir,
      'ui-evidence',
      'screenshots',
      'landing',
      'after',
      'home__default__mobile-390__after.png',
    );
    const captureStatePath = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'capture-state.json');
    const captureState = await readJson(captureStatePath);

    assert.equal(process.exitCode ?? 0, 0);
    assert.equal(runtime.counters['/screen'], 1);
    assert.equal(captureState.entries['after::home::mobile-390'].status, 'success');
    assert.ok(captureState.entries['after::home::mobile-390'].outputPath.endsWith('__after.png'));
    await readFile(screenshotPath);

    process.exitCode = undefined;
    await handleRun({
      config: path.join(tempDir, 'ui-evidence', 'config.yaml'),
      stage: 'landing',
      skipBefore: true,
      skipCompare: true,
      skipReport: true,
      skipReview: true,
      afterAttach: runtime.baseUrl,
      resume: true,
    });

    assert.equal(process.exitCode ?? 0, 0);
    assert.equal(runtime.counters['/screen'], 1);
  } finally {
    process.exitCode = undefined;
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('failed captures write diagnostics and resume retries only failed entries', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-run-failure-'));
  const runtime = await createDynamicServer();

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(path.join(tempDir, 'ui-evidence', 'config.yaml'), buildConfig(runtime.baseUrl), 'utf8');
    runtime.state.screenHtml = '<main data-testid="screen-other">Wrong screen</main>';

    const config = await loadConfig(path.join(tempDir, 'ui-evidence', 'config.yaml'));
    const failedCapture = await captureStages({
      config,
      phase: 'after',
      stageArg: 'landing',
      language: 'en',
    });

    assert.equal(failedCapture.hasFailures, true);
    assert.equal(failedCapture.counts.failed, 1);

    await buildReviewPages({
      config,
      stageArg: 'landing',
      language: 'en',
    });

    const manifestPath = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'manifest.json');
    const reviewPath = path.join(tempDir, 'ui-evidence', 'screenshots', 'landing', 'review', 'index.html');
    const manifest = await readJson(manifestPath);
    const reviewHtml = await readFile(reviewPath, 'utf8');

    assert.equal(manifest.counts.failedCaptures, 1);
    assert.equal(manifest.captures[0].execution.after.status, 'failed');
    assert.equal(manifest.captures[0].execution.after.failure.step, 'waitFor');
    assert.deepEqual(manifest.captures[0].execution.after.failure.waitTarget, {
      type: 'testId',
      value: 'screen-home',
      timeoutMs: 500,
    });
    assert.match(reviewHtml, /after/);
    assert.match(reviewHtml, /waitFor/);

    runtime.state.screenHtml = '<main data-testid="screen-home">Home</main>';
    const resumedCapture = await captureStages({
      config,
      phase: 'after',
      stageArg: 'landing',
      language: 'en',
      resume: true,
    });

    assert.equal(resumedCapture.hasFailures, false);
    assert.equal(resumedCapture.counts.captured, 1);
    assert.equal(runtime.counters['/screen'], 2);
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});
