import { access, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { ensureStageStructure } from '../util/stage-notes.mjs';
import { ensureDir, fileExists } from '../util/fs.mjs';
import { inferLocale, resolveBaseUrl, resolveCapturePlan } from '../util/selection.mjs';
import { loadHook } from '../util/hooks.mjs';
import { resolveProjectPath } from '../../config/load-config.mjs';
import { createLogger } from '../util/logging.mjs';
import { createRunId, createRuntimeHandle, createStateApi } from '../runtime/state-store.mjs';
import {
  buildCaptureStateEntry,
  buildCaptureStateKey,
  loadCaptureState,
  saveCaptureState,
} from './capture-state.mjs';

const captureCss = `
  *,
  *::before,
  *::after {
    animation-delay: 0s !important;
    animation-duration: 0s !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition: none !important;
  }
`;

const STEP_TIMING_KEYS = {
  auth: 'authMs',
  setup: 'setupMs',
  goto: 'gotoMs',
  waitFor: 'waitForMs',
  prepare: 'prepareMs',
  screenshot: 'screenshotMs',
};

function buildContextOptions(viewportSpec) {
  const devicePreset = viewportSpec.device ? devices[viewportSpec.device] : null;
  const {
    defaultBrowserType: _defaultBrowserType,
    ...deviceOptions
  } = devicePreset ?? {};

  return {
    ...deviceOptions,
    ...(viewportSpec.viewport ? { viewport: viewportSpec.viewport } : {}),
    ...(viewportSpec.locale ? { locale: viewportSpec.locale } : {}),
    ...(viewportSpec.timezoneId ? { timezoneId: viewportSpec.timezoneId } : {}),
    ...(viewportSpec.colorScheme ? { colorScheme: viewportSpec.colorScheme } : {}),
  };
}

function createExecutionRecord() {
  return {
    status: 'missing',
    startedAt: new Date().toISOString(),
    finishedAt: null,
    totalMs: null,
    timings: {
      authMs: 0,
      setupMs: 0,
      gotoMs: 0,
      waitForMs: 0,
      prepareMs: 0,
      screenshotMs: 0,
    },
    failure: null,
  };
}

function toMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function attachCaptureFailure(error, failure) {
  if (error instanceof Error) {
    if (!error.captureFailure) {
      error.captureFailure = failure;
    }
    return error;
  }

  const wrapped = new Error(String(error));
  wrapped.captureFailure = failure;
  return wrapped;
}

function buildWaitTarget(screen) {
  if (screen.waitFor?.testId) {
    return {
      type: 'testId',
      value: screen.waitFor.testId,
      timeoutMs: screen.waitFor.timeoutMs ?? 30_000,
    };
  }

  if (screen.waitFor?.selector) {
    return {
      type: 'selector',
      value: screen.waitFor.selector,
      timeoutMs: screen.waitFor.timeoutMs ?? 30_000,
    };
  }

  return null;
}

function buildFailure({ step, screen, error, waitTarget = null, lastRequest = null }) {
  return {
    step,
    message: toMessage(error),
    ...(step === 'waitFor' && waitTarget ? { waitTarget } : {}),
    ...(lastRequest ? { lastRequest } : {}),
    screenId: screen.id,
  };
}

async function runCaptureStep({ step, execution = null, screen, getFailureMeta = null, task }) {
  const startedAt = Date.now();
  try {
    return await task();
  } catch (error) {
    if (!execution) {
      throw error;
    }

    throw attachCaptureFailure(error, buildFailure({
      step,
      screen,
      error,
      ...(getFailureMeta ? getFailureMeta() : {}),
    }));
  } finally {
    if (execution) {
      execution.timings[STEP_TIMING_KEYS[step]] = Date.now() - startedAt;
    }
  }
}

async function settlePage(page, captureConfig) {
  if (captureConfig.browser.waitForFonts) {
    await page.evaluate(async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });
  }

  const timeout = captureConfig.browser.waitForNetworkIdleMs ?? 0;
  if (timeout > 0) {
    await page.waitForLoadState('networkidle', { timeout }).catch(() => {});
  }

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      }),
  );
}

async function bootstrapAuth(context, baseUrl, auth, noteFailure = null) {
  if (!auth?.bootstrapRequest) {
    return;
  }

  const method = auth.bootstrapRequest.method ?? 'POST';
  const url = new URL(auth.bootstrapRequest.url, baseUrl).toString();

  let response;
  try {
    response = await context.request.fetch(url, {
      method,
      headers: auth.bootstrapRequest.headers,
      data: auth.bootstrapRequest.json,
    });
  } catch (error) {
    noteFailure?.({
      url,
      method,
      errorText: toMessage(error),
    });
    throw error;
  }

  if (!response.ok()) {
    noteFailure?.({
      url,
      method,
      errorText: `HTTP ${response.status()}`,
    });
    throw new Error(`Auth bootstrap failed for ${auth.bootstrapRequest.url} (${response.status()})`);
  }
}

async function waitForReady(page, screen) {
  const timeout = screen.waitFor?.timeoutMs ?? 30_000;
  if (screen.waitFor?.testId) {
    await page.getByTestId(screen.waitFor.testId).waitFor({ state: 'visible', timeout });
  } else if (screen.waitFor?.selector) {
    await page.locator(screen.waitFor.selector).waitFor({ state: 'visible', timeout });
  }
}

async function ensureStorageState(config, screen) {
  if (!screen.auth?.storageState) {
    return null;
  }

  const resolvedPath = resolveProjectPath(config, screen.auth.storageState);
  await access(resolvedPath).catch(() => {
    throw new Error(`Missing storage state "${resolvedPath}" for screen "${screen.id}".`);
  });
  return resolvedPath;
}

async function prepareScreenContext({
  browser,
  config,
  stage,
  screen,
  viewport,
  phase,
  baseUrl,
  language,
  execution = null,
  runtimeHandle = createRuntimeHandle(config),
}) {
  const contextOptions = buildContextOptions(viewport);
  const stateApi = createStateApi(config);
  const runtime = {
    context: null,
    page: null,
    lastRequest: null,
  };

  const failureMeta = (step) => ({
    waitTarget: step === 'waitFor' ? buildWaitTarget(screen) : null,
    lastRequest: runtime.lastRequest,
  });

  try {
    await runCaptureStep({
      step: 'auth',
      execution,
      screen,
      getFailureMeta: () => failureMeta('auth'),
      task: async () => {
        const storageStatePath = await ensureStorageState(config, screen);
        if (storageStatePath) {
          contextOptions.storageState = storageStatePath;
        }

        runtime.context = await browser.newContext(contextOptions);
        runtime.page = await runtime.context.newPage();
        runtime.page.setDefaultTimeout(45_000);
        runtime.page.on('requestfailed', (request) => {
          runtime.lastRequest = {
            url: request.url(),
            method: request.method(),
            errorText: request.failure()?.errorText ?? 'Request failed',
          };
        });

        await bootstrapAuth(runtime.context, baseUrl, screen.auth, (requestFailure) => {
          runtime.lastRequest = requestFailure;
        });
      },
    });

    await runCaptureStep({
      step: 'setup',
      execution,
      screen,
      getFailureMeta: () => failureMeta('setup'),
      task: async () => {
        const setupHook = await loadHook(config, screen.hooks?.setup);
        if (setupHook) {
          await setupHook({
            page: runtime.page,
            context: runtime.context,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
            runtime: runtimeHandle,
            state: stateApi,
          });
        }
      },
    });

    await runCaptureStep({
      step: 'goto',
      execution,
      screen,
      getFailureMeta: () => failureMeta('goto'),
      task: async () => {
        await runtime.page.goto(new URL(screen.path, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
        if (config.capture.browser.freezeAnimations) {
          await runtime.page.addStyleTag({ content: captureCss }).catch(() => {});
        }
      },
    });

    await runCaptureStep({
      step: 'waitFor',
      execution,
      screen,
      getFailureMeta: () => failureMeta('waitFor'),
      task: async () => {
        await waitForReady(runtime.page, screen);
        await settlePage(runtime.page, config.capture);
      },
    });

    await runCaptureStep({
      step: 'prepare',
      execution,
      screen,
      getFailureMeta: () => failureMeta('prepare'),
      task: async () => {
        const prepareHook = await loadHook(config, screen.hooks?.prepare);
        if (prepareHook) {
          await prepareHook({
            page: runtime.page,
            context: runtime.context,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
            runtime: runtimeHandle,
            state: stateApi,
          });
          await settlePage(runtime.page, config.capture);
        }
      },
    });

    return runtime;
  } catch (error) {
    await runtime.context?.close().catch(() => {});
    throw error;
  }
}

export async function openPreparedScreen({ browser, config, stage, screen, viewport, phase, baseUrl, language, runtimeHandle }) {
  const prepared = await prepareScreenContext({
    browser,
    config,
    stage,
    screen,
    viewport,
    phase,
    baseUrl,
    language,
    runtimeHandle,
  });

  return {
    context: prepared.context,
    page: prepared.page,
  };
}

async function captureScreen({ browser, config, stage, screen, viewport, phase, baseUrl, language, outputPath, runtimeHandle }) {
  const execution = createExecutionRecord();
  const captureStartedAt = Date.now();

  try {
    const prepared = await prepareScreenContext({
      browser,
      config,
      stage,
      screen,
      viewport,
      phase,
      baseUrl,
      language,
      execution,
      runtimeHandle,
    });

    try {
      await runCaptureStep({
        step: 'screenshot',
        execution,
        screen,
        getFailureMeta: () => ({ lastRequest: prepared.lastRequest }),
        task: async () => {
          await prepared.page.screenshot({
            fullPage: screen.screenshot?.fullPage ?? true,
            path: outputPath,
          });
        },
      });

      execution.status = 'success';
      return { outputPath, execution };
    } finally {
      await prepared.context.close().catch(() => {});
    }
  } catch (error) {
    execution.status = 'failed';
    execution.failure = error.captureFailure ?? buildFailure({
      step: 'screenshot',
      screen,
      error,
    });
    return { outputPath: null, execution };
  } finally {
    execution.finishedAt = new Date().toISOString();
    execution.totalMs = Date.now() - captureStartedAt;
  }
}

function buildPhaseOutputPath({ config, stage, screen, viewport, phase }) {
  const locale = inferLocale(screen);
  const outputBaseId = screen.fileId ?? screen.id;
  const stageDir = path.join(config.meta.artifactsRoot, stage.id, phase);
  return path.join(stageDir, `${outputBaseId}__${locale}__${viewport.id}__${phase}.png`);
}

async function canReuseCapture({ resume, state, phase, screen, viewport, outputPath }) {
  if (!resume) {
    return false;
  }

  const key = buildCaptureStateKey({
    phase,
    screenId: screen.id,
    viewportId: viewport.id,
  });
  const entry = state.entries?.[key];
  if (entry?.status !== 'success') {
    return false;
  }

  return fileExists(outputPath);
}

export async function captureResolvedPlan({
  config,
  phase,
  selections,
  baseUrlOverride,
  language,
  outputPathResolver = buildPhaseOutputPath,
  resume = false,
  persistState = true,
  logOptions = {},
  runId = createRunId(phase),
}) {
  const logger = createLogger(logOptions);
  const browser = await chromium.launch({ headless: config.capture.browser.headless });
  const outputs = [];
  const failures = [];
  const skipped = [];
  const stateByStageId = new Map();

  async function getStageState(stage) {
    if (!persistState) {
      return {
        version: 1,
        updatedAt: null,
        entries: {},
      };
    }

    const existing = stateByStageId.get(stage.id);
    if (existing) {
      return existing;
    }

    const loaded = await loadCaptureState(config, stage);
    stateByStageId.set(stage.id, loaded);
    return loaded;
  }

  try {
    for (const selection of selections) {
      const { stage, screens, viewports } = selection;
      const baseUrl = resolveBaseUrl(config, phase, baseUrlOverride);
      const state = await getStageState(stage);

      for (const viewport of viewports) {
        for (const screen of screens) {
          const plannedOutputPath = outputPathResolver({
            config,
            stage,
            screen,
            viewport,
            phase,
          });
          await ensureDir(path.dirname(plannedOutputPath));

          if (await canReuseCapture({
            resume,
            state,
            phase,
            screen,
            viewport,
            outputPath: plannedOutputPath,
          })) {
            skipped.push({
              stageId: stage.id,
              screenId: screen.id,
              viewportId: viewport.id,
              outputPath: plannedOutputPath,
            });
            logger.detail(`skipped ${stage.id}/${phase}/${screen.id} (${viewport.id})`);
            continue;
          }

          await rm(plannedOutputPath, { force: true }).catch(() => {});
          const result = await captureScreen({
            browser,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
            outputPath: plannedOutputPath,
            runtimeHandle: createRuntimeHandle(config, runId),
          });
          const locale = inferLocale(screen);
          const stateKey = buildCaptureStateKey({
            phase,
            screenId: screen.id,
            viewportId: viewport.id,
          });

          state.entries[stateKey] = buildCaptureStateEntry({
            config,
            phase,
            stage,
            screen,
            viewport,
            locale,
            execution: result.execution,
            outputPath: result.outputPath ?? plannedOutputPath,
          });
          if (persistState) {
            await saveCaptureState(config, stage, state);
          }

          if (result.execution.status === 'success') {
            outputs.push({
              stageId: stage.id,
              stageTitle: stage.title,
              screenId: screen.id,
              fileId: screen.fileId ?? screen.id,
              label: screen.label,
              locale,
              viewportId: viewport.id,
              outputPath: result.outputPath,
            });
            logger.detail(`captured ${stage.id}/${phase}/${screen.id} (${viewport.id})`);
            continue;
          }

          failures.push({
            stageId: stage.id,
            stageTitle: stage.title,
            screenId: screen.id,
            fileId: screen.fileId ?? screen.id,
            label: screen.label,
            locale,
            viewportId: viewport.id,
            outputPath: plannedOutputPath,
            execution: result.execution,
          });
          logger.error(
            `failed ${stage.id}/${phase}/${screen.id} (${viewport.id}): ${result.execution.failure?.step ?? 'capture'} ${result.execution.failure?.message ?? 'unknown error'}`,
          );
        }
      }
    }
  } finally {
    await browser.close();
  }

  return {
    runId,
    outputs,
    failures,
    skipped,
    counts: {
      captured: outputs.length,
      failed: failures.length,
      skipped: skipped.length,
    },
    hasFailures: failures.length > 0,
  };
}

export async function captureStages({
  config,
  phase,
  stageArg,
  screenIds = [],
  viewportIds = [],
  profileId = null,
  paramsFilter = {},
  baseUrlOverride,
  language,
  resume = false,
  logOptions = {},
  runId = createRunId(phase),
}) {
  const plan = resolveCapturePlan(config, {
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });

  for (const { stage } of plan.selections) {
    await ensureStageStructure(config, stage, language);
  }

  return captureResolvedPlan({
    config,
    phase,
    selections: plan.selections,
    baseUrlOverride,
    language,
    resume,
    logOptions,
    runId,
  });
}
