import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { runCommand } from '../src/lib/util/process.mjs';

const BIN_PATH = path.resolve(process.cwd(), 'bin', 'ui-evidence.mjs');

test('subcommand help exits before invoking the handler', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-help-'));

  try {
    const result = await runCommand(`node "${BIN_PATH}" run --help`, { cwd: tempDir });
    assert.match(result.stdout, /ui-evidence run/);
    assert.match(result.stdout, /Usage:/);
    assert.doesNotMatch(result.stdout, /Unknown stage|No config|Timed out/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('command-specific help is available through help <command>', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-help-command-'));

  try {
    const result = await runCommand(`node "${BIN_PATH}" help doctor`, { cwd: tempDir });
    assert.match(result.stdout, /ui-evidence doctor/);
    assert.match(result.stdout, /--deep/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
