import { csvOption, keyValueOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { runSnapshot } from '../lib/snapshot/run-snapshot.mjs';
import { getServerLogTail, startServer, stopServer } from '../lib/server/process-server.mjs';
import { resolveCapturePlan } from '../lib/util/selection.mjs';
import { runReadyValidation } from '../lib/doctor/ready-validation.mjs';
import { createLogger, normalizeLogOptions } from '../lib/util/logging.mjs';
import { summarizeFailures } from '../lib/util/failure-summary.mjs';

export async function handleSnapshot(options) {
  const config = await loadConfig(options.config);
  const logOptions = normalizeLogOptions(options);
  const logger = createLogger(logOptions);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const profileId = options.profile ?? null;
  const paramsFilter = keyValueOption(options.params);
  const stageArg = options.stage ?? 'all';
  const screenIds = csvOption(options.screens);
  const viewportIds = csvOption(options.viewports);
  const plan = resolveCapturePlan(config, {
    scopeId: options.scope ?? null,
    stageArg,
    screenIds,
    viewportIds,
    profileId,
    paramsFilter,
  });
  let afterHandle = null;

  try {
    afterHandle = await startServer(config, 'after', {
      showServerLogOnFail: logOptions.showServerLogOnFail,
    });
    if (!options.skipReady) {
      const ready = await runReadyValidation({
        config,
        phase: 'after',
        selections: plan.selections,
        baseUrlOverride: options.baseUrl,
        language,
        logger,
      });
      if (!ready.ok) {
        const summary = summarizeFailures({
          command: 'snapshot',
          configPath: options.config,
          failures: ready.checks.filter((item) => item.status === 'fail'),
          profileId,
          paramsFilter,
          resume: true,
        });
        if (summary) {
          logger.summary(`failed: [${summary.failed.join(', ')}]`);
          logger.summary(`rerun: ${summary.rerun}`);
        }
        process.exitCode = 1;
        return;
      }
    }

    const result = await runSnapshot({
      config,
      scopeId: options.scope ?? null,
      stageArg,
      screenIds,
      viewportIds,
      profileId,
      paramsFilter,
      baseUrlOverride: options.baseUrl,
      label: options.label ?? null,
      language,
      logOptions,
    });

    logger.summary(`done: ${result.counts.captures} current capture(s), ${result.counts.overviews} overview(s)`);
    logger.summary(`review: ${result.reviewPath}`);
    if (result.failedCaptures > 0) {
      const summary = summarizeFailures({
        command: 'snapshot',
        configPath: options.config,
        failures: result.failures ?? [],
        profileId,
        paramsFilter,
        resume: true,
      });
      if (summary) {
        logger.summary(`failed: [${summary.failed.join(', ')}]`);
        logger.summary(`rerun: ${summary.rerun}`);
      }
      process.exitCode = 1;
    }
  } finally {
    if (process.exitCode && logOptions.showServerLogOnFail) {
      const tail = getServerLogTail(afterHandle);
      if (tail) {
        logger.summary(tail);
      }
    }
    await stopServer(afterHandle);
  }
}
