import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { loadConfig, resolveProjectPath } from '../../config/load-config.mjs';
import { discoverProject } from '../discover/discover-project.mjs';
import { resolveBaselineOptions, prepareGitBaseline } from '../baseline/git-baseline.mjs';
import {
  DEFAULT_CONFIG_PATH,
  DEFAULT_INSTALLATION_DOC_PATH,
  detectLegacyLayout,
  detectLegacyRuntimeLayout,
  formatLegacyLayoutWarning,
  formatLegacyRuntimeLayoutWarning,
} from '../layout/default-layout.mjs';
import { resolveServerSpec, startServer, stopServer } from '../server/process-server.mjs';
import { runReadyValidation } from './ready-validation.mjs';
import { loadHook } from '../util/hooks.mjs';
import { fileExists } from '../util/fs.mjs';
import { runCommandSync } from '../util/process.mjs';
import { hashDirectory, hashFile, readDirectoryProvenance, readProvenanceHeader } from '../util/provenance.mjs';
import { resolveCapturePlan } from '../util/selection.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PACKAGE_ROOT = path.resolve(__dirname, '..', '..', '..');
const CANONICAL_SKILL_SOURCE_DIR = path.join(PACKAGE_ROOT, 'agent-skill', 'ui-evidence');

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

async function runReadyPhaseValidation({
  checks,
  config,
  phase,
  plan,
  baseUrlOverride,
  serverOverrides,
  serverLabel,
  language,
}) {
  let serverHandle = null;

  try {
    serverHandle = await startServer(config, phase, serverOverrides);
    checks.push(makeCheck(`ready:${phase}:server`, 'pass', `Ready validation is using ${baseUrlOverride ?? config.servers?.[phase]?.baseUrl ?? config.capture.baseUrl}.`));
  } catch (error) {
    checks.push(makeCheck(
      `ready:${phase}:server`,
      'fail',
      `Unable to prepare ${serverLabel}: ${error instanceof Error ? error.message : String(error)}`,
    ));
    await stopServer(serverHandle);
    return;
  }

  try {
    const result = await runReadyValidation({
      config,
      phase,
      selections: plan.selections,
      baseUrlOverride,
      language,
    });
    for (const check of result.checks) {
      checks.push(makeCheck(`ready:${phase}:${check.stageId}/${check.screenId}`, check.status, check.message));
    }
  } finally {
    await stopServer(serverHandle);
  }
}

async function appendGeneratedDriftChecks(checks, cwd) {
  const canonicalSkillDigest = await hashDirectory(CANONICAL_SKILL_SOURCE_DIR);
  const installTemplateDigest = await hashFile(path.join(PACKAGE_ROOT, 'templates', 'consumer', 'docs', 'ui-evidence-installation.md'));
  const claudeCommandDigest = await hashFile(path.join(PACKAGE_ROOT, 'templates', 'consumer', '.claude', 'commands', 'ui-evidence.md'));
  const managedFiles = [
    { key: 'generated:install-doc', absolutePath: path.resolve(cwd, DEFAULT_INSTALLATION_DOC_PATH), digest: installTemplateDigest },
    { key: 'generated:claude-command', absolutePath: path.resolve(cwd, '.claude', 'commands', 'ui-evidence.md'), digest: claudeCommandDigest },
  ];

  for (const managedFile of managedFiles) {
    if (!(await fileExists(managedFile.absolutePath))) {
      continue;
    }
    const content = await pathToContent(managedFile.absolutePath);
    const provenance = readProvenanceHeader(managedFile.absolutePath, content);
    if (!provenance) {
      continue;
    }
    checks.push(makeCheck(
      managedFile.key,
      provenance.sourceDigest === managedFile.digest ? 'pass' : 'warn',
      provenance.sourceDigest === managedFile.digest
        ? `${path.relative(cwd, managedFile.absolutePath)} is in sync.`
        : `${path.relative(cwd, managedFile.absolutePath)} is stale. Run "ui-evidence install --sync".`,
    ));
  }

  const skillCopies = [
    { key: 'generated:codex-skill', absolutePath: path.resolve(cwd, '.agents', 'skills', 'ui-evidence') },
    { key: 'generated:claude-skill', absolutePath: path.resolve(cwd, '.claude', 'skills', 'ui-evidence') },
  ];
  for (const skillCopy of skillCopies) {
    if (!(await fileExists(skillCopy.absolutePath))) {
      continue;
    }
    const provenance = await readDirectoryProvenance(skillCopy.absolutePath);
    if (!provenance) {
      continue;
    }
    checks.push(makeCheck(
      skillCopy.key,
      provenance.sourceDigest === canonicalSkillDigest ? 'pass' : 'warn',
      provenance.sourceDigest === canonicalSkillDigest
        ? `${path.relative(cwd, skillCopy.absolutePath)} is in sync.`
        : `${path.relative(cwd, skillCopy.absolutePath)} is stale. Run "ui-evidence install --sync".`,
    ));
  }
}

async function pathToContent(filePath) {
  return readFile(filePath, 'utf8');
}

export async function runDoctor(options = {}) {
  const checks = [];
  const configPath = options.config ?? DEFAULT_CONFIG_PATH;
  const configExists = await fileExists(path.resolve(process.cwd(), configPath));
  const legacyPaths = await detectLegacyLayout(process.cwd());
  const legacyRuntimePaths = await detectLegacyRuntimeLayout(process.cwd());
  const ready = Boolean(options.ready || options.deep);

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

  if (legacyPaths.length) {
    checks.push(makeCheck('layout', 'warn', formatLegacyLayoutWarning(legacyPaths)));
  }
  if (legacyRuntimePaths.length) {
    checks.push(makeCheck('runtime-layout', 'warn', formatLegacyRuntimeLayoutWarning(legacyRuntimePaths)));
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
  let selectionPlan = null;
  try {
    selectionPlan = resolveCapturePlan(config, {
      scopeId: options.scopeId ?? null,
      stageArg: options.stageArg ?? 'all',
      screenIds: options.screenIds ?? [],
      viewportIds: [],
      profileId: options.profileId ?? null,
      paramsFilter: options.paramsFilter ?? {},
    });
    checks.push(makeCheck(
      'selection',
      'pass',
      selectionPlan.scope
        ? `Scope ${selectionPlan.scope.id} resolves to ${selectionPlan.selections.length} stage selection(s).`
        : `Selected ${selectionPlan.selections.length} stage selection(s).${selectionPlan.profile ? ` Profile: ${selectionPlan.profile.id}.` : ''}`,
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

  await appendGeneratedDriftChecks(checks, process.cwd());

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

  if (ready && selectionOk && selectionPlan) {
    const language = config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
    await runReadyPhaseValidation({
      checks,
      config,
      phase: 'after',
      plan: selectionPlan,
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
          await runReadyPhaseValidation({
            checks,
            config,
            phase: 'before',
            plan: selectionPlan,
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
