import { chromium } from '@playwright/test';
import { openPreparedScreen } from '../capture/playwright-capture.mjs';
import { resolveBaseUrl } from '../util/selection.mjs';

function cloneSelectionsWithFirstViewport(selections) {
  return selections.map((selection) => ({
    ...selection,
    viewports: selection.viewports.slice(0, 1),
  }));
}

export async function runReadyValidation({
  config,
  phase,
  selections,
  baseUrlOverride,
  language,
  logger = null,
}) {
  const browser = await chromium.launch({ headless: true });
  const checks = [];
  const readySelections = cloneSelectionsWithFirstViewport(selections);
  const baseUrl = resolveBaseUrl(config, phase, baseUrlOverride);

  try {
    for (const selection of readySelections) {
      const { stage, screens, viewports } = selection;
      const viewport = viewports[0];
      for (const screen of screens) {
        const key = `${stage.id}/${screen.id}/${viewport.id}`;
        try {
          const prepared = await openPreparedScreen({
            browser,
            config,
            stage,
            screen,
            viewport,
            phase,
            baseUrl,
            language,
          });
          await prepared.context.close();
          checks.push({
            key,
            status: 'pass',
            stageId: stage.id,
            screenId: screen.id,
            viewportId: viewport.id,
            message: `${screen.path} is reachable and its wait target resolves.`,
          });
        } catch (error) {
          logger?.error(`ready failed ${phase}/${key}: ${error instanceof Error ? error.message : String(error)}`);
          checks.push({
            key,
            status: 'fail',
            stageId: stage.id,
            screenId: screen.id,
            viewportId: viewport.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  return {
    ok: checks.every((check) => check.status !== 'fail'),
    baseUrl,
    checks,
  };
}
