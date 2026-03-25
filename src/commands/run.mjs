import { csvOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { captureStages } from '../lib/capture/playwright-capture.mjs';
import { buildComparisons } from '../lib/compare/build-comparisons.mjs';
import { generateReports } from '../lib/report/render-report.mjs';
import { buildReviewPages } from '../lib/review/build-review.mjs';
import { startServer, stopServer } from '../lib/server/process-server.mjs';
import { prepareGitBaseline } from '../lib/baseline/git-baseline.mjs';

function buildAttachOverride(baseUrl) {
  if (!baseUrl) {
    return {};
  }

  return {
    server: {
      mode: 'attach',
      baseUrl,
      readyUrl: baseUrl,
    },
  };
}

export async function handleRun(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const stageArg = options.stage ?? 'all';
  const screenIds = csvOption(options.screens);
  const viewportIds = csvOption(options.viewports);
  const beforeRef = options.beforeAttach ? null : options.beforeRef ?? config.baseline?.git?.ref;

  let beforeHandle = null;
  let afterHandle = null;
  let baseline = null;
  let captureFailures = 0;

  try {
    if (!options.skipBefore) {
      if (options.beforeAttach) {
        beforeHandle = await startServer(config, 'before', buildAttachOverride(options.beforeAttach));
      } else if (beforeRef) {
        baseline = await prepareGitBaseline(config, beforeRef);
        if (!baseline.server?.baseUrl) {
          throw new Error(`Baseline ref "${beforeRef}" is configured but no baseline server baseUrl is available.`);
        }
        beforeHandle = await startServer(config, 'before', {
          server: baseline.server,
          cwd: baseline.server?.cwd ?? baseline.worktreeDir,
          label: 'baseline-before',
        });
      } else {
        beforeHandle = await startServer(config, 'before');
      }

      const beforeCapture = await captureStages({
        config,
        phase: 'before',
        stageArg,
        screenIds,
        viewportIds,
        baseUrlOverride: options.beforeAttach ?? options.beforeBaseUrl ?? baseline?.server?.baseUrl,
        language,
        resume: Boolean(options.resume),
      });
      captureFailures += beforeCapture.counts.failed;
    }
  } finally {
    await stopServer(beforeHandle);
    await baseline?.cleanup?.();
  }

  try {
    if (!options.skipAfter) {
      afterHandle = await startServer(config, 'after', buildAttachOverride(options.afterAttach));
      const afterCapture = await captureStages({
        config,
        phase: 'after',
        stageArg,
        screenIds,
        viewportIds,
        baseUrlOverride: options.afterAttach ?? options.afterBaseUrl,
        language,
        resume: Boolean(options.resume),
      });
      captureFailures += afterCapture.counts.failed;
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

  if (captureFailures > 0) {
    process.exitCode = 1;
  }
}
