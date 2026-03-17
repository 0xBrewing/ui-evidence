import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { runDoctor } from '../src/lib/doctor/run-doctor.mjs';

function createServer(html) {
  const server = http.createServer((request, response) => {
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

test('doctor --deep validates routes and wait targets without writing screenshots', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-doctor-'));
  const runtime = await createServer('<main data-testid="screen-home">Home</main>');

  try {
    await writeFile(
      path.join(tempDir, 'ui-evidence.config.yaml'),
      `version: 1
project:
  name: doctor-app
  rootDir: .
artifacts:
  rootDir: screenshots/ui-evidence
capture:
  baseUrl: ${runtime.baseUrl}
  browser:
    headless: true
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
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
      - id: home
        label: Home
        path: /
        waitFor:
          testId: screen-home
`,
      'utf8',
    );

    const result = await runDoctor({
      config: path.join(tempDir, 'ui-evidence.config.yaml'),
      deep: true,
      stageArg: 'landing',
      screenIds: ['home'],
    });

    assert.equal(result.ok, true);
    assert.ok(result.checks.some((check) => check.key === 'deep:after:landing/home' && check.status === 'pass'));
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('doctor --deep reports invalid wait targets as failures', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-doctor-fail-'));
  const runtime = await createServer('<main data-testid="screen-home">Home</main>');

  try {
    await writeFile(
      path.join(tempDir, 'ui-evidence.config.yaml'),
      `version: 1
project:
  name: doctor-app
  rootDir: .
artifacts:
  rootDir: screenshots/ui-evidence
capture:
  baseUrl: ${runtime.baseUrl}
  browser:
    headless: true
  viewports:
    - id: mobile-390
      viewport:
        width: 390
        height: 844
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
      - id: home
        label: Home
        path: /
        waitFor:
          testId: screen-missing
`,
      'utf8',
    );

    const result = await runDoctor({
      config: path.join(tempDir, 'ui-evidence.config.yaml'),
      deep: true,
      stageArg: 'landing',
      screenIds: ['home'],
    });

    assert.equal(result.ok, false);
    assert.ok(result.checks.some((check) => check.key === 'deep:after:landing/home' && check.status === 'fail'));
  } finally {
    await new Promise((resolve) => runtime.server.close(resolve));
    await rm(tempDir, { recursive: true, force: true });
  }
});
