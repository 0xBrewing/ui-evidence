import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises';
import { loadConfig } from '../src/config/load-config.mjs';

const MINIMAL_CONFIG = `version: 1
project:
  name: layout-test
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
stages:
  - id: primary-flow
    title: Primary Flow
    description: Test stage
    screens:
      - id: home
        label: Home
        path: /
`;

test('loadConfig defaults to ui-evidence/config.yaml', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-layout-default-'));
  const previousCwd = process.cwd();

  try {
    await mkdir(path.join(tempDir, 'ui-evidence'), { recursive: true });
    await writeFile(path.join(tempDir, 'ui-evidence', 'config.yaml'), MINIMAL_CONFIG, 'utf8');

    process.chdir(tempDir);
    const config = await loadConfig();
    const resolvedTempDir = await realpath(tempDir);

    assert.ok(config.meta.configPath.endsWith(path.join('ui-evidence', 'config.yaml')));
    assert.equal(config.meta.projectRoot, resolvedTempDir);
    assert.equal(config.meta.artifactsRoot, path.join(resolvedTempDir, 'ui-evidence', 'screenshots'));
    assert.equal(config.meta.runtimeStateRoot, path.join(resolvedTempDir, 'ui-evidence', 'state'));
    assert.equal(config.meta.runtimeTempRoot, path.join(resolvedTempDir, 'ui-evidence', 'tmp'));
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('loadConfig gives a legacy-layout hint when only ui-evidence.config.yaml exists', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-layout-legacy-'));
  const previousCwd = process.cwd();

  try {
    await writeFile(path.join(tempDir, 'ui-evidence.config.yaml'), MINIMAL_CONFIG, 'utf8');

    process.chdir(tempDir);
    await assert.rejects(
      () => loadConfig(),
      /Use --config ui-evidence\.config\.yaml if you need the legacy layout temporarily/,
    );
  } finally {
    process.chdir(previousCwd);
    await rm(tempDir, { recursive: true, force: true });
  }
});
