import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

test('skill mirror is in sync with the canonical skill source', () => {
  const result = spawnSync(process.execPath, ['./scripts/sync-skill-mirror.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
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

  const mirroredSkill = await readFile(
    path.join(
      repoRoot,
      manifest.metadata.pluginRoot,
      manifest.plugins[0].source,
      'skills',
      'ui-evidence',
      'SKILL.md',
    ),
    'utf8',
  );

  assert.match(mirroredSkill, /^---\nname: ui-evidence/m);
});
