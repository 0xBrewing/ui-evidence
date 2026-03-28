import { existsSync } from 'node:fs';
import path from 'node:path';
import { resolveProjectPath } from '../../config/load-config.mjs';
import { buildDefaultBaselineWorktreeDir } from '../layout/default-layout.mjs';
import { ensureDir, removeDir } from '../util/fs.mjs';
import { runCommand, runCommandArgs, runCommandSync } from '../util/process.mjs';

function slugifyRef(ref) {
  return String(ref)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'baseline';
}

function gitRefExists(projectRoot, ref) {
  const result = runCommandSync('git', ['rev-parse', '--verify', ref], { cwd: projectRoot });
  return result.status === 0;
}

function detectInstallCommand(worktreeDir) {
  if (directoryExistsSync(path.join(worktreeDir, 'node_modules'))) {
    return null;
  }
  if (existsSync(path.join(worktreeDir, 'pnpm-lock.yaml'))) {
    return 'pnpm install --frozen-lockfile';
  }
  if (existsSync(path.join(worktreeDir, 'yarn.lock'))) {
    return 'yarn install --frozen-lockfile';
  }
  if (existsSync(path.join(worktreeDir, 'bun.lockb')) || existsSync(path.join(worktreeDir, 'bun.lock'))) {
    return 'bun install --frozen-lockfile';
  }
  if (existsSync(path.join(worktreeDir, 'package-lock.json'))) {
    return 'npm ci';
  }
  if (existsSync(path.join(worktreeDir, 'package.json'))) {
    return 'npm install';
  }
  return null;
}

function directoryExistsSync(dirPath) {
  return existsSync(dirPath);
}

function buildResolvedServer(config) {
  const baselineServer = config.baseline?.git?.server;
  if (baselineServer?.baseUrl) {
    return baselineServer;
  }

  const fallback = config.servers?.after?.command
    ? {
        ...config.servers.after,
        baseUrl: config.servers.after.baseUrl ?? config.capture.baseUrl,
      }
    : config.servers?.before?.command
      ? {
          ...config.servers.before,
          baseUrl: config.servers.before.baseUrl ?? config.capture.baseUrl,
        }
      : null;

  return fallback;
}

function resolveBaselineServer(server, worktreeDir) {
  if (!server) {
    return null;
  }

  return {
    ...server,
    cwd: server.cwd ? path.resolve(worktreeDir, server.cwd) : worktreeDir,
  };
}

export function resolveBaselineOptions(config, beforeRefOverride) {
  const gitConfig = config.baseline?.git ?? {};
  const ref = beforeRefOverride ?? gitConfig.ref;
  if (!ref) {
    return null;
  }

  const worktreeDir = resolveProjectPath(
    config,
    gitConfig.worktreeDir ?? buildDefaultBaselineWorktreeDir(slugifyRef(ref)),
  );

  return {
    ref,
    worktreeDir,
    installCommand: gitConfig.installCommand ?? null,
    server: buildResolvedServer(config),
  };
}

export async function prepareGitBaseline(config, beforeRefOverride) {
  const baseline = resolveBaselineOptions(config, beforeRefOverride);
  if (!baseline) {
    return null;
  }

  if (!gitRefExists(config.meta.projectRoot, baseline.ref)) {
    throw new Error(`Baseline git ref "${baseline.ref}" does not exist.`);
  }

  await ensureDir(path.dirname(baseline.worktreeDir));
  await removeDir(baseline.worktreeDir);
  await runCommandArgs('git', ['worktree', 'add', '--detach', baseline.worktreeDir, baseline.ref], {
    cwd: config.meta.projectRoot,
    label: 'baseline',
  });

  const installCommand = baseline.installCommand ?? detectInstallCommand(baseline.worktreeDir);
  if (installCommand) {
    await runCommand(installCommand, {
      cwd: baseline.worktreeDir,
      label: 'baseline-install',
    });
  }

  const resolvedServer = resolveBaselineServer(baseline.server, baseline.worktreeDir);

  return {
    ...baseline,
    server: resolvedServer,
    cleanup: async () => {
      await runCommandArgs('git', ['worktree', 'remove', '--force', baseline.worktreeDir], {
        cwd: config.meta.projectRoot,
      }).catch(async () => {
        await removeDir(baseline.worktreeDir);
      });
    },
  };
}
