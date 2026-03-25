import { csvOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { captureStages } from '../lib/capture/playwright-capture.mjs';

export async function handleCapture(options) {
  const phase = options.phase ?? 'after';
  if (!['before', 'after'].includes(phase)) {
    throw new Error(`Unknown phase "${phase}". Use "before" or "after".`);
  }

  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  const result = await captureStages({
    config,
    phase,
    stageArg: options.stage ?? 'all',
    screenIds: csvOption(options.screens),
    viewportIds: csvOption(options.viewports),
    baseUrlOverride: options.baseUrl,
    language,
    resume: Boolean(options.resume),
  });

  console.log(`done: ${result.counts.captured} screenshot(s), ${result.counts.failed} failed, ${result.counts.skipped} skipped`);
  if (result.hasFailures) {
    process.exitCode = 1;
  }
}
