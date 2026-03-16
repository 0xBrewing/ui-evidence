import path from 'node:path';
import { fileExists } from '../util/fs.mjs';
import { loadConfig, resolveProjectPath } from '../../config/load-config.mjs';
import { discoverProject } from '../discover/discover-project.mjs';
import { loadHook } from '../util/hooks.mjs';
import { chromium } from '@playwright/test';
import { resolveBaselineOptions } from '../baseline/git-baseline.mjs';
import { runCommandSync } from '../util/process.mjs';

async function probeUrl(url, timeoutMs = 3_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok || response.status < 500,
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDoctor(options = {}) {
  const checks = [];
  const configPath = options.config ?? 'ui-evidence.config.yaml';
  const configExists = await fileExists(path.resolve(process.cwd(), configPath));

  checks.push({
    key: 'node-version',
    status: Number(process.versions.node.split('.')[0]) >= 20 ? 'pass' : 'fail',
    message: `Node.js ${process.versions.node}`,
  });

  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    checks.push({
      key: 'playwright-chromium',
      status: 'pass',
      message: 'Playwright Chromium is available.',
    });
  } catch (error) {
    checks.push({
      key: 'playwright-chromium',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  if (!configExists) {
    const discovery = await discoverProject({ cwd: process.cwd() });
    checks.push({
      key: 'config',
      status: 'warn',
      message: `No config found at ${configPath}. Run "ui-evidence init --interactive" to create one.`,
    });
    return {
      ok: checks.every((item) => item.status !== 'fail'),
      checks,
      discovery,
    };
  }

  let config = null;
  try {
    config = await loadConfig(configPath);
    checks.push({
      key: 'config',
      status: 'pass',
      message: `Loaded ${config.meta.configPath}`,
    });
  } catch (error) {
    checks.push({
      key: 'config',
      status: 'fail',
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: false,
      checks,
    };
  }

  const urlChecks = uniqueUrls([
    config.capture.baseUrl,
    config.servers?.before?.baseUrl,
    config.servers?.after?.baseUrl,
  ]);

  for (const url of urlChecks) {
    const result = await probeUrl(url);
    checks.push({
      key: `url:${url}`,
      status: result.ok ? 'pass' : 'warn',
      message: result.ok
        ? `Reachable: ${url}${result.status ? ` (${result.status})` : ''}`
        : `Not reachable yet: ${url}${result.error ? ` (${result.error})` : ''}`,
    });
  }

  for (const stage of config.stages) {
    for (const screen of stage.screens) {
      if (screen.auth?.storageState) {
        const storageStatePath = resolveProjectPath(config, screen.auth.storageState);
        checks.push({
          key: `storage:${stage.id}/${screen.id}`,
          status: (await fileExists(storageStatePath)) ? 'pass' : 'warn',
          message: `storageState ${storageStatePath}`,
        });
      }

      for (const hookType of ['setup', 'prepare']) {
        const specifier = screen.hooks?.[hookType];
        if (!specifier) {
          continue;
        }

        try {
          await loadHook(config, specifier);
          checks.push({
            key: `hook:${stage.id}/${screen.id}/${hookType}`,
            status: 'pass',
            message: `Loaded ${specifier}`,
          });
        } catch (error) {
          checks.push({
            key: `hook:${stage.id}/${screen.id}/${hookType}`,
            status: 'fail',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  const baseline = resolveBaselineOptions(config, options.beforeRef);
  if (baseline) {
    const refCheck = runCommandSync('git', ['rev-parse', '--verify', baseline.ref], {
      cwd: config.meta.projectRoot,
    });
    checks.push({
      key: 'baseline-ref',
      status: refCheck.status === 0 ? 'pass' : 'fail',
      message: refCheck.status === 0
        ? `Baseline ref ${baseline.ref} is available.`
        : `Baseline ref ${baseline.ref} was not found.`,
    });

    if (baseline.server?.command && baseline.server?.baseUrl) {
      checks.push({
        key: 'baseline-server',
        status: 'pass',
        message: `Baseline server will use ${baseline.server.command}`,
      });
    } else {
      checks.push({
        key: 'baseline-server',
        status: 'warn',
        message: 'Baseline ref is configured, but no reusable server command/baseUrl was found yet.',
      });
    }
  }

  return {
    ok: checks.every((item) => item.status !== 'fail'),
    checks,
  };
}

function uniqueUrls(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function formatDoctorResult(result, format = 'text') {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines = [];
  for (const check of result.checks) {
    const marker = check.status === 'pass' ? 'PASS' : check.status === 'warn' ? 'WARN' : 'FAIL';
    lines.push(`${marker} ${check.key}: ${check.message}`);
  }

  if (result.discovery) {
    lines.push('');
    lines.push(`Discovery preset: ${result.discovery.preset}`);
    if (result.discovery.unresolved.length) {
      lines.push('Open items:');
      for (const item of result.discovery.unresolved) {
        lines.push(`- ${item.message}`);
      }
    }
  }

  return lines.join('\n');
}
