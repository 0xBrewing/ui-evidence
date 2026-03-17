import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { scaffoldConsumerRepo } from '../src/lib/install/scaffold-consumer.mjs';
import { fileExists } from '../src/lib/util/fs.mjs';

test('scaffoldConsumerRepo writes bootstrap files for Claude and Codex', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-install-'));

  try {
    await writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'consumer-app',
          packageManager: 'pnpm@9.0.0',
          scripts: {
            dev: 'vite --port 4010',
          },
          dependencies: {
            react: '^19.0.0',
          },
          devDependencies: {
            vite: '^7.0.0',
          },
        },
        null,
        2,
      ),
      'utf8',
    );
    await writeFile(path.join(tempDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n', 'utf8');
    await writeFile(path.join(tempDir, 'CLAUDE.md'), '# Existing Claude notes\n', 'utf8');
    await writeFile(path.join(tempDir, 'AGENTS.md'), '# Existing agents notes\n', 'utf8');

    const result = await scaffoldConsumerRepo({
      cwd: tempDir,
      agent: 'both',
      config: 'ui-evidence.config.yaml',
    });

    const configExists = await fileExists(path.join(tempDir, 'ui-evidence.config.yaml'));
    const localInstallDoc = await readFile(path.join(tempDir, 'docs', 'ui-evidence-installation.md'), 'utf8');
    const claudeCommand = await readFile(path.join(tempDir, '.claude', 'commands', 'ui-evidence.md'), 'utf8');
    const claudeNotes = await readFile(path.join(tempDir, 'CLAUDE.md'), 'utf8');
    const agentsNotes = await readFile(path.join(tempDir, 'AGENTS.md'), 'utf8');
    const codexSkillExists = await fileExists(
      path.join(tempDir, '.agents', 'skills', 'ui-evidence', 'SKILL.md'),
    );
    const legacyCodexSkillExists = await fileExists(path.join(tempDir, 'skills', 'ui-evidence', 'SKILL.md'));
    const claudeSkillExists = await fileExists(path.join(tempDir, '.claude', 'skills', 'ui-evidence', 'SKILL.md'));

    assert.equal(configExists, true);
    assert.match(localInstallDoc, /pnpm exec ui-evidence discover --format json/);
    assert.match(claudeCommand, /docs\/ui-evidence-installation\.md/);
    assert.match(claudeNotes, /ui-evidence/);
    assert.match(agentsNotes, /\.agents\/skills\/ui-evidence\//);
    assert.equal(codexSkillExists, true);
    assert.equal(legacyCodexSkillExists, false);
    assert.equal(claudeSkillExists, true);
    assert.equal(result.discovery.packageManager, 'pnpm');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
