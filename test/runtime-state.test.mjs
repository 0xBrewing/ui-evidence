import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { createStateApi } from '../src/lib/runtime/state-store.mjs';

test('state API reads and writes durable json values under runtime state dir', async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ui-evidence-state-'));

  try {
    const config = {
      meta: {
        runtimeStateRoot: path.join(tempDir, 'ui-evidence', 'state'),
        runtimeTempRoot: path.join(tempDir, 'ui-evidence', 'tmp'),
        artifactsRoot: path.join(tempDir, 'ui-evidence', 'screenshots'),
      },
    };
    const state = createStateApi(config);

    await state.put('shared/seed/demo', { locale: 'en', ready: true });
    assert.equal(
      state.resolvePath('shared/seed/demo'),
      path.join(tempDir, 'ui-evidence', 'state', 'shared', 'seed', 'demo.json'),
    );
    assert.deepEqual(await state.get('shared/seed/demo'), { locale: 'en', ready: true });

    await state.delete('shared/seed/demo');
    assert.equal(await state.get('shared/seed/demo'), null);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
