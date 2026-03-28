import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { access, cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

test('skill mirror can be generated from the canonical skill source', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-skill-mirror-'));
  const mirrorPath = path.join(tempRoot, 'plugins', 'ui-evidence', 'skills', 'ui-evidence');
  const result = spawnSync(
    process.execPath,
    ['./scripts/sync-skill-mirror.mjs', '--mirror', mirrorPath, '--check'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.notEqual(result.status, 0, 'check should fail before the mirror exists');

  const syncResult = spawnSync(
    process.execPath,
    ['./scripts/sync-skill-mirror.mjs', '--mirror', mirrorPath],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

  const checkResult = spawnSync(
    process.execPath,
    ['./scripts/sync-skill-mirror.mjs', '--mirror', mirrorPath, '--check'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  assert.equal(checkResult.status, 0, checkResult.stderr || checkResult.stdout);
});

test('marketplace indexing target stays canonical and unique', () => {
  return (async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-marketplace-'));
    await mkdir(path.join(tempRoot, '.claude-plugin'), { recursive: true });
    await mkdir(path.join(tempRoot, 'agent-skill'), { recursive: true });
    await cp(path.join(repoRoot, '.gitignore'), path.join(tempRoot, '.gitignore'));
    await cp(path.join(repoRoot, '.claude-plugin'), path.join(tempRoot, '.claude-plugin'), { recursive: true });
    await cp(path.join(repoRoot, 'agent-skill'), path.join(tempRoot, 'agent-skill'), { recursive: true });
    try {
      await access(path.join(repoRoot, 'plugins'));
      await cp(path.join(repoRoot, 'plugins'), path.join(tempRoot, 'plugins'), { recursive: true, force: true });
    } catch {
      // No generated mirror is present in a clean checkout.
    }

    const initResult = spawnSync('git', ['init'], {
      cwd: tempRoot,
      encoding: 'utf8',
    });
    assert.equal(initResult.status, 0, initResult.stderr || initResult.stdout);

    const addResult = spawnSync('git', ['add', '.'], {
      cwd: tempRoot,
      encoding: 'utf8',
    });
    assert.equal(addResult.status, 0, addResult.stderr || addResult.stdout);

    const listResult = spawnSync('git', ['ls-files'], {
      cwd: tempRoot,
      encoding: 'utf8',
    });
    assert.equal(listResult.status, 0, listResult.stderr || listResult.stdout);

    const skillFiles = listResult.stdout
      .split('\n')
      .filter((line) => line === 'SKILL.md' || line.endsWith('/SKILL.md'));

    assert.deepEqual(skillFiles, ['agent-skill/ui-evidence/SKILL.md']);
  })();
});

test('claude marketplace manifest points to the generated skill mirror', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(repoRoot, '.claude-plugin', 'marketplace.json'), 'utf8'),
  );

  assert.equal(manifest.metadata.pluginRoot, './plugins');
  assert.equal(manifest.plugins.length, 1);
  assert.equal(manifest.plugins[0].name, 'ui-evidence');
  assert.equal(manifest.plugins[0].source, 'ui-evidence');
  assert.deepEqual(manifest.plugins[0].skills, ['./skills/ui-evidence']);
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.prepare, 'node ./scripts/sync-skill-mirror.mjs');
});
