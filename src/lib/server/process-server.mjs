import { resolveProjectPath } from '../../config/load-config.mjs';
import { spawnCommand, stopChildProcess } from '../util/process.mjs';

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
  if (!server?.command) {
    return null;
  }

  const child = spawnCommand(server.command, {
    cwd: options.cwd,
    env: server.env,
    label: options.label,
  });

  await waitForUrl(server.readyUrl ?? server.baseUrl, server.timeoutMs ?? 60_000);
  return { child, label: options.label };
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
  });
}

export async function stopServer(handle) {
  if (!handle) {
    return;
  }
  await stopChildProcess(handle.child);
}
