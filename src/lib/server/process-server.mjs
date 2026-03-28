import { resolveProjectPath } from '../../config/load-config.mjs';
import { getChildProcessLogTail, spawnCommand, stopChildProcess } from '../util/process.mjs';

async function waitForUrl(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function startServerSpec(server, options = {}) {
  const resolved = resolveServerSpec(server);
  if (!resolved) {
    return null;
  }

  if (resolved.mode === 'managed') {
    if (!resolved.command) {
      throw new Error('Managed server mode requires a command.');
    }

    const child = spawnCommand(resolved.command, {
      cwd: options.cwd,
      env: resolved.env,
      label: options.label,
      streamOutput: false,
    });

    try {
      await waitForUrl(resolved.readyUrl, resolved.timeoutMs);
      return { child, label: options.label, mode: resolved.mode };
    } catch (error) {
      const tail = options.showServerLogOnFail ? getChildProcessLogTail(child) : '';
      await stopChildProcess(child);
      if (tail) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}\n${tail}`);
      }
      throw error;
    }
  }

  if (resolved.readyUrl) {
    await waitForUrl(resolved.readyUrl, resolved.timeoutMs);
  }

  return { child: null, label: options.label, mode: resolved.mode };
}

export async function startServer(config, phase, overrides = {}) {
  const server = {
    ...(config.servers?.[phase] ?? {}),
    ...(overrides.server ?? {}),
  };
  const cwd = overrides.cwd ?? (server.cwd ? resolveProjectPath(config, server.cwd) : config.meta.projectRoot);
  return startServerSpec(server, {
    cwd,
    label: overrides.label ?? phase,
    showServerLogOnFail: overrides.showServerLogOnFail,
  });
}

export async function stopServer(handle) {
  if (!handle) {
    return;
  }
  await stopChildProcess(handle.child);
}

export function resolveServerSpec(server) {
  if (!server || !Object.keys(server).length) {
    return null;
  }

  const mode = server.mode ?? (server.command ? 'managed' : 'attach');
  const readyUrl = server.readyUrl ?? server.baseUrl;
  if (!readyUrl && mode !== 'managed') {
    return null;
  }

  return {
    ...server,
    mode,
    readyUrl,
    timeoutMs: server.timeoutMs ?? 60_000,
  };
}

export function getServerLogTail(handle, count = 40) {
  return getChildProcessLogTail(handle?.child, count);
}
