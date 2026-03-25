import { csvOption } from '../cli/parse-args.mjs';
import { loadConfig } from '../config/load-config.mjs';
import { runSnapshot } from '../lib/snapshot/run-snapshot.mjs';
import { startServer, stopServer } from '../lib/server/process-server.mjs';

export async function handleSnapshot(options) {
  const config = await loadConfig(options.config);
  const language = options.language ?? config.report?.language ?? config.artifacts.reportLanguage ?? 'en';
  let afterHandle = null;

  try {
    afterHandle = await startServer(config, 'after');
    const result = await runSnapshot({
      config,
      scopeId: options.scope ?? null,
      stageArg: options.stage ?? 'all',
      screenIds: csvOption(options.screens),
      viewportIds: csvOption(options.viewports),
      baseUrlOverride: options.baseUrl,
      label: options.label ?? null,
      language,
    });

    console.log(`done: ${result.counts.captures} current capture(s), ${result.counts.overviews} overview(s)`);
    console.log(`review: ${result.reviewPath}`);
    if (result.failedCaptures > 0) {
      process.exitCode = 1;
    }
  } finally {
    await stopServer(afterHandle);
  }
}
