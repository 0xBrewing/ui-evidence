import { access } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { ensureStageStructure } from '../util/stage-notes.mjs';
import { inferLocale, resolveBaseUrl, selectScreens, selectStages, selectViewports } from '../util/selection.mjs';
import { loadHook } from '../util/hooks.mjs';
import { resolveProjectPath } from '../../config/load-config.mjs';

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

async function bootstrapAuth(context, baseUrl, auth) {
  if (!auth?.bootstrapRequest) {
    return;
  }

  const response = await context.request.fetch(new URL(auth.bootstrapRequest.url, baseUrl).toString(), {
    method: auth.bootstrapRequest.method ?? 'POST',
    headers: auth.bootstrapRequest.headers,
    data: auth.bootstrapRequest.json,
  });

  if (!response.ok()) {
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

export async function openPreparedScreen({ browser, config, stage, screen, viewport, phase, baseUrl, language }) {
  const contextOptions = buildContextOptions(viewport);
  const storageStatePath = await ensureStorageState(config, screen);
  if (storageStatePath) {
    contextOptions.storageState = storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);

  try {
    await bootstrapAuth(context, baseUrl, screen.auth);
    const setupHook = await loadHook(config, screen.hooks?.setup);
    const prepareHook = await loadHook(config, screen.hooks?.prepare);

    if (setupHook) {
      await setupHook({ page, context, config, stage, screen, viewport, phase, baseUrl, language });
    }

    await page.goto(new URL(screen.path, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    if (config.capture.browser.freezeAnimations) {
      await page.addStyleTag({ content: captureCss }).catch(() => {});
    }

    await waitForReady(page, screen);
    await settlePage(page, config.capture);

    if (prepareHook) {
      await prepareHook({ page, context, config, stage, screen, viewport, phase, baseUrl, language });
      await settlePage(page, config.capture);
    }

    return { context, page };
  } catch (error) {
    await context.close().catch(() => {});
    throw error;
  }
}

async function captureScreen({ browser, config, stage, screen, viewport, phase, baseUrl, language }) {
  const { context, page } = await openPreparedScreen({
    browser,
    config,
    stage,
    screen,
    viewport,
    phase,
    baseUrl,
    language,
  });

  try {
    const locale = inferLocale(screen);
    const outputBaseId = screen.fileId ?? screen.id;
    const stageDir = path.join(config.meta.artifactsRoot, stage.id, phase);
    const outputPath = path.join(stageDir, `${outputBaseId}__${locale}__${viewport.id}__${phase}.png`);

    await page.screenshot({
      fullPage: screen.screenshot?.fullPage ?? true,
      path: outputPath,
    });

    return outputPath;
  } finally {
    await context.close();
  }
}

export async function captureStages({
  config,
  phase,
  stageArg,
  screenIds = [],
  viewportIds = [],
  baseUrlOverride,
  language,
}) {
  const stages = selectStages(config, stageArg);
  const browser = await chromium.launch({ headless: config.capture.browser.headless });
  const outputs = [];

  try {
    for (const stage of stages) {
      await ensureStageStructure(config, stage, language);
      const selectedScreens = selectScreens(stage, screenIds);
      const selectedViewports = selectViewports(config, stage, viewportIds);
      const baseUrl = resolveBaseUrl(config, phase, baseUrlOverride);

      for (const viewport of selectedViewports) {
        for (const screen of selectedScreens) {
          const outputPath = await captureScreen({
            browser,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
          });
          outputs.push({ stageId: stage.id, screenId: screen.id, viewportId: viewport.id, outputPath });
          console.log(`captured ${stage.id}/${phase}/${screen.id} (${viewport.id})`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  return outputs;
}
