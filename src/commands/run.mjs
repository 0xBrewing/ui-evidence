import { csvOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { captureStages } from '../lib/capture/playwright-capture.mjs';
import { buildComparisons } from '../lib/compare/build-comparisons.mjs';
import { generateReports } from '../lib/report/render-report.mjs';
import { buildReviewPages } from '../lib/review/build-review.mjs';
import { startServer, stopServer } from '../lib/server/process-server.mjs';
import { prepareGitBaseline } from '../lib/baseline/git-baseline.mjs';

export async function handleRun(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const stageArg = options.stage ?? 'all';
  const screenIds = csvOption(options.screens);
  const viewportIds = csvOption(options.viewports);
  const beforeRef = options.beforeRef ?? config.baseline?.git?.ref;

  let beforeHandle = null;
  let afterHandle = null;
  let baseline = null;

  try {
    if (!options.skipBefore) {
      if (beforeRef) {
        baseline = await prepareGitBaseline(config, beforeRef);
        if (!baseline.server?.baseUrl) {
          throw new Error(`Baseline ref "${beforeRef}" is configured but no baseline server baseUrl is available.`);
        }
        if (!options.beforeBaseUrl && !baseline.server.command) {
          throw new Error(
            `Baseline ref "${beforeRef}" requires either baseline.git.server.command or --before-base-url.`,
          );
        }
        beforeHandle = await startServer(config, 'before', {
          server: baseline.server,
          cwd: baseline.server?.cwd ?? baseline.worktreeDir,
          label: 'baseline-before',
        });
      } else {
        beforeHandle = await startServer(config, 'before');
      }

      await captureStages({
        config,
        phase: 'before',
        stageArg,
        screenIds,
        viewportIds,
        baseUrlOverride: options.beforeBaseUrl ?? baseline?.server?.baseUrl,
        language,
      });
    }
  } finally {
    await stopServer(beforeHandle);
    await baseline?.cleanup?.();
  }

  try {
    if (!options.skipAfter) {
      afterHandle = await startServer(config, 'after');
      await captureStages({
        config,
        phase: 'after',
        stageArg,
        screenIds,
        viewportIds,
        baseUrlOverride: options.afterBaseUrl,
        language,
      });
    }
  } finally {
    await stopServer(afterHandle);
  }

  if (!options.skipCompare) {
    await buildComparisons({
      config,
      stageArg,
      overviewViewport: options.overviewViewport,
      language,
    });
  }

  if (!options.skipReport) {
    await generateReports({
      config,
      stageArg,
      language,
    });
  }

  if (!options.skipReview) {
    await buildReviewPages({
      config,
      stageArg,
      language,
    });
  }
}
