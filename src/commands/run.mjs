import { csvOption, keyValueOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { captureStages } from '../lib/capture/playwright-capture.mjs';
import { buildComparisons } from '../lib/compare/build-comparisons.mjs';
import { generateReports } from '../lib/report/render-report.mjs';
import { buildReviewPages } from '../lib/review/build-review.mjs';
import { getServerLogTail, startServer, stopServer } from '../lib/server/process-server.mjs';
import { prepareGitBaseline } from '../lib/baseline/git-baseline.mjs';
import { resolveCapturePlan } from '../lib/util/selection.mjs';
import { runReadyValidation } from '../lib/doctor/ready-validation.mjs';
import { createLogger, normalizeLogOptions } from '../lib/util/logging.mjs';
import { summarizeFailures } from '../lib/util/failure-summary.mjs';
import { createRunId } from '../lib/runtime/state-store.mjs';

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
  const logOptions = normalizeLogOptions(options);
  const logger = createLogger(logOptions);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const stageArg = options.stage ?? 'all';
  const screenIds = csvOption(options.screens);
  const viewportIds = csvOption(options.viewports);
  const profileId = options.profile ?? null;
  const paramsFilter = keyValueOption(options.params);
  const beforeRef = options.beforeAttach ? null : options.beforeRef ?? config.baseline?.git?.ref;
  const runId = createRunId('run');
  const selectionPlan = resolveCapturePlan(config, {
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });

  let beforeHandle = null;
  let afterHandle = null;
  let baseline = null;
  const captureFailures = [];

  function printFailureSummary(command, failures) {
    const summary = summarizeFailures({
      command,
      configPath: options.config,
      failures,
      profileId,
      paramsFilter,
      resume: true,
    });
    if (!summary) {
      return;
    }
    logger.summary(`failed: [${summary.failed.join(', ')}]`);
    logger.summary(`rerun: ${summary.rerun}`);
  }

  try {
    if (!options.skipBefore) {
      if (options.beforeAttach) {
        beforeHandle = await startServer(config, 'before', {
          ...buildAttachOverride(options.beforeAttach),
          showServerLogOnFail: logOptions.showServerLogOnFail,
        });
      } else if (beforeRef) {
        baseline = await prepareGitBaseline(config, beforeRef);
        if (!baseline.server?.baseUrl) {
          throw new Error(`Baseline ref "${beforeRef}" is configured but no baseline server baseUrl is available.`);
        }
        beforeHandle = await startServer(config, 'before', {
          server: baseline.server,
          cwd: baseline.server?.cwd ?? baseline.worktreeDir,
          label: 'baseline-before',
          showServerLogOnFail: logOptions.showServerLogOnFail,
        });
      } else {
        beforeHandle = await startServer(config, 'before', {
          showServerLogOnFail: logOptions.showServerLogOnFail,
        });
      }

      if (!options.skipReady) {
        const ready = await runReadyValidation({
          config,
          phase: 'before',
          selections: selectionPlan.selections,
          baseUrlOverride: options.beforeAttach ?? options.beforeBaseUrl ?? baseline?.server?.baseUrl,
          language,
          logger,
        });
        if (!ready.ok) {
          printFailureSummary('run', ready.checks.filter((item) => item.status === 'fail'));
          process.exitCode = 1;
          return;
        }
      }

      const beforeCapture = await captureStages({
        config,
        phase: 'before',
        stageArg,
        screenIds,
        viewportIds,
        profileId,
        paramsFilter,
        baseUrlOverride: options.beforeAttach ?? options.beforeBaseUrl ?? baseline?.server?.baseUrl,
        language,
        resume: Boolean(options.resume),
        logOptions,
        runId,
      });
      captureFailures.push(...beforeCapture.failures);
    }
  } finally {
    if (captureFailures.length && logOptions.showServerLogOnFail) {
      const tail = getServerLogTail(beforeHandle);
      if (tail) {
        logger.summary(tail);
      }
    }
    await stopServer(beforeHandle);
    await baseline?.cleanup?.();
  }

  try {
    if (!options.skipAfter) {
      afterHandle = await startServer(config, 'after', {
        ...buildAttachOverride(options.afterAttach),
        showServerLogOnFail: logOptions.showServerLogOnFail,
      });
      if (!options.skipReady) {
        const ready = await runReadyValidation({
          config,
          phase: 'after',
          selections: selectionPlan.selections,
          baseUrlOverride: options.afterAttach ?? options.afterBaseUrl,
          language,
          logger,
        });
        if (!ready.ok) {
          printFailureSummary('run', ready.checks.filter((item) => item.status === 'fail'));
          process.exitCode = 1;
          return;
        }
      }
      const afterCapture = await captureStages({
        config,
        phase: 'after',
        stageArg,
        screenIds,
        viewportIds,
        profileId,
        paramsFilter,
        baseUrlOverride: options.afterAttach ?? options.afterBaseUrl,
        language,
        resume: Boolean(options.resume),
        logOptions,
        runId,
      });
      captureFailures.push(...afterCapture.failures);
    }
  } finally {
    if (captureFailures.length && logOptions.showServerLogOnFail) {
      const tail = getServerLogTail(afterHandle);
      if (tail) {
        logger.summary(tail);
      }
    }
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
      screenIds,
      viewportIds,
      profileId,
      paramsFilter,
      language,
    });
  }

  if (!options.skipReview) {
    await buildReviewPages({
      config,
      stageArg,
      screenIds,
      viewportIds,
      profileId,
      paramsFilter,
      language,
    });
  }

  logger.summary(`done: ${selectionPlan.selections.length} stage selection(s), ${captureFailures.length} failed capture(s)`);

  if (captureFailures.length > 0) {
    printFailureSummary('run', captureFailures);
    process.exitCode = 1;
  }
}
