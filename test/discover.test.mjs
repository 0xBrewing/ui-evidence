import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { discoverProject } from '../src/lib/discover/discover-project.mjs';
import { runCommand } from '../src/lib/util/process.mjs';

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
    assert.equal(result.suggestedConfig.project.rootDir, '..');
    assert.equal(result.suggestedConfig.artifacts.rootDir, 'ui-evidence/screenshots');
    assert.equal(result.suggestedConfig.servers.after.command, 'pnpm dev');
    assert.equal(result.suggestedConfig.stages[0].screens[0].waitFor.testId, 'screen-home');
    assert.equal(result.defaultConfigPath, 'ui-evidence/config.yaml');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('discoverProject prefers workspace app hints in JS monorepos', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-discover-workspace-'));

  try {
    await mkdir(path.join(tempDir, 'apps', 'web', 'src', 'app', 'compatibility'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'workspace-root',
          packageManager: 'pnpm@9.0.0',
          workspaces: ['apps/*'],
          scripts: {
            'dev:web': 'next dev -p 3100',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
    await writeFile(
      path.join(tempDir, 'playwright.config.ts'),
      `export default {
        use: { baseURL: 'http://127.0.0.1:3100' },
        webServer: { command: 'pnpm dev:web', url: 'http://127.0.0.1:3100' }
      };\n`,
      'utf8',
    );
    await writeFile(
      path.join(tempDir, 'apps', 'web', 'package.json'),
      JSON.stringify(
        {
          name: '@repo/web',
          dependencies: {
            next: '^15.0.0',
            react: '^19.0.0',
          },
          devDependencies: {
            '@playwright/test': '^1.55.0',
          },
          scripts: {
            dev: 'next dev -p 3000',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(
      path.join(tempDir, 'apps', 'web', 'src', 'app', 'page.tsx'),
      `export default function Page() { return <main data-testid="screen-home">Home</main>; }\n`,
      'utf8',
    );
    await writeFile(
      path.join(tempDir, 'apps', 'web', 'src', 'app', 'compatibility', 'page.tsx'),
      `export default function Page() { return <form data-testid="screen-compatibility-form-harness">Compatibility</form>; }\n`,
      'utf8',
    );
    await runCommand('git init -b main', { cwd: tempDir });
    await runCommand('git config user.email "tests@example.com"', { cwd: tempDir });
    await runCommand('git config user.name "UI Evidence Tests"', { cwd: tempDir });
    await runCommand('git add . && git commit -m "initial"', { cwd: tempDir });

    const result = await discoverProject({ cwd: tempDir });

    assert.equal(result.preset, 'next-playwright');
    assert.equal(result.detected.selectedPackage.path, 'apps/web');
    assert.equal(result.suggestedConfig.capture.baseUrl, 'http://127.0.0.1:3100');
    assert.equal(result.suggestedConfig.servers.after.command, 'pnpm dev:web');
    assert.equal(result.suggestedConfig.servers.after.cwd, undefined);
    assert.equal(result.suggestedConfig.baseline.git.server.command, 'pnpm dev:web');
    assert.deepEqual(
      result.detected.workspacePackages.map((candidate) => candidate.path).sort(),
      ['.', 'apps/web'],
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('discoverProject leaves low-confidence wait targets unresolved', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-discover-pairing-'));

  try {
    await mkdir(path.join(tempDir, 'app', 'checkout'), { recursive: true });
    await mkdir(path.join(tempDir, 'components'), { recursive: true });
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'pairing-app',
          packageManager: 'pnpm@9.0.0',
          dependencies: {
            next: '^15.0.0',
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
      path.join(tempDir, 'app', 'checkout', 'page.tsx'),
      `export default function Page() { return <main>Checkout</main>; }\n`,
      'utf8',
    );
    await writeFile(
      path.join(tempDir, 'components', 'compatibility-form.tsx'),
      `export function CompatibilityForm() { return <form data-testid="screen-compatibility-form-harness" />; }\n`,
      'utf8',
    );

    const result = await discoverProject({ cwd: tempDir });

    assert.equal(result.suggestedConfig.stages[0].screens[0].path, '/checkout');
    assert.equal(result.suggestedConfig.stages[0].screens[0].waitFor, undefined);
    assert.ok(result.unresolved.some((item) => item.key === 'wait-target'));
    assert.equal(result.detected.screenCandidates[0].confidence, 'low');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('discoverProject warns when legacy root layout is still present', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-discover-legacy-'));

  try {
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'legacy-layout-app',
        packageManager: 'pnpm@9.0.0',
      }, null, 2),
      'utf8',
    );
    await writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
    await writeFile(path.join(tempDir, 'ui-evidence.config.yaml'), 'version: 1\n', 'utf8');

    const result = await discoverProject({ cwd: tempDir });

    assert.equal(result.existingConfig, 'ui-evidence.config.yaml');
    assert.ok(result.warnings.some((item) => item.includes('Legacy ui-evidence paths detected')));
    assert.ok(result.detected.legacyLayout.includes('ui-evidence.config.yaml'));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
