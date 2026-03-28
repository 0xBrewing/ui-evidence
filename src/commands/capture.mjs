import { csvOption, keyValueOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { captureStages } from '../lib/capture/playwright-capture.mjs';
import { createLogger, normalizeLogOptions } from '../lib/util/logging.mjs';
import { summarizeFailures } from '../lib/util/failure-summary.mjs';

export async function handleCapture(options) {
  const phase = options.phase ?? 'after';
  if (!['before', 'after'].includes(phase)) {
    throw new Error(`Unknown phase "${phase}". Use "before" or "after".`);
  }

  const config = await loadConfig(options.config);
  const logOptions = normalizeLogOptions(options);
  const logger = createLogger(logOptions);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const profileId = options.profile ?? null;
  const paramsFilter = keyValueOption(options.params);
  const result = await captureStages({
    config,
    phase,
    stageArg: options.stage ?? 'all',
    screenIds: csvOption(options.screens),
    viewportIds: csvOption(options.viewports),
    profileId,
    paramsFilter,
    baseUrlOverride: options.baseUrl,
    language,
    resume: Boolean(options.resume),
    logOptions,
  });

  logger.summary(`done: ${result.counts.captured} screenshot(s), ${result.counts.failed} failed, ${result.counts.skipped} skipped`);
  if (result.hasFailures) {
    const summary = summarizeFailures({
      command: 'capture',
      configPath: options.config,
      failures: result.failures,
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
}
