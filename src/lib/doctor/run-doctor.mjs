import path from 'node:path';
import { chromium } from '@playwright/test';
import { loadConfig, resolveProjectPath } from '../../config/load-config.mjs';
import { openPreparedScreen } from '../capture/playwright-capture.mjs';
import { discoverProject } from '../discover/discover-project.mjs';
import { resolveBaselineOptions, prepareGitBaseline } from '../baseline/git-baseline.mjs';
import { resolveServerSpec, startServer, stopServer } from '../server/process-server.mjs';
import { loadHook } from '../util/hooks.mjs';
import { fileExists } from '../util/fs.mjs';
import { runCommandSync } from '../util/process.mjs';
import { resolveBaseUrl, resolveCapturePlan, selectViewports } from '../util/selection.mjs';

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

function uniqueUrls(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function makeCheck(key, status, message) {
  return { key, status, message };
}

async function runDeepPhaseValidation({
  checks,
  config,
  phase,
  scopeId,
  stageArg,
  screenIds,
  baseUrlOverride,
  serverOverrides,
  serverLabel,
  language,
}) {
  let serverHandle = null;
  let browser = null;

  try {
    serverHandle = await startServer(config, phase, serverOverrides);
    browser = await chromium.launch({ headless: true });
    checks.push(makeCheck(`deep:${phase}:server`, 'pass', `Deep validation is using ${resolveBaseUrl(config, phase, baseUrlOverride)}.`));
  } catch (error) {
    checks.push(makeCheck(
      `deep:${phase}:server`,
      'fail',
      `Unable to prepare ${serverLabel}: ${error instanceof Error ? error.message : String(error)}`,
    ));
    await stopServer(serverHandle);
    await browser?.close().catch(() => {});
    return;
  }

  try {
    const baseUrl = resolveBaseUrl(config, phase, baseUrlOverride);
    const plan = resolveCapturePlan(config, {
      scopeId,
      stageArg,
      screenIds,
      viewportIds: [],
    });
    for (const selection of plan.selections) {
      const { stage, screens, viewports } = selection;
      const viewport = viewports[0] ?? selectViewports(config, stage, [])[0];
      for (const screen of screens) {
        const key = `deep:${phase}:${stage.id}/${screen.id}`;
        try {
          const { context } = await openPreparedScreen({
            browser,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
          });
          await context.close();
          checks.push(makeCheck(key, 'pass', `${screen.path} is reachable and its wait target resolves (${viewport.id}).`));
        } catch (error) {
          checks.push(makeCheck(key, 'fail', error instanceof Error ? error.message : String(error)));
        }
      }
    }
  } finally {
    await stopServer(serverHandle);
    await browser?.close().catch(() => {});
  }
}

export async function runDoctor(options = {}) {
  const checks = [];
  const configPath = options.config ?? 'ui-evidence.config.yaml';
  const configExists = await fileExists(path.resolve(process.cwd(), configPath));

  checks.push(makeCheck(
    'node-version',
    Number(process.versions.node.split('.')[0]) >= 20 ? 'pass' : 'fail',
    `Node.js ${process.versions.node}`,
  ));

  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    checks.push(makeCheck('playwright-chromium', 'pass', 'Playwright Chromium is available.'));
  } catch (error) {
    checks.push(makeCheck('playwright-chromium', 'fail', error instanceof Error ? error.message : String(error)));
  }

  if (!configExists) {
    const discovery = await discoverProject({ cwd: process.cwd() });
    checks.push(makeCheck('config', 'warn', `No config found at ${configPath}. Run "ui-evidence init --interactive" to create one.`));
    return {
      ok: checks.every((item) => item.status !== 'fail'),
      checks,
      discovery,
    };
  }

  let config = null;
  try {
    config = await loadConfig(configPath);
    checks.push(makeCheck('config', 'pass', `Loaded ${config.meta.configPath}`));
  } catch (error) {
    checks.push(makeCheck('config', 'fail', error instanceof Error ? error.message : String(error)));
    return {
      ok: false,
      checks,
    };
  }

  let selectionOk = true;
  try {
    const selectionPlan = resolveCapturePlan(config, {
      scopeId: options.scopeId ?? null,
      stageArg: options.stageArg ?? 'all',
      screenIds: options.screenIds ?? [],
      viewportIds: [],
    });
    checks.push(makeCheck(
      'selection',
      'pass',
      selectionPlan.scope
        ? `Scope ${selectionPlan.scope.id} resolves to ${selectionPlan.selections.length} stage selection(s).`
        : `Selected ${selectionPlan.selections.length} stage selection(s).`,
    ));
  } catch (error) {
    selectionOk = false;
    checks.push(makeCheck('selection', 'fail', error instanceof Error ? error.message : String(error)));
  }

  const urlChecks = uniqueUrls([
    config.capture.baseUrl,
    config.servers?.before?.baseUrl,
    config.servers?.after?.baseUrl,
  ]);

  for (const url of urlChecks) {
    const result = await probeUrl(url);
    checks.push(makeCheck(
      `url:${url}`,
      result.ok ? 'pass' : 'warn',
      result.ok
        ? `Reachable: ${url}${result.status ? ` (${result.status})` : ''}`
        : `Not reachable yet: ${url}${result.error ? ` (${result.error})` : ''}`,
    ));
  }

  for (const stage of config.stages) {
    for (const screen of stage.screens) {
      if (screen.auth?.storageState) {
        const storageStatePath = resolveProjectPath(config, screen.auth.storageState);
        checks.push(makeCheck(
          `storage:${stage.id}/${screen.id}`,
          (await fileExists(storageStatePath)) ? 'pass' : 'warn',
          `storageState ${storageStatePath}`,
        ));
      }

      for (const hookType of ['setup', 'prepare']) {
        const specifier = screen.hooks?.[hookType];
        if (!specifier) {
          continue;
        }

        try {
          await loadHook(config, specifier);
          checks.push(makeCheck(`hook:${stage.id}/${screen.id}/${hookType}`, 'pass', `Loaded ${specifier}`));
        } catch (error) {
          checks.push(makeCheck(
            `hook:${stage.id}/${screen.id}/${hookType}`,
            'fail',
            error instanceof Error ? error.message : String(error),
          ));
        }
      }
    }
  }

  const baseline = resolveBaselineOptions(config, options.beforeRef);
  if (baseline) {
    const refCheck = runCommandSync('git', ['rev-parse', '--verify', baseline.ref], {
      cwd: config.meta.projectRoot,
    });
    checks.push(makeCheck(
      'baseline-ref',
      refCheck.status === 0 ? 'pass' : 'fail',
      refCheck.status === 0
        ? `Baseline ref ${baseline.ref} is available.`
        : `Baseline ref ${baseline.ref} was not found.`,
    ));

    if (baseline.server?.baseUrl) {
      const resolvedBaselineServer = resolveServerSpec(baseline.server);
      checks.push(makeCheck(
        'baseline-server',
        'pass',
        resolvedBaselineServer?.mode === 'managed'
          ? `Baseline server will use ${baseline.server.command}`
          : `Baseline server will attach to ${baseline.server.baseUrl}`,
      ));
    } else {
      checks.push(makeCheck(
        'baseline-server',
        'warn',
        'Baseline ref is configured, but no reusable server command/baseUrl was found yet.',
      ));
    }
  }

  if (options.deep && selectionOk) {
    const language = config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
    await runDeepPhaseValidation({
      checks,
      config,
      phase: 'after',
      scopeId: options.scopeId ?? null,
      stageArg: options.stageArg ?? 'all',
      screenIds: options.screenIds ?? [],
      baseUrlOverride: undefined,
      serverOverrides: {},
      serverLabel: 'after server',
      language,
    });

    if (baseline) {
      let preparedBaseline = null;
      try {
        preparedBaseline = await prepareGitBaseline(config, baseline.ref);
        if (!preparedBaseline?.server?.baseUrl) {
          checks.push(makeCheck(
            'deep:before:server',
            'fail',
            `Baseline ref "${baseline.ref}" does not provide a reusable baseUrl for deep validation.`,
          ));
        } else {
          await runDeepPhaseValidation({
            checks,
            config,
            phase: 'before',
            scopeId: options.scopeId ?? null,
            stageArg: options.stageArg ?? 'all',
            screenIds: options.screenIds ?? [],
            baseUrlOverride: preparedBaseline.server.baseUrl,
            serverOverrides: {
              server: preparedBaseline.server,
              cwd: preparedBaseline.server.cwd ?? preparedBaseline.worktreeDir,
              label: 'baseline-before',
            },
            serverLabel: `baseline ref ${baseline.ref}`,
            language,
          });
        }
      } catch (error) {
        checks.push(makeCheck(
          'deep:before:server',
          'fail',
          error instanceof Error ? error.message : String(error),
        ));
      } finally {
        await preparedBaseline?.cleanup?.();
      }
    }
  }

  return {
    ok: checks.every((item) => item.status !== 'fail'),
    checks,
  };
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
