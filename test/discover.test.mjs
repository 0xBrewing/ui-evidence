import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { discoverProject } from '../src/lib/discover/discover-project.mjs';

test('discoverProject infers preset, routes, and wait target candidates', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-discover-'));

  try {
    await mkdir(path.join(tempDir, 'app', 'settings'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'demo-next-app',
          packageManager: 'pnpm@9.0.0',
          dependencies: {
            next: '^15.0.0',
          },
          devDependencies: {
            '@playwright/test': '^1.55.0',
          },
          scripts: {
            dev: 'next dev -p 4010',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
    await writeFile(
      path.join(tempDir, 'app', 'page.tsx'),
      `export default function Page() { return <main data-testid="screen-home">Home</main>; }\n`,
      'utf8',
    );
    await writeFile(
      path.join(tempDir, 'app', 'settings', 'page.tsx'),
      `export default function Page() { return <section data-testid="screen-settings">Settings</section>; }\n`,
      'utf8',
    );

    const result = await discoverProject({ cwd: tempDir });

    assert.equal(result.preset, 'next-playwright');
    assert.equal(result.packageManager, 'pnpm');
    assert.deepEqual(result.detected.routeCandidates.slice(0, 2), ['/', '/settings']);
    assert.ok(result.detected.testIds.includes('screen-home'));
    assert.equal(result.suggestedConfig.capture.baseUrl, 'http://127.0.0.1:4010');
    assert.equal(result.suggestedConfig.servers.after.command, 'pnpm dev');
    assert.equal(result.suggestedConfig.stages[0].screens[0].waitFor.testId, 'screen-home');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
