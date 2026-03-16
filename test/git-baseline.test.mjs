import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { runCommand } from '../src/lib/util/process.mjs';
import { prepareGitBaseline } from '../src/lib/baseline/git-baseline.mjs';

test('prepareGitBaseline creates and cleans a detached worktree', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-baseline-'));

  try {
    await runCommand('git init -b main', { cwd: tempDir });
    await runCommand('git config user.email "tests@example.com"', { cwd: tempDir });
    await runCommand('git config user.name "UI Evidence Tests"', { cwd: tempDir });
    await writeFile(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'baseline-app' }, null, 2), 'utf8');
    await writeFile(path.join(tempDir, 'README.md'), '# first\n', 'utf8');
    await runCommand('git add . && git commit -m "initial"', { cwd: tempDir });

    await writeFile(path.join(tempDir, 'README.md'), '# second\n', 'utf8');
    await runCommand('git add README.md && git commit -m "second"', { cwd: tempDir });

    const config = {
      meta: {
        projectRoot: tempDir,
      },
      baseline: {
        git: {
          ref: 'main~1',
          worktreeDir: 'tmp/ui-evidence/main',
        },
      },
      capture: {
        baseUrl: 'http://127.0.0.1:3000',
      },
      servers: {},
    };

    const baseline = await prepareGitBaseline(config);
    const baselineReadme = await readFile(path.join(baseline.worktreeDir, 'README.md'), 'utf8');

    assert.match(baselineReadme, /first/);
    assert.equal(path.basename(baseline.worktreeDir), 'main');

    await baseline.cleanup();

    let removed = false;
    try {
      await readFile(path.join(baseline.worktreeDir, 'README.md'), 'utf8');
    } catch {
      removed = true;
    }
    assert.equal(removed, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
